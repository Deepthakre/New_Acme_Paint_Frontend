import { memo, type ReactNode } from 'react';

const STYLES: Record<string, string> = {
  FACTORY: 'bg-blue/10 text-blue',
  TRANSIT: 'bg-ochre/10 text-ochre',
  DEALER: 'bg-green/10 text-green',
  SOLD: 'bg-red/10 text-red',
  RETURNED: 'bg-violet/10 text-violet',
  OK: 'bg-green/10 text-green',
  LOW: 'bg-ochre/10 text-ochre',
  OUT: 'bg-red/10 text-red',
  PENDING: 'bg-ochre/10 text-ochre',
  DISPATCHED: 'bg-green/10 text-green',
  REJECTED: 'bg-red/10 text-red',
};

interface StatusPillProps {
  status: string;
  children?: ReactNode;
}

function StatusPill({ status, children }: StatusPillProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap ${
        STYLES[status] || 'bg-line/60 text-ink-soft'
      }`}
    >
      <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      {children || status}
    </span>
  );
}

// Purely presentational and re-rendered inside large table bodies — memoize
// so an unrelated state change in the parent (e.g. a filter input) doesn't
// re-render every pill row that didn't actually change.
export default memo(StatusPill);
