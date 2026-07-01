# Deploy on VM

本文件提供在 Linux VM（Ubuntu/Debian）部署 HMEAYC 後端的最小可行流程。

## 1) 系統需求

- Python 3.11+
- `ffmpeg`（區間切片需要）

## 2) 安裝

```bash
git clone https://github.com/HMEAYC/NSTC.git
cd HMEAYC/backend
pip install -e ".[dev]"
```

## 3) 環境變數

```bash
export DATABASE_URL=postgresql+psycopg2://hmeayc:hmeayc@localhost:5432/hmeayc
export GEMINI_API_KEY=...
```

## 4) 執行

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8080
```

## 5) 命令列分析

```bash
python -m app "<video_path>" --stride 4 --pose pose
```

常用選項：
- `--no-track`
- `--no-video-reid`
- `--no-ai`
- `--pdf`
- `--no-accumulate-sessions`

## 6) API 使用

```bash
# 健康檢查
curl http://127.0.0.1:8080/health

# 提交分析任務
curl -X POST http://127.0.0.1:8080/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"video_path":"media/demo.mp4","stride":4,"pose":"pose"}'

# 查詢任務
curl http://127.0.0.1:8080/api/tasks/<task_id>
```

## 7) 產出位置

- 暫存：`$KINDER_TMP_DIR`（預設 `./tmp`）
- 身分與跨影片累積：`$KINDER_MEMORY_DIR`（預設 `./memory`）
- 分析報告：`$KINDER_REPORTS_DIR`（預設 `./reports`）
