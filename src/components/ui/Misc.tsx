import type { MouseEvent, ReactNode } from 'react';
import { IconX } from './Icons';

interface PanelProps { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children?: ReactNode; }
export function Panel({ title, subtitle, actions, children }: PanelProps) {
  return (
    <section className="ui-panel">
      <div className="ui-panel-head">
        <div className="min-w-0">
          <h2 className="ui-panel-title">{title}</h2>
          {subtitle && <div className="ui-panel-subtitle">{subtitle}</div>}
        </div>
        {actions && <div className="ui-panel-actions">{actions}</div>}
      </div>
      <div className="ui-panel-body">{children}</div>
    </section>
  );
}

interface TableProps { columns: string[]; children?: ReactNode; emptyLabel?: string; isEmpty?: boolean; }
export function Table({ columns, children, emptyLabel = 'Nothing here yet.', isEmpty }: TableProps) {
  return (
    <div className="ui-table-wrap">
      <table className="ui-table">
        <thead><tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>
          {isEmpty ? <tr><td colSpan={columns.length} className="ui-table-empty">{emptyLabel}</td></tr> : children}
        </tbody>
      </table>
    </div>
  );
}

interface FlashProps { kind?: 'err' | 'ok'; children?: ReactNode; }
export function Flash({ kind, children }: FlashProps) {
  if (!children) return null;
  return (
    <div role={kind === 'err' ? 'alert' : 'status'} className={`ui-flash ${kind === 'err' ? 'is-error' : 'is-success'}`}>
      <span className="ui-flash-dot" aria-hidden="true">{kind === 'err' ? '!' : '✓'}</span>
      <span>{children}</span>
    </div>
  );
}

interface StatCardProps { n: ReactNode; label: ReactNode; icon?: ReactNode; }
export function StatCard({ n, label, icon }: StatCardProps) {
  return (
    <div className="stat-card">
      <div><div className="stat-number">{n}</div><div className="stat-label">{label}</div></div>
      {icon && <div className="stat-icon">{icon}</div>}
    </div>
  );
}

export function ProgressBar({ pct }: { pct: number }) {
  const clamped = Math.min(100, Math.max(0, pct));
  return <div className="progress-track"><div className={`progress-fill ${clamped >= 100 ? 'complete' : ''}`} style={{ width: `${clamped}%` }} /></div>;
}

interface ModalProps { title: ReactNode; onClose: () => void; children?: ReactNode; }
export function Modal({ title, onClose, children }: ModalProps) {
  return (
    <div className="ui-modal-backdrop no-print" onClick={onClose}>
      <div className="ui-modal" onClick={(e: MouseEvent<HTMLDivElement>) => e.stopPropagation()}>
        <div className="ui-modal-head"><h3>{title}</h3><button onClick={onClose} aria-label="Close"><IconX className="w-4 h-4" /></button></div>
        <div className="ui-modal-body">{children}</div>
      </div>
    </div>
  );
}
