import { useEffect, useState, useCallback } from "react";
import { api } from "../api/client";
import LoadingSpinner from "../components/LoadingSpinner";

interface FirmwareVersion {
  id: string;
  version: string;
  description: string;
  file_size: number;
  created_at: string;
}

export default function FirmwareUpload() {
  const [versions, setVersions] = useState<FirmwareVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [version, setVersion] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const fetchVersions = useCallback(() => {
    setLoading(true);
    api.listFirmware()
      .then((res) => setVersions(res.versions))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchVersions(); }, [fetchVersions]);

  const handleUpload = async () => {
    if (!version.trim() || !file) {
      setMessage({ type: "error", text: "請填寫版本號並選擇韌體檔案" });
      return;
    }
    setUploading(true);
    setMessage(null);
    try {
      await api.uploadFirmware(version.trim(), description.trim(), file);
      setMessage({ type: "ok", text: `韌體 v${version.trim()} 上傳成功` });
      setVersion(""); setDescription(""); setFile(null);
      fetchVersions();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "上傳失敗" });
    } finally {
      setUploading(false);
    }
  };

  const fmtSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">韌體管理</h1>

      {/* Upload Card */}
      <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-700">📤 上傳新韌體</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder="版本號 (e.g. 0.2.0)"
            className="text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="更新說明 (選填)"
            className="text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>
        <input
          type="file"
          accept=".bin"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        />
        <button
          onClick={handleUpload}
          disabled={uploading || !version.trim() || !file}
          className="text-sm bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {uploading ? "上傳中…" : "上傳"}
        </button>
        {message && (
          <p className={`text-sm ${message.type === "ok" ? "text-green-600" : "text-red-600"}`}>
            {message.text}
          </p>
        )}
      </div>

      {/* Version List */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-700 mb-4">📋 版本歷史</h2>
        {loading ? (
          <LoadingSpinner text="載入中…" />
        ) : versions.length === 0 ? (
          <p className="text-sm text-gray-400">尚無韌體版本</p>
        ) : (
          <div className="space-y-2">
            {versions.map((v) => (
              <div key={v.id} className="flex items-center justify-between text-sm py-2 border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-3">
                  <span className="font-mono font-semibold text-gray-800">v{v.version}</span>
                  {v.description && (
                    <span className="text-gray-500">{v.description}</span>
                  )}
                </div>
                <div className="flex items-center gap-4 text-gray-400">
                  <span>{fmtSize(v.file_size)}</span>
                  <span>{new Date(v.created_at).toLocaleString("zh-TW")}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Reference */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
        <p className="font-semibold mb-1">💡 OTA 更新流程</p>
        <ol className="list-decimal list-inside space-y-1 text-xs">
          <li>在「上傳新韌體」區塊中選擇 .bin 檔並填寫版本號</li>
          <li>ESP32 會每小時自動檢查新版本（via <code className="bg-blue-100 px-1 rounded">GET /api/firmware/version</code>）</li>
          <li>發現新版本時自動下載、寫入 inactive partition、重啟</li>
          <li>啟動成功後標記為 valid，失敗則自動回滾到前一個版本</li>
        </ol>
      </div>
    </div>
  );
}
