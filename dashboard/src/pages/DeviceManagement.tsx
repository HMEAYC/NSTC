import { useEffect, useState } from "react";
import { api, type DeviceInfo } from "../api/client";
import { useAuth } from "../auth/context";
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

const API_BASE = import.meta.env.VITE_API_BASE || "";

interface Org { id: string; name: string; code: string; }

export default function DeviceManagement() {
  const { user } = useAuth();
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingDevice, setEditingDevice] = useState<DeviceInfo | null>(null);
  const [editName, setEditName] = useState("");
  const [editOrgId, setEditOrgId] = useState("");
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const isSuper = user?.role === "super_admin";

  // WiFi fields
  const [wifiSsid, setWifiSsid] = useState("");
  const [wifiPassword, setWifiPassword] = useState("");
  const [wifiSaving, setWifiSaving] = useState(false);
  const [wifiMsg, setWifiMsg] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

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

  const openModal = (d: DeviceInfo) => {
    setEditingDevice(d);
    setEditName(d.name);
    setEditOrgId(d.org_id);
    setEditError(null);
    setWifiMsg(null);
    setShowPassword(false);
    // Load WiFi config for this device
    api.getDeviceWifiConfig(d.id)
      .then((cfg) => {
        setWifiSsid(cfg.ssid || "");
        setWifiPassword(cfg.password || "");
      })
      .catch(() => {
        setWifiSsid("");
        setWifiPassword("");
      });
    if (isSuper) {
      const tok = localStorage.getItem("hmeayc_token");
      fetch(`${API_BASE}/api/admin/orgs`, {
        headers: { Authorization: `Bearer ${tok}` },
      })
        .then((r) => r.json())
        .then((data) => setOrgs(data.orgs || []))
        .catch(() => {});
    }
  };

  const handleSave = async () => {
    if (!editingDevice) return;
    setSaving(true);
    setEditError(null);
    try {
      const data: { name?: string; org_id?: string } = { name: editName };
      if (isSuper && editOrgId !== editingDevice.org_id) {
        data.org_id = editOrgId;
      }
      const res = await api.updateDevice(editingDevice.id, data);
      setDevices((prev) => prev.map((d) => d.id === editingDevice.id ? { ...d, ...res.device } : d));
      setEditingDevice(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  };

  const handleWifiSave = async () => {
    if (!editingDevice) return;
    if (!wifiSsid.trim()) {
      setWifiMsg("WiFi SSID 不可為空");
      return;
    }
    setWifiSaving(true);
    setWifiMsg(null);
    try {
      await api.setDeviceWifiConfig(editingDevice.id, wifiSsid.trim(), wifiPassword);
      setWifiMsg("WiFi 設定已儲存");
    } catch (err) {
      setWifiMsg(err instanceof Error ? err.message : "儲存失敗");
    } finally {
      setWifiSaving(false);
    }
  };

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
                  onClick={() => openModal(d)}
                  className="bg-white rounded-xl shadow-sm p-4 flex items-center justify-between hover:shadow-md transition-shadow cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`w-3 h-3 rounded-full flex-shrink-0 ${statusColor[d.status] || "bg-gray-400"}`} />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-gray-800 truncate">{d.name}</div>
                      <div className="text-xs text-gray-400 font-mono">{d.device_id}</div>
                      <div className="text-[10px] text-gray-300 leading-none">MAC</div>
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

      {/* Edit Modal */}
      {editingDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md mx-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-800">編輯裝置</h3>
              <button onClick={() => setEditingDevice(null)} className="text-gray-400 hover:text-gray-600 text-lg">&times;</button>
            </div>

            <div className="space-y-4">
              {editError && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-xs">
                  {editError}
                </div>
              )}

              {/* Basic info */}
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">裝置名稱</label>
                  <input value={editName} onChange={(e) => setEditName(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">MAC 位址</label>
                  <p className="text-sm font-mono text-gray-700">{editingDevice.device_id}</p>
                </div>
                {isSuper && (
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">所屬組織</label>
                    <select value={editOrgId} onChange={(e) => setEditOrgId(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm">
                      {orgs.map((o) => (
                        <option key={o.id} value={o.id}>{o.name} ({o.code})</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">韌體版本</label>
                    <p className="text-sm">{editingDevice.firmware_version || "—"}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">狀態</label>
                    <p className="text-sm">{editingDevice.status === "online" ? "連線中" : "離線"}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">目前連接 WiFi</label>
                    <p className="text-sm">{editingDevice.wifi_ssid || "—"}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">訊號強度</label>
                    <p className="text-sm">{editingDevice.wifi_rssi != null ? `${editingDevice.wifi_rssi} dBm` : "—"}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">IP 位址</label>
                    <p className="text-sm">{editingDevice.ip_address || "—"}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">電量</label>
                    <p className="text-sm">{batteryLevel(editingDevice.battery_level).label}</p>
                  </div>
                </div>
              </div>

              {/* WiFi Config section */}
              <div className="border-t pt-4">
                <h4 className="text-xs font-semibold text-gray-600 mb-3">📶 WiFi 設定</h4>
                <p className="text-[10px] text-gray-400 mb-3">設定此裝置的 WiFi 連線。儲存後裝置將在下次輪詢時套用新設定。</p>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">WiFi SSID</label>
                    <input value={wifiSsid} onChange={(e) => setWifiSsid(e.target.value)}
                      placeholder="請輸入 WiFi 名稱"
                      className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">WiFi 密碼</label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={wifiPassword}
                        onChange={(e) => setWifiPassword(e.target.value)}
                        placeholder="請輸入 WiFi 密碼"
                        className="w-full border rounded-lg px-3 py-2 text-sm pr-16"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 hover:text-gray-600"
                      >
                        {showPassword ? "隱藏" : "顯示"}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={handleWifiSave} disabled={wifiSaving || !wifiSsid.trim()}
                      className="text-xs px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">
                      {wifiSaving ? "儲存中…" : "儲存 WiFi"}
                    </button>
                    {wifiMsg && (
                      <span className={`text-xs ${wifiMsg.includes("失敗") || wifiMsg.includes("不可") ? "text-red-500" : "text-green-600"}`}>
                        {wifiMsg}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-2 justify-end mt-6">
              <button onClick={() => setEditingDevice(null)}
                className="text-xs px-3 py-1.5 rounded-lg text-gray-500 hover:bg-gray-100">取消</button>
              <button onClick={handleSave} disabled={saving || !editName.trim()}
                className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                {saving ? "儲存中…" : "儲存"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
