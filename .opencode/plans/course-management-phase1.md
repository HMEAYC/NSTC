# Phase 1: Core Course Management

## Goal

Add a complete course management layer on top of the existing Session/WebSocket infrastructure. A `Course` is a lesson plan (what, when, who) that wraps one or more existing `Session` runs.

---

## Data Model (3 new files, 1 modified)

### New: `backend/app/models/course_template.py`

```python
class CourseTemplate(Base):
    __tablename__ = "course_templates"
    id            # UUID PK
    org_id        # FK -> organizations
    name          # str
    description   # str (nullable)
    duration_minutes  # int (nullable)
    stages        # JSON (nullable) — [{name:"暖身",duration:300,type:"warmup"},...]
    metrics_config # JSON (nullable) — {activity:true,smoothness:true,stability:true}
    created_at    # datetime
```

### New: `backend/app/models/course.py`

```python
class Course(Base):
    __tablename__ = "courses"
    id            # UUID PK
    org_id        # FK -> organizations
    class_id      # FK -> classes (nullable)
    template_id   # FK -> course_templates (nullable)
    name          # str
    description   # str (nullable)
    status        # Enum: draft | scheduled | active | completed | cancelled
    scheduled_at  # DateTime (nullable)
    started_at    # DateTime (nullable)
    ended_at      # DateTime (nullable)
    created_at    # datetime
```

### Modified: `backend/app/models/session.py`

Add column: `course_id = Column(String(36), ForeignKey("courses.id"), nullable=True)`

*Later additions beyond original plan:*
- `template_id = Column(String(36), ForeignKey("course_templates.id"), nullable=True)` — links each session to the template being taught
- `current_activity_index = Column(Integer, default=0)` — tracks which activity within the template is currently active

### Updated: `backend/app/models/__init__.py`

Add imports for `CourseTemplate`, `Course`.

---

## Database Migration

```bash
alembic revision --autogenerate -m "add course and course_template models"
```

---

## New API Router: `backend/app/api/courses.py`

Follows existing CRUD patterns from `sessions.py` / `admin.py` (FlatAPI, Pydantic request bodies, `effective_org_id`, `require_role`).

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/courses` | org_admin/teacher/super_admin | List courses, filterable by `?status=&class_id=` |
| POST | `/api/courses` | org_admin/super_admin | Create course |
| GET | `/api/courses/{id}` | org_admin/teacher/super_admin | Get course detail with sessions |
| PUT | `/api/courses/{id}` | org_admin/super_admin | Update course (draft/scheduled only) |
| DELETE | `/api/courses/{id}` | org_admin/super_admin | Delete course (draft only) |
| POST | `/api/courses/{id}/start` | org_admin/super_admin/teacher | Start → `started_at=now`, status=active |
| POST | `/api/courses/{id}/end` | org_admin/super_admin/teacher | End → `ended_at=now`, status=completed |
| GET | `/api/courses/{id}/sessions` | org_admin/teacher/super_admin | List sessions for this course |
| GET | `/api/templates` | org_admin/teacher/super_admin | List templates |
| POST | `/api/templates` | org_admin/super_admin | Create template |
| GET | `/api/templates/{id}` | org_admin/teacher/super_admin | Get template |
| PUT | `/api/templates/{id}` | org_admin/super_admin | Update template |
| DELETE | `/api/templates/{id}` | org_admin/super_admin | Delete template |

### New: `backend/app/api/assessments.py` (built beyond original plan)

Assessment computation and query endpoints:

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/sessions/{id}/assessments/compute` | any (org-scoped) | Batch compute activity/smoothness/stability from IMU data; also populates `AnalysisResult` (rhythm_sync_rate, freeze_reaction) based on session's template music_element |
| GET | `/api/sessions/{id}/assessments` | any (org-scoped) | Get session assessment results with child/device names |
| GET | `/api/children/{id}/assessments` | any (org-scoped) | Get child's assessment history across sessions, including `music_element` and `template_name` from associated template |
| GET | `/api/children/{id}/analysis/trends` | any (org-scoped) | Cross-session trend aggregation grouped by music element |
| GET | `/api/classes/{id}/assessments` | any (org-scoped) | Get class-level assessment summary per session |

### New: `backend/app/models/assessment_result.py`

```python
class AssessmentResult(Base):
    __tablename__ = "assessment_results"
    id, session_id, device_id, child_id
    activity_level, smoothness, stability_index  # computed IMU metrics
    sample_count, window_seconds, computed_at
    UniqueConstraint(session_id, device_id, child_id)
```

### New: `backend/app/models/analysis_result.py`

```python
class AnalysisResult(Base):
    __tablename__ = "analysis_results"
    id, session_id, child_id, timestamp
    rhythm_sync_rate       # populated for 節奏/拍子 templates
    freeze_reaction_time   # populated for 走停 templates
    freeze_stability_score # populated for 走停 templates
    raw_data               # JSON, for future use
```

### Modified: `backend/app/main.py`

Register the new router: `app.include_router(courses_router)`

Also registers `assessments_router`.

---

## Frontend: API Client (`dashboard/src/api/client.ts`)

Add new types:

```typescript
CourseInfo { id, org_id, class_id, template_id, name, description, status, scheduled_at, started_at, ended_at, created_at }
CourseTemplateInfo { id, name, description, duration_minutes, stages, metrics_config, created_at }
SessionDetail extends SessionSummary { template_id?, current_activity_index, template_activities[] }
AssessmentResultInfo { id, device_id, child_id, activity_level, smoothness, stability_index, ... }
```

Add new methods:

| Method | API call |
|--------|----------|
| `api.listCourses(params?)` | `GET /api/courses?status=&class_id=` |
| `api.createCourse(data)` | `POST /api/courses` |
| `api.getCourse(id)` | `GET /api/courses/{id}` |
| `api.updateCourse(id, data)` | `PUT /api/courses/{id}` |
| `api.deleteCourse(id)` | `DELETE /api/courses/{id}` |
| `api.startCourse(id)` | `POST /api/courses/{id}/start` |
| `api.endCourse(id)` | `POST /api/courses/{id}/end` |
| `api.getCourseSessions(id)` | `GET /api/courses/{id}/sessions` |
| `api.listTemplates()` | `GET /api/templates` |
| `api.createTemplate(data)` | `POST /api/templates` |
| `api.getTemplate(id)` | `GET /api/templates/{id}` |
| `api.updateTemplate(id, data)` | `PUT /api/templates/{id}` |
| `api.deleteTemplate(id)` | `DELETE /api/templates/{id}` |
| `api.createSession(data)` | `POST /api/sessions` (supports template_id) |
| `api.updateActivity(sessionId, idx)` | `PUT /api/sessions/{id}/activity` |
| `api.computeSessionAssessment(sessionId)` | `POST /api/sessions/{id}/assessments/compute` |
| `api.getSessionAssessments(sessionId)` | `GET /api/sessions/{id}/assessments` |
| `api.getChildAssessments(childId)` | `GET /api/children/{id}/assessments` |
| `api.getChildAnalysisTrends(childId)` | `GET /api/children/{id}/analysis/trends` |
| `api.getClassAssessments(classId)` | `GET /api/classes/{id}/assessments` |

### Session API additions beyond original plan

`backend/app/api/sessions.py` adds:

- `POST /api/sessions` now accepts `{course_type, template_id?, title?}` — sessions can be created directly with a template link
- `PUT /api/sessions/{id}/activity` — updates `current_activity_index` (used by LiveView activity tracker)
- `GET /api/sessions/{id}` returns `template_id`, `current_activity_index`, `template_activities[]` (resolved from template's stages)

### New: `backend/scripts/import_pdf.py` (beyond original plan)

Imports 42 lesson plans from the full book PDF (`跳動的音符 -編輯版1208.pdf`), organized by 4 age groups × 10-12 music elements. Detects lesson boundaries, parses structured data (objectives, resources, motivation, activities with rhythm patterns, CD tracks, supplementary), and upserts via the template API.

Usage:
```bash
python3 scripts/import_pdf.py path/to/book.pdf --batch --token $TOKEN
python3 scripts/import_pdf.py path/to/book.pdf --replace --batch   # clear + re-import all
```

---

## Frontend: Pages

### New: `dashboard/src/pages/Courses.tsx`
- **Route:** `/dashboard/courses`
- **Access:** org_admin, super_admin, teacher
- **Layout:** Same card/table pattern as `ClassManagement.tsx`
- **Features:**
  - List all courses with status badges (draft/scheduled/active/completed/cancelled)
  - Create button → inline form (name, class selector, template selector, scheduled_at date picker)
  - Click course → navigate to `/dashboard/courses/:id`

### New: `dashboard/src/pages/CourseDetail.tsx`
- **Route:** `/dashboard/courses/:id`
- **Access:** org_admin, super_admin, teacher
- **Features:**
  - Course info display (name, description, status, scheduled_at, class name, template name)
  - Action buttons (role-gated): Edit (draft), Start, End
  - Start → `POST /api/courses/{id}/start`, then show active state
  - End → `POST /api/courses/{id}/end`
  - Sessions table: status, device count, IMU count, link to live view + report
  - Back navigation to `/dashboard/courses`

### New: `dashboard/src/pages/Templates.tsx`
- **Route:** `/dashboard/templates`
- **Access:** org_admin, super_admin, teacher
- **Features:**
  - List templates as cards with age group, music element, core piece badges
  - Create/edit modal: name, description, age group, music element, core piece, objectives, resources, motivation, activities (with rhythm patterns), CD tracks, supplementary
  - Delete with confirmation
  - ESC key closes modal

### New: `dashboard/src/pages/ChildAssessments.tsx` (beyond original plan)
- **Route:** `/dashboard/children/:childId/assessments`
- **Access:** org_admin, super_admin, teacher
- **Features:**
  - Latest metrics overview (activity, smoothness, stability)
  - Average metrics across all sessions
  - Trend bar charts for activity level and stability index
  - Per-music-element analysis trends (rhythm_sync_rate, freeze_reaction_time, freeze_stability_score)
  - Historical assessment list with music_element and template_name

### New: `dashboard/src/pages/ClassAssessments.tsx` (beyond original plan)
- **Route:** `/dashboard/classes/:classId/assessments`
- **Access:** org_admin, super_admin, teacher
- **Features:**
  - Per-session assessment summary table (activity, smoothness, stability averages)

### Modified: `dashboard/src/pages/LiveView.tsx` (beyond original plan)
- **Features:**
  - Activity tracker panel: shows template activities from linked session, progress bar, current activity card (title, rhythm pattern, content excerpt)
  - Prev/Next buttons to advance through activities; calls `PUT /api/sessions/{id}/activity` to sync

---

## Frontend: Routing + Navigation

### Modified: `dashboard/src/App.tsx`

Add lazy imports and 3 new routes under the teacher/org_admin section:

```tsx
const Courses = lazy(() => import("./pages/Courses"));
const CourseDetail = lazy(() => import("./pages/CourseDetail"));
const Templates = lazy(() => import("./pages/Templates"));

{/* alongside existing /dashboard/classes route */}
<Route path="/dashboard/courses" element={<Courses />} />
<Route path="/dashboard/courses/:id" element={<CourseDetail />} />
<Route path="/dashboard/templates" element={<Templates />} />
```

### Modified: `dashboard/src/components/Navbar.tsx`

Add "課程" section after "班級", visible for org_admin/super_admin/teacher:

- `href="/dashboard/courses"` → "課程列表"
- `href="/dashboard/templates"` → "教案模板"

---

## File Change Summary

| # | File | Action |
|---|------|--------|
| 1 | `backend/app/models/course_template.py` | **Create** |
| 2 | `backend/app/models/course.py` | **Create** |
| 3 | `backend/app/models/assessment_result.py` | **Create** (beyond plan) |
| 4 | `backend/app/models/analysis_result.py` | **Create** (beyond plan) |
| 5 | `backend/app/models/__init__.py` | **Edit** (add imports) |
| 6 | `backend/app/models/session.py` | **Edit** (add course_id FK + template_id + current_activity_index) |
| 7 | *Alembic auto-generated migration* | **Generate** |
| 8 | `backend/app/api/courses.py` | **Create** |
| 9 | `backend/app/api/assessments.py` | **Create** (beyond plan) |
| 10 | `backend/app/main.py` | **Edit** (register routers) |
| 11 | `backend/scripts/import_pdf.py` | **Create** (beyond plan) |
| 12 | `dashboard/src/api/client.ts` | **Edit** (types + methods) |
| 13 | `dashboard/src/pages/Courses.tsx` | **Create** |
| 14 | `dashboard/src/pages/CourseDetail.tsx` | **Create** |
| 15 | `dashboard/src/pages/Templates.tsx` | **Create + rewrite** |
| 16 | `dashboard/src/pages/ChildAssessments.tsx` | **Create** (beyond plan) |
| 17 | `dashboard/src/pages/ClassAssessments.tsx` | **Create** (beyond plan) |
| 18 | `dashboard/src/pages/LiveView.tsx` | **Edit** (activity tracker) |
| 19 | `dashboard/src/App.tsx` | **Edit** (add routes) |
| 20 | `dashboard/src/components/Navbar.tsx` | **Edit** (add nav links) |

---

## Post-Implementation Verification

1. `cd backend` + `alembic upgrade head` — migration applies cleanly
2. `cd backend` + `uvicorn app.main:app` — server starts
3. `curl http://localhost:8000/health` — responds OK
4. `curl -X POST http://localhost:8000/api/courses` — creates a course (with auth)
5. `curl http://localhost:8000/api/templates` — lists templates
6. `cd dashboard` + `npm run dev` — frontend builds and renders new pages
