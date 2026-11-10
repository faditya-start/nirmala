import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AuthResponse, MeResponse, OrganizationUnitDto } from "@nirmala/shared";
import { api, onUnauthorized } from "../lib/api";
import type { AuthUser, Role } from "../lib/roles";

export type AuthStatus = "loading" | "ready";

export interface AuthContextValue {
  user: AuthUser | null;
  /** Eselon I the user may see (GET /auth/me `organizationUnits`, already filtered by scope). */
  organizationUnits: OrganizationUnitDto[];
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
  const [organizationUnits, setOrganizationUnits] = useState<OrganizationUnitDto[]>([]);
  const [status, setStatus] = useState<AuthStatus>("loading");

  /** GET /auth/me -> MeResponse. Returns the user, or null when signed out or the request failed. */
  const readSession = useCallback(async (): Promise<AuthUser | null> => {
    try {
      const result = await api.get<MeResponse>("/auth/me", { skipUnauthorized: true });
      setUser(result.user ?? null);
      setOrganizationUnits(Array.isArray(result.organizationUnits) ? result.organizationUnits : []);
      return result.user ?? null;
    } catch {
      setUser(null);
      setOrganizationUnits([]);
      return null;
    }
  }, []);

  const refresh = useCallback(async () => {
    await readSession();
    setStatus("ready");
  }, [readSession]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // A 401 anywhere means the session is gone: clear the user, the route guard redirects to /login.
  useEffect(
    () =>
      onUnauthorized(() => {
        setUser(null);
        setOrganizationUnits([]);
      }),
    []
  );

  const login = useCallback(async (username: string, password: string) => {
    const result = await api.post<AuthResponse>("/auth/login", { username, password }, { skipUnauthorized: true });
    // Login answers with the short SessionUser: show it at once, then fill in unitLabel and scope from /auth/me.
    setUser(result.user);
    const detailed = await readSession();
    return detailed ?? result.user;
  }, [readSession]);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout", undefined, { skipUnauthorized: true });
    } catch {
      /* the cookie may already be gone; clear local state anyway */
    }
    setUser(null);
    setOrganizationUnits([]);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, organizationUnits, status, login, logout, refresh, hasRole: (...roles) => (user ? roles.includes(user.role) : false) }),
    [user, organizationUnits, status, login, logout, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth harus dipakai di dalam <AuthProvider>.");
  return value;
}
