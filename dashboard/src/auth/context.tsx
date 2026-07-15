import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import type { UserInfo } from "../api/client";

interface AuthState {
  user: UserInfo | null;
  token: string | null;
  loading: boolean;
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

function getStoredToken(): string | null {
  return localStorage.getItem("hmeayc_token");
}

function storeToken(token: string | null) {
  if (token) {
    localStorage.setItem("hmeayc_token", token);
  } else {
    localStorage.removeItem("hmeayc_token");
  }
}

const API_BASE = import.meta.env.VITE_API_BASE || "";

async function authFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => ({}))).detail || res.statusText;
    throw new Error(detail);
  }
  return res.json();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: getStoredToken(),
    loading: true,
  });

  const fetchMe = useCallback(async (tok: string): Promise<UserInfo | null> => {
    try {
      return await authFetch<UserInfo>("/api/auth/me", {
        headers: { Authorization: `Bearer ${tok}` },
      });
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    const tok = getStoredToken();
    if (!tok) {
      setState({ user: null, token: null, loading: false });
      return;
    }
    fetchMe(tok).then((user) => {
      setState({ user, token: tok, loading: false });
    });
  }, [fetchMe]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await authFetch<{ access_token: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    storeToken(res.access_token);
    const user = await fetchMe(res.access_token);
    setState({ user, token: res.access_token, loading: false });
  }, [fetchMe]);

  const logout = useCallback(() => {
    storeToken(null);
    setState({ user: null, token: null, loading: false });
  }, []);

  const refresh = useCallback(async () => {
    const tok = getStoredToken();
    if (!tok) return;
    try {
      const res = await authFetch<{ access_token: string }>("/api/auth/refresh", {
        method: "POST",
        headers: { Authorization: `Bearer ${tok}` },
      });
      storeToken(res.access_token);
      const user = await fetchMe(res.access_token);
      setState({ user, token: res.access_token, loading: false });
    } catch {
      storeToken(null);
      setState({ user: null, token: null, loading: false });
    }
  }, [fetchMe]);

  return (
    <AuthContext.Provider value={{ ...state, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function authHeaders(token: string | null): Record<string, string> {
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}
