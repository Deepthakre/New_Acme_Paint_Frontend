import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PageShell from '../../components/layout/PageShell';
import { Panel, Flash, StatCard } from '../../components/ui/Misc';
import { TextInput } from '../../components/ui/Field';
import Button, { LinkButton } from '../../components/ui/Button';
import StatusPill from '../../components/ui/StatusPill';
import PainterVerify from './PainterVerify';
import { rewardApi, getSession, clearSession, UPI_RE, type PainterSession } from '../../lib/rewardApi';
import { formatPaise, type MyClaim } from '../../types';

const LABEL: Record<string, string> = { QUEUED: 'Sending', PROCESSING: 'On its way', PAID: 'Received', FAILED: 'Failed' };
const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

/** The painter's own reward history (after an OTP). */
export default function MyRewardsPage() {
  const [session, setSession] = useState<PainterSession | null>(() => getSession());
  const [rows, setRows] = useState<MyClaim[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [fixing, setFixing] = useState<{ id: string; upi: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    setError('');
    try {
      const r = await rewardApi.claims(p);
      setRows((cur) => (p === 1 ? r.data : [...cur, ...r.data]));
      setTotal(r.totalPaidPaise);
      setMore(r.pagination.hasNextPage);
      setPage(p);
    } catch (err) {
      if ((err as { status?: number }).status === 401) setSession(null);
      setError(err instanceof Error ? err.message : 'Could not load your rewards.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session) void load(1);
  }, [session, load]);

  async function retry() {
    if (!fixing) return;
    setBusy(true);
    setError('');
    try {
      await rewardApi.retry(fixing.id, fixing.upi.trim().toLowerCase());
      setFixing(null);
      await load(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not retry.');
    } finally {
      setBusy(false);
    }
  }

  if (!session) {
    return (
      <PageShell>
        <PainterVerify intro="Verify your mobile number to see your rewards." onVerified={setSession} />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <Panel
        title="🎨 My rewards · मेरे इनाम"
        subtitle={<>Mobile <span className="mono">{session.mobile}</span> · <LinkButton type="button" onClick={() => { clearSession(); setSession(null); setRows([]); }}>Not you? Verify another number</LinkButton></>}
        actions={<Link to="/r"><Button variant="green">Claim a reward</Button></Link>}
      >
        <Flash kind="err">{error}</Flash>
        <div className="grid sm:grid-cols-2 gap-4 mb-5 max-w-lg">
          <StatCard n={formatPaise(total)} label="Total received" />
          <StatCard n={rows.length ? `${rows.length}${more ? '+' : ''}` : '0'} label="Rewards claimed" />
        </div>

        {rows.length === 0 && !loading && <p className="text-sm text-ink-soft">No rewards yet. Open a paint bucket and scan the QR sticker inside.</p>}
        <div className="grid gap-3">
          {rows.map((c) => (
            <div key={c.id} className="p-4 rounded-xl border border-line bg-white">
              <div className="flex justify-between gap-3 flex-wrap items-start">
                <div>
                  <div className="text-lg font-semibold">{formatPaise(c.amountPaise)} <span className="text-sm font-normal text-ink-soft">· {c.size} bucket</span></div>
                  <div className="text-xs text-ink-soft">{fmt(c.createdAt)} · <span className="mono">{c.upiId}</span></div>
                </div>
                <StatusPill status={c.status}>{LABEL[c.status] || c.status}</StatusPill>
              </div>
              {c.status === 'FAILED' && (
                <div className="mt-3 text-sm">
                  <div className="text-red">{c.failureReason || 'The payment could not be completed.'}</div>
                  {fixing?.id === c.id ? (
                    <div className="flex gap-2 mt-2 flex-wrap">
                      <TextInput className="flex-1 min-w-[200px]" value={fixing.upi} onChange={(e) => setFixing({ id: c.id, upi: e.target.value })} placeholder="name@upi" autoCapitalize="none" />
                      <Button variant="green" disabled={busy || !UPI_RE.test(fixing.upi.trim().toLowerCase())} onClick={retry}>{busy ? 'Sending…' : 'Send again'}</Button>
                      <LinkButton type="button" onClick={() => setFixing(null)}>Cancel</LinkButton>
                    </div>
                  ) : (
                    <div className="mt-1"><LinkButton type="button" onClick={() => setFixing({ id: c.id, upi: c.upiId })}>Fix UPI ID &amp; send again</LinkButton></div>
                  )}
                </div>
              )}
              {c.status === 'PAID' && c.utr && <div className="text-xs text-ink-soft mt-2">UTR: <span className="mono">{c.utr}</span></div>}
            </div>
          ))}
        </div>
        {more && <div className="mt-4"><Button variant="violet" disabled={loading} onClick={() => void load(page + 1)}>{loading ? 'Loading…' : 'Load more'}</Button></div>}
      </Panel>
    </PageShell>
  );
}
