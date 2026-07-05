import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type DeviceInfo } from "../api/client";
import LoadingSpinner from "../components/LoadingSpinner";

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
  const navigate = useNavigate();
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = () => {
    setLoading(true);
    setError(null);
    api.listDevices()
      .then((d) => {
        setDevices(d.devices);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "載入失敗");
        setLoading(false);
      });
  };

  useEffect(() => { fetchData(); }, []);

  const onlineCount = devices.filter((d) => d.status === "online").length;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">📡 裝置管理</h1>
          <p className="text-sm text-gray-500">ESP32 穿戴式裝置註冊與狀態</p>
        </div>
        <button onClick={fetchData} className="text-xs text-blue-600 hover:underline">重新整理</button>
      </div>

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
          <div className="text-2xl font-bold text-gray-800">{devices.length > 0 ? `${Math.round(onlineCount / Math.max(devices.length, 1) * 100)}%` : "—"}</div>
          <div className="text-xs text-gray-400">裝置上線率</div>
        </div>
      </div>

      {loading && <LoadingSpinner text="載入中…" />}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm">
          {error}
        </div>
      )}

      {!loading && !error && (
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
                  onClick={() => d.status === "online" && navigate(`/dashboard/live/${d.active_session_id || "default"}?device=${d.id}`)}
                  className="bg-white rounded-xl shadow-sm p-4 flex items-center justify-between hover:shadow-md transition-shadow cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`w-3 h-3 rounded-full flex-shrink-0 ${statusColor[d.status] || "bg-gray-400"}`} />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-gray-800 truncate">{d.name}</div>
                      <div className="text-xs text-gray-400 font-mono">{d.device_id}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <div className="text-center hidden sm:block">
                      <div className="font-mono">{d.firmware_version || "—"}</div>
                      <div className="text-gray-400">韌體</div>
                    </div>
                    <div className="text-center hidden sm:block">
                      <div className="font-mono">{d.wifi_ssid || "—"}</div>
                      <div className="text-gray-400">WiFi</div>
                    </div>
                    <div className="text-center hidden md:block">
                      <div className="font-mono">
                        {d.wifi_rssi != null ? `${d.wifi_rssi} dBm` : "—"}
                      </div>
                      <div className="text-gray-400">訊號</div>
                    </div>
                    <div className="text-center hidden lg:block">
                      <div className="font-mono">{d.ip_address || "—"}</div>
                      <div className="text-gray-400">IP</div>
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
    </div>
  );
}
