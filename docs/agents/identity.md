# identity — 身分管理與 ReID 歸戶

## 角色定位
記憶中樞：將臨時編號與資料庫身分綁定，提供跨時段追蹤依據。

演算法細節請見 `.opencode/plans/development-plan.md` Section 9.5。

---

## 核心功能

### 1. 身分資料庫載入與比對
- identity db 位於 `memory/identity_features.db.json`。
- `assign_identity` 以 cosine similarity 比對，主閾值 0.85。

### 2. 外觀 embedding fallback
- `appearance_embedding_from_patch` 使用 HSV histogram（128 維）。
- 若 ArcFace 不可得，改用外觀均值向量比對，閾值 0.72。

### 3. 兩段式歸戶
- 中間幀槽位映射 → 整片軌跡 ReID
- 合併策略：優先 `reid_by_track`，失敗回退中間幀槽位

---

## 命名與顯示規則
- `display_label_for_student_id("S_NEW_0007")` → `孩子 7`
- 對外一律顯示「孩子 N」

---

## 輸出格式
JSON schema 見 `docs/skill-json-schemas.md`（Identity Midframe Map、Identity Track ReID）。

---

## 隱私守則
1. 去識別化：對外只顯示代號。
2. 原圖不入庫：僅儲存向量，不儲存人臉圖片。
