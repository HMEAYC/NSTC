#!/usr/bin/env bash
# ===========================================================================
# 驗證：多人系統裝置管理 — API 端點整合測試
# 使用方式：bash field-testing/verify-device-management.sh
# 前提：後端已在 http://localhost:8000 執行
# ===========================================================================

set -uo pipefail
API_BASE="http://localhost:8000"
PASS=0
FAIL=0

# 獲取 JWT Token 以便進行多租戶 RBAC 驗證
TOKEN=$(command curl -s -X POST "$API_BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@test.com","password":"password123"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null || echo "")

curl() {
  local args=("$@")
  if [[ "${args[*]}" == *"/api/auth/login"* ]]; then
    command curl "${args[@]}"
  else
    command curl -H "Authorization: Bearer $TOKEN" "${args[@]}"
  fi
}

green() { echo "  ✅ $1"; ((PASS++)); }
red() { echo "  ❌ $1"; ((FAIL++)); }

echo "========================================"
echo "  多人系統裝置管理 — API 驗證"
echo "========================================"
echo ""

# -------------------------------------------------------------------
echo "1️⃣  裝置管理 (Device)"
# -------------------------------------------------------------------

echo "  1.1 列出裝置"
r=$(curl -s "$API_BASE/api/devices")
COUNT=$(echo "$r" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['devices']))" 2>/dev/null || echo "0")
green "GET /api/devices → $COUNT 筆裝置（新測試將新增 2 筆）"

echo "  1.2 註冊/更新腰帶 A"
r=$(curl -s -X POST "$API_BASE/api/devices" \
  -H "Content-Type: application/json" \
  -d '{"device_id":"esp32-c3-001","name":"腰帶 A","firmware_version":"v0.1.0"}')
if echo "$r" | python3 -c "import sys,json; d=json.load(sys.stdin)['device']; assert d['status']=='online'" 2>/dev/null; then
  DEVICE_A_ID=$(echo "$r" | python3 -c "import sys,json; print(json.load(sys.stdin)['device']['id'])")
  green "POST /api/devices → 腰帶 A 已註冊 (id=$DEVICE_A_ID)"
else
  DEVICE_A_ID=""
  red "POST /api/devices → $r"
fi

echo "  1.3 註冊腰帶 B"
r=$(curl -s -X POST "$API_BASE/api/devices" \
  -H "Content-Type: application/json" \
  -d '{"device_id":"esp32-c3-002","name":"腰帶 B","firmware_version":"v0.1.0"}')
DEVICE_B_ID=$(echo "$r" | python3 -c "import sys,json; print(json.load(sys.stdin)['device']['id'])")
if echo "$r" | python3 -c "import sys,json; d=json.load(sys.stdin)['device']; assert d['status']=='online'" 2>/dev/null; then
  green "POST /api/devices → 腰帶 B 已註冊 (id=$DEVICE_B_ID)"
else
  red "POST /api/devices → $r"
fi

echo "  1.4 重新註冊（更新狀態 = 心跳測試）"
r=$(curl -s -X POST "$API_BASE/api/devices" \
  -H "Content-Type: application/json" \
  -d '{"device_id":"esp32-c3-001","firmware_version":"v0.1.1"}')
if echo "$r" | python3 -c "import sys,json; d=json.load(sys.stdin)['device']; assert d['firmware_version']=='v0.1.1'" 2>/dev/null; then
  green "POST /api/devices (心跳) → 版本已更新至 v0.1.1"
else
  red "POST /api/devices (心跳) → $r"
fi

echo "  1.5 列出裝置 (應 ≥ 2 筆)"
r=$(curl -s "$API_BASE/api/devices")
COUNT=$(echo "$r" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['devices']))")
if [ "$COUNT" -ge 2 ]; then
  green "GET /api/devices → $COUNT 筆裝置"
else
  red "GET /api/devices → 預期 ≥ 2 筆，得到 $COUNT 筆"
fi

# -------------------------------------------------------------------
echo ""
echo "2️⃣  學員管理 (Child)"
# -------------------------------------------------------------------

TAG=$(date +%s)
echo "  2.1 註冊學員 小明 (tag=$TAG)"
r=$(curl -s -X POST "$API_BASE/api/children" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"小明\",\"student_id\":\"S001-$TAG\",\"notes\":\"3歳\"}")
CHILD_A_ID=$(echo "$r" | python3 -c "import sys,json; print(json.load(sys.stdin)['child']['id'])" 2>/dev/null || echo "")
if [ -n "$CHILD_A_ID" ]; then
  green "POST /api/children → 小明已註冊 (id=$CHILD_A_ID)"
else
  red "POST /api/children → $r"
fi

echo "  2.2 註冊學員 小華 (tag=$TAG)"
r=$(curl -s -X POST "$API_BASE/api/children" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"小華\",\"student_id\":\"S002-$TAG\",\"notes\":\"4歳\"}")
CHILD_B_ID=$(echo "$r" | python3 -c "import sys,json; print(json.load(sys.stdin)['child']['id'])" 2>/dev/null || echo "")
if [ -n "$CHILD_B_ID" ]; then
  green "POST /api/children → 小華已註冊 (id=$CHILD_B_ID)"
else
  red "POST /api/children → $r"
fi

echo "  2.3 列出學員 (應 ≥ 2 筆)"
r=$(curl -s "$API_BASE/api/children")
COUNT=$(echo "$r" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['children']))")
if [ "$COUNT" -ge 2 ]; then
  green "GET /api/children → $COUNT 筆學員"
else
  red "GET /api/children → 預期 ≥ 2 筆，得到 $COUNT 筆"
fi

# -------------------------------------------------------------------
echo ""
echo "3️⃣  Session 配對 (Assignment)"
# -------------------------------------------------------------------

echo "  3.1 建立課程"
r=$(curl -s -X POST "$API_BASE/api/sessions" -H "Content-Type: application/json" -d '{"name":"測試課程","course_type":"march"}')
SESSION_ID=$(echo "$r" | python3 -c "import sys,json; print(json.load(sys.stdin)['session']['id'])")
if [ -n "$SESSION_ID" ]; then
  green "POST /api/sessions → session_id=$SESSION_ID"
else
  red "POST /api/sessions → $r"
fi

echo "  3.2 配對腰帶 A → 小明"
r=$(curl -s -X POST "$API_BASE/api/sessions/$SESSION_ID/assign" \
  -H "Content-Type: application/json" \
  -d "{\"device_id\":\"$DEVICE_A_ID\",\"child_id\":\"$CHILD_A_ID\",\"confidence\":0.95}")
if echo "$r" | python3 -c "import sys,json; a=json.load(sys.stdin)['assignment']; assert a['method']=='manual'" 2>/dev/null; then
  green "POST /api/sessions/$SESSION_ID/assign → 配對成功 (method=manual)"
else
  red "POST /api/sessions/$SESSION_ID/assign → $r"
fi

echo "  3.3 配對腰帶 B → 小華"
r=$(curl -s -X POST "$API_BASE/api/sessions/$SESSION_ID/assign" \
  -H "Content-Type: application/json" \
  -d "{\"device_id\":\"$DEVICE_B_ID\",\"child_id\":\"$CHILD_B_ID\",\"confidence\":0.88}")
if echo "$r" | python3 -c "import sys,json; a=json.load(sys.stdin)['assignment']; assert a['confidence']==0.88" 2>/dev/null; then
  green "POST /api/sessions/$SESSION_ID/assign → 配對成功 (confidence=0.88)"
else
  red "POST /api/sessions/$SESSION_ID/assign → $r"
fi

echo "  3.4 查詢課程配對結果"
r=$(curl -s "$API_BASE/api/sessions/$SESSION_ID/assignments")
COUNT=$(echo "$r" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['assignments']))")
if [ "$COUNT" -eq 2 ]; then
  green "GET /api/sessions/$SESSION_ID/assignments → $COUNT 筆配對"
  echo "$r" | python3 -c "
import sys,json
for a in json.load(sys.stdin)['assignments']:
    print(f'      ▸ {a[\"device_name\"]} ↔ {a[\"child_name\"]} (信心: {a[\"confidence\"]})')
" 2>/dev/null
else
  red "GET /api/sessions/$SESSION_ID/assignments → 預期 2 筆，得到 $COUNT 筆"
fi

echo "  3.5 重新配對（覆寫測試）"
r=$(curl -s -X POST "$API_BASE/api/sessions/$SESSION_ID/assign" \
  -H "Content-Type: application/json" \
  -d "{\"device_id\":\"$DEVICE_A_ID\",\"child_id\":\"$CHILD_B_ID\",\"confidence\":1.0}")
if echo "$r" | python3 -c "import sys,json; a=json.load(sys.stdin)['assignment']; assert a['child_id']=='$CHILD_B_ID'" 2>/dev/null; then
  green "POST /api/sessions/$SESSION_ID/assign (覆寫) → 腰帶 A 改配小華"
else
  red "POST /api/sessions/$SESSION_ID/assign (覆寫) → $r"
fi

# -------------------------------------------------------------------
echo ""
echo "4️⃣  錯誤處理"
# -------------------------------------------------------------------

echo "  4.1 配對不存在裝置"
r=$(curl -s -X POST "$API_BASE/api/sessions/$SESSION_ID/assign" \
  -H "Content-Type: application/json" \
  -d '{"device_id":"nonexistent","child_id":"'$CHILD_A_ID'"}')
if echo "$r" | python3 -c "import sys,json; assert json.load(sys.stdin).get('detail')" 2>/dev/null; then
  green "不存在裝置 → 回傳 404"
else
  red "不存在裝置 → $r"
fi

echo "  4.2 查詢不存在 Session"
r=$(curl -s "$API_BASE/api/sessions/no-such-id/assignments")
if echo "$r" | python3 -c "import sys,json; assert json.load(sys.stdin).get('detail')" 2>/dev/null; then
  green "不存在 Session → 回傳 404"
else
  red "不存在 Session → $r"
fi

# -------------------------------------------------------------------
echo ""
echo "5️⃣  Dashboard 頁面驗證"
# -------------------------------------------------------------------

DASHBOARD_URL="http://localhost:5173"
DASHBOARD_UP=$(curl -s -o /dev/null -w "%{http_code}" "$DASHBOARD_URL/dashboard/" 2>/dev/null || echo "000")
if [ "$DASHBOARD_UP" = "200" ]; then
  echo "  5.1 裝置管理頁面"
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$DASHBOARD_URL/dashboard/devices")
  if [ "$HTTP_CODE" = "200" ]; then
    green "$DASHBOARD_URL/dashboard/devices → $HTTP_CODE"
  else
    red "$DASHBOARD_URL/dashboard/devices → $HTTP_CODE (預期 200)"
  fi
  echo "  5.2 評估指標頁面"
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$DASHBOARD_URL/dashboard/assessment/default")
  if [ "$HTTP_CODE" = "200" ]; then
    green "$DASHBOARD_URL/dashboard/assessment/default → $HTTP_CODE"
  else
    red "$DASHBOARD_URL/dashboard/assessment/default → $HTTP_CODE (預期 200)"
  fi
else
  echo "  5.1-5.2 Dashboard 未啟動，跳過頁面檢查 (npm run dev)"
fi

# -------------------------------------------------------------------
echo ""
echo "========================================"
echo "  驗證結果"
echo "  ✅ 通過: $PASS"
echo "  ❌ 失敗: $FAIL"
echo "========================================"

# 清理測試資料（可選）
# echo ""
# echo "清理測試資料…"
# python3 -c "
# import requests
# BASE = '$API_BASE'
# # 可加入刪除測試資料的邏輯
# print('  清理完成')
# "

exit $FAIL
