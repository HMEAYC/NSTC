# micro_analytics — 微觀層個體動作分析

## 角色定位
微觀觀察員：分析個別幼兒的肢體動作細節。

演算法細節請見 `.opencode/plans/development-plan.md` Section 9.4。

---

## 分析維度

### 1. 節奏同步度分析
`librosa.beat.beat_track` 取 BPM 與 beat_times → 腕部訊號峰值比對 → 平均誤差 (ms)。

| 同步誤差 | 評級 |
|---------|------|
| < 50ms | 優秀 |
| 50-150ms | 良好 |
| 150-300ms | 需加強 |
| > 300ms | 落後 |

### 2. 抑制控制（Stop Signal）
RMS 掉落點偵測停止信號 → 停止後 1 秒髖部位移 (cm)。

| 位移 | 評級 |
|-----|------|
| < 5cm | 優秀 |
| 5-15cm | 良好 |
| 15-30cm | 需加強 |
| > 30cm | 不穩定 |

### 3. 動作流暢度
髖部軌跡 jerk（加速度變化率）。

| Jerk (m/s³) | 評級 |
|-------------|------|
| < 2.0 | 流暢 |
| 2.0-5.0 | 普通 |
| 5.0-10.0 | 僵硬 |
| > 10.0 | 非常僵硬 |

### 4. 個別追蹤軌跡
ByteTrack 聚合輸出軌跡圖。

---

## 輸出欄位
JSON schema 見 `docs/skill-json-schemas.md`（Micro、Identity Track ReID）。

---

## 限制
- 指標屬近似代理，不等於臨床或正式量表。
