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

---

## File Change Summary

| # | File | Action |
|---|------|--------|
| 1 | `backend/app/models/session.py` | **Edit** (add group_name) |
| 2 | `backend/app/models/course_evaluation.py` | **Create** |
| 3 | `backend/app/models/__init__.py` | **Edit** (add CourseEvaluation import) |
| 4 | *Alembic auto-generated migration* | **Generate** |
| 5 | `backend/app/api/courses.py` | **Edit** (add evaluation + report endpoints) |
| 6 | `dashboard/src/api/client.ts` | **Edit** (add evaluation + report methods) |
| 7 | `dashboard/src/pages/Templates.tsx` | **Rewrite** (add stages editor + metrics config) |
| 8 | `dashboard/src/pages/CourseDetail.tsx` | **Rewrite** (add evaluation section) |
| 9 | `dashboard/src/pages/CourseReport.tsx` | **Create** |
| 10 | `dashboard/src/App.tsx` | **Edit** (add report route) |

---

## Post-Implementation Verification

1. `cd backend && alembic upgrade head` — migration applies
2. `cd backend && python -c "from app.main import app"` — server loads
3. `cd dashboard && npx tsc --noEmit` — TypeScript passes
4. `cd dashboard && npx vite build` — production build succeeds
