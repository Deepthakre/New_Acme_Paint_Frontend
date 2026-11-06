import type { ReactElement } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { Role } from '../types';

interface ProtectedRouteProps {
  roles?: Role[];
  children: ReactElement;
}

/**
 * Wraps a page and enforces: (1) must be logged in, (2) if `roles` is given,
 * the user's role must be in that list. This is a UX guard only — the real
 * backend must re-check role on every request, since a client-side check
 * can always be bypassed by someone editing the bundle or hitting the API directly.
 */
export default function ProtectedRoute({ roles, children }: ProtectedRouteProps): ReactElement {
  const { user, initializing } = useAuth();

  if (initializing) return <div className="min-h-screen flex items-center justify-center text-sm text-ink-soft">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;

  return children;
}
