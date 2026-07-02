export interface SessionSummary {
  id: string;
  course_type: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  duration_sec: number | null;
  imu_count: number;
  device_count: number;
}

export interface AnalysisResult {
  id: string;
  session_id: string;
  type: string;
  result: Record<string, unknown>;
}

const API_BASE = import.meta.env.VITE_API_BASE || "";

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
  return res.json();
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
  created_at: string | null;
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

export const api = {
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

  listDevices: () =>
    fetchJSON<{ devices: DeviceInfo[] }>("/api/devices"),

  registerDevice: (device_id: string, name?: string, firmware_version?: string) =>
    fetchJSON<{ device: DeviceInfo }>("/api/devices", {
      method: "POST",
      body: JSON.stringify({ device_id, name, firmware_version }),
    }),

  listChildren: () =>
    fetchJSON<{ children: ChildInfo[] }>("/api/children"),

  registerChild: (name: string, student_id?: string, notes?: string) =>
    fetchJSON<{ child: ChildInfo }>("/api/children", {
      method: "POST",
      body: JSON.stringify({ name, student_id, notes }),
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
    const res = await fetch(`${API_BASE}/api/firmware/upload`, { method: "POST", body: form });
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
};
