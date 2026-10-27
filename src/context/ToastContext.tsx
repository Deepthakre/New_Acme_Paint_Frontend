import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

type ToastKind = 'success' | 'error';

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  /** Green toast — something worked. */
  success: (message: string) => void;
  /** Red toast — something needs the person's attention. */
  error: (message: string) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const MAX_VISIBLE = 3;
const DURATION_MS: Record<ToastKind, number> = { success: 3500, error: 6000 };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      if (!message) return;
      const id = nextId.current++;
      // The same message twice in a row replaces the old toast instead of stacking.
      setToasts((prev) => [...prev.filter((t) => !(t.kind === kind && t.message === message)), { id, kind, message }].slice(-MAX_VISIBLE));
      timers.current.set(
        id,
        window.setTimeout(() => dismiss(id), DURATION_MS[kind])
      );
    },
    [dismiss]
  );

  // Clear any pending timers if the provider ever unmounts.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((t) => window.clearTimeout(t));
      pending.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (m) => push('success', m),
      error: (m) => push('error', m),
      dismiss,
    }),
    [push, dismiss]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* Bottom-centre stack. The wrapper ignores clicks so it never blocks the page; each toast re-enables them. */}
      <div className="fixed inset-x-0 bottom-6 z-[100] flex flex-col items-center gap-2 px-4 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className={`toast-in pointer-events-auto flex items-start gap-3 w-full max-w-[460px] rounded-2xl px-4 py-3 shadow-lg text-white text-[14px] font-semibold ${
              t.kind === 'success' ? 'bg-green' : 'bg-red'
            }`}
          >
            <span aria-hidden="true" className="shrink-0 mt-px text-[16px] leading-[20px]">
              {t.kind === 'success' ? '✓' : '✕'}
            </span>
            <span className="flex-1 whitespace-pre-line leading-[20px]">{t.message}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
              className="shrink-0 text-[20px] leading-[20px] opacity-80 hover:opacity-100"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}