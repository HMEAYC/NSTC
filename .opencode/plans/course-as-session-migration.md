# Course → Session 合併計畫

## 目標
消除「課程（Course）」與「Session」兩個概念的混淆，以後 Session 就是課程。

## 現狀

### courses 表（要消失的）
| 欄位 | 說明 |
|------|------|
| id, org_id, class_id, template_id | FK |
| name, description | 課程名稱/描述 |
| status | draft / scheduled / active / completed / cancelled |
| scheduled_at, started_at, ended_at | 時間 |
| created_at | 建立時間 |

### 相依
- `course_evaluations.course_id` → 要改指向 sessions
- `sessions.course_id` → 刪掉

### sessions 表（要擴充的）
| 現有欄位 | 缺少的 |
|----------|--------|
| id, org_id, class_id, teacher_id, template_id | ❌ name, description |
| title, group_name | ❌ scheduled_at |
| course_type, child_info | ❌ 較完整的 status |
| status (active/completed) | ❌ 需要 draft/scheduled/cancelled |
| current_activity_index, start_time, end_time | |

### 不受影響的 FK（已指向 sessions）
- `device_assignments` ✅
- `analysis_results` ✅
- `assessment_results` ✅
- `imu_data` ✅
- `reports` ✅

## 執行步驟

### Step 1: DB Migration
```sql
-- 擴充 sessions.status enum
ALTER TYPE session_status ADD VALUE 'draft';
ALTER TYPE session_status ADD VALUE 'scheduled';
ALTER TYPE session_status ADD VALUE 'cancelled';

-- 加欄位到 sessions
ALTER TABLE sessions ADD COLUMN name VARCHAR(200);
ALTER TABLE sessions ADD COLUMN description TEXT;
ALTER TABLE sessions ADD COLUMN scheduled_at TIMESTAMP;

-- 搬資料：courses → sessions（用 course_id 配對）
UPDATE sessions s SET
  name = c.name,
  description = c.description,
  scheduled_at = c.scheduled_at
FROM courses c
WHERE s.course_id = c.id;

-- 把沒有對應 course 的 session 也用 title 補 name
UPDATE sessions SET name = title WHERE name IS NULL;

-- course_evaluations → 加 session_id 欄位
ALTER TABLE course_evaluations ADD COLUMN session_id VARCHAR(36) REFERENCES sessions(id);

-- 搬 course_evaluations 資料（每個 evaluation 找到對應 session）
UPDATE course_evaluations e SET session_id = s.id
FROM sessions s
WHERE e.course_id = s.course_id;

-- 刪掉舊 FK + 欄位
ALTER TABLE course_evaluations DROP COLUMN course_id;
ALTER TABLE sessions DROP COLUMN course_id;
DROP TABLE courses;
```

### Step 2: Backend API
- `courses.py` → 整併進 `sessions.py`（或全部刪除，路由搬到 sessions.py）
- `GET /api/sessions` → 回傳所有課程（含 filter by status, class_id）
- `POST /api/sessions` → 建立新課程（name, class_id, template_id, scheduled_at, description）
- `GET /api/sessions/{id}` → 課程詳情（含 template_activities, assignments, etc）
- `PUT /api/sessions/{id}` → 更新課程
- `DELETE /api/sessions/{id}` → 刪除課程
- `POST /api/sessions/{id}/start` → 開始上課（status→active, start_time=now）
- `POST /api/sessions/{id}/end` → 結束課程（status→completed, end_time=now）
- `PUT /api/sessions/{id}/activity` → 更新活動進度（已存在）
- `GET /api/sessions/{id}/evaluations` → 課程評分列表
- `PUT /api/sessions/{id}/evaluations/{childId}` → 儲存評分
- `GET /api/sessions/{id}/report` → 課程報告

### Step 3: Frontend
- `Courses.tsx` → 改名 `SessionList.tsx` 或內容簡化（路由 `/dashboard/sessions`）
- `CourseDetail.tsx` → 改名 `SessionDetail.tsx` 或直接改用 `/dashboard/sessions/{id}`
- `client.ts` → 更新所有 `getCourse`, `createCourse` → `getSession`, `createSession`
- 其他頁面裡的 Link (`/dashboard/courses/...`) → 改成 `/dashboard/sessions/...`
- App.tsx 路由更新

### Step 4: 清理
- 刪除 `backend/app/models/course.py`
- 刪除 `backend/app/api/courses.py`
- 確認所有前端編譯通過
