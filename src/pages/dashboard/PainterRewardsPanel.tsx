import { useCallback, useEffect, useRef, useState } from 'react';
import { Panel, Table, Flash } from '../../components/ui/Misc';
import { Field, TextInput } from '../../components/ui/Field';
import { LinkButton } from '../../components/ui/Button';
import * as api from '../../lib/apiClient';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import type { RewardPainterRow } from '../../types';

const PAGE_SIZE = 10;

function fmtDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function PainterRewardsPanel() {
  const [rows, setRows] = useState<RewardPainterRow[]>([]);
  const [total, setTotal] = useState(0); // painters matching the current search (from server)
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false); // first page / search change
  const [loadingMore, setLoadingMore] = useState(false); // "Show more" click
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);

  // Only the latest request may update state (covers StrictMode's double
  // effect in dev and a slow older response landing after a newer one).
  const reqIdRef = useRef(0);

  const fetchPage = useCallback(
    async (pageNo: number, replace: boolean) => {
      const reqId = ++reqIdRef.current;
      if (replace) setLoading(true);
      else setLoadingMore(true);
      setError('');
      try {
        const { data, pagination } = await api.paged.rewardPainters({
          page: pageNo,
          limit: PAGE_SIZE,
          search: debouncedSearch.trim() || undefined,
        });
        if (reqId !== reqIdRef.current) return; // stale response — ignore
        setRows((prev) => {
          if (replace) return data;
          const seen = new Set(prev.map((p) => p.id));
          return [...prev, ...data.filter((p) => !seen.has(p.id))];
        });
        setPage(pagination.page);
        setTotal(pagination.totalItems);
        setHasMore(pagination.hasNextPage);
      } catch (err) {
        if (reqId !== reqIdRef.current) return;
        setError(err instanceof Error ? err.message : 'Could not load painter rewards.');
      } finally {
        if (reqId === reqIdRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [debouncedSearch]
  );

  // Page 1 loads on mount and again (from the top) whenever the search changes.
  useEffect(() => {
    fetchPage(1, true);
  }, [fetchPage]);

  return (
    <Panel
      title="🎨 Painter Rewards — ₹50 Claims"
      subtitle={`Painters who have claimed the bucket reward — ${total} painter${total === 1 ? '' : 's'}${
        debouncedSearch.trim() ? ' matching your search' : ''
      }, most earned first. Every individual claim (bucket QR + time) is in the Reward Claims sheet of the Full Admin Report above.`}
    >
      <br />
      <Flash kind="err">{error}</Flash>
      <div className="flex flex-wrap gap-3 mb-4 items-end">
        <Field label="Search Painter ID / Name / Mobile / City / UPI" className="flex-1 min-w-[220px]">
          <TextInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="PT-2026-000001, Ramesh, 98xxxxxxxx, Nagpur…" />
        </Field>
      </div>

      <Table
        columns={['Painter', 'Mobile', 'City', 'UPI ID', 'Claims', 'Earned', 'Withdrawn', 'Wallet', 'Last Claim']}
        isEmpty={rows.length === 0}
        emptyLabel={loading ? 'Loading…' : 'No painter has claimed a reward yet.'}
      >
        {rows.map((p) => (
          <tr key={p.id} className="border-b border-line">
            <td className="py-2 px-2.5">
              <div className="font-semibold">{p.name}</div>
              <div className="mono text-[11px] text-ink-soft">{p.id}</div>
            </td>
            <td className="py-2 px-2.5 mono">{p.mobile}</td>
            <td className="py-2 px-2.5">{p.city}</td>
            <td className="py-2 px-2.5 mono">{p.upiId}</td>
            <td className="py-2 px-2.5 font-semibold">{p.claims}</td>
            <td className="py-2 px-2.5">₹{p.totalEarned}</td>
            <td className="py-2 px-2.5">₹{p.totalWithdrawn}</td>
            <td className="py-2 px-2.5">₹{p.walletBalance}</td>
            <td className="py-2 px-2.5">{fmtDateTime(p.lastClaimedAt)}</td>
          </tr>
        ))}
      </Table>

      {hasMore && (
        <div className="flex justify-center mt-4">
          <LinkButton type="button" onClick={() => fetchPage(page + 1, false)} disabled={loadingMore || loading}>
            {loadingMore ? 'Loading…' : `Show more (${Math.min(PAGE_SIZE, Math.max(total - rows.length, 0))} more)`}
          </LinkButton>
        </div>
      )}
    </Panel>
  );
}