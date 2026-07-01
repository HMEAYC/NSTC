# Field Testing

This directory holds artifacts and protocols for on-site field testing of
the HMEAYC system.

## Purpose

- Validate hardware (IMU sensors, camera, audio) in real classroom environments.
- Verify end-to-end pipeline: IMU ingestion → analysis → report generation.
- Collect edge-case data (occlusions, noise, multi-child scenarios).
- Document configuration and findings per session.

## Session Protocol Template

```markdown
# Field Test Session — YYYY-MM-DD

**Location:** <school / classroom>
**Attendees:** <list>
**Hardware:** <sensor S/Ns, camera model>
**Duration:** <start – end>

### Objectives
- <goal 1>
- <goal 2>

### Setup Notes
<wiring, mounting, lighting conditions>

### Observations
<issues, anomalies, qualitative notes>

### Data Collected
- IMU logs: <paths>
- Video clips: <paths>
- Audio: <paths>

### Action Items
- [ ] <item>
```

Create one markdown file per session using the template above.

---

## 多人系統裝置管理 — 驗證

### 快速驗證

```bash
# 完整 API 流程測試（需後端在 :8080 執行）
bash field-testing/verify-device-management.sh
```

### API 測試案例

`verify-device-management.sh` 涵蓋：

| # | 測試項目 | 預期結果 |
|---|---------|---------|
| 1.1 | 列出裝置（空） | `devices: []` |
| 1.2 | 註冊腰帶 A | 回傳 status=online |
| 1.3 | 註冊腰帶 B | 回傳 status=online |
| 1.4 | 心跳更新（版本） | firmware_version 更新 |
| 1.5 | 列出裝置（2 筆） | `len(devices) == 2` |
| 2.1-2.2 | 註冊學員 × 2 | name 正確 |
| 2.3 | 列出學員（2 筆） | `len(children) == 2` |
| 3.1 | 建立課程 | 回傳 session_id |
| 3.2-3.3 | 配對裝置→學員 | method=manual |
| 3.4 | 查詢配對（2 筆） | `len(assignments) == 2` |
| 3.5 | 覆寫配對 | child_id 更新 |
| 4.1-4.2 | 錯誤處理 | 回傳 404 |
| 5.1-5.2 | Dashboard 頁面 | HTTP 200 |

### 操作文件

詳細操作步驟與資料庫模型說明請見 `device-management-guide.md`。
