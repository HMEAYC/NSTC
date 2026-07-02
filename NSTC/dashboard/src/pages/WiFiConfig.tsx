import { useEffect, useState } from "react";
import { api } from "../api/client";
import LoadingSpinner from "../components/LoadingSpinner";

export default function WiFiConfig() {
  const [ssid, setSsid] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    api.getWifiConfig()
      .then((cfg) => {
        if (cfg.ssid) {
          setSsid(cfg.ssid);
          setPassword("");
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!ssid.trim()) {
      setMessage({ type: "error", text: "請輸入 WiFi 名稱（SSID）" });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await api.setWifiConfig(ssid.trim(), password);
      setMessage({ type: "ok", text: "WiFi 設定已儲存" });
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "儲存失敗" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">WiFi 設定</h1>

      <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-700">📶 無線網路設定</h2>

        {loading ? (
          <LoadingSpinner text="載入中…" />
        ) : (
          <>
            <div>
              <label className="block text-sm text-gray-600 mb-1">WiFi 名稱 (SSID) *</label>
              <input
                value={ssid}
                onChange={(e) => setSsid(e.target.value)}
                placeholder="e.g. chen"
                className="w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">密碼</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="WiFi 密碼"
                className="w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>
            <button
              onClick={handleSave}
              disabled={saving || !ssid.trim()}
              className="text-sm bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {saving ? "儲存中…" : "儲存設定"}
            </button>
            {message && (
              <p className={`text-sm ${message.type === "ok" ? "text-green-600" : "text-red-600"}`}>
                {message.text}
              </p>
            )}
          </>
        )}
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-800">
        <p className="font-semibold mb-1">⚠️ 使用說明</p>
        <ul className="list-disc list-inside space-y-1 text-xs">
          <li>此設定儲存在遠端資料庫中，供 ESP32 腰帶透過網路讀取</li>
          <li>ESP32 開機時會先嘗試使用內建 WiFi 設定連線</li>
          <li>連線成功後，系統會定期檢查是否有新的 WiFi 設定</li>
          <li>若要立即生效，需重新啟動 ESP32 或等待自動檢查（每小時）</li>
          <li>為了安全性，密碼不會從後端讀回到畫面中</li>
        </ul>
      </div>

      <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-600">
        <p className="font-semibold mb-1">🔧 目前韌體 WiFi 設定</p>
        <p className="text-xs font-mono">
          SSID: chen<br />
          設定檔: <code className="bg-gray-200 px-1 rounded">firmware/sdkconfig.defaults</code>
        </p>
      </div>
    </div>
  );
}
