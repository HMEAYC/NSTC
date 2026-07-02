#!/bin/bash

PID_FILE="/tmp/hmeayc-pids"

echo "=== Stopping HMEAYC Services ==="

# Stop background processes
if [ -f "$PID_FILE" ]; then
  while IFS='=' read -r name pid; do
    if kill -0 "$pid" 2>/dev/null; then
      echo "  Stopping $name (PID $pid)"
      kill "$pid" 2>/dev/null
    fi
  done < "$PID_FILE"
  rm -f "$PID_FILE"
fi

# Stop database
echo "  Stopping PostgreSQL..."
docker compose down

echo "=== All services stopped ==="
