import { useEffect, useState } from "react";
import { api, type CourseTemplateInfo } from "../api/client";
import LoadingSpinner from "../components/LoadingSpinner";

interface Stage {
  name: string;
  duration: number;
  type: string;
}

const stageTypes = [
  { value: "warmup", label: "暖身" },
  { value: "drill", label: "訓練" },
  { value: "game", label: "遊戲" },
  { value: "cooldown", label: "緩和" },
  { value: "other", label: "其他" },
];

export default function Templates() {
  const [templates, setTemplates] = useState<CourseTemplateInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    duration_minutes: "",
  });
  const [stages, setStages] = useState<Stage[]>([]);
  const [metricsConfig, setMetricsConfig] = useState({
    activity: true,
    smoothness: true,
    stability: true,
  });
  const [saving, setSaving] = useState(false);

  const fetchTemplates = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listTemplates();
      setTemplates(res.templates);
    } catch (e) {
      setError(e instanceof Error ? e.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTemplates(); }, []);

  const resetForm = (t?: CourseTemplateInfo) => {
    if (t) {
      setEditingId(t.id);
      setForm({
        name: t.name,
        description: t.description || "",
        duration_minutes: t.duration_minutes?.toString() || "",
      });
      setStages(t.stages || []);
      setMetricsConfig(
        t.metrics_config as { activity: boolean; smoothness: boolean; stability: boolean } || {
          activity: true, smoothness: true, stability: true,
        },
      );
    } else {
      setEditingId(null);
      setForm({ name: "", description: "", duration_minutes: "" });
      setStages([]);
      setMetricsConfig({ activity: true, smoothness: true, stability: true });
    }
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const data = {
        name: form.name,
        description: form.description || undefined,
        duration_minutes: form.duration_minutes ? parseInt(form.duration_minutes) : undefined,
        stages: stages.length > 0 ? stages : undefined,
        metrics_config: metricsConfig,
      };
      if (editingId) {
        await api.updateTemplate(editingId, data);
      } else {
        await api.createTemplate(data);
      }
      setShowModal(false);
      fetchTemplates();
    } catch { /* ignore */ } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("確定刪除此教案模板？")) return;
    try {
      await api.deleteTemplate(id);
      fetchTemplates();
    } catch { /* ignore */ }
  };

  const addStage = () => {
    setStages([...stages, { name: "", duration: 5, type: "drill" }]);
  };

  const updateStage = (i: number, field: keyof Stage, value: string | number) => {
    const next = [...stages];
    (next[i] as any)[field] = value;
    setStages(next);
  };

  const removeStage = (i: number) => {
    setStages(stages.filter((_, idx) => idx !== i));
  };

  if (loading) return <div className="p-6 max-w-4xl mx-auto"><LoadingSpinner text="載入教案模板…" /></div>;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">教案模板</h1>
        <button onClick={() => resetForm()}
          className="text-sm bg-blue-600 text-white px-4 py-1.5 rounded-lg hover:bg-blue-700">+ 新增模板</button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm">{error}</div>}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto space-y-4">
            <h2 className="text-lg font-bold text-gray-800">{editingId ? "編輯模板" : "新增模板"}</h2>

            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="模板名稱" className="w-full border rounded-lg px-3 py-2 text-sm" />
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="描述（選填）" className="w-full border rounded-lg px-3 py-2 text-sm" />
            <input type="number" value={form.duration_minutes}
              onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })}
              placeholder="預計時長（分鐘，選填）" className="w-full border rounded-lg px-3 py-2 text-sm" />

            {/* Stages */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">課程階段</label>
                <button onClick={addStage}
                  className="text-xs text-blue-600 hover:underline">+ 新增階段</button>
              </div>
              <div className="space-y-2">
                {stages.length === 0 && (
                  <p className="text-xs text-gray-400">尚未設定階段</p>
                )}
                {stages.map((s, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <input value={s.name} onChange={(e) => updateStage(i, "name", e.target.value)}
                      placeholder="階段名稱" className="flex-1 border rounded-lg px-2 py-1.5 text-xs" />
                    <input type="number" value={s.duration}
                      onChange={(e) => updateStage(i, "duration", parseInt(e.target.value) || 0)}
                      className="w-16 border rounded-lg px-2 py-1.5 text-xs" title="分鐘" />
                    <select value={s.type} onChange={(e) => updateStage(i, "type", e.target.value)}
                      className="border rounded-lg px-2 py-1.5 text-xs bg-white">
                      {stageTypes.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    <button onClick={() => removeStage(i)}
                      className="text-red-500 hover:text-red-700 text-sm">✕</button>
                  </div>
                ))}
              </div>
            </div>

            {/* Metrics Config */}
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-2">評估指標</label>
              <div className="flex gap-4">
                {Object.entries(metricsConfig).map(([key, val]) => (
                  <label key={key} className="flex items-center gap-1.5 text-sm">
                    <input type="checkbox" checked={val}
                      onChange={() => setMetricsConfig({ ...metricsConfig, [key]: !val })}
                      className="rounded" />
                    {key === "activity" ? "活動量" : key === "smoothness" ? "平穩度" : "穩定性"}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowModal(false)}
                className="text-sm bg-gray-100 text-gray-600 px-4 py-1.5 rounded-lg hover:bg-gray-200">取消</button>
              <button onClick={handleSave} disabled={saving || !form.name.trim()}
                className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
                {saving ? "儲存中…" : "儲存"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {templates.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-8 text-center text-gray-400 text-sm">尚無教案模板</div>
        ) : templates.map((t) => (
          <div key={t.id}
            className="bg-white rounded-xl shadow-sm p-4 hover:shadow-md">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-gray-800">{t.name}</div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {t.description || "—"}
                  {t.duration_minutes && ` · ${t.duration_minutes} 分鐘`}
                  {t.stages && t.stages.length > 0 && ` · ${t.stages.length} 個階段`}
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => resetForm(t)}
                  className="text-xs text-blue-600 hover:underline">編輯</button>
                <button onClick={() => handleDelete(t.id)}
                  className="text-xs text-red-600 hover:underline">刪除</button>
              </div>
            </div>
            {t.stages && t.stages.length > 0 && (
              <div className="flex gap-1.5 mt-2 flex-wrap">
                {t.stages.map((s, i) => (
                  <span key={i}
                    className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                    {s.name} ({s.duration}分)
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
