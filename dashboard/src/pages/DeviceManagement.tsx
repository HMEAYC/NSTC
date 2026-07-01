import { useEffect, useState } from "react";
import { api, type DeviceInfo, type ChildInfo } from "../api/client";
import LoadingSpinner from "../components/LoadingSpinner";

type Tab = "devices" | "children" | "assign";

const statusColor: Record<string, string> = {
  online: "bg-green-500",
  offline: "bg-gray-400",
};

function batteryLevel(v: number | null): { color: string; label: string } {
  if (v === null) return { color: "bg-gray-200", label: "N/A" };
  if (v > 0.5) return { color: "bg-green-500", label: `${Math.round(v * 100)}%` };
  if (v > 0.2) return { color: "bg-yellow-500", label: `${Math.round(v * 100)}%` };
  return { color: "bg-red-500", label: `${Math.round(v * 100)}%` };
}

export default function DeviceManagement() {
  const [tab, setTab] = useState<Tab>("devices");
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [children, setChildren] = useState<ChildInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRegisterChild, setShowRegisterChild] = useState(false);
  const [childForm, setChildForm] = useState({ name: "", student_id: "", notes: "" });

  const fetchData = () => {
    setLoading(true);
    setError(null);
    Promise.all([api.listDevices(), api.listChildren()])
      .then(([d, c]) => {
        setDevices(d.devices);
        setChildren(c.children);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "載入失敗");
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleRegisterChild = async () => {
    if (!childForm.name.trim()) return;
    try {
      await api.registerChild(
        childForm.name.trim(),
        childForm.student_id.trim() || undefined,
        childForm.notes.trim() || undefined,
      );
      setChildForm({ name: "", student_id: "", notes: "" });
      setShowRegisterChild(false);
      fetchData();
    } catch {
      // ignore
    }
  };

  const onlineCount = devices.filter((d) => d.status === "online").length;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">📡 裝置與學員管理</h1>
          <p className="text-sm text-gray-500">多人系統裝置管理與跨模態配對（FFT 相位匹配）</p>
        </div>
        <button
          onClick={fetchData}
          className="text-xs text-blue-600 hover:underline"
        >
          重新整理
        </button>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="text-2xl font-bold text-gray-800">{devices.length}</div>
          <div className="text-xs text-gray-400">已註冊裝置</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-gray-800">{onlineCount}</span>
            <span className={`w-2.5 h-2.5 rounded-full ${onlineCount > 0 ? "bg-green-500" : "bg-gray-400"}`} />
          </div>
          <div className="text-xs text-gray-400">目前連線中</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="text-2xl font-bold text-gray-800">{children.length}</div>
          <div className="text-xs text-gray-400">已註冊學員</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="text-2xl font-bold text-gray-800">{devices.length > 0 ? `${Math.round(onlineCount / Math.max(devices.length, 1) * 100)}%` : "—"}</div>
          <div className="text-xs text-gray-400">裝置上線率</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white rounded-xl shadow-sm p-1">
        {[
          { key: "devices" as Tab, label: `📡 裝置 (${devices.length})` },
          { key: "children" as Tab, label: `👤 學員 (${children.length})` },
          { key: "assign" as Tab, label: "🔗 跨模態配對機制" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 text-sm py-2 rounded-lg font-medium transition-colors ${
              tab === t.key
                ? "bg-blue-600 text-white shadow-sm"
                : "text-gray-500 hover:bg-gray-100"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && <LoadingSpinner text="載入中…" />}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm">
          {error}
        </div>
      )}

      {/* Tab: Devices */}
      {!loading && !error && tab === "devices" && (
        <div className="space-y-3">
          {devices.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm p-8 text-center">
              <p className="text-gray-400 text-sm">尚無註冊裝置</p>
              <p className="text-xs text-gray-300 mt-1">ESP32 連線後會自動註冊</p>
            </div>
          ) : (
            devices.map((d) => {
              const batt = batteryLevel(d.battery_level);
              return (
                <div
                  key={d.id}
                  className="bg-white rounded-xl shadow-sm p-4 flex items-center justify-between hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`w-3 h-3 rounded-full flex-shrink-0 ${statusColor[d.status] || "bg-gray-400"}`} />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-gray-800 truncate">{d.name}</div>
                      <div className="text-xs text-gray-400 font-mono">{d.device_id}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <div className="text-center">
                      <div className="font-mono">{d.firmware_version || "—"}</div>
                      <div className="text-gray-400">韌體</div>
                    </div>
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <span className={`w-2 h-2 rounded-full ${batt.color}`} />
                        <span className="font-mono">{batt.label}</span>
                      </div>
                      <div className="text-gray-400">電量</div>
                    </div>
                    <div className="text-center hidden sm:block">
                      <div className="font-mono">
                        {d.last_seen
                          ? new Date(d.last_seen).toLocaleString("zh-TW", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </div>
                      <div className="text-gray-400">最後上線</div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      d.status === "online"
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-500"
                    }`}>
                      {d.status === "online" ? "連線中" : "離線"}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Tab: Children */}
      {!loading && !error && tab === "children" && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button
              onClick={() => setShowRegisterChild(!showRegisterChild)}
              className="text-sm bg-blue-600 text-white px-4 py-1.5 rounded-lg hover:bg-blue-700 transition-colors"
            >
              {showRegisterChild ? "取消" : "+ 註冊學員"}
            </button>
          </div>

          {showRegisterChild && (
            <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
              <input
                value={childForm.name}
                onChange={(e) => setChildForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="姓名 *"
                className="w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
              <input
                value={childForm.student_id}
                onChange={(e) => setChildForm((p) => ({ ...p, student_id: e.target.value }))}
                placeholder="學號 (選填)"
                className="w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
              <input
                value={childForm.notes}
                onChange={(e) => setChildForm((p) => ({ ...p, notes: e.target.value }))}
                placeholder="備註 (選填)"
                className="w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
              <button
                onClick={handleRegisterChild}
                disabled={!childForm.name.trim()}
                className="text-sm bg-green-600 text-white px-4 py-1.5 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                確認註冊
              </button>
            </div>
          )}

          {children.length === 0 && !showRegisterChild ? (
            <div className="bg-white rounded-xl shadow-sm p-8 text-center">
              <p className="text-gray-400 text-sm">尚無學員資料</p>
            </div>
          ) : (
            children.map((c) => (
              <div
                key={c.id}
                className="bg-white rounded-xl shadow-sm p-4 flex items-center justify-between hover:shadow-md transition-shadow"
              >
                <div>
                  <div className="text-sm font-semibold text-gray-800">{c.name}</div>
                  {c.student_id && (
                    <div className="text-xs text-gray-400 font-mono">{c.student_id}</div>
                  )}
                  {c.notes && (
                    <div className="text-xs text-gray-400 mt-0.5">{c.notes}</div>
                  )}
                </div>
                <div className="text-xs text-gray-400">
                  {c.created_at
                    ? new Date(c.created_at).toLocaleDateString("zh-TW")
                    : ""}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab: Assignment Mechanism */}
      {!loading && !error && tab === "assign" && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-2">🔗 跨模態裝置配對機制</h2>
            <p className="text-sm text-gray-500 mb-4">
              根據 HMEAYC 論文提出的 N² 候選自校準 FFT 相位匹配演算法，自動將 IMU 腰帶訊號與攝影機姿態估計訊號進行配對。
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="bg-blue-50 rounded-lg p-3">
                <div className="font-semibold text-blue-700 mb-1">📡 IMU 腰帶訊號</div>
                <ul className="text-xs text-blue-600 space-y-1">
                  <li>加速度計 ±16g @ 50Hz</li>
                  <li>陀螺儀 ±2000°/s</li>
                  <li>WiFi UDP 串流至伺服器</li>
                  <li>FFT 相位角 φᵢᴵᴹᵁ</li>
                </ul>
              </div>
              <div className="bg-green-50 rounded-lg p-3">
                <div className="font-semibold text-green-700 mb-1">📹 攝影機視覺訊號</div>
                <ul className="text-xs text-green-600 space-y-1">
                  <li>MediaPipe Pose 33 點骨架</li>
                  <li>髖部位移軌跡 y(t)</li>
                  <li>不儲存影像，僅保留座標</li>
                  <li>FFT 相位角 φⱼᵛᴵˢ</li>
                </ul>
              </div>
              <div className="bg-purple-50 rounded-lg p-3">
                <div className="font-semibold text-purple-700 mb-1">🧮 配對演算法</div>
                <ul className="text-xs text-purple-600 space-y-1">
                  <li>N² 候選自校準偏移</li>
                  <li>Hungarian 全域最優指派</li>
                  <li>信心分數 conf ∈ [0, 1]</li>
                  <li>O(N⁵) 複雜度，N ≤ 10</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
            <div className="flex items-start gap-2 text-sm text-yellow-800">
              <span className="text-lg">🚧</span>
              <div>
                <div className="font-semibold">跨模態配對流程</div>
                <ol className="mt-2 space-y-1 text-xs list-decimal list-inside">
                  <li>教師開啟課程 → 音樂播放（librosa beat tracking）</li>
                  <li>ESP32 腰帶串流 IMU 資料，攝影機追蹤 MediaPipe 骨架</li>
                  <li>課程結束後呼叫 <code className="bg-yellow-100 px-1 rounded">POST /session/{{id}}/assign</code></li>
                  <li>系統計算 N² 候選偏移，執行 Hungarian 指派</li>
                  <li>回傳配對結果 + 信心分數，教師可手動覆寫</li>
                </ol>
                <p className="mt-2 text-xs text-yellow-700">
                  💡 理論基礎：IMU 加速度與視覺髖部位移之間存在恆定 π 弧度相位差，
                  為物理運動學恆等式，無需額外校正。
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">📊 合成驗證結果</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-gray-600">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4">條件</th>
                    <th className="text-left py-2 pr-4">N</th>
                    <th className="text-left py-2 pr-4">雜訊 σ</th>
                    <th className="text-left py-2">準確率</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["低雜訊", "3", "0.15 m/s²", "100%"],
                    ["低雜訊", "5", "0.15 m/s²", "100%"],
                    ["中等雜訊", "3", "0.50 m/s²", "100%"],
                    ["中等雜訊", "5", "0.50 m/s²", "100%"],
                  ].map((r) => (
                    <tr key={r[0] + r[1]} className="border-b border-gray-50">
                      <td className="py-2 pr-4">{r[0]}</td>
                      <td className="py-2 pr-4">{r[1]}</td>
                      <td className="py-2 pr-4">{r[2]}</td>
                      <td className="py-2 font-semibold text-green-600">{r[3]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
