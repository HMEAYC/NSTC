#!/bin/bash
set -e

PID_FILE="/tmp/hmeayc-pids"

echo "=== Starting HMEAYC Services ==="

# 1. Database
echo "[1/3] Starting PostgreSQL..."
docker compose up -d db
sleep 1

# 2. Backend
echo "[2/3] Starting Backend (:8000)..."
cd backend
nohup python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8000 \
  > /tmp/hmeayc-backend.log 2>&1 &
echo "backend=$!" >> "$PID_FILE"
cd ..

# 3. Dashboard
echo "[3/3] Starting Dashboard (:5173)..."
cd dashboard
nohup npx vite --host 127.0.0.1 --port 5173 \
  > /tmp/hmeayc-dashboard.log 2>&1 &
echo "dashboard=$!" >> "$PID_FILE"
cd ..

echo ""
echo "=== All services started ==="
echo "  PostgreSQL :5432"
echo "  Backend    :8000  (log: /tmp/hmeayc-backend.log)"
echo "  Dashboard  :5173  (log: /tmp/hmeayc-dashboard.log)"
echo ""
echo "Run ./stop.sh to stop all services."
