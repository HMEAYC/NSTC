import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../auth/context";
import { api, type SessionDetailInfo, type DeviceInfo, type ChildInfo, type AssignmentInfo } from "../api/client";
import LoadingSpinner from "../components/LoadingSpinner";

const statusConfig: Record<string, { label: string; color: string }> = {
  draft: { label: "草稿", color: "bg-gray-100 text-gray-600" },
  scheduled: { label: "排程中", color: "bg-blue-100 text-blue-700" },
  active: { label: "進行中", color: "bg-green-100 text-green-700" },
  completed: { label: "已完成", color: "bg-purple-100 text-purple-700" },
  cancelled: { label: "已取消", color: "bg-red-100 text-red-700" },
};

export default function SessionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [session, setSession] = useState<SessionDetailInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Device assignment state
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [classChildren, setClassChildren] = useState<ChildInfo[]>([]);
  const [assignments, setAssignments] = useState<AssignmentInfo[]>([]);
  const [assigningDev, setAssigningDev] = useState<string | null>(null);

  // Pairing modal state
  const [pairingChildId, setPairingChildId] = useState<string | null>(null);
  const [pairingDeviceId, setPairingDeviceId] = useState("");
  const [autoPairLoading, setAutoPairLoading] = useState(false);
  const [autoPairResult, setAutoPairResult] = useState<{
    assignments: { device_id: string; child_id: string; confidence: number }[];
    bpm_estimate: number;
    pose_data_available: boolean;
  } | null>(null);

  // Evaluation state
  const [evaluations, setEvaluations] = useState<{ child_id: string; child_name: string; score: number | null; comment: string | null }[]>([]);
  const [evalLoaded, setEvalLoaded] = useState(false);
  const [savingEval, setSavingEval] = useState<string | null>(null);

  // Activity flow state
  const [actIdx, setActIdx] = useState(0);
  const [savingAct, setSavingAct] = useState(false);

  const canEdit = user?.role === "org_admin" || user?.role === "super_admin";
  const canControl = canEdit || user?.role === "teacher";
  const isCompleted = session?.status === "completed";

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [sessionRes, evalRes] = await Promise.all([
        api.getSession(id),
        api.getSessionEvaluations(id).catch(() => ({ evaluations: [] })),
      ]);
      const s = sessionRes.session;
      setSession(s);
      setActIdx(s.current_activity_index || 0);
      setEvaluations(evalRes.evaluations);
      setEvalLoaded(true);

      if (s.status === "active") {
        const [devRes, assignRes] = await Promise.all([
          api.listDevices().catch(() => ({ devices: [] })),
          api.getSessionAssignments(id).catch(() => ({ assignments: [] })),
        ]);
        setDevices(devRes.devices);
        setAssignments(assignRes.assignments);
      }

      if (s.class_id) {
        const { children } = await api.getClassChildren(s.class_id).catch(() => ({ children: [] }));
        setClassChildren(children);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAssignDevice = async (childId: string, deviceId: string) => {
    if (!id) return;
    setAssigningDev(childId);
    try {
      await api.assignSessionDevice(id, deviceId, childId);
      const { assignments } = await api.getSessionAssignments(id);
      setAssignments(assignments);
    } catch { /* ignore */ } finally {
      setAssigningDev(null);
    }
  };

  const handleAutoPair = async () => {
    if (!id) return;
    setAutoPairLoading(true);
    setAutoPairResult(null);
    try {
      const res = await api.autoPairSession(id);
      setAutoPairResult(res);
    } catch { /* ignore */ } finally {
      setAutoPairLoading(false);
    }
  };

  const handleStart = async () => {
    if (!id) return;
    setActionLoading(true);
    try {
      await api.startSession(id);
      await fetchData();
    } catch { /* ignore */ } finally {
      setActionLoading(false);
    }
  };

  const handleEnd = async () => {
    if (!id) return;
    setActionLoading(true);
    try {
      await api.endSession(id);
      await fetchData();
    } catch { /* ignore */ } finally {
      setActionLoading(false);
    }
  };

  const advanceActivity = (delta: number) => {
    if (!session) return;
    const acts = session.template_activities;
    if (!acts || acts.length === 0) return;
    const next = Math.max(0, Math.min(acts.length - 1, actIdx + delta));
    setActIdx(next);
    setSavingAct(true);
    api.updateActivity(id!, next).finally(() => setSavingAct(false));
  };

  const handleEvalChange = (childId: string, field: "score" | "comment", value: string) => {
    setEvaluations((prev) =>
      prev.map((e) =>
        e.child_id === childId
          ? { ...e, [field]: field === "score" ? (value ? parseFloat(value) : null) : value }
          : e,
      ),
    );
  };

  const handleEvalSave = async (childId: string) => {
    const ev = evaluations.find((e) => e.child_id === childId);
    if (!ev) return;
    setSavingEval(childId);
    try {
      await api.upsertSessionEvaluation(id!, childId, {
        score: ev.score,
        comment: ev.comment || null,
      });
    } catch { /* ignore */ } finally {
      setSavingEval(null);
    }
  };

  if (loading) return <div className="p-6 max-w-4xl mx-auto"><LoadingSpinner text="載入課程…" /></div>;

  if (error || !session) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm">{error || "課程不存在"}</div>
        <Link to="/dashboard/sessions" className="text-blue-600 hover:underline text-sm mt-4 inline-block">← 返回課程列表</Link>
      </div>
    );
  }

  const cfg = statusConfig[session.status] || { label: session.status, color: "bg-gray-100 text-gray-600" };
  const isActive = session.status === "active";
  const isDraftOrScheduled = session.status === "draft" || session.status === "scheduled";

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <Link to="/dashboard/sessions" className="text-blue-600 hover:underline text-sm">← 返回課程列表</Link>

      {/* Header Card */}
      <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">{session.name}</h1>
            {session.description && <p className="text-sm text-gray-500 mt-1">{session.description}</p>}
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full ${cfg.color}`}>{cfg.label}</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-gray-400">班級</span>
            <p className="font-medium">{session.class_name || "—"}</p>
          </div>
          <div>
            <span className="text-gray-400">教案模板</span>
            <p className="font-medium">{session.template_name || "—"}</p>
          </div>
          <div>
            <span className="text-gray-400">預定時間</span>
            <p className="font-medium">{session.scheduled_at ? new Date(session.scheduled_at).toLocaleString("zh-TW") : "—"}</p>
          </div>
          {session.started_at && (
            <div>
              <span className="text-gray-400">開始時間</span>
              <p className="font-medium">{new Date(session.started_at).toLocaleString("zh-TW")}</p>
            </div>
          )}
          {session.ended_at && (
            <div>
              <span className="text-gray-400">結束時間</span>
              <p className="font-medium">{new Date(session.ended_at).toLocaleString("zh-TW")}</p>
            </div>
          )}
        </div>

        {canControl && (
          <div className="flex gap-2 pt-2">
            {isDraftOrScheduled && (
              <button onClick={handleStart} disabled={actionLoading}
                className="bg-green-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-green-700 disabled:opacity-50">
                {actionLoading ? "處理中…" : "開始上課"}
              </button>
            )}
            {isActive && (
              <button onClick={handleEnd} disabled={actionLoading}
                className="bg-red-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-red-700 disabled:opacity-50">
                {actionLoading ? "處理中…" : "結束課程"}
              </button>
            )}
            {isCompleted && (
              <Link to={`/dashboard/sessions/${session.id}/report`}
                className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-blue-700">
                查看報告
              </Link>
            )}
          </div>
        )}
      </div>

      {/* Device Assignment (active session only) */}
      {isActive && (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4">裝置配對</h2>
          {classChildren.length === 0 ? (
            <div className="text-center text-gray-400 text-sm py-4">課程沒有關聯班級，無法配對裝置</div>
          ) : (
            <table className="w-full text-xs text-gray-600">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 font-medium">學童</th>
                  <th className="pb-2 font-medium">裝置</th>
                  <th className="pb-2 font-medium w-32">即時</th>
                </tr>
              </thead>
              <tbody>
                {classChildren.map((child) => {
                  const curr = assignments.find((a) => a.child_id === child.id);
                  const assignedDevice = curr ? devices.find((d) => d.id === curr.device_id) : null;
                  return (
                    <tr
                      key={child.id}
                      onClick={() => { setPairingChildId(child.id); setPairingDeviceId(curr?.device_id || ""); setAutoPairResult(null); }}
                      className="border-b last:border-0 cursor-pointer hover:bg-gray-50 transition-colors"
                    >
                      <td className="py-2 font-medium">{child.name}</td>
                      <td className="py-2">
                        {assignedDevice ? (
                          <span className="text-blue-700 font-medium">{assignedDevice.name}</span>
                        ) : (
                          <span className="text-gray-400">點擊配對裝置</span>
                        )}
                      </td>
                      <td className="py-2">
                        {curr ? (
                          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                            <Link to={`/dashboard/live/${id}?device=${curr.device_id}`}
                              className="text-blue-600 hover:underline">即時</Link>
                            <Link to={`/dashboard/assessment/${id}?device=${curr.device_id}`}
                              className="text-blue-600 hover:underline">評估</Link>
                          </div>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Pairing Modal */}
      {pairingChildId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            {(() => {
              const child = classChildren.find((c) => c.id === pairingChildId);
              const curr = assignments.find((a) => a.child_id === pairingChildId);
              const occupiedIds = new Set(
                assignments.filter((a) => a.child_id !== pairingChildId).map((a) => a.device_id),
              );
              const available = devices.filter((d) => d.id === pairingDeviceId || !occupiedIds.has(d.id));
              const childPairSuggestion = autoPairResult?.assignments.find((a) => a.child_id === pairingChildId);
              return (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-gray-800">
                      裝置配對：{child?.name || ""}
                    </h3>
                    <button onClick={() => setPairingChildId(null)} className="text-gray-400 hover:text-gray-600 text-lg">&times;</button>
                  </div>

                  <label className="text-xs text-gray-500 block mb-1">選擇裝置</label>
                  <select
                    value={pairingDeviceId}
                    onChange={(e) => setPairingDeviceId(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm mb-4"
                  >
                    <option value="">-- 請選擇裝置 --</option>
                    {available.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.status === "online" ? "連線中" : "離線"})
                      </option>
                    ))}
                  </select>

                  <div className="flex gap-2 mb-4">
                    <button
                      onClick={async () => {
                        if (!pairingDeviceId) return;
                        await handleAssignDevice(pairingChildId, pairingDeviceId);
                        setPairingChildId(null);
                      }}
                      disabled={!pairingDeviceId || assigningDev === pairingChildId}
                      className="flex-1 text-xs py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {assigningDev === pairingChildId ? "儲存中…" : "手動配對"}
                    </button>
                    <button
                      onClick={async () => {
                        await handleAutoPair();
                      }}
                      disabled={autoPairLoading}
                      className="flex-1 text-xs py-1.5 rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50"
                    >
                      {autoPairLoading ? "分析中…" : "🔗 跨模態自動配對"}
                    </button>
                    {curr && (
                      <button
                        onClick={async () => {
                          if (!id) return;
                          try {
                            await api.deleteAssignment(curr.id);
                            const { assignments: updated } = await api.getSessionAssignments(id);
                            setAssignments(updated);
                            setPairingChildId(null);
                          } catch { /* ignore */ }
                        }}
                        className="text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                      >
                        解除配對
                      </button>
                    )}
                    <button
                      onClick={() => setPairingChildId(null)}
                      className="text-xs px-3 py-1.5 rounded-lg text-gray-500 hover:bg-gray-100"
                    >
                      取消
                    </button>
                  </div>

                  {autoPairLoading && (
                    <div className="text-xs text-purple-600 mb-4">正在分析 IMU 訊號頻譜…</div>
                  )}

                  {childPairSuggestion && !autoPairLoading && (
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-xs text-purple-800 mb-4">
                      <div className="font-semibold mb-1">🔗 自動配對建議</div>
                      {autoPairResult?.pose_data_available ? (
                        <div>使用 FFT 相位匹配（IMU ↔ 攝影機髖部軌跡）</div>
                      ) : (
                        <div>僅有 IMU 資料，以頻譜相位分析建議</div>
                      )}
                      {autoPairResult?.bpm_estimate ? (
                        <div className="mt-1">偵測 BPM：約 {autoPairResult.bpm_estimate}</div>
                      ) : null}
                      <div className="mt-2 flex items-center gap-2">
                        <span>建議配對：</span>
                        <span className="font-mono font-medium">
                          {devices.find((d) => d.id === childPairSuggestion.device_id)?.name || childPairSuggestion.device_id}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded-full font-medium ${
                          childPairSuggestion.confidence > 0.7 ? "bg-green-200 text-green-800" :
                          childPairSuggestion.confidence > 0.4 ? "bg-yellow-200 text-yellow-800" :
                          "bg-red-200 text-red-800"
                        }`}>
                          {(childPairSuggestion.confidence * 100).toFixed(0)}%
                        </span>
                        <button
                          onClick={async () => {
                            await handleAssignDevice(pairingChildId, childPairSuggestion.device_id);
                            setPairingChildId(null);
                          }}
                          className="text-purple-600 hover:underline ml-2"
                        >
                          採用
                        </button>
                      </div>
                    </div>
                  )}

                  <hr className="mb-4" />

                  <div className="bg-purple-50 rounded-lg p-4 text-xs text-purple-800 space-y-3">
                    <h4 className="font-semibold text-sm">🔗 跨模態裝置配對機制</h4>
                    <p>
                      根據 HMEAYC 論文提出的 <strong>N² 候選自校準 FFT 相位匹配演算法</strong>，
                      自動將 IMU 腰帶訊號與攝影機姿態估計訊號進行配對。
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="bg-blue-100 rounded-lg p-2.5">
                        <div className="font-semibold text-blue-800 mb-1">📡 IMU 腰帶訊號</div>
                        <ul className="space-y-0.5 text-blue-700">
                          <li>加速度計 ±16g @ 50Hz</li>
                          <li>陀螺儀 ±2000°/s</li>
                          <li>透過 WebSocket 串流至伺服器</li>
                          <li>FFT 相位角 φᵢᴵᴹᵁ</li>
                        </ul>
                      </div>
                      <div className="bg-green-100 rounded-lg p-2.5">
                        <div className="font-semibold text-green-800 mb-1">📹 攝影機視覺訊號</div>
                        <ul className="space-y-0.5 text-green-700">
                          <li>MediaPipe Pose 33 點骨架</li>
                          <li>髖部位移軌跡 y(t)</li>
                          <li>不儲存影像，僅保留座標</li>
                          <li>FFT 相位角 φⱼᵛᴵˢ</li>
                        </ul>
                      </div>
                      <div className="bg-purple-100 rounded-lg p-2.5">
                        <div className="font-semibold text-purple-800 mb-1">🧮 配對演算法</div>
                        <ul className="space-y-0.5 text-purple-700">
                          <li>N² 候選自校準偏移</li>
                          <li>Hungarian 全域最優指派</li>
                          <li>信心分數 conf ∈ [0, 1]</li>
                          <li>O(N⁵) 複雜度，N ≤ 10</li>
                        </ul>
                      </div>
                    </div>
                    <div className="bg-yellow-100 rounded-lg p-3 text-yellow-800">
                      <div className="font-semibold mb-1">理論基礎</div>
                      <p>
                        IMU 加速度與視覺髖部位移之間存在恆定 π 弧度相位差，
                        為物理運動學恆等式，無需額外校正。
                      </p>
                      <ol className="mt-2 space-y-0.5 list-decimal list-inside">
                        <li>教師開啟課程 → 音樂播放（librosa beat tracking）</li>
                        <li>ESP32 腰帶串流 IMU 資料，攝影機追蹤 MediaPipe 骨架</li>
                        <li>系統對每個裝置（IMU）與每個學童（髖部軌跡）計算 FFT 相位相關</li>
                        <li>對 N² 個候選對執行 Hungarian 指派，求全域最優解</li>
                        <li>回傳配對結果 + 信心分數，教師可手動覆寫</li>
                      </ol>
                      <p className="mt-2">
                        💡 目前使用 IMU 頻譜分析進行建議配對。
                        若有上傳課程錄影，系統將改用 IMU ↔ 髖部軌跡交叉相位匹配，準確率更高。
                      </p>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Activity Flow (active session with template) */}
      {isActive && session.template_activities && session.template_activities.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-gray-700">📋 活動流程</h2>
            <span className="text-xs text-gray-400">
              {actIdx + 1} / {session.template_activities.length}
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-1.5 mb-3">
            <div
              className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${((actIdx + 1) / session.template_activities.length) * 100}%` }}
            />
          </div>
          {session.template_activities[actIdx] && (
            <div className="border border-blue-100 bg-blue-50 rounded-lg p-3">
              <div className="text-sm font-medium text-blue-800 mb-1">
                {session.template_activities[actIdx].title}
              </div>
              {session.template_activities[actIdx].rhythm_pattern && (
                <div className="text-xs font-mono text-blue-600 mb-1">
                  節奏型: {session.template_activities[actIdx].rhythm_pattern}
                </div>
              )}
              <div className="text-xs text-blue-700/70 line-clamp-2">
                {session.template_activities[actIdx].content}
              </div>
            </div>
          )}
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => advanceActivity(-1)}
              disabled={actIdx <= 0 || savingAct}
              className="flex-1 text-xs py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30"
            >
              ← 上一個
            </button>
            <button
              onClick={() => advanceActivity(1)}
              disabled={actIdx >= session.template_activities.length - 1 || savingAct}
              className="flex-1 text-xs py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-30"
            >
              下一個 →
            </button>
          </div>
        </div>
      )}

      {/* Evaluations (only for completed sessions) */}
      {isCompleted && evalLoaded && canControl && (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4">學生評分</h2>
          {evaluations.length === 0 ? (
            <div className="text-center text-gray-400 text-sm py-4">沒有找到班級學生</div>
          ) : (
            <table className="w-full text-xs text-gray-600">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 font-medium">學生</th>
                  <th className="pb-2 font-medium w-20">評分 (0-100)</th>
                  <th className="pb-2 font-medium">評語</th>
                  <th className="pb-2 font-medium w-16">操作</th>
                </tr>
              </thead>
              <tbody>
                {evaluations.map((ev) => (
                  <tr key={ev.child_id} className="border-b last:border-0">
                    <td className="py-2 font-medium">{ev.child_name}</td>
                    <td className="py-2">
                      <input type="number" min={0} max={100}
                        value={ev.score ?? ""}
                        onChange={(e) => handleEvalChange(ev.child_id, "score", e.target.value)}
                        className="w-20 border rounded-lg px-2 py-1 text-xs" />
                    </td>
                    <td className="py-2">
                      <input value={ev.comment ?? ""}
                        onChange={(e) => handleEvalChange(ev.child_id, "comment", e.target.value)}
                        placeholder="評語（選填）"
                        className="w-full border rounded-lg px-2 py-1 text-xs" />
                    </td>
                    <td className="py-2">
                      <button onClick={() => handleEvalSave(ev.child_id)} disabled={savingEval === ev.child_id}
                        className="text-blue-600 hover:underline disabled:opacity-50">
                        {savingEval === ev.child_id ? "儲存中" : "儲存"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
