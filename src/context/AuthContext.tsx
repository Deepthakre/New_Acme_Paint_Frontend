import { createContext, useContext, useState, useCallback, useEffect, useMemo, type ReactNode } from 'react';
import * as api from '../lib/apiClient';
import type { Role, User, RegisterPayload } from '../types';

interface AuthContextValue {
  user: User | null;
  /** True until the initial silent session restore has finished. */
  initializing: boolean;
  login: (username: string, password: string, role: Role) => Promise<User>;
  register: (payload: RegisterPayload) => Promise<User>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);

  // Restore the session after a page refresh: the httpOnly refresh cookie
  // survives reloads, the in-memory access token does not.
  useEffect(() => {
    let cancelled = false;
    api
      .restoreSession()
      .then((u) => {
        if (!cancelled) setUser(u);
      })
      .finally(() => {
        if (!cancelled) setInitializing(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (username: string, password: string, role: Role) => {
    const u = await api.login(username, password, role);
    setUser(u);
    return u;
  }, []);

  const register = useCallback(async (payload: RegisterPayload) => {
    const u = await api.register(payload);
    setUser(u);
    return u;
  }, []);

  // Always clears local state, even if the server call fails (offline,
  // expired token) so the user is never stuck "logged in" in the UI.
  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, initializing, login, register, logout }),
    [user, initializing, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
