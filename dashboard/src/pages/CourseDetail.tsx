import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../auth/context";
import { api, type CourseDetailInfo, type DeviceInfo, type ChildInfo, type AssignmentInfo } from "../api/client";
import LoadingSpinner from "../components/LoadingSpinner";

const statusConfig: Record<string, { label: string; color: string }> = {
  draft: { label: "草稿", color: "bg-gray-100 text-gray-600" },
  scheduled: { label: "排程中", color: "bg-blue-100 text-blue-700" },
  active: { label: "進行中", color: "bg-green-100 text-green-700" },
  completed: { label: "已完成", color: "bg-purple-100 text-purple-700" },
  cancelled: { label: "已取消", color: "bg-red-100 text-red-700" },
};

const sessionStatusColor: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  completed: "bg-purple-100 text-purple-700",
};

export default function CourseDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [course, setCourse] = useState<CourseDetailInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Device assignment state
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [classChildren, setClassChildren] = useState<ChildInfo[]>([]);
  const [assignments, setAssignments] = useState<AssignmentInfo[]>([]);
  const [assigningDev, setAssigningDev] = useState<string | null>(null);

  // Evaluation state
  const [evaluations, setEvaluations] = useState<{ child_id: string; child_name: string; score: number | null; comment: string | null }[]>([]);
  const [evalLoaded, setEvalLoaded] = useState(false);
  const [savingEval, setSavingEval] = useState<string | null>(null);

  const canEdit = user?.role === "org_admin" || user?.role === "super_admin";
  const canControl = canEdit || user?.role === "teacher";
  const isCompleted = course?.status === "completed";

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [courseRes, evalRes] = await Promise.all([
        api.getCourse(id),
        api.getCourseEvaluations(id).catch(() => ({ evaluations: [] })),
      ]);
      const c = courseRes.course;
      setCourse(c);
      setEvaluations(evalRes.evaluations);
      setEvalLoaded(true);

      // Also fetch device assignment data when course is active
      if (c.status === "active") {
        const [devRes, assignRes] = await Promise.all([
          api.listDevices().catch(() => ({ devices: [] })),
          c.active_session_id
            ? api.getSessionAssignments(c.active_session_id).catch(() => ({ assignments: [] }))
            : Promise.resolve({ assignments: [] }),
        ]);
        setDevices(devRes.devices);
        setAssignments(assignRes.assignments);
      }

      // Fetch children from class (for device assignment)
      if (c.class_id) {
        const { children } = await api.getClassChildren(c.class_id).catch(() => ({ children: [] }));
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
    if (!course?.active_session_id) return;
    setAssigningDev(childId);
    try {
      await api.assignSessionDevice(course.active_session_id, deviceId, childId);
      const { assignments } = await api.getSessionAssignments(course.active_session_id);
      setAssignments(assignments);
    } catch { /* ignore */ } finally {
      setAssigningDev(null);
    }
  };

  const handleStart = async () => {
    if (!id) return;
    setActionLoading(true);
    try {
      await api.startCourse(id);
      await fetchData();
    } catch { /* ignore */ } finally {
      setActionLoading(false);
    }
  };

  const handleEnd = async () => {
    if (!id) return;
    setActionLoading(true);
    try {
      await api.endCourse(id);
      await fetchData();
    } catch { /* ignore */ } finally {
      setActionLoading(false);
    }
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
      await api.upsertCourseEvaluation(id!, childId, {
        score: ev.score,
        comment: ev.comment || null,
      });
    } catch { /* ignore */ } finally {
      setSavingEval(null);
    }
  };

  if (loading) return <div className="p-6 max-w-4xl mx-auto"><LoadingSpinner text="載入課程…" /></div>;

  if (error || !course) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm">{error || "課程不存在"}</div>
        <Link to="/dashboard/courses" className="text-blue-600 hover:underline text-sm mt-4 inline-block">← 返回課程列表</Link>
      </div>
    );
  }

  const cfg = statusConfig[course.status] || { label: course.status, color: "bg-gray-100 text-gray-600" };
  const isActive = course.status === "active";
  const isDraftOrScheduled = course.status === "draft" || course.status === "scheduled";

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <Link to="/dashboard/courses" className="text-blue-600 hover:underline text-sm">← 返回課程列表</Link>

      {/* Header Card */}
      <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">{course.name}</h1>
            {course.description && <p className="text-sm text-gray-500 mt-1">{course.description}</p>}
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full ${cfg.color}`}>{cfg.label}</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-gray-400">班級</span>
            <p className="font-medium">{course.class_name || "—"}</p>
          </div>
          <div>
            <span className="text-gray-400">教案模板</span>
            <p className="font-medium">{course.template_name || "—"}</p>
          </div>
          <div>
            <span className="text-gray-400">預定時間</span>
            <p className="font-medium">{course.scheduled_at ? new Date(course.scheduled_at).toLocaleString("zh-TW") : "—"}</p>
          </div>
          {course.started_at && (
            <div>
              <span className="text-gray-400">開始時間</span>
              <p className="font-medium">{new Date(course.started_at).toLocaleString("zh-TW")}</p>
            </div>
          )}
          {course.ended_at && (
            <div>
              <span className="text-gray-400">結束時間</span>
              <p className="font-medium">{new Date(course.ended_at).toLocaleString("zh-TW")}</p>
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
              <Link to={`/dashboard/courses/${course.id}/report`}
                className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-blue-700">
                查看報告
              </Link>
            )}
          </div>
        )}
      </div>

      {/* Device Assignment (active course only) */}
      {isActive && course.active_session_id && (
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
                  <th className="pb-2 font-medium w-16">操作</th>
                </tr>
              </thead>
              <tbody>
                {classChildren.map((child) => {
                  const curr = assignments.find((a) => a.child_id === child.id);
                  const occupiedDeviceIds = new Set(
                    assignments.filter((a) => a.child_id !== child.id).map((a) => a.device_id),
                  );
                  return (
                    <tr key={child.id} className="border-b last:border-0">
                      <td className="py-2 font-medium">{child.name}</td>
                      <td className="py-2">
                        <select
                          value={curr?.device_id ?? ""}
                          onChange={(e) => handleAssignDevice(child.id, e.target.value)}
                          disabled={assigningDev === child.id}
                          className="border rounded-lg px-2 py-1 text-xs bg-white w-full"
                        >
                          <option value="">-- 未配對 --</option>
                          {devices
                            .filter((d) => d.id === curr?.device_id || !occupiedDeviceIds.has(d.id))
                            .map((d) => (
                              <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                        </select>
                      </td>
                      <td className="py-2">
                        {curr && (
                          <button
                            onClick={async () => {
                              if (!course?.active_session_id) return;
                              try {
                                await api.deleteAssignment(curr.id);
                                const { assignments: updated } = await api.getSessionAssignments(course.active_session_id!);
                                setAssignments(updated);
                              } catch { /* ignore */ }
                            }}
                            className="text-red-500 hover:underline"
                          >
                            解除
                          </button>
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

      {/* Sessions List */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-bold text-gray-800 mb-4">即時串流記錄</h2>
        {course.sessions.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-8">
            {isActive ? "課程進行中，等待裝置連線…" : "尚無串流記錄"}
          </div>
        ) : (
          <table className="w-full text-xs text-gray-600">
            <thead>
              <tr className="border-b text-left">
                <th className="pb-2 font-medium">標題</th>
                <th className="pb-2 font-medium">類型</th>
                <th className="pb-2 font-medium">狀態</th>
                <th className="pb-2 font-medium">開始時間</th>
                <th className="pb-2 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {course.sessions.map((s) => (
                <tr key={s.id} className="border-b last:border-0">
                  <td className="py-2">{s.title || "—"}</td>
                  <td className="py-2">{s.course_type}</td>
                  <td className="py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${sessionStatusColor[s.status] || "bg-gray-100 text-gray-600"}`}>
                      {s.status === "active" ? "進行中" : "已完成"}
                    </span>
                  </td>
                  <td className="py-2">{s.start_time ? new Date(s.start_time).toLocaleString("zh-TW") : "—"}</td>
                  <td className="py-2">
                    <div className="flex gap-2">
                      <Link to={`/dashboard/live/${s.id}`}
                        className="text-blue-600 hover:underline">即時監控</Link>
                      <Link to={`/dashboard/assessment/${s.id}`}
                        className="text-blue-600 hover:underline">評估指標</Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Evaluations (only for completed courses) */}
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
