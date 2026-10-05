import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './routes/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import { ROLE_HOME } from './lib/constants';

// Route-level code splitting: each page ships as its own chunk and is only
// fetched when the user actually navigates there, instead of one big bundle
// with e.g. the Manufacturing page's QR/Excel libraries loaded up front for
// a customer who only ever visits /verify.
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const ManufacturingPage = lazy(() => import('./pages/manufacturing/ManufacturingPage'));
const WarehousePage = lazy(() => import('./pages/warehouse/WarehousePage'));
const DealerSalePage = lazy(() => import('./pages/crm/DealerSalePage'));
const VerifyPage = lazy(() => import('./pages/verify/VerifyPage'));
const DashboardPage = lazy(() => import('./pages/dashboard/DashboardPage'));
const AccessoriesPage = lazy(() => import('./pages/accessories/AccessoriesPage'));
const DealerPortalPage = lazy(() => import('./pages/portal/DealerPortalPage'));
const SalesTeamPage = lazy(() => import('./pages/sales/SalesTeamPage'));
const PainterDashboardPage = lazy(() => import('./pages/PainterDashboardPage'));

function RouteFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg">
      <div className="text-sm text-ink-soft">Loading…</div>
    </div>
  );
}

function RootRedirect() {
  const { user, initializing } = useAuth();
  if (initializing) return <RouteFallback />;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={ROLE_HOME[user.role] || '/login'} replace />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<RootRedirect />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />

              <Route
                path="/manufacturing"
                element={
                  <ProtectedRoute roles={['admin']}>
                    <ManufacturingPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/warehouse"
                element={
                  <ProtectedRoute roles={['admin', 'warehouse']}>
                    <WarehousePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dealer-sale"
                element={
                  <ProtectedRoute roles={['dealer']}>
                    <DealerSalePage />
                  </ProtectedRoute>
                }
              />
              {/* Public on purpose: this is what opens when a customer scans the QR
                  printed on the bucket. They won't have an account, so it must not
                  sit behind ProtectedRoute — logged-in roles can still reach it fine. */}
              <Route path="/verify" element={<VerifyPage />} />
              <Route path="/painter" element={<PainterDashboardPage />} />
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute roles={['admin']}>
                    <DashboardPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/accessories"
                element={
                  <ProtectedRoute roles={['admin']}>
                    <AccessoriesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dealer-portal"
                element={
                  <ProtectedRoute roles={['dealer']}>
                    <DealerPortalPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/sales-team"
                element={
                  <ProtectedRoute roles={['salesrep']}>
                    <SalesTeamPage />
                  </ProtectedRoute>
                }
              />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}
