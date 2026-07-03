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

### Modified: `backend/app/main.py`

Register the new router: `app.include_router(courses_router)`

---

## Frontend: API Client (`dashboard/src/api/client.ts`)

Add new types:

```typescript
CourseInfo { id, org_id, class_id, template_id, name, description, status, scheduled_at, started_at, ended_at, created_at }
CourseTemplateInfo { id, name, description, duration_minutes, stages, metrics_config, created_at }
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
  - List templates as cards
  - Create/edit modal: name, description, duration, stages (dynamic list of name+duration)
  - Delete with confirmation

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
| 3 | `backend/app/models/__init__.py` | **Edit** (add imports) |
| 4 | `backend/app/models/session.py` | **Edit** (add course_id FK) |
| 5 | *Alembic auto-generated migration* | **Generate** |
| 6 | `backend/app/api/courses.py` | **Create** |
| 7 | `backend/app/main.py` | **Edit** (register router) |
| 8 | `dashboard/src/api/client.ts` | **Edit** (types + methods) |
| 9 | `dashboard/src/pages/Courses.tsx` | **Create** |
| 10 | `dashboard/src/pages/CourseDetail.tsx` | **Create** |
| 11 | `dashboard/src/pages/Templates.tsx` | **Create** |
| 12 | `dashboard/src/App.tsx` | **Edit** (add routes) |
| 13 | `dashboard/src/components/Navbar.tsx` | **Edit** (add nav links) |

---

## Post-Implementation Verification

1. `cd backend` + `alembic upgrade head` — migration applies cleanly
2. `cd backend` + `uvicorn app.main:app` — server starts
3. `curl http://localhost:8000/health` — responds OK
4. `curl -X POST http://localhost:8000/api/courses` — creates a course (with auth)
5. `curl http://localhost:8000/api/templates` — lists templates
6. `cd dashboard` + `npm run dev` — frontend builds and renders new pages
