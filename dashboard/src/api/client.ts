export interface SessionSummary {
  id: string;
  device_id: string;
  started_at: string;
  ended_at: string | null;
  status: string;
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

  getReport: (id: string) =>
    fetchJSON<{
      id: string;
      session_id: string;
      report_type: string;
      markdown: string;
    }>(`/api/reports/${id}`),

  analyzeImu: (id: string) =>
    fetchJSON<{ results: AnalysisResult[] }>(`/api/sessions/${id}/analysis`),
};
