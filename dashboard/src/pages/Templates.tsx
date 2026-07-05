import { useEffect, useState } from "react";
import { api, type SessionTemplateInfo } from "../api/client";
import LoadingSpinner from "../components/LoadingSpinner";

interface Activity {
  title: string;
  content: string;
  rhythm_pattern?: string;
}

interface CdTrack {
  album: string;
  track: string;
  details: string;
}

interface Stage {
  name: string;
  duration: number;
  type: string;
  music_element?: string;
  core_piece?: string;
  age_group?: string;
  objectives_main?: string[];
  objectives_sub?: string[];
  resources?: string[];
  motivation?: string;
  activities?: Activity[];
  cd_tracks?: CdTrack[];
  supplementary?: string;
}

const ageGroups = [
  "孕期胎教",
  "0 歲寶寶",
  "1-2 歲學步兒",
  "3-6 歲幼兒",
];

const stageTypes = [
  { value: "warmup", label: "暖身" },
  { value: "drill", label: "訓練" },
  { value: "game", label: "遊戲" },
  { value: "cooldown", label: "緩和" },
  { value: "other", label: "其他" },
];

export default function Templates() {
  const [templates, setTemplates] = useState<SessionTemplateInfo[]>([]);
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

  useEffect(() => {
    if (!showModal) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setShowModal(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showModal]);

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

  const defaultStage = (): Stage => ({
    name: "",
    duration: 30,
    type: "game",
    music_element: "",
    core_piece: "",
    age_group: "",
    objectives_main: [],
    objectives_sub: [],
    resources: [],
    motivation: "",
    activities: [],
    cd_tracks: [],
    supplementary: "",
  });

  const resetForm = (t?: SessionTemplateInfo) => {
    if (t) {
      setEditingId(t.id);
      setForm({
        name: t.name,
        description: t.description || "",
        duration_minutes: t.duration_minutes?.toString() || "",
      });
      setStages(t.stages && t.stages.length > 0 ? t.stages.map(normalizeStage) : [defaultStage()]);
      setMetricsConfig(
        t.metrics_config as { activity: boolean; smoothness: boolean; stability: boolean } || {
          activity: true, smoothness: true, stability: true,
        },
      );
    } else {
      setEditingId(null);
      setForm({ name: "", description: "", duration_minutes: "" });
      setStages([defaultStage()]);
      setMetricsConfig({ activity: true, smoothness: true, stability: true });
    }
    setShowModal(true);
  };

  function normalizeStage(s: any): Stage {
    return {
      name: s.name || "",
      duration: s.duration ?? 30,
      type: s.type || "game",
      music_element: s.music_element || "",
      core_piece: s.core_piece || "",
      age_group: s.age_group || "",
      objectives_main: Array.isArray(s.objectives_main) ? s.objectives_main : [],
      objectives_sub: Array.isArray(s.objectives_sub) ? s.objectives_sub : [],
      resources: Array.isArray(s.resources) ? s.resources : [],
      motivation: s.motivation || "",
      activities: Array.isArray(s.activities) ? s.activities : [],
      cd_tracks: Array.isArray(s.cd_tracks) ? s.cd_tracks : [],
      supplementary: s.supplementary || "",
    };
  }

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

  const updateStage = (field: keyof Stage, value: any) => {
    const next = [...stages];
    (next[0] as any)[field] = value;
    setStages(next);
  };

  const stage = stages[0] || defaultStage();

  const addListItem = (field: "objectives_main" | "objectives_sub" | "resources") => {
    updateStage(field, [...(stage[field] || []), ""]);
  };

  const updateListItem = (field: "objectives_main" | "objectives_sub" | "resources", i: number, value: string) => {
    const list = [...(stage[field] || [])];
    list[i] = value;
    updateStage(field, list);
  };

  const removeListItem = (field: "objectives_main" | "objectives_sub" | "resources", i: number) => {
    const list = [...(stage[field] || [])];
    list.splice(i, 1);
    updateStage(field, list);
  };

  const addActivity = () => {
    updateStage("activities", [...(stage.activities || []), { title: "", content: "", rhythm_pattern: "" }]);
  };

  const updateActivity = (i: number, field: keyof Activity, value: string) => {
    const list = [...(stage.activities || [])];
    list[i] = { ...list[i], [field]: value };
    updateStage("activities", list);
  };

  const removeActivity = (i: number) => {
    const list = [...(stage.activities || [])];
    list.splice(i, 1);
    updateStage("activities", list);
  };

  const addCdTrack = () => {
    updateStage("cd_tracks", [...(stage.cd_tracks || []), { album: "", track: "", details: "" }]);
  };

  const updateCdTrack = (i: number, field: keyof CdTrack, value: string) => {
    const list = [...(stage.cd_tracks || [])];
    list[i] = { ...list[i], [field]: value };
    updateStage("cd_tracks", list);
  };

  const removeCdTrack = (i: number) => {
    const list = [...(stage.cd_tracks || [])];
    list.splice(i, 1);
    updateStage("cd_tracks", list);
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
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-8 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-2xl space-y-5 my-4">
            <h2 className="text-lg font-bold text-gray-800">{editingId ? "編輯教案" : "新增教案"}</h2>

            {/* 基本資訊 */}
            <Section title="基本資訊">
              <div className="grid grid-cols-2 gap-3">
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="教案名稱 (e.g. 快快兔與慢慢龜《獵豹與蝸牛》)" className="col-span-2 border rounded-lg px-3 py-2 text-sm" />
                <select value={stage.age_group || ""} onChange={(e) => updateStage("age_group", e.target.value)}
                  className="border rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="">選擇年齡層</option>
                  {ageGroups.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="簡述（選填）" className="col-span-2 border rounded-lg px-3 py-2 text-sm" rows={2} />
              </div>
            </Section>

            {/* 音樂元素 */}
            <Section title="音樂元素">
              <div className="grid grid-cols-2 gap-3">
                <input value={stage.music_element || ""} onChange={(e) => updateStage("music_element", e.target.value)}
                  placeholder="音樂元素 (e.g. 快慢 Tempo - Fast & Slow)" className="border rounded-lg px-3 py-2 text-sm" />
                <input value={stage.core_piece || ""} onChange={(e) => updateStage("core_piece", e.target.value)}
                  placeholder="核心曲目 (e.g. 獵豹與蝸牛)" className="border rounded-lg px-3 py-2 text-sm" />
              </div>
            </Section>

            {/* 教學目標 */}
            <Section title="教學目標">
              <LabeledList
                label="主目標" items={stage.objectives_main || []}
                onAdd={() => addListItem("objectives_main")}
                onUpdate={(i, v) => updateListItem("objectives_main", i, v)}
                onRemove={(i) => removeListItem("objectives_main", i)}
                placeholder="e.g. 美感:感知音樂的快慢速度"
              />
              <div className="mt-2" />
              <LabeledList
                label="次目標" items={stage.objectives_sub || []}
                onAdd={() => addListItem("objectives_sub")}
                onUpdate={(i, v) => updateListItem("objectives_sub", i, v)}
                onRemove={(i) => removeListItem("objectives_sub", i)}
                placeholder="e.g. 口語理解"
              />
            </Section>

            {/* 教學資源 */}
            <Section title="教學資源">
              <LabeledList
                label="資源與器材" items={stage.resources || []}
                onAdd={() => addListItem("resources")}
                onUpdate={(i, v) => updateListItem("resources", i, v)}
                onRemove={(i) => removeListItem("resources", i)}
                placeholder="e.g. 氣球傘"
              />
            </Section>

            {/* 引起動機 */}
            <Section title="引起動機">
              <textarea value={stage.motivation || ""} onChange={(e) => updateStage("motivation", e.target.value)}
                placeholder="故事內容..." className="w-full border rounded-lg px-3 py-2 text-sm" rows={4} />
            </Section>

            {/* 活動流程 */}
            <Section title="活動流程">
              <div className="space-y-3">
                {(stage.activities || []).length === 0 && (
                  <p className="text-xs text-gray-400">尚未新增活動</p>
                )}
                {(stage.activities || []).map((a, i) => (
                  <div key={i} className="border rounded-lg p-3 space-y-2 bg-gray-50">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 font-medium">活動 {i + 1}</span>
                      <input value={a.title} onChange={(e) => updateActivity(i, "title", e.target.value)}
                        placeholder="活動標題 (e.g. 活動一:說白節奏)" className="flex-1 border rounded px-2 py-1 text-xs" />
                      <button onClick={() => removeActivity(i)} className="text-red-500 hover:text-red-700 text-xs">✕</button>
                    </div>
                    <input value={a.rhythm_pattern || ""} onChange={(e) => updateActivity(i, "rhythm_pattern", e.target.value)}
                      placeholder="節奏型 (e.g. X XX X XX \ X X X-)" className="w-full border rounded px-2 py-1 text-xs font-mono" />
                    <textarea value={a.content} onChange={(e) => updateActivity(i, "content", e.target.value)}
                      placeholder="活動內容與步驟..." className="w-full border rounded px-2 py-1 text-xs" rows={3} />
                  </div>
                ))}
                <button onClick={addActivity}
                  className="text-xs text-blue-600 hover:underline">+ 新增活動</button>
              </div>
            </Section>

            {/* CD 曲目 */}
            <Section title="CD 曲目">
              <div className="space-y-2">
                {(stage.cd_tracks || []).length === 0 && (
                  <p className="text-xs text-gray-400">尚未新增 CD 曲目</p>
                )}
                {(stage.cd_tracks || []).map((t, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <input value={t.album} onChange={(e) => updateCdTrack(i, "album", e.target.value)}
                      placeholder="專輯 (e.g. CD-I)" className="w-20 border rounded px-2 py-1.5 text-xs" />
                    <input value={t.track} onChange={(e) => updateCdTrack(i, "track", e.target.value)}
                      placeholder="曲目 (e.g. 4. 旋轉木馬(Carousel)- 快慢(Fast & Slow))"
                      className="flex-1 border rounded px-2 py-1.5 text-xs" />
                    <input value={t.details} onChange={(e) => updateCdTrack(i, "details", e.target.value)}
                      placeholder="說明 (e.g. 4個快慢4*8拍)" className="w-28 border rounded px-2 py-1.5 text-xs" />
                    <button onClick={() => removeCdTrack(i)} className="text-red-500 hover:text-red-700 text-xs mt-1">✕</button>
                  </div>
                ))}
                <button onClick={addCdTrack}
                  className="text-xs text-blue-600 hover:underline">+ 新增曲目</button>
              </div>
            </Section>

            {/* 補充資料 */}
            <Section title="補充資料">
              <textarea value={stage.supplementary || ""} onChange={(e) => updateStage("supplementary", e.target.value)}
                placeholder="注音符號表、節奏型圖示、補充圖譜等參考資料..." className="w-full border rounded-lg px-3 py-2 text-sm" rows={3} />
            </Section>

            {/* 評估指標 */}
            <Section title="評估指標">
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
            </Section>

            <div className="flex gap-2 justify-end pt-2">
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
        ) : templates.map((t) => {
          const s = t.stages && t.stages.length > 0 ? t.stages[0] as any : null;
          return (
            <div key={t.id} onClick={() => resetForm(t)}
              className="bg-white rounded-xl shadow-sm p-4 hover:shadow-md cursor-pointer">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-gray-800">{t.name}</div>
                  <div className="text-xs text-gray-400 mt-0.5 space-x-2">
                    {s?.age_group && <span className="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">{s.age_group}</span>}
                    {s?.music_element && <span>{s.music_element}</span>}
                    {s?.core_piece && <span>《{s.core_piece}》</span>}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }}
                    className="text-xs text-red-600 hover:underline">刪除</button>
                </div>
              </div>
              {s?.objectives_main && s.objectives_main.length > 0 && (
                <div className="mt-2 text-xs text-gray-500 line-clamp-1">
                  目標：{s.objectives_main.join("、")}
                </div>
              )}
              {s?.resources && s.resources.length > 0 && (
                <div className="flex gap-1 mt-1.5 flex-wrap">
                  {s.resources.map((r: string, i: number) => (
                    <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{r}</span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-sm font-medium text-gray-700 block mb-2">{title}</label>
      {children}
    </div>
  );
}

function LabeledList({ label, items, onAdd, onUpdate, onRemove, placeholder }: {
  label: string;
  items: string[];
  onAdd: () => void;
  onUpdate: (i: number, v: string) => void;
  onRemove: (i: number) => void;
  placeholder: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-500">{label}</span>
        <button onClick={onAdd} className="text-xs text-blue-600 hover:underline">+ 新增</button>
      </div>
      <div className="space-y-1">
        {items.length === 0 && <p className="text-xs text-gray-400">尚未設定</p>}
        {items.map((item, i) => (
          <div key={i} className="flex gap-1">
            <input value={item} onChange={(e) => onUpdate(i, e.target.value)}
              placeholder={placeholder} className="flex-1 border rounded px-2 py-1.5 text-xs" />
            <button onClick={() => onRemove(i)} className="text-red-500 hover:text-red-700 text-xs">✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}
