import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Panel, Table, Flash, StatCard } from '../../components/ui/Misc';
import { Field, TextInput, Select } from '../../components/ui/Field';
import Button, { LinkButton } from '../../components/ui/Button';
import StatusPill from '../../components/ui/StatusPill';
import * as api from '../../lib/apiClient';
import { barcodesCsv, downloadText, isLocalUrl, printRewardStickers, publicBaseUrl, STICKER_CSS, stickerMarkup } from '../../lib/printRewardStickers';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { SIZE_OPTIONS } from '../../lib/constants';
import { formatPaise, type BarcodeRun, type GenerateBarcodesResult, type PainterAdminRow, type RewardClaimRow, type RewardRate, type RewardStats } from '../../types';

type Tab = 'claims' | 'rates' | 'generate' | 'stickers' | 'painters';
const TABS: [Tab, string][] = [['claims', 'Claims & payouts'], ['rates', 'Reward rates'], ['generate', 'Generate & print'], ['stickers', 'Printed stickers'], ['painters', 'Painters']];
const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');

export default function RewardsAdminPanel() {
  const [tab, setTab] = useState<Tab>('claims');
  const [stats, setStats] = useState<RewardStats | null>(null);
  const [error, setError] = useState('');

  const loadStats = useCallback(() => { api.getRewardStats().then(setStats).catch((e) => setError(errMsg(e))); }, []);
  useEffect(() => { loadStats(); const t = setInterval(loadStats, 30000); return () => clearInterval(t); }, [loadStats]);

  return (
    <Panel title="🎨 Painter Rewards — sticker barcode → automatic UPI payment" subtitle="Print the reward sticker (50×50 mm), put it inside the bucket. When the painter scans it and enters name, mobile OTP, city and UPI ID, the reward amount for that bucket size is paid to the UPI ID automatically.">
      <Flash kind="err">{error}</Flash>
      {stats?.provider === 'mock' && <Flash kind="err">Payment mode is MOCK (testing). No real money is sent. Set PAYOUT_PROVIDER=razorpay on the server for live payments.</Flash>}
      {stats && stats.needsReview > 0 && <Flash kind="err">{stats.needsReview} payment(s) could not reach the payment gateway after many tries — open “Claims &amp; payouts” and press Retry.</Flash>}
      {stats && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          <StatCard n={`${stats.claimsToday} · ${formatPaise(stats.claimedTodayPaise)}`} label="Claimed today" />
          <StatCard n={`${stats.paid.count} · ${formatPaise(stats.paid.totalPaise)}`} label="Paid to painters" />
          <StatCard n={`${stats.inProgress.count} · ${formatPaise(stats.inProgress.totalPaise)}`} label="Payment in progress" />
          <StatCard n={`${stats.failed.count} · ${formatPaise(stats.failed.totalPaise)}`} label="Failed (painter must fix UPI)" />
          <StatCard n={stats.stickers.ACTIVE} label="Stickers waiting in buckets" />
          <StatCard n={stats.stickers.CLAIMED} label="Stickers claimed" />
          <StatCard n={stats.stickers.VOID} label="Stickers cancelled" />
          <StatCard n={stats.painters} label="Painters" />
        </div>
      )}
      <div className="flex flex-wrap gap-2 mb-4">
        {TABS.map(([k, label]) => <Button key={k} variant={tab === k ? 'blue' : 'violet'} onClick={() => setTab(k)}>{label}</Button>)}
      </div>
      {tab === 'claims' && <ClaimsTab onChange={loadStats} />}
      {tab === 'rates' && <RatesTab />}
      {tab === 'generate' && <GenerateTab onChange={loadStats} />}
      {tab === 'stickers' && <StickersTab onChange={loadStats} />}
      {tab === 'painters' && <PaintersTab />}
    </Panel>
  );
}

// ------------------------------------------------------------------ pager
function Pager({ page, hasNext, onPage }: { page: number; hasNext: boolean; onPage: (p: number) => void }) {
  return (
    <div className="flex gap-3 items-center mt-3 text-sm">
      <Button variant="violet" disabled={page <= 1} onClick={() => onPage(page - 1)}>← Prev</Button>
      <span className="text-ink-soft">Page {page}</span>
      <Button variant="violet" disabled={!hasNext} onClick={() => onPage(page + 1)}>Next →</Button>
    </div>
  );
}

// ------------------------------------------------------------------ claims & payouts
function ClaimsTab({ onChange }: { onChange: () => void }) {
  const [rows, setRows] = useState<RewardClaimRow[]>([]);
  const [status, setStatus] = useState('ALL');
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search, 300);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  const load = useCallback(() => {
    api.paged.rewardClaims({ page, limit: 20, status, search: q.trim() || undefined })
      .then((r) => { setRows(r.data); setHasNext(r.pagination.hasNextPage); })
      .catch((e) => setError(errMsg(e)));
  }, [page, status, q]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [status, q]);

  async function act(id: string, fn: (id: string) => Promise<unknown>) {
    setBusyId(id); setError('');
    try { await fn(id); load(); onChange(); } catch (e) { setError(errMsg(e)); } finally { setBusyId(''); }
  }

  return (
    <>
      <Flash kind="err">{error}</Flash>
      <p className="text-sm text-ink-soft mb-3">Payments are sent automatically. You only need to act on <b>Failed</b> (wrong UPI ID — the painter can fix it, or press Retry) and on payments stuck in progress for a long time (<b>Check status</b>).</p>
      <div className="flex gap-3 flex-wrap mb-3 items-end">
        <Field label="Status" className="w-48"><Select value={status} onChange={(e) => setStatus(e.target.value)}><option value="ALL">All</option><option value="QUEUED">Sending</option><option value="PROCESSING">Processing</option><option value="PAID">Paid</option><option value="FAILED">Failed</option></Select></Field>
        <Field label="Search name / mobile / UPI / claim / sticker" className="min-w-[260px] flex-1 max-w-md"><TextInput value={search} onChange={(e) => setSearch(e.target.value)} /></Field>
        <Button variant="violet" onClick={load}>Refresh</Button>
      </div>
      <Table columns={['Claim', 'Painter', 'UPI ID', 'Bucket', 'Reward', 'Status', 'When', '']} isEmpty={rows.length === 0} emptyLabel="No claims yet.">
        {rows.map((c) => (
          <tr key={c.id} className="border-b border-line align-top">
            <td className="py-2 px-2.5"><div className="mono text-xs">{c.id}</div><div className="mono text-[11px] text-ink-soft">{c.barcodeSerial}</div></td>
            <td className="py-2 px-2.5"><div className="font-semibold">{c.painterName}</div><div className="mono text-[11px] text-ink-soft">{c.mobile} · {c.city}</div></td>
            <td className="py-2 px-2.5 mono">{c.upiId}</td>
            <td className="py-2 px-2.5">{c.size}</td>
            <td className="py-2 px-2.5 font-semibold">{formatPaise(c.amountPaise)}</td>
            <td className="py-2 px-2.5">
              <StatusPill status={c.status} />
              {c.status === 'FAILED' && c.failureReason && <div className="text-[11px] text-red max-w-[220px]">{c.failureReason}</div>}
              {c.status === 'PAID' && c.utr && <div className="mono text-[11px] text-ink-soft">UTR {c.utr}</div>}
              {c.needsReview && <div className="text-[11px] text-red">Gateway unreachable — retry</div>}
            </td>
            <td className="py-2 px-2.5 text-xs">{fmt(c.createdAt)}</td>
            <td className="py-2 px-2.5 whitespace-nowrap">
              {(c.status === 'FAILED' || (c.status === 'QUEUED' && c.needsReview)) && <LinkButton type="button" disabled={busyId === c.id} onClick={() => act(c.id, api.retryRewardClaim)}>Retry</LinkButton>}
              {c.status === 'PROCESSING' && <LinkButton type="button" disabled={busyId === c.id} onClick={() => act(c.id, api.checkRewardClaim)}>Check status</LinkButton>}
            </td>
          </tr>
        ))}
      </Table>
      <Pager page={page} hasNext={hasNext} onPage={setPage} />
    </>
  );
}

// ------------------------------------------------------------------ rates
function RatesTab() {
  const [rates, setRates] = useState<RewardRate[]>([]);
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [size, setSize] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const load = useCallback(() => { api.listRewardRates().then(setRates).catch((e) => setError(errMsg(e))); }, []);
  useEffect(() => { load(); }, [load]);

  async function save(sz: string, rupees: string, active = true) {
    setError(''); setOk('');
    try { await api.setRewardRate({ size: sz, amountRupees: Number(rupees), active }); setOk(`Saved ${sz}.`); setEdit((e) => { const n = { ...e }; delete n[sz]; return n; }); load(); } catch (e) { setError(errMsg(e)); }
  }
  async function add(e: FormEvent) {
    e.preventDefault();
    await save(size.trim(), amount);
    setSize(''); setAmount('');
  }
  const known = new Set(rates.map((r) => r.size));
  const suggestions = SIZE_OPTIONS.filter((s) => !known.has(s.toUpperCase()));

  return (
    <>
      <Flash kind="err">{error}</Flash>
      <Flash kind="ok">{ok}</Flash>
      <p className="text-sm text-ink-soft mb-3">How much a painter earns for ONE bucket of each size. The rate is read at the moment the painter claims, so a change applies to stickers not yet claimed.</p>
      <Table columns={['Bucket size', 'Reward (₹)', 'Active', '']} isEmpty={rates.length === 0} emptyLabel="No rates yet. Add one below — stickers can only be made for sizes that have a rate.">
        {rates.map((r) => {
          const val = edit[r.size] ?? String(r.amountPaise / 100);
          return (
            <tr key={r.size} className="border-b border-line">
              <td className="py-2 px-2.5 font-semibold">{r.size}</td>
              <td className="py-2 px-2.5 w-40"><TextInput inputMode="decimal" value={val} onChange={(e) => setEdit({ ...edit, [r.size]: e.target.value.replace(/[^\d.]/g, '') })} /></td>
              <td className="py-2 px-2.5"><StatusPill status={r.active ? 'ACTIVE' : 'PAUSED'} /></td>
              <td className="py-2 px-2.5 whitespace-nowrap">
                <LinkButton type="button" disabled={!Number(val)} onClick={() => save(r.size, val, r.active)}>Save</LinkButton> · <LinkButton type="button" onClick={() => save(r.size, String(r.amountPaise / 100), !r.active)}>{r.active ? 'Pause' : 'Activate'}</LinkButton>
              </td>
            </tr>
          );
        })}
      </Table>
      <form onSubmit={add} className="flex flex-wrap gap-3 items-end mt-5">
        <Field label="Bucket size (e.g. 20L)" className="w-44"><TextInput value={size} onChange={(e) => setSize(e.target.value)} required /></Field>
        <Field label="Reward (₹)" className="w-40"><TextInput inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} required /></Field>
        <Button type="submit" variant="green" disabled={!size.trim() || !Number(amount)}>Add / update rate</Button>
        {suggestions.length > 0 && <div className="text-xs text-ink-soft">Quick add: {suggestions.map((s) => <LinkButton key={s} type="button" onClick={() => setSize(s)}>{s}</LinkButton>).reduce<React.ReactNode[]>((a, el, i) => (i ? [...a, ' · ', el] : [el]), [])}</div>}
      </form>
    </>
  );
}

// ------------------------------------------------------------------ generate + print
function GenerateTab({ onChange }: { onChange: () => void }) {
  const [rates, setRates] = useState<RewardRate[]>([]);
  const [size, setSize] = useState('');
  const [count, setCount] = useState('100');
  const [label, setLabel] = useState('');
  const [fresh, setFresh] = useState<GenerateBarcodesResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { api.listRewardRates().then((r) => { const a = r.filter((x) => x.active); setRates(a); setSize((s) => s || a[0]?.size || ''); }).catch((e) => setError(errMsg(e))); }, []);

  async function generate() {
    setBusy(true); setError('');
    try { setFresh(await api.generateBarcodes({ size, count: Number(count), label: label.trim() })); onChange(); } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  }
  const rate = rates.find((r) => r.size === size);

  return (
    <>
      <Flash kind="err">{error}</Flash>
      {isLocalUrl() && <Flash kind="err">Stickers will point to {publicBaseUrl()} — that only works on this computer! Set VITE_PUBLIC_URL to your real website address before printing.</Flash>}
      <p className="text-sm text-ink-soft mb-3">Each sticker carries a unique secret QR (works once). The code is shown <b>only once</b> — print immediately. Sticker URL: <span className="mono">{publicBaseUrl()}/r/…</span></p>
      {rates.length === 0 ? (
        <p className="text-sm">First add a reward rate in the <b>Reward rates</b> tab.</p>
      ) : (
        <div className="flex flex-wrap gap-4 items-end mb-4">
          <Field label="Bucket size" className="w-40"><Select value={size} onChange={(e) => setSize(e.target.value)}>{rates.map((r) => <option key={r.size} value={r.size}>{r.size} — {formatPaise(r.amountPaise)}</option>)}</Select></Field>
          <Field label="How many stickers? (max 1000)" className="w-52"><TextInput inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, ''))} /></Field>
          <Field label="Run name (optional)" className="min-w-[220px]"><TextInput placeholder="e.g. Nov-2026 run 1" value={label} onChange={(e) => setLabel(e.target.value)} /></Field>
          <Button variant="green" disabled={busy || !size || !Number(count) || Number(count) > 1000} onClick={generate}>{busy ? 'Generating…' : 'Generate stickers'}</Button>
        </div>
      )}
      {rate && <p className="text-xs text-ink-soft mb-3">Painters will receive {formatPaise(rate.amountPaise)} for each {size} sticker.</p>}
      {fresh && (
        <div className="p-4 rounded-lg border border-green bg-white">
          <div className="font-semibold text-green">{fresh.generated} stickers ready — {fresh.size} · {formatPaise(fresh.amountPaise)} each ({fresh.label})</div>
          <div className="text-xs text-ink-soft mb-3">Serials {fresh.codes[0].serial} → {fresh.codes[fresh.codes.length - 1].serial}. These codes will not be shown again after you leave this page.</div>
          <div className="flex gap-6 flex-wrap items-start">
            <div>
              <style>{STICKER_CSS}</style>
              <div className="border border-dashed border-line inline-block" dangerouslySetInnerHTML={{ __html: stickerMarkup(fresh.codes[0]) }} />
              <div className="text-[11px] text-ink-soft mt-1">Preview (actual size 50 × 50 mm)</div>
            </div>
            <div className="grid gap-3 max-w-sm">
              <Button variant="blue" onClick={() => printRewardStickers(fresh.codes)}>Print {fresh.generated} stickers (50×50 mm)</Button>
              <Button variant="violet" onClick={() => downloadText(`reward-stickers-${fresh.label}.csv`, barcodesCsv(fresh.codes))}>Download CSV (for print vendor)</Button>
              <p className="text-xs text-ink-soft">In the print window choose paper size <b>50 × 50 mm</b>, margins <b>None</b>, scale <b>100%</b>. One sticker prints per page. Test-print and scan one with a phone before printing the whole run.</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ------------------------------------------------------------------ printed stickers + cancel
function StickersTab({ onChange }: { onChange: () => void }) {
  const [runs, setRuns] = useState<BarcodeRun[]>([]);
  const [serial, setSerial] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const load = useCallback(() => { api.getBarcodeRuns().then(setRuns).catch((e) => setError(errMsg(e))); }, []);
  useEffect(() => { load(); }, [load]);

  async function cancel(e: FormEvent) {
    e.preventDefault(); setError(''); setOk('');
    try { await api.voidBarcode(serial.trim().toUpperCase(), reason.trim()); setOk(`${serial.toUpperCase()} cancelled.`); setSerial(''); setReason(''); load(); onChange(); } catch (err) { setError(errMsg(err)); }
  }
  return (
    <>
      <Flash kind="err">{error}</Flash>
      <Flash kind="ok">{ok}</Flash>
      <Table columns={['Run', 'Size', 'Serials', 'Printed', 'Waiting', 'Claimed', 'Cancelled', 'Created']} isEmpty={runs.length === 0} emptyLabel="No stickers printed yet.">
        {runs.map((r) => (
          <tr key={`${r.batchLabel}|${r.size}`} className="border-b border-line">
            <td className="py-2 px-2.5 font-semibold">{r.batchLabel || '—'}</td>
            <td className="py-2 px-2.5">{r.size}</td>
            <td className="py-2 px-2.5 mono text-xs">{r.firstSerial} → {r.lastSerial}</td>
            <td className="py-2 px-2.5">{r.total}</td>
            <td className="py-2 px-2.5">{r.ACTIVE}</td>
            <td className="py-2 px-2.5">{r.CLAIMED}</td>
            <td className="py-2 px-2.5">{r.VOID}</td>
            <td className="py-2 px-2.5 text-xs">{fmt(r.createdAt)}</td>
          </tr>
        ))}
      </Table>
      <form onSubmit={cancel} className="flex flex-wrap gap-3 items-end mt-5">
        <Field label="Cancel an unused sticker — serial" className="w-52"><TextInput placeholder="RB-000123" value={serial} onChange={(e) => setSerial(e.target.value)} required /></Field>
        <Field label="Reason" className="min-w-[240px]"><TextInput placeholder="lost / damaged / wrong sheet" value={reason} onChange={(e) => setReason(e.target.value)} required /></Field>
        <Button type="submit" variant="ochre" disabled={!serial.trim() || reason.trim().length < 3}>Cancel sticker</Button>
      </form>
    </>
  );
}

// ------------------------------------------------------------------ painters
function PaintersTab() {
  const [rows, setRows] = useState<PainterAdminRow[]>([]);
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search, 300);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    api.paged.rewardPainters({ page, limit: 20, search: q.trim() || undefined }).then((r) => { setRows(r.data); setHasNext(r.pagination.hasNextPage); }).catch((e) => setError(errMsg(e)));
  }, [page, q]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [q]);

  async function setStatus(p: PainterAdminRow, status: 'ACTIVE' | 'BLOCKED') {
    try { await api.setPainterStatus(p.id, status); load(); } catch (err) { setError(errMsg(err)); }
  }
  return (
    <>
      <Flash kind="err">{error}</Flash>
      <Field label="Search ID / name / mobile / city / UPI" className="max-w-md mb-3"><TextInput value={search} onChange={(e) => setSearch(e.target.value)} /></Field>
      <Table columns={['Painter', 'Mobile', 'UPI ID', 'Claims', 'Paid', 'Last claim', 'Status', '']} isEmpty={rows.length === 0} emptyLabel="No painters yet.">
        {rows.map((p) => (
          <tr key={p.id} className="border-b border-line">
            <td className="py-2 px-2.5"><div className="font-semibold">{p.name}</div><div className="mono text-[11px] text-ink-soft">{p.id} · {p.city}</div></td>
            <td className="py-2 px-2.5 mono">{p.mobile}</td>
            <td className="py-2 px-2.5 mono">{p.upiId || '—'}</td>
            <td className="py-2 px-2.5">{p.claims}</td>
            <td className="py-2 px-2.5">{formatPaise(p.paidPaise)}</td>
            <td className="py-2 px-2.5 text-xs">{fmt(p.lastClaimAt)}</td>
            <td className="py-2 px-2.5"><StatusPill status={p.status} /></td>
            <td className="py-2 px-2.5 whitespace-nowrap">
              {p.status === 'BLOCKED' ? <LinkButton type="button" onClick={() => setStatus(p, 'ACTIVE')}>Unblock</LinkButton> : <LinkButton type="button" onClick={() => window.confirm(`Block ${p.name}? They will not be able to claim any more rewards.`) && setStatus(p, 'BLOCKED')}>Block</LinkButton>}
            </td>
          </tr>
        ))}
      </Table>
      <Pager page={page} hasNext={hasNext} onPage={setPage} />
    </>
  );
}
