export interface SessionSummary {
  id: string;
  course_type: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  duration_sec: number | null;
  imu_count: number;
  device_count: number;
  title?: string;
}

export interface AnalysisResult {
  id: string;
  session_id: string;
  type: string;
  result: Record<string, unknown>;
}

export interface UserInfo {
  id: string;
  email: string;
  display_name: string;
  role: string;
  org_id: string;
  is_active: boolean;
}

export interface DeviceInfo {
  id: string;
  device_id: string;
  name: string;
  firmware_version: string | null;
  battery_level: number | null;
  status: string;
  last_seen: string | null;
  created_at: string | null;
}

export interface ChildInfo {
  id: string;
  name: string;
  student_id: string | null;
  notes: string | null;
  class_id?: string | null;
  created_at: string | null;
}

export interface ChildAssignmentInfo {
  id: string;
  name: string;
  student_id: string | null;
  class_id: string | null;
  device_id: string | null;
  device_name: string | null;
  assignment_id: string | null;
}

export interface AssignmentInfo {
  id: string;
  device_id: string;
  device_name: string;
  child_id: string;
  child_name: string;
  confidence: number | null;
  method: string;
  assigned_at: string | null;
}

export interface CourseInfo {
  id: string;
  org_id: string;
  class_id: string | null;
  template_id: string | null;
  name: string;
  description: string | null;
  status: string;
  scheduled_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string | null;
}

export interface CourseDetailInfo extends CourseInfo {
  class_name: string | null;
  template_name: string | null;
  sessions: {
    id: string;
    title: string | null;
    course_type: string;
    status: string;
    start_time: string | null;
    end_time: string | null;
  }[];
}

export interface CourseTemplateInfo {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number | null;
  stages: { name: string; duration: number; type?: string }[] | null;
  metrics_config: Record<string, boolean> | null;
  created_at: string | null;
}

export interface AssessmentResultInfo {
  id: string;
  device_id: string | null;
  device_name: string | null;
  child_id: string | null;
  child_name: string | null;
  activity_level: number | null;
  smoothness: number | null;
  stability_index: number | null;
  sample_count: number | null;
  window_seconds: number | null;
  computed_at: string | null;
}

export interface SessionAssessmentResponse {
  session_id: string;
  assessments: AssessmentResultInfo[];
  summary: {
    student_count: number;
    device_count: number;
    avg_activity_level: number;
    avg_smoothness: number;
    avg_stability_index: number;
  };
}

export interface ChildAssessmentResponse {
  child_id: string;
  child_name: string;
  assessments: (AssessmentResultInfo & {
    session_id: string;
    course_type: string;
    session_started_at: string | null;
  })[];
}

export interface ClassAssessmentResponse {
  class_id: string;
  sessions: {
    session_id: string;
    course_type: string;
    started_at: string | null;
    student_count: number;
    device_count: number;
    avg_activity_level: number;
    avg_smoothness: number;
    avg_stability_index: number;
  }[];
  total_sessions_with_assessments: number;
}

const API_BASE = import.meta.env.VITE_API_BASE || "";

function getToken(): string | null {
  return localStorage.getItem("hmeayc_token");
}

function authHeader(): Record<string, string> {
  const tok = getToken();
  return tok ? { Authorization: `Bearer ${tok}` } : {};
}

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...authHeader(), ...init?.headers },
  });
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
  return res.json();
}

export const api = {
  // Auth
  login: (email: string, password: string) =>
    fetchJSON<{ access_token: string; user_id: string; org_id: string; role: string; display_name: string }>(
      "/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }
    ),

  me: () => fetchJSON<UserInfo>("/api/auth/me"),

  // Sessions
  listSessions: () =>
    fetchJSON<{ sessions: SessionSummary[] }>("/api/sessions"),

  getSession: (id: string) => fetchJSON<SessionSummary>(`/api/sessions/${id}`),

  getAnalysis: (id: string) =>
    fetchJSON<{ results: AnalysisResult[] }>(`/api/sessions/${id}/analysis`),

  generateReport: (id: string) =>
    fetchJSON<{ report: { id: string } }>(`/api/sessions/${id}/report`, {
      method: "POST",
    }),

  getSessionReport: (id: string) =>
    fetchJSON<{
      id: string;
      session_id: string;
      report_type: string;
      markdown: string;
    }>(`/api/sessions/${id}/report`),

  getReport: (id: string) =>
    fetchJSON<{
      id: string;
      session_id: string;
      report_type: string;
      markdown: string;
    }>(`/api/reports/${id}`),

  endSession: (id: string) =>
    fetchJSON<{ status: string }>(`/api/sessions/${id}/end`, {
      method: "POST",
    }),

  analyzeImu: (id: string) =>
    fetchJSON<{ results: AnalysisResult[] }>(`/api/sessions/${id}/analysis`),

  // Devices
  listDevices: () =>
    fetchJSON<{ devices: DeviceInfo[] }>("/api/devices"),

  registerDevice: (device_id: string, name?: string, firmware_version?: string) =>
    fetchJSON<{ device: DeviceInfo }>("/api/devices", {
      method: "POST",
      body: JSON.stringify({ device_id, name, firmware_version }),
    }),

  listChildren: () =>
    fetchJSON<{ children: ChildInfo[] }>("/api/children"),

  listChildAssignments: () =>
    fetchJSON<{ children: ChildAssignmentInfo[] }>("/api/children/assignments"),

  assignChildDevice: (childId: string, deviceId: string) =>
    fetchJSON<{ status: string }>(`/api/children/${childId}/assign`, {
      method: "PUT",
      body: JSON.stringify({ device_id: deviceId }),
    }),

  deleteAssignment: (assignmentId: string) =>
    fetchJSON<{ status: string }>(`/api/assignments/${assignmentId}`, {
      method: "DELETE",
    }),

  registerChild: (name: string, student_id?: string, notes?: string, class_id?: string) =>
    fetchJSON<{ child: ChildInfo }>("/api/children", {
      method: "POST",
      body: JSON.stringify({ name, student_id, notes, class_id }),
    }),

  getAssignments: (sessionId: string) =>
    fetchJSON<{ assignments: AssignmentInfo[] }>(`/api/sessions/${sessionId}/assignments`),

  assignDevice: (sessionId: string, device_id: string, child_id: string, confidence?: number) =>
    fetchJSON<{ assignment: AssignmentInfo }>(`/api/sessions/${sessionId}/assign`, {
      method: "POST",
      body: JSON.stringify({ device_id, child_id, confidence }),
    }),

  // Firmware
  listFirmware: () =>
    fetchJSON<{ versions: { id: string; version: string; description: string; file_size: number; created_at: string }[] }>("/api/firmware/list"),

  uploadFirmware: async (version: string, description: string, file: File) => {
    const form = new FormData();
    form.append("version", version);
    form.append("description", description);
    form.append("file", file);
    const tok = getToken();
    const headers: Record<string, string> = tok ? { Authorization: `Bearer ${tok}` } : {};
    const res = await fetch(`${API_BASE}/api/firmware/upload`, { method: "POST", body: form, headers });
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
    return res.json();
  },

  // WiFi Config
  getWifiConfig: () =>
    fetchJSON<{ ssid: string | null; updated_at: string | null; password?: string }>("/api/config/wifi"),

  setWifiConfig: (ssid: string, password: string) =>
    fetchJSON<{ ssid: string; updated_at: string }>(`/api/config/wifi`, {
      method: "PUT",
      body: JSON.stringify({ ssid, password: password || null }),
    }),

  // Assessments
  computeSessionAssessment: (sessionId: string) =>
    fetchJSON<{ assessments: AssessmentResultInfo[] }>(
      `/api/sessions/${sessionId}/assessments/compute`, { method: "POST" }
    ),

  getSessionAssessments: (sessionId: string) =>
    fetchJSON<SessionAssessmentResponse>(`/api/sessions/${sessionId}/assessments`),

  getChildAssessments: (childId: string) =>
    fetchJSON<ChildAssessmentResponse>(`/api/children/${childId}/assessments`),

  getClassAssessments: (classId: string) =>
    fetchJSON<ClassAssessmentResponse>(`/api/classes/${classId}/assessments`),

  // Courses
  listCourses: (params?: { status?: string; class_id?: string }) => {
    const q = params ? "?" + new URLSearchParams(params as Record<string, string>).toString() : "";
    return fetchJSON<{ courses: CourseInfo[] }>(`/api/courses${q}`);
  },

  createCourse: (data: {
    name: string;
    class_id?: string;
    template_id?: string;
    description?: string;
    scheduled_at?: string;
  }) =>
    fetchJSON<{ course: CourseInfo }>("/api/courses", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getCourse: (id: string) =>
    fetchJSON<{ course: CourseDetailInfo }>(`/api/courses/${id}`),

  updateCourse: (id: string, data: {
    name?: string;
    description?: string;
    class_id?: string | null;
    template_id?: string | null;
    scheduled_at?: string | null;
  }) =>
    fetchJSON<{ course: CourseInfo }>(`/api/courses/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  deleteCourse: (id: string) =>
    fetchJSON<{ status: string }>(`/api/courses/${id}`, {
      method: "DELETE",
    }),

  startCourse: (id: string) =>
    fetchJSON<{ course: CourseInfo }>(`/api/courses/${id}/start`, { method: "POST" }),

  endCourse: (id: string) =>
    fetchJSON<{ course: CourseInfo }>(`/api/courses/${id}/end`, { method: "POST" }),

  getCourseSessions: (id: string) =>
    fetchJSON<{ sessions: { id: string; title: string | null; course_type: string; status: string; start_time: string | null; end_time: string | null }[] }>(`/api/courses/${id}/sessions`),

  // Templates
  listTemplates: () =>
    fetchJSON<{ templates: CourseTemplateInfo[] }>("/api/templates"),

  createTemplate: (data: {
    name: string;
    description?: string;
    duration_minutes?: number;
    stages?: { name: string; duration: number; type?: string }[];
    metrics_config?: Record<string, boolean>;
  }) =>
    fetchJSON<{ template: CourseTemplateInfo }>("/api/templates", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getTemplate: (id: string) =>
    fetchJSON<{ template: CourseTemplateInfo }>(`/api/templates/${id}`),

  updateTemplate: (id: string, data: {
    name?: string;
    description?: string;
    duration_minutes?: number;
    stages?: { name: string; duration: number; type?: string }[];
    metrics_config?: Record<string, boolean>;
  }) =>
    fetchJSON<{ template: CourseTemplateInfo }>(`/api/templates/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  deleteTemplate: (id: string) =>
    fetchJSON<{ status: string }>(`/api/templates/${id}`, {
      method: "DELETE",
    }),

  // Course Evaluations
  getCourseEvaluations: (courseId: string) =>
    fetchJSON<{ evaluations: { child_id: string; child_name: string; score: number | null; comment: string | null }[] }>(`/api/courses/${courseId}/evaluations`),

  upsertCourseEvaluation: (courseId: string, childId: string, data: { score?: number | null; comment?: string | null }) =>
    fetchJSON<{ evaluation: { child_id: string; score: number | null; comment: string | null } }>(
      `/api/courses/${courseId}/evaluations/${childId}`,
      { method: "PUT", body: JSON.stringify(data) },
    ),

  // Course Report
  getCourseReport: (courseId: string) =>
    fetchJSON<{
      course: { id: string; name: string; description: string | null; status: string; class_name: string | null; scheduled_at: string | null; started_at: string | null; ended_at: string | null };
      summary: { session_count: number; total_imu_records: number; unique_devices: number };
      sessions: { session_id: string; title: string | null; status: string; start_time: string | null; end_time: string | null; imu_count: number; device_count: number; avg_activity_level: number | null; avg_smoothness: number | null; avg_stability_index: number | null }[];
      evaluations: { child_id: string; child_name: string; score: number | null; comment: string | null }[];
    }>(`/api/courses/${courseId}/report`),
};
