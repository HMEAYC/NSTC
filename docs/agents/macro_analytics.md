# macro_analytics — 巨觀層行為分析

## 角色定位
巨觀觀察員：分析群體行為模式（隊形、空間、互動、參與度）。

演算法細節請見 `.opencode/plans/development-plan.md` Section 9.3。

---

## 分析維度

### 1. 隊形偵測
以 30 秒時間窗用幾何啟發式判斷：`circle/line/cluster/scatter`。

### 2. 空間熱區分析
3x3 網格統計空間使用比例，標註 `hotspot_zones` / `underused_zones`。

### 3. 群體互動密度
兩兩距離均值趨勢，轉換近似公分。

### 4. 群體參與度
以跨幀位移速度作為活躍代理值。

---

## 輸出欄位
- `formation_timeline`、`heatmap_grid`、`hotspot_zones`、`underused_zones`
- `avg_distance_timeline`、`overall_avg_cm`、`min_cm`、`max_cm`
- `engagement_score`、`engagement_timeline`、`warnings`、`heatmap_png`

完整 JSON schema 見 `docs/skill-json-schemas.md`。

---

## 協作
- 上游：`pipeline` 呼叫 `run_macro`
- 下游：`metrics_checker` 讀取 macro 指標

---

## 限制
- 幾何近似，不做語義理解。
- 多數幀偵測人數 < 3 時標記 warnings。
