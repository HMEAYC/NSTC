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
  const myOrgId = user?.org_id || "";
  const [filterOrgId, setFilterOrgId] = useState<string>("");

  const [scanning, setScanning] = useState(false);
  const [scanResults, setScanResults] = useState<{ mac: string; ip: string }[] | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  const fetchData = () => {
    setLoading(true);
    setError(null);
    api.listDevices(isSuper ? undefined : myOrgId || undefined)
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

  useEffect(() => {
    if (isSuper) {
      api.listOrgs().then((d) => setOrgs(d.orgs || [])).catch(() => {});
    }
  }, []);

  const handleScan = async () => {
    setScanning(true);
    setScanError(null);
    setScanResults(null);
    try {
      const data = await api.scanDevices();
      setScanResults(data.devices);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : "掃描失敗");
    } finally {
      setScanning(false);
    }
  };

  const handleRegisterDevice = async (mac: string) => {
    try {
      await api.registerDevice(mac, mac);
      setScanResults((prev) => prev ? prev.filter((d) => d.mac !== mac) : null);
      fetchData();
    } catch (err) {
      setScanError(err instanceof Error ? err.message : "註冊失敗");
    }
  };

  const openModal = (d: DeviceInfo) => {
    setEditingDevice(d);
    setEditName(d.name);
    setEditOrgId(d.org_id);
    setEditError(null);
    if (isSuper) {
      api.listOrgs()
        .then((data) => setOrgs(data.orgs || []))
        .catch((err) => console.error("Failed to list orgs:", err));
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

  const filteredDevices = isSuper && filterOrgId
    ? devices.filter((d) => d.org_id === filterOrgId)
    : devices;

  const onlineCount = filteredDevices.filter((d) => d.status === "online").length;

  useEffect(() => {
    if (!editingDevice) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setEditingDevice(null);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [editingDevice]);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">📡 裝置管理</h1>
          <p className="text-sm text-gray-500">ESP32 穿戴式裝置註冊與狀態</p>
        </div>
        <div className="flex items-center gap-3">
          {isSuper && (
            <button
              onClick={handleScan}
              disabled={scanning}
              className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {scanning ? "掃描中…" : "掃描網路"}
            </button>
          )}
          <button onClick={() => fetchData()} className="text-xs text-blue-600 hover:underline">重新整理</button>
        </div>
      </div>

      {isSuper && orgs.length > 0 && (
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">機構篩選：</span>
          <select value={filterOrgId} onChange={(e) => setFilterOrgId(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm bg-white">
            <option value="">全部機構</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>{o.name} ({o.code})</option>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="text-2xl font-bold text-gray-800">{filteredDevices.length}</div>
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
          <div className="text-2xl font-bold text-gray-800">{filteredDevices.length > 0 ? `${Math.round(onlineCount / Math.max(filteredDevices.length, 1) * 100)}%` : "—"}</div>
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
          {filteredDevices.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm p-8 text-center">
              <p className="text-gray-400 text-sm">尚無註冊裝置</p>
              <p className="text-xs text-gray-300 mt-1">ESP32 連線後會自動註冊</p>
            </div>
          ) : (
            filteredDevices.map((d) => {
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

              {editingDevice.status === "offline" && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700 space-y-1.5">
                  <div className="font-semibold text-sm">💡 如何讓裝置重新連線</div>
                  <ol className="list-decimal list-inside space-y-0.5 text-blue-600">
                    <li>確認裝置已接上電源</li>
                    <li>用手機搜尋 WiFi <span className="font-mono font-semibold">HMEAYC-Setup</span></li>
                    <li>連線後會自動彈出設定頁面</li>
                    <li>輸入目標 WiFi 名稱與密碼</li>
                    <li>裝置儲存後會自動重啟並連線</li>
                  </ol>
                </div>
              )}

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
                    <label className="text-xs text-gray-500 block mb-1">WiFi SSID</label>
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

      {scanResults !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-800">📡 網路掃描結果</h3>
              <button onClick={() => setScanResults(null)} className="text-gray-400 hover:text-gray-600 text-lg">&times;</button>
            </div>

            {scanError && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-xs mb-3">
                {scanError}
              </div>
            )}

            {scanResults.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">未發現未註冊的 ESP32 裝置</p>
            ) : (
              <div className="space-y-2">
                {scanResults.map((d) => (
                  <div key={d.mac} className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                    <div className="min-w-0">
                      <div className="text-sm font-mono text-gray-800">{d.mac}</div>
                      <div className="text-xs text-gray-400">{d.ip}</div>
                    </div>
                    <button
                      onClick={() => handleRegisterDevice(d.mac)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 flex-shrink-0"
                    >
                      註冊
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end mt-4">
              <button onClick={() => setScanResults(null)}
                className="text-xs px-3 py-1.5 rounded-lg text-gray-500 hover:bg-gray-100">
                關閉
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
