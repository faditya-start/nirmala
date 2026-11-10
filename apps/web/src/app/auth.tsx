import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, onUnauthorized } from "../lib/api";
import type { AuthUser, Role } from "../lib/roles";

export type AuthStatus = "loading" | "ready";

export interface AuthContextValue {
  user: AuthUser | null;
  /** "loading" until the first GET /auth/me answers. Guards wait for "ready". */
  status: AuthStatus;
  login: (username: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  /** Re-read the session from the server. */
  refresh: () => Promise<void>;
  hasRole: (...roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  const refresh = useCallback(async () => {
    try {
      const result = await api.get<{ user: AuthUser | null }>("/auth/me", { skipUnauthorized: true });
      setUser(result.user ?? null);
    } catch {
      setUser(null);
    } finally {
      setStatus("ready");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // A 401 anywhere means the session is gone: clear the user, the route guard redirects to /login.
  useEffect(() => onUnauthorized(() => setUser(null)), []);

  const login = useCallback(async (username: string, password: string) => {
    const result = await api.post<{ user: AuthUser }>("/auth/login", { username, password }, { skipUnauthorized: true });
    setUser(result.user);
    return result.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout", undefined, { skipUnauthorized: true });
    } catch {
      /* the cookie may already be gone; clear local state anyway */
    }
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, login, logout, refresh, hasRole: (...roles) => (user ? roles.includes(user.role) : false) }),
    [user, status, login, logout, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth harus dipakai di dalam <AuthProvider>.");
  return value;
}
