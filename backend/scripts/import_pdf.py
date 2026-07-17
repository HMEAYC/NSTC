#!/usr/bin/env python3
"""
Import lesson plans from the full book PDF (跳動的音符 -編輯版1208.pdf).

Detects all 42 lesson plans organized by age group × music element,
parses each one, and upserts into the template system.

Usage:
  python3 scripts/import_pdf.py path/to/book.pdf [--dry-run] [--one NAME] [--batch] [--list] [--api-url http://localhost:8000] [--token TOKEN]

Options:
  --dry-run     Parse and preview only, don't save
  --one NAME    Only process one lesson matching element name (e.g. "拍子", "節奏")
  --list        Just list detected lessons without parsing
  --batch       Process all detected lesson plans
  --token       JWT auth token (default: $HMEAYC_TOKEN)
"""

import json
import os
import re
import sys

# ── known lesson plan element definitions ────────────────────────────

ELEMENTS = [
    ("拍子", "Steady Beat"),
    ("節奏", "Rhythm"),
    ("快慢", "Tempo - Fast & Slow"),
    ("高低", "Pitch - High & Low"),
    ("走停", "Stop & Go"),
    ("長短", "Duration - Long & Short"),
    ("力度—強弱", "Dynamics - Loud & Soft"),
    ("曲式", "Musical Form"),
    ("音色", "Timbre"),
    ("調式—大小調", "Major & Minor"),
    ("協和與不協和", "Consonant & Inconsonant"),
    ("舒緩", "Soothing"),
]

# Age groups in the book, in order
AGE_ORDER = ["孕期胎教", "0 歲寶寶", "1-2 歲學步兒", "3-6 歲幼兒"]

# Age group markers in the book text (in order)
AGE_MARKERS = [
    ("孕期胎教", [r'壹、產前胎教']),
    ("0 歲寶寶",  [r'貳、0\s*歲寶寶']),
    ("1-2 歲學步兒", [r'參、1-2\s*歲學步兒']),
    ("3-6 歲幼兒", [r'肆、3-6\s*歲幼兒']),
]

# Text after this within an age group is lesson content
LESSON_SECTION_MARKER = r'本書創作音樂CD'

# Parser for the book's lesson-plan/numbered section format
# Accepts various forms: "(一) 拍子（Steady Beat）", "(七)曲式", "(十) 舒緩"
ELEMENT_HEADER_RE = re.compile(
    r'[（(]\s*([一二三四五六七八九十]+)\s*[）)]\s*(.+?)$',
    re.MULTILINE
)

# Map Chinese element names to (cn, en) pairs (relaxed matching)
def resolve_element(name: str):
    name = name.strip().rstrip(')）')
    # Remove trailing English in brackets if any
    name = re.sub(r'\s*[（(].*$', '', name).strip()
    for cn, en in ELEMENTS:
        if name == cn or cn.startswith(name) or name.startswith(cn):
            return cn, en
    return None


# ── helpers ──────────────────────────────────────────────────────────

def page_texts(path: str) -> list[str]:
    import fitz
    doc = fitz.open(path)
    texts = [page.get_text() + "\n" for page in doc]
    doc.close()
    return texts


def clean(text: str) -> str:
    text = re.sub(r'\n\s*\d+\s*\n', '\n', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def extract_section(text: str, start: str, end: str | None = None) -> str:
    """Extract text between start and end markers, supporting known prefix variants."""
    # Try both with and without common bullet prefixes
    candidates = [start]
    for prefix in ['●', '', '■', '✦', '◆']:
        candidates.append(f"{prefix}{start}")
        candidates.append(f"{prefix} {start}")

    si = None
    for s in candidates:
        if s in text:
            si = text.index(s) + len(s)
            break
    if si is None:
        return ""

    if end:
        ecandidates = [end]
        for ep in ['', '●', '', '■', '✦', '◆']:
            ecandidates.append(f"{ep}{end}")
            ecandidates.append(f"{ep} {end}")
        for e in ecandidates:
            if e in text[si:]:
                return text[si:text.index(e, si)].strip()

    return text[si:].strip()


# ── boundary detection ──────────────────────────────────────────────

def find_boundaries(pages: list[str]) -> list[dict]:
    """
    Returns list of {age_group, cn_name, en_name, start_page, end_page}.
    Uses a two-pass approach:
      1) find age group page ranges
      2) within each range, scan for numbered section headers like "(一) 拍子"
         and map them to known elements.
    """
    # Step 1: find age group page ranges
    age_ranges = []
    for name, patterns in AGE_MARKERS:
        for i, txt in enumerate(pages):
            if any(re.search(p, txt) for p in patterns):
                age_ranges.append((name, i))
                break

    if len(age_ranges) < len(AGE_MARKERS):
        for name in AGE_ORDER:
            if name not in [a[0] for a in age_ranges]:
                kw = name.replace(" ", "").replace("-", "")
                for i, txt in enumerate(pages):
                    if kw in txt.replace(" ", "").replace("-", ""):
                        if not any(a[1] == i for a in age_ranges):
                            age_ranges.append((name, i))
                            break

    age_ranges.sort(key=lambda x: x[1])

    # Close age ranges
    closed = []
    for idx, (name, start) in enumerate(age_ranges):
        end = age_ranges[idx + 1][1] - 1 if idx + 1 < len(age_ranges) else len(pages) - 1
        for p in range(end, start, -1):
            if "最終篇" in pages[p] or "作者簡介" in pages[p]:
                end = p - 1
                break
        closed.append({"name": name, "start": start, "end": end})

    # Step 2: find lesson plan section starts & element headers per age group
    lessons = []
    for ag in closed:
        # Find lesson plan section start (after "本書創作音樂CD")
        ls_start = None
        for i in range(ag["start"], ag["end"] + 1):
            if re.search(LESSON_SECTION_MARKER, pages[i]):
                ls_start = i
                break

        if ls_start is None:
            continue

        # Scan pages for numbered section headers that match known elements
        raw = []
        for i in range(ls_start, ag["end"] + 1):
            for m in ELEMENT_HEADER_RE.finditer(pages[i]):
                num = m.group(1)
                name_raw = m.group(2).strip()
                resolved = resolve_element(name_raw)
                if resolved:
                    cn_name, en_name = resolved
                    raw.append((i, cn_name, en_name, name_raw))
                    break  # one per page is enough

        if not raw:
            continue

        # Deduplicate by (cn_name, en_name) keeping first occurrence
        seen = set()
        found = []
        for page, cn, en, raw_name in raw:
            key = (cn, en)
            if key not in seen:
                seen.add(key)
                found.append({
                    "age_group": ag["name"],
                    "cn_name": cn,
                    "en_name": en,
                    "start_page": page,
                })

        # Sort by page
        found.sort(key=lambda x: x["start_page"])

        # Close page ranges
        for idx, f in enumerate(found):
            if idx + 1 < len(found):
                f["end_page"] = found[idx + 1]["start_page"] - 1
            else:
                f["end_page"] = ag["end"]

        lessons.extend(found)

    return lessons


# ── parsing ──────────────────────────────────────────────────────────

def parse_objectives(text: str) -> tuple[list[str], list[str]]:
    main_list, sub_list = [], []
    
    # Try 教學目標 first (3-6 age group), then 活動目標 (younger groups)
    section = extract_section(text, '教學目標', '教學資源')
    if not section:
        section = extract_section(text, '教學目標', '教學過程')
    if not section:
        section = extract_section(text, '教學目標', '活動過程')
    if not section:
        section = extract_section(text, '活動目標', '活動過程')
    if not section:
        section = extract_section(text, '活動目標', '備註')
    if not section:
        section = extract_section(text, '活動目標', '教學資源')
    if not section:
        return [], []

    # Check for 主目標/次目標 split
    if '主目標' in section or '次目標' in section:
        parts = re.split(r'[主次]目標', section)
    else:
        # Simpler format: just bullet points under 活動目標
        parts = [section]

    for i, part in enumerate(parts):
        part = part.strip()
        if not part:
            continue
        # Numbered items: (1) ... (2) ... or 1. ... 2. ...
        items = re.findall(r'[（(]?\d+[）)][\s]*(.*?)(?=\n[（(]?\d+[）)]|\Z)', part, re.DOTALL)
        if not items:
            items = re.findall(r'[\-\*]\s*(.*?)(?=\n[\-\*]|\Z)', part, re.DOTALL)
        if not items:
            items = re.findall(r'[▶➢]\s*(.*?)(?=\n[▶➢]|\Z)', part, re.DOTALL)
        if not items:
            items = [part]
        cleaned = []
        for item in items:
            item = item.strip().strip('\n')
            item = re.sub(r'\s+', ' ', item)
            if item and len(item) > 3:
                cleaned.append(item)

        if len(parts) > 1 and '次' not in part and i <= 1:
            main_list.extend(cleaned)
        elif len(parts) > 1:
            sub_list.extend(cleaned)
        else:
            # No 主/次 split — put everything in main
            main_list.extend(cleaned)

    return main_list, sub_list


def parse_resources(text: str) -> list[str]:
    section = extract_section(text, '教學資源', '教學過程')
    if not section:
        section = extract_section(text, '教學資源', '活動過程')
    if not section:
        section = extract_section(text, '教學資源', None)
    if not section:
        return []
    items = re.findall(r'[\-\*▶➢]?\s*(.+?)(?=[\n][\-\*▶➢]|\Z)', section, re.DOTALL)
    if not items:
        items = [section.strip()]
    result = []
    for item in items:
        item = item.strip().strip('\n\r')
        item = re.sub(r'\s+', ' ', item)
        if item and len(item) > 1:
            result.append(item)
    return result


def parse_motivation(text: str) -> str:
    # Look for "引起動機：" with text until next numbered activity
    m = re.search(r'引起動機[：:]\s*(.+?)(?=\n\s*\d[\.\、]\s|\n\s*[（(]\d+[）)]|\n\s*[靜動][態]|\Z)', text, re.DOTALL)
    if m:
        return m.group(1).strip()
    # Fallback: text between 引起動機 and 活動 marker
    section = extract_section(text, '引起動機', '活動')
    if section:
        section = re.sub(r'\n\s*\d[\.\、]?\s*活動.*$', '', section, flags=re.DOTALL)
        return section.strip()
    return ""


def parse_activities(text: str) -> list[dict]:
    # Try 教學過程 then 活動過程
    section = extract_section(text, '教學過程', '本書 CD')
    if not section:
        section = extract_section(text, '教學過程', '補充資料')
    if not section:
        section = extract_section(text, '活動過程', '本書 CD')
    if not section:
        section = extract_section(text, '活動過程', '備註')
    if not section:
        section = extract_section(text, '活動過程', '教學資源')
    if not section:
        section = extract_section(text, '教學過程', None)
    if not section:
        section = extract_section(text, '活動過程', None)
    if not section:
        return []

    # Remove motivation part
    m = re.search(r'引起動機[：:].*?(\n\s*\d)', section, re.DOTALL)
    if m:
        section = section[m.start(1):]
    else:
        mi = section.find('引起動機')
        ai = section.find('活動')
        if 0 <= mi < ai:
            section = section[ai:]

    activities = []

    # Try various split patterns
    for pattern in [
        r'\n\s*((?:[（(]?\d+[）)]?\s*)?[活動]\s*[一二三四五六七八九十]+)\s*\n',
        r'\n\s*(\d+[\.\、]?\s*活動[^\n]*)\n',
        r'\n\s*([（(]\d+[）)]\s*[靜動][態][^\n]*)\n',
        r'\n\s*(\d+[\.\、]?\s*[靜動][態][^\n]*)\n',
    ]:
        parts = re.split(pattern, section)
        if len(parts) >= 3:
            i = 0
            while i < len(parts):
                part = parts[i].strip()
                if not part:
                    i += 1
                    continue
                if re.match(r'[\d\s]*[活動一二三四五六七八九十]', part) or \
                   re.match(r'[（(]\d+[）)]', part) or \
                   re.match(r'[靜動][態]', part):
                    title = part
                    i += 1
                    content = parts[i].strip() if i < len(parts) else ""
                    rp = ""
                    rm = re.search(r'[/\\\\]\s*([Xx\.\s\d*拍\\/tiTa\-]+)', content)
                    if rm:
                        rp = rm.group(1).strip()[:60]
                    activities.append({
                        "title": title,
                        "content": content,
                        "rhythm_pattern": rp
                    })
                i += 1
            if activities:
                return activities

    # Fallback: paragraphs
    paragraphs = [p.strip() for p in section.split('\n\n') if p.strip()]
    for p in paragraphs:
        if len(p) > 20:
            activities.append({
                "title": p.split('\n')[0][:60],
                "content": p,
                "rhythm_pattern": ""
            })
    return activities


def parse_cd_tracks(text: str) -> list[dict]:
    """Find CD track listings in the text by scanning for CD-I/II/III/IV patterns."""
    # Approach: find a block of lines that contain CD album markers followed by numbered tracks.
    # Known CD albums: CD-I, CD-II, CD-III, CD-IV
    # Tracks look like: "1. 行走的木偶（Walking marionettes）- 拍子（Steady Beat）"

    # Step 1: find the CD listing region
    # It starts after the element header and ends at 活動目標/教學目標/備註
    lines = text.split('\n')

    # Flags
    in_cd = False
    cd_lines = []

    for line in lines:
        stripped = line.strip()
        # Start: first line matching CD-I/II/III/IV
        if re.match(r'(CD[- ]?[IVXL\d]+)', stripped):
            in_cd = True
        # End: section markers
        if in_cd and re.match(r'\s*(?:[\-\*]\s*)?(?:活動目標|教學目標|活動過程|備註)', stripped):
            break
        if in_cd:
            cd_lines.append(stripped)

    if not cd_lines:
        return []

    # Step 2: parse the collected lines
    tracks = []
    current_album = ""

    for line in cd_lines:
        if not line:
            continue

        # Skip header lines like "六、本書創作音樂CD I、II、III、IV 之教案" or "本書創作音樂CD..."
        if '本書創作音樂CD' in line or re.match(r'[一二三四五六七八九十]+[、，]', line):
            continue

        # Check for "CD-I：" type album header with possibly content after
        m = re.match(r'(CD[- ]?[IVXL\d]+)\s*[：:]?\s*(.*)', line)
        if m:
            current_album = m.group(1).strip().replace(' ', '-')
            rest = m.group(2).strip()
            if rest:
                tracks.append({"album": current_album, "track": rest, "details": ""})
            continue

        # Skip duration-only lines like "10 個4*8 拍" before any other parsing
        if re.match(r'^\s*\d+\s*個\s*4\*8\s*拍', line):
            continue

        # Numbered track lines: "1. 行走的木偶..." or "1、行走的木偶..."
        m = re.match(r'\s*(\d+)[\.\、]?\s*(.+)', line)
        if m:
            track_text = m.group(2).strip()
            # Skip lines that are just durations like "9 個4*8 拍" or "10 個4*8 拍"
            if re.match(r'^個?\s*\d*\s*個?\s*4\*8\s*拍', track_text):
                continue
            # Skip very short lines that aren't real track names
            if len(track_text) < 5:
                continue
            detail = ""
            dm = re.search(r'(\d+\s*個\s*4\*8\s*拍)', track_text)
            if dm:
                detail = dm.group(1)
            tracks.append({"album": current_album or "", "track": track_text, "details": detail})

    return tracks


def parse_supplementary(text: str) -> str:
    section = extract_section(text, '補充資料', None)
    if section:
        return section.strip()
    return ""


def parse_lesson(text: str, age_group: str, cn_name: str, en_name: str) -> dict:
    mot = parse_motivation(text)
    main_obj, sub_obj = parse_objectives(text)
    resources = parse_resources(text)
    activities = parse_activities(text)
    cd_tracks = parse_cd_tracks(text)
    supplementary = parse_supplementary(text)

    # Generate name from motivation + element
    core_piece = ""
    if cd_tracks:
        for t in cd_tracks:
            m = re.search(r'\d+[\.\、]\s*(.+?)[（(]', t.get("track", ""))
            if m:
                candidate = m.group(1).strip()
                if candidate and len(candidate) < 40:
                    core_piece = candidate
                    break

    if mot:
        # Use the first line of motivation (before any newline) as the name
        mot_short = mot.split('\n')[0].strip().rstrip('。，,.').strip()
        # Limit to 60 chars
        if len(mot_short) > 60:
            mot_short = mot_short[:57] + '…'
        name = f"{mot_short}《{cn_name}》" if core_piece else f"{mot_short}（{en_name}）"
    else:
        name = f"{cn_name}（{en_name}）"

    desc = f"{age_group} · {cn_name}（{en_name}）"

    return {
        "name": name,
        "description": desc,
        "stages": [{
            "name": name,
            "duration": 0,
            "type": "other",
            "age_group": age_group,
            "music_element": f"{cn_name}（{en_name}）",
            "core_piece": core_piece,
            "objectives_main": main_obj,
            "objectives_sub": sub_obj,
            "resources": resources,
            "motivation": mot,
            "activities": activities,
            "cd_tracks": cd_tracks,
            "supplementary": supplementary,
        }]
    }


# ── display ──────────────────────────────────────────────────────────

def print_lesson(lesson: dict):
    s = lesson["stages"][0]
    print(f"\n{'='*60}")
    print(f"  教案: {lesson['name']}")
    print(f"  年齡: {s['age_group']}  |  元素: {s['music_element']}")
    print(f"  主目標: {len(s['objectives_main'])} 項")
    for o in s['objectives_main']:
        print(f"    - {o[:60]}")
    print(f"  次目標: {len(s['objectives_sub'])} 項")
    print(f"  資源: {len(s['resources'])} 項")
    if s['motivation']:
        print(f"  引起動機: {s['motivation'][:60]}...")
    print(f"  活動: {len(s['activities'])} 個")
    for a in s['activities']:
        rp = f" [{a.get('rhythm_pattern','')}]" if a.get('rhythm_pattern') else ""
        print(f"    - {a['title'][:50]}{rp}")
    print(f"  CD曲目: {len(s['cd_tracks'])} 首")
    for t in s['cd_tracks'][:3]:
        print(f"    - {t['album']}: {t['track'][:50]}")
    if s['supplementary']:
        print(f"  補充資料: {len(s['supplementary'])} 字")
    print()


# ── API upsert ──────────────────────────────────────────────────────

def fetch_templates(api_url: str, token: str) -> list[dict]:
    import urllib.request
    headers = {"Authorization": f"Bearer {token}"}
    req = urllib.request.Request(f"{api_url}/api/templates", headers=headers)
    try:
        resp = urllib.request.urlopen(req)
        return json.loads(resp.read()).get("templates", [])
    except Exception as e:
        print(f"  Warning: cannot list templates: {e}")
        return []


def _normalize(s: str) -> str:
    """Normalize brackets and whitespace for comparison."""
    return s.replace('（', '(').replace('）', ')').replace(' ', '')


def match_template(lesson: dict, existing: list[dict]) -> str | None:
    name = lesson["name"]
    age = lesson["stages"][0]["age_group"]
    music = lesson["stages"][0]["music_element"]

    # 1. Exact name match
    for t in existing:
        if t["name"] == name:
            return t["id"]

    # 2. Normalized name match
    nname = _normalize(name)
    for t in existing:
        if _normalize(t["name"]) == nname:
            return t["id"]

    # 3. (age_group + music_element) match (normalized)
    nage = _normalize(age)
    nmusic = _normalize(music)
    for t in existing:
        st = t.get("stages", [])
        if st:
            s = st[0]
            sa = _normalize(s.get("age_group", "") or "")
            sm = _normalize(s.get("music_element", "") or "")
            if sa and sm and sa == nage and sm == nmusic:
                return t["id"]

    # 4. Element name match in template name (e.g. "拍子(Steady Beat)" found in name)
    #    Only if age group also matches
    if age:
        for t in existing:
            tname = t["name"]
            st = t.get("stages", [])
            s = st[0] if st else {}
            ta = _normalize(s.get("age_group", "") or "")
            # Check if template name contains the element info
            # Try matching by element keywords
            for kw in music.replace('（', '(').replace('）', ')').split('('):
                kw = kw.strip().rstrip(')')
                if len(kw) > 1 and kw in tname:
                    # Age group must match if available
                    if ta and ta != nage:
                        continue
                    return t["id"]

    return None


def upsert_template(lesson: dict, existing: list[dict], api_url: str, token: str, dry_run: bool = False):
    import urllib.request

    mid = match_template(lesson, existing)
    action = "UPDATE" if mid else "CREATE"

    if dry_run:
        print(f"  [{action}] {lesson['name'][:50]} {'(match ' + mid[:8] + '...)' if mid else '(new)'}")
        return

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
    }
    data = json.dumps(lesson, ensure_ascii=False).encode()

    try:
        if mid:
            req = urllib.request.Request(
                f"{api_url}/api/templates/{mid}",
                data=data, headers=headers, method="PUT"
            )
        else:
            req = urllib.request.Request(
                f"{api_url}/api/templates",
                data=data, headers=headers
            )
        resp = urllib.request.urlopen(req)
        result = json.loads(resp.read())
        tid = result.get('template', {}).get('id', result.get('id', ''))
        print(f"  ✓ {action}: {lesson['name'][:40]} ({tid[:8]}…)")
    except urllib.error.HTTPError as e:
        print(f"  ✗ {action} FAILED: {e.code} {e.read().decode()[:120]}")
    except Exception as e:
        print(f"  ✗ {action} ERROR: {e}")


# ── main ─────────────────────────────────────────────────────────────

def main():
    import argparse
    parser = argparse.ArgumentParser(description="Import lesson plans from book PDF")
    parser.add_argument("pdf", help="Path to PDF file")
    parser.add_argument("--dry-run", action="store_true", help="Parse and preview only")
    parser.add_argument("--one", help="Process only lessons matching this element name")
    parser.add_argument("--list", action="store_true", help="List detected lessons without parsing")
    parser.add_argument("--batch", action="store_true", help="Process all detected lesson plans")
    parser.add_argument("--api-url", default="http://localhost:8000")
    parser.add_argument("--token", help="JWT token (default: $HMEAYC_TOKEN)")
    parser.add_argument("--replace", action="store_true", help="Delete existing templates before importing")
    args = parser.parse_args()

    if not os.path.exists(args.pdf):
        print(f"File not found: {args.pdf}")
        sys.exit(1)

    print("Extracting pages...")
    pages = page_texts(args.pdf)
    clean_pages = [clean(p) for p in pages]

    print("Detecting lesson plan boundaries...")
    info = find_boundaries(clean_pages)
    if not info:
        print("No lesson plans detected!")
        sys.exit(1)

    by_age = {}
    for l in info:
        by_age.setdefault(l["age_group"], []).append(l)

    print(f"\nDetected {len(info)} lesson plans:")
    for ag in AGE_ORDER:
        if ag in by_age:
            print(f"\n  {ag} ({len(by_age[ag])} lessons):")
            for l in by_age[ag]:
                print(f"    {l['cn_name']:12s} ({l['en_name']:30s}) pages {l['start_page']+1}-{l['end_page']+1}")
        else:
            print(f"\n  {ag}: (none)")

    if args.list:
        return

    # Filter
    if args.one:
        kw = args.one.lower()
        info = [l for l in info if kw in l['cn_name'].lower() or kw in l['en_name'].lower()]
        if not info:
            print(f"\nNo lesson matching '{args.one}'")
            sys.exit(1)
        print(f"\nFiltered to {len(info)} lesson(s)")

    if not args.batch and not args.one:
        print("\nUse --batch to process all, or --one NAME for a single element.")
        return

    # Auth
    token = args.token or os.environ.get("HMEAYC_TOKEN")
    existing = []
    if token and not args.dry_run:
        existing = fetch_templates(args.api_url, token)
        print(f"\nFetched {len(existing)} existing templates from API")

        if args.replace and existing:
            import urllib.request
            headers = {"Authorization": f"Bearer {token}"}
            print(f"Deleting {len(existing)} existing templates...")
            for t in existing:
                tid = t["id"]
                try:
                    req = urllib.request.Request(
                        f"{args.api_url}/api/templates/{tid}",
                        headers=headers, method="DELETE"
                    )
                    urllib.request.urlopen(req)
                except urllib.error.HTTPError as e:
                    if e.code != 404:
                        print(f"  ✗ Delete {tid[:8]}… failed: {e.code}")
            existing = []
            print("  Done.")

    # Process
    for i, bound in enumerate(info):
        combined = ""
        for p in range(bound["start_page"], bound["end_page"] + 1):
            combined += clean_pages[p] + "\n"
        combined = re.sub(r'\n{3,}', '\n\n', combined).strip()

        lesson = parse_lesson(combined, bound["age_group"], bound["cn_name"], bound["en_name"])

        print(f"\n{'='*60}")
        print(f"[{i+1}/{len(info)}] {bound['age_group']} → {bound['cn_name']}（{bound['en_name']}）")
        print_lesson(lesson)

        if token:
            upsert_template(lesson, existing, args.api_url, token, args.dry_run)
        else:
            print("  (no HMEAYC_TOKEN — set env var or use --token to save)")


if __name__ == "__main__":
    main()
