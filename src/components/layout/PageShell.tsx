import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import TopBar from './TopBar';
import { TAB_META } from '../../lib/constants';

export default function PageShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const current = TAB_META.find((t) => location.pathname === t.path || location.pathname.startsWith(`${t.path}/`));

  const contextCopy: Record<string, string> = {
    Manufacturing: 'Production batches, product catalogue and QR operations',
    Warehouse: 'Dispatch, delivery tracking and stock movement',
    'Dealer Sale': 'Dealer receipts, customer sales and returns',
    'Customer Verify': 'Product authenticity and painter reward verification',
    Dashboard: 'Business overview, orders, stock and operational reporting',
    Accessories: 'Tools, brushes, rollers and accessory inventory',
    'Dealer Portal': 'Orders, purchase history, billing and vouchers',
    'Sales Team': 'Dealer order booking, targets and purchase history',
  };

  return (
    <div className="app-shell min-h-screen bg-bg">
      <TopBar />
      <main className="app-main min-h-screen">
        <div className="app-content max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-9 py-5 sm:py-7">
          <header className="workspace-context no-print">
            <div className="workspace-context-main">
              <div className="workspace-mark"><span>{current?.num || '00'}</span></div>
              <div>
                <div className="workspace-kicker">ACMEPAINT / OPERATIONS</div>
                <div className="workspace-heading-row">
                  <h1>{current?.label || 'Workspace'}</h1>
                  <span className="workspace-live"><i /> Live</span>
                </div>
                <p className="workspace-description">{contextCopy[current?.label || ''] || 'Manage your manufacturing operations from one workspace.'}</p>
              </div>
            </div>
            <div className="workspace-context-meta">
              <span className="workspace-meta-label">TODAY</span>
              <span>{new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date())}</span>
            </div>
          </header>
          {children}
        </div>
      </main>
    </div>
  );
}
