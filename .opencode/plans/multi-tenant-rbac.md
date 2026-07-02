# Multi-Tenant RBAC 架構規劃

> 支援多幼兒園、多班、多教師、多家長同時使用，並落實資料權限控管。

---

## 1. 動機與目標

### 1.1 現狀限制

- 無使用者模型 — 所有端點無身分驗證（少數除外）
- 無組織/租戶隔離 — 所有資料全域可見
- 無角色權限 — 單一共享 API Key，無區別
- 無法支援家長檢視、教師分班管理、跨園區隔離

### 1.2 設計目標

| 目標 | 說明 |
|------|------|
| **多租戶隔離** | 不同幼兒園的資料完全隔離 |
| **角色權限** | super_admin > org_admin > teacher > parent |
| **資料最小暴露** | 只能看見自己被授權的資料 |
| **家長參與** | 家長可綁定幼兒，檢視發展報告 |
| **研究合規** | 支援去識別化匯出、IRB 授權管理 |

---

## 2. 資料模型設計

### 2.1 新增表格

```mermaid
erDiagram
    Organization {
        uuid id PK
        string name
        string code UK
        string contact_email
        boolean is_active
        datetime created_at
    }

    User {
        uuid id PK
        uuid org_id FK
        string email UK
        string password_hash
        string display_name
        enum role
        boolean is_active
        datetime created_at
    }

    Class {
        uuid id PK
        uuid org_id FK
        string name
        string grade
        datetime created_at
    }

    TeacherClass {
        uuid id PK
        uuid teacher_id FK
        uuid class_id FK
    }

    ParentChild {
        uuid id PK
        uuid parent_id FK
        uuid child_id FK
    }

    Organization ||--o{ User : has
    Organization ||--o{ Class : has
    Organization ||--o{ Device : owns
    User ||--o{ TeacherClass : teaches
    Class ||--o{ TeacherClass : assigned
    Class ||--o{ Child : contains
    User ||--o{ ParentChild : is_parent
    Child ||--o{ ParentChild : has_parent
```

### 2.2 修改現有表格

| 表格 | 新增欄位 | 說明 |
|------|---------|------|
| `children` | `org_id` FK, `class_id` FK, `added_by` FK→users | 幼兒歸屬於組織+班級 |
| `sessions` | `org_id` FK, `class_id` FK, `teacher_id` FK→users, `title` | 課程歸屬於班級+教師 |
| `devices` | `org_id` FK | 裝置歸屬於組織 |
| `reports` | `child_id` FK→children, `generated_by` FK→users | 報告可對應到個別幼兒 |
| `analysis_results` | `child_id` FK→children | 分析結果可對應到幼兒 |

### 2.3 角色定義

| 角色 | 層級 | 說明 |
|------|------|------|
| `super_admin` | 全域 | 系統管理，可檢視/管理所有組織 |
| `org_admin` | 組織 | 管理所屬組織的教師/班級/裝置/幼兒 |
| `teacher` | 班級 | 開課、查看所屬班級幼兒報告與指標 |
| `parent` | 個人 | 唯讀檢視自己綁定幼兒的報告與發展歷程 |

---

## 3. API 設計

### 3.1 驗證系統（新增）

| Method | Path | 說明 |
|--------|------|------|
| `POST` | `/api/auth/login` | 登入 → 回傳 JWT |
| `POST` | `/api/auth/refresh` | 刷新 Token |
| `GET` | `/api/auth/me` | 當前使用者與角色資訊 |

使用 JWT（如 `python-jose`），Payload 包含 `user_id`, `org_id`, `role`。

### 3.2 組織管理（super_admin）

| Method | Path | 說明 |
|--------|------|------|
| `GET` | `/api/admin/orgs` | 所有組織列表 |
| `POST` | `/api/admin/orgs` | 新增組織 |
| `PUT` | `/api/admin/orgs/{id}` | 更新組織資訊 |
| `DELETE` | `/api/admin/orgs/{id}` | 停用組織 |

### 3.3 班級管理（org_admin / teacher）

| Method | Path | 說明 |
|--------|------|------|
| `GET` | `/api/orgs/{orgId}/classes` | 班級列表 |
| `POST` | `/api/orgs/{orgId}/classes` | 新增班級 |
| `PUT` | `/api/orgs/{orgId}/classes/{id}` | 編輯班級 |
| `DELETE` | `/api/orgs/{orgId}/classes/{id}` | 刪除班級 |
| `GET` | `/api/orgs/{orgId}/classes/{id}/children` | 班級幼兒列表 |

### 3.4 使用者管理（org_admin）

| Method | Path | 說明 |
|--------|------|------|
| `GET` | `/api/orgs/{orgId}/users` | 教師/管理員列表 |
| `POST` | `/api/orgs/{orgId}/users` | 新增教師帳號 |
| `PUT` | `/api/orgs/{orgId}/users/{id}` | 編輯使用者 |
| `DELETE` | `/api/orgs/{orgId}/users/{id}` | 停用使用者 |

### 3.5 家長綁定

| Method | Path | 說明 |
|--------|------|------|
| `POST` | `/api/children/{childId}/parents` | org_admin 綁定家長 |
| `GET` | `/api/parents/me/children` | 家長查看自己的幼兒 |
| `DELETE` | `/api/parents/{parentId}/children/{childId}` | 解除綁定 |

### 3.6 現有 API 修改

**原則：** 每個資料庫查詢加入 `org_id` 過濾，並檢查使用者角色權限。

| 現有 API | 修改為 |
|----------|--------|
| `GET /api/sessions` | 只回傳該教師/組織的 sessions |
| `POST /api/sessions` | 自動帶入 `teacher_id`, `org_id` |
| `GET /api/children` | 只回傳該組織/班級的幼兒 |
| `POST /api/children` | 自動帶入 `org_id` |
| `GET /api/devices` | 只回傳該組織的裝置 |
| `POST /api/devices` | 自動帶入 `org_id` |
| `WS /ws/{session_id}` | 須驗證 JWT，只允許所屬 teacher 連線 |
| `POST /api/sessions/{id}/report` | 報告關聯到 child_id + generated_by |

### 3.7 權限檢查 Middleware

所有 API 端點（除 `/api/auth/*`, `/health` 外）透過 Dependency：

```python
from fastapi import Depends, HTTPException
from app.auth.jwt import get_current_user

def require_role(*roles: str):
    async def check(current_user = Depends(get_current_user)):
        if current_user.role not in roles:
            raise HTTPException(403, "Insufficient permissions")
        return current_user
    return check

def same_org(org_id: str, current_user = Depends(get_current_user)):
    if current_user.role == "super_admin":
        return
    if current_user.org_id != org_id:
        raise HTTPException(403, "Cross-org access denied")
```

---

## 4. Dashboard 頁面變更

```
/dashboard/login                    ← 新增登入頁面（Email + Password）
/dashboard/                         ← 根據角色顯示不同首頁
/dashboard/admin/orgs               ← super_admin 管理組織列表
/dashboard/admin/orgs/{id}          ← 組織詳細（班級/教師/裝置）
/dashboard/classes                  ← 教師/管理者查看班級
/dashboard/classes/{id}             ← 班級詳細 + 幼兒列表
/dashboard/children/{id}            ← 幼兒歷程（家長/教師用）
/dashboard/parent/children          ← 家長入口（只看自己小孩）
/dashboard/admin/users              ← org_admin 管理教師帳號
/dashboard/settings                 ← 組織設定
```

### 4.1 角色導覽差異

| 角色 | 可見頁面 |
|------|---------|
| super_admin | 管理組織、全域裝置、系統設定 |
| org_admin | 管理班級、教師帳號、裝置、所有報告 |
| teacher | 我的班級、即時監控、歷史課程、報告 |
| parent | 我的小孩（報告/歷程唯讀） |

---

## 5. 資料分享與隱私

### 5.1 存取規則矩陣

| 資料 | super_admin | org_admin | teacher | parent |
|------|:-----------:|:---------:|:-------:|:------:|
| 跨組織資料 | ✅ | ❌ | ❌ | ❌ |
| 組織基本資料 | ✅ | ✅ | ✅ | ❌ |
| 班級幼兒列表 | ✅ | ✅ | 所屬班級 | ❌ |
| 幼兒報告 | ✅ | ✅ | 所屬班級 | 自己的小孩 |
| 即時 IMU 資料 | ✅ | ✅ | 所屬班級 | ❌ |
| 原始 IMU 數據 | ✅ | ✅ 限研究用途 | ❌ | ❌ |
| 裝置管理 | ✅ | ✅ 所屬組織 | ❌ | ❌ |
| 教師帳號管理 | ✅ | ✅ 所屬組織 | ❌ | ❌ |

### 5.2 研究匯出

- 支援 CSV/JSON 匿名化匯出（移除姓名、學號，保留年齡/性別）
- 需 super_admin 或 org_admin 權限
- 匯出記錄寫入審計日誌

### 5.3 IRB 合規

- 家長同意書電子化儲存（僅 org_admin 可上傳/查閱）
- 家長可隨時撤回同意 → 觸發資料標記或刪除流程
- 研究資料保存期限設定，到期自動提醒

---

## 6. 實作階段

| 階段 | 內容 | 預估工時 |
|------|------|---------|
| **Phase 1** | ✅ 已完成 — `User`/`Organization`/`Class`/`TeacherClass`/`ParentChild` 模型 + Alembic migration（`6f11ca848bb2`）；JWT 登入（`/api/auth/*`）；`org_id` FK 遷移 | 2 週 |
| **Phase 2** | ✅ 已完成 — 權限檢查 middleware + 所有現有 API org_id 過濾 + 角色檢查；Dashboard 登入流程 + AuthProvider + ProtectedRoute | 2 週 |
| **Phase 3** | ✅ 已完成 — 教師/班級管理 API + UI（`/dashboard/classes`, `/dashboard/admin/users`）；家長綁定流程（`POST /api/children/{id}/parents`）；Parent 專區（`/dashboard/parent`） | 1 週 |
| **Phase 4** | ✅ 已完成 — 匿名化匯出（CSV/JSON，`/api/admin/export/anonymized`）；審計日誌（`AuditLog` model + `log_action()` helper）；IRB 合規（`ParentConsent` model + `/api/consent`） | 1 週 |

---

## 7. 注意事項

- **密碼儲存：** 使用 `bcrypt`（透過 `passlib`），不儲存明文
- **CORS：** 維持 allowlist 政策，生產環境不得使用 `*`
- **Rate Limit：** 登入端點建議加入速率限制（如 `slowapi`）
- **WebSocket 驗證：** 查詢參數帶 token（`/ws/{session_id}?token=xxx`），連線時驗證
- **資料遷移：** 現有資料在 migration 時設 `org_id` 為一個預設組織，避免資料孤立
- **審計：** 所有寫入操作（新增/修改/刪除）記錄 `actor_id`, `action`, `timestamp`
