# Phase 2+3: Template Stages, Multi-Group, Evaluation & Report

## Goal

Build on Phase 1 by adding:
- Advanced template editing (stages, metrics config)
- Multi-group support within a course
- Teacher scoring/comments per student (post-course evaluations)
- Consolidated course report across all sessions

---

## Phase 2: Template Stages & Multi-Group

### Template Stages UI (`dashboard/src/pages/Templates.tsx`)

Rewrite the template editor modal to support:

- **Stages editor**: dynamic list of `{name, duration (min), type (warmup/drill/game/cooldown/other)}`
  - Add/remove stages
  - Each stage has name input, number input for duration, type selector
- **Metrics config**: checkbox group for `activity`, `smoothness`, `stability`
- Display stage badges on template cards in the list view

Backend already stores `stages` (JSON) and `metrics_config` (JSON); only UI changes needed.

### Multi-Group via `group_name` on Session

**Modified: `backend/app/models/session.py`**
Add column: `group_name = Column(String(100), nullable=True)`

This allows a Course to have multiple Sessions for different groups (e.g., "A組", "B組") running in parallel.

### Beyond Phase 2: Session–Template Integration (built after original plan)

**Modified: `backend/app/models/session.py`**
Add columns:
- `template_id = Column(String(36), ForeignKey("course_templates.id"), nullable=True)` — links each session to a specific lesson plan template
- `current_activity_index = Column(Integer, default=0)` — tracks which activity within the template is currently being taught

**Modified: `backend/app/api/sessions.py`**
- `POST /api/sessions` now accepts `template_id` and `title`
- `PUT /api/sessions/{id}/activity` — update current activity index
- `GET /api/sessions/{id}` returns resolved `template_activities[]` from the linked template's stages

**Modified: `dashboard/src/pages/LiveView.tsx`**
- On mount, fetches session detail to get template activities
- Displays activity tracker panel: progress bar, current activity card (title, rhythm pattern, content)
- Prev/Next buttons advance the activity index and sync via API
- Teacher can see which activity is running and manually advance

---

## Phase 3: Evaluation & Report

### New Model: `CourseEvaluation` (`backend/app/models/course_evaluation.py`)

```python
class CourseEvaluation(Base):
    __tablename__ = "course_evaluations"
    id: UUID PK
    course_id: FK -> courses
    child_id: FK -> children
    teacher_id: FK -> users (nullable)
    score: Float (nullable, 0-100)
    comment: String(1000) (nullable)
    created_at, updated_at
    UniqueConstraint(course_id, child_id)  # one evaluation per student per course
```

**Registered in** `backend/app/models/__init__.py`

### Database Migration (`alembic/versions/01d302e27d4a_...`)

Combined migration adding:
- `sessions.group_name` column
- `course_evaluations` table with FKs and unique constraint

### API Endpoints (`backend/app/api/courses.py`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/courses/{id}/evaluations` | List evaluations with child names; if none exist, returns class children |
| PUT | `/api/courses/{id}/evaluations/{child_id}` | Upsert evaluation (score + comment) |
| GET | `/api/courses/{id}/report` | Consolidated report: course info, session summaries (IMU count, avg metrics), evaluations |

### Frontend: API Client (`dashboard/src/api/client.ts`)

Added methods:
- `api.getCourseEvaluations(courseId)`
- `api.upsertCourseEvaluation(courseId, childId, {score, comment})`
- `api.getCourseReport(courseId)`

### Frontend: Course Evaluation UI (`dashboard/src/pages/CourseDetail.tsx`)

When course status = `completed` and user is teacher/admin:
- Show "學生評分" section with table
- Each student row has: name, score input (0-100), comment input, save button
- Calls `upsertCourseEvaluation` per student independently

### Frontend: Course Detail Header

- Add "查看報告" link button when course is completed
- Links to `/dashboard/courses/:id/report`

### Frontend: Course Report Page (`dashboard/src/pages/CourseReport.tsx`)

- Route: `/dashboard/courses/:id/report`
- Access: org_admin, super_admin, teacher
- Displays:
  - Course header (name, class)
  - Summary cards (session count, IMU records, devices)
  - Sessions table (title, start time, IMU count, devices, avg activity/smoothness/stability)
  - Evaluations table (student name, score, comment)

### Beyond Phase 3: Cross-Session Analysis Trends (built after original plan)

**New: `GET /api/children/{id}/analysis/trends`** in `backend/app/api/assessments.py`

Aggregates `AnalysisResult` across all sessions for a child, grouped by `music_element` (resolved via Session → CourseTemplate → stages[0].music_element). Returns per-element arrays of `{date, rhythm_sync_rate, freeze_reaction_time, freeze_stability_score}`.

**Modified: `GET /api/children/{id}/assessments`** in `backend/app/api/assessments.py`

Returns `music_element` and `template_name` fields alongside each assessment entry, resolved from the session's linked template.

**Modified: `dashboard/src/pages/ChildAssessments.tsx`**

- Fetches both assessments and trends data on load
- New "音樂元素分析趨勢" section showing per-element bar charts:
  - 節奏同步率 (rhythm_sync_rate) for 節奏/拍子 sessions
  - 靜止反應時間 (freeze_reaction_time) for 走停 sessions
  - 靜止穩定度 (freeze_stability_score) for 走停 sessions
- Assessment list now shows music_element badges

**New: `POST /api/sessions/{id}/assessments/compute`** in `backend/app/api/assessments.py`

After computing basic metrics (activity_level, smoothness, stability_index), checks the session's template `music_element`:
- 節奏/拍子 → computes `rhythm_sync_rate` (zero-crossing rate approximation)
- 走停 → computes `freeze_reaction_time` + `freeze_stability_score` (activity drop detection)
Results stored in `AnalysisResult` table, upserted per child per session.

---

## File Change Summary

| # | File | Action |
|---|------|--------|
| 1 | `backend/app/models/session.py` | **Edit** (add group_name + template_id + current_activity_index) |
| 2 | `backend/app/models/course_evaluation.py` | **Create** |
| 3 | `backend/app/models/assessment_result.py` | **Create** (beyond plan) |
| 4 | `backend/app/models/analysis_result.py` | **Create** (beyond plan) |
| 5 | `backend/app/models/__init__.py` | **Edit** (add imports) |
| 6 | *Alembic auto-generated migration* | **Generate** |
| 7 | `backend/app/api/courses.py` | **Edit** (add evaluation + report endpoints) |
| 8 | `backend/app/api/assessments.py` | **Create** (beyond plan) |
| 9 | `backend/app/api/sessions.py` | **Edit** (add template_id support + activity endpoint) |
| 10 | `dashboard/src/api/client.ts` | **Edit** (add assessment + activity + trends methods) |
| 11 | `dashboard/src/pages/Templates.tsx` | **Rewrite** (add stages editor + metrics config) |
| 12 | `dashboard/src/pages/CourseDetail.tsx` | **Rewrite** (add evaluation section) |
| 13 | `dashboard/src/pages/CourseReport.tsx` | **Create** |
| 14 | `dashboard/src/pages/ChildAssessments.tsx` | **Create** (beyond plan) |
| 15 | `dashboard/src/pages/ClassAssessments.tsx` | **Create** (beyond plan) |
| 16 | `dashboard/src/pages/LiveView.tsx` | **Edit** (activity tracker panel) |
| 17 | `dashboard/src/App.tsx` | **Edit** (add routes) |

---

## Post-Implementation Verification

1. `cd backend && alembic upgrade head` — migration applies
2. `cd backend && python -c "from app.main import app"` — server loads
3. `cd dashboard && npx tsc --noEmit` — TypeScript passes
4. `cd dashboard && npx vite build` — production build succeeds
