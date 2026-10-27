import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import { painterApi } from '../lib/painterApi';
import type { PainterProfile } from '../types';

interface PainterAuthValue {
  painter: PainterProfile | null;
  initializing: boolean;
  setPainter: (p: PainterProfile | null) => void;
  logout: () => Promise<void>;
}

const Ctx = createContext<PainterAuthValue | null>(null);

/** Wraps ONLY the painter routes, so staff pages never mount or depend on it. */
export function PainterAuthProvider({ children }: { children: ReactNode }) {
  const [painter, setPainter] = useState<PainterProfile | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    let cancelled = false;
    painterApi
      .restore()
      .then((p) => {
        if (!cancelled) setPainter(p);
      })
      .finally(() => {
        if (!cancelled) setInitializing(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const logout = useCallback(async () => {
    try {
      await painterApi.logout();
    } finally {
      setPainter(null);
    }
  }, []);

  const value = useMemo(() => ({ painter, initializing, setPainter, logout }), [painter, initializing, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function PainterLayout() {
  return (
    <PainterAuthProvider>
      <Outlet />
    </PainterAuthProvider>
  );
}

export function usePainterAuth(): PainterAuthValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePainterAuth must be used within PainterAuthProvider');
  return ctx;
}
