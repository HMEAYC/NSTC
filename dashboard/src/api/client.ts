const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8080";

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export const api = {
  listSessions: () => fetchJSON<{ sessions: unknown[] }>("/api/sessions"),
  getSession: (id: string) => fetchJSON(`/api/sessions/${id}`),
  getAnalysis: (id: string) => fetchJSON(`/api/sessions/${id}/analysis`),
  generateReport: (id: string) =>
    fetchJSON(`/api/sessions/${id}/report`, { method: "POST" }),
};
