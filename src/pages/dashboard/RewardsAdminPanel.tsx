import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Panel, Table, Flash, StatCard } from '../../components/ui/Misc';
import { Field, TextInput, Select } from '../../components/ui/Field';
import Button, { LinkButton } from '../../components/ui/Button';
import StatusPill from '../../components/ui/StatusPill';
import * as api from '../../lib/apiClient';
import { downloadText, printRewardStickers, rewardCodesCsv } from '../../lib/printRewardCodes';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import {
  formatPaise,
  type Campaign,
  type FraudAction,
  type FraudFlag,
  type GenerateCodesResult,
  type PainterAdminRow,
  type PayoutAdminRow,
  type ReconcileReport,
  type AdminNotificationItem,
  type RewardStats,
} from '../../types';

type Tab = 'alerts' | 'campaigns' | 'flags' | 'payouts' | 'codes' | 'painters' | 'health';
const TABS: [Tab, string][] = [['alerts', 'Alerts'], ['campaigns', 'Campaigns'], ['flags', 'Fraud / holds'], ['payouts', 'Payouts'], ['codes', 'Print QR codes'], ['painters', 'Painters'], ['health', 'Reconcile']];
const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');

export default function RewardsAdminPanel() {
  const [tab, setTab] = useState<Tab>('alerts');
  const [unread, setUnread] = useState(0);
  const [stats, setStats] = useState<RewardStats | null>(null);
  const [error, setError] = useState('');

  const loadStats = useCallback(() => { api.getRewardStats().then(setStats).catch((e) => setError(errMsg(e))); }, []);
  useEffect(() => { loadStats(); }, [loadStats]);

  return (
    <Panel title="🎨 Painter Rewards — inner QR cashback" subtitle="Campaigns, held claims, UPI payouts and sticker printing. Amounts are paid only after the dealer has recorded the sale.">
      <Flash kind="err">{error}</Flash>
      {stats && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          <StatCard n={stats.scansToday} label="Claims today" />
          <StatCard n={formatPaise(stats.rewardsCreditedPaise)} label="Rewards credited" />
          <StatCard n={formatPaise(stats.walletLiabilityPaise)} label="Owed in wallets" />
          <StatCard n={`${stats.payouts.pending.count} · ${formatPaise(stats.payouts.pending.totalPaise)}`} label="Payouts pending" />
          <StatCard n={stats.openFlags} label="Open fraud flags" />
          <StatCard n={stats.painters} label="Painters" />
          <StatCard n={`${stats.codes.REDEEMED} / ${stats.codes.ACTIVE + stats.codes.REDEEMED + stats.codes.HELD}`} label="Codes redeemed / live" />
          <StatCard n={`${formatPaise(stats.activeCampaignSpentPaise)} / ${formatPaise(stats.activeCampaignBudgetPaise)}`} label="Active budget used" />
        </div>
      )}
      <div className="flex flex-wrap gap-2 mb-4">
        {TABS.map(([k, label]) => (
          <Button key={k} variant={tab === k ? 'blue' : 'violet'} onClick={() => setTab(k)}>{label}{k === 'flags' && stats?.openFlags ? ` (${stats.openFlags})` : ''}{k === 'alerts' && unread ? ` (${unread})` : ''}</Button>
        ))}
      </div>
      {tab === 'alerts' && <AlertsTab onUnread={setUnread} onChange={loadStats} />}
      {tab === 'campaigns' && <CampaignsTab onChange={loadStats} />}
      {tab === 'flags' && <FlagsTab onChange={loadStats} />}
      {tab === 'payouts' && <PayoutsTab onChange={loadStats} />}
      {tab === 'codes' && <CodesTab />}
      {tab === 'painters' && <PaintersTab onChange={loadStats} />}
      {tab === 'health' && <HealthTab />}
    </Panel>
  );
}

// ------------------------------------------------------------------ campaigns
function CampaignsTab({ onChange }: { onChange: () => void }) {
  const [rows, setRows] = useState<Campaign[]>([]);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [startsAt, setStartsAt] = useState(new Date().toISOString().slice(0, 10));
  const [endsAt, setEndsAt] = useState('');
  const [budget, setBudget] = useState('');
  const [rules, setRules] = useState([{ product: '', size: '20L', amount: '50' }, { product: '', size: '4L', amount: '15' }]);

  const load = useCallback(() => { api.paged.campaigns({ limit: 50 }).then((r) => setRows(r.data)).catch((e) => setError(errMsg(e))); }, []);
  useEffect(() => { load(); }, [load]);

  async function create(e: FormEvent) {
    e.preventDefault(); setError('');
    try {
      await api.createCampaign({
        name, startsAt, endsAt: endsAt || null, budgetRupees: Number(budget),
        rules: rules.filter((r) => r.amount).map((r) => ({ product: r.product.trim(), size: r.size.trim(), amountRupees: Number(r.amount) })),
      });
      setName(''); setBudget(''); load(); onChange();
    } catch (err) { setError(errMsg(err)); }
  }
  async function act(c: Campaign, status: 'ACTIVE' | 'PAUSED' | 'ENDED') {
    setError('');
    try { await api.updateCampaign(c.id, { status }); load(); onChange(); } catch (err) { setError(errMsg(err)); }
  }
  async function topUp(c: Campaign) {
    const v = window.prompt('Add budget (₹)');
    if (!v || Number(v) <= 0) return;
    try { await api.updateCampaign(c.id, { addBudgetRupees: Number(v) }); load(); onChange(); } catch (err) { setError(errMsg(err)); }
  }

  return (
    <>
      <Flash kind="err">{error}</Flash>
      <form onSubmit={create} className="grid md:grid-cols-4 gap-3 items-end mb-5">
        <Field label="Campaign name" className="md:col-span-2"><TextInput value={name} onChange={(e) => setName(e.target.value)} required /></Field>
        <Field label="Total budget (₹)"><TextInput inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value.replace(/[^\d.]/g, ''))} required /></Field>
        <div />
        <Field label="Starts"><TextInput type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required /></Field>
        <Field label="Ends (optional)"><TextInput type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} /></Field>
        <div className="md:col-span-4 text-xs font-semibold uppercase text-ink-soft">Reward per bucket (leave product empty = any product)</div>
        {rules.map((r, i) => (
          <div key={i} className="md:col-span-4 grid grid-cols-3 gap-3">
            <TextInput placeholder="Product (optional)" value={r.product} onChange={(e) => setRules(rules.map((x, j) => (j === i ? { ...x, product: e.target.value } : x)))} />
            <TextInput placeholder="Size e.g. 20L" value={r.size} onChange={(e) => setRules(rules.map((x, j) => (j === i ? { ...x, size: e.target.value } : x)))} />
            <TextInput placeholder="₹ reward" inputMode="decimal" value={r.amount} onChange={(e) => setRules(rules.map((x, j) => (j === i ? { ...x, amount: e.target.value.replace(/[^\d.]/g, '') } : x)))} />
          </div>
        ))}
        <div className="md:col-span-4 flex gap-3">
          <LinkButton type="button" onClick={() => setRules([...rules, { product: '', size: '', amount: '' }])}>+ Add rule</LinkButton>
          <Button type="submit" variant="green" disabled={!name || !budget}>Create campaign</Button>
        </div>
      </form>
      <Table columns={['Campaign', 'Status', 'Budget used', 'Rules', 'Period', '']} isEmpty={rows.length === 0} emptyLabel="No campaigns yet. Without an ACTIVE campaign no reward is paid.">
        {rows.map((c) => (
          <tr key={c.id} className="border-b border-line">
            <td className="py-2 px-2.5"><div className="font-semibold">{c.name}</div><div className="mono text-[11px] text-ink-soft">{c.id}</div></td>
            <td className="py-2 px-2.5"><StatusPill status={c.status} /></td>
            <td className="py-2 px-2.5">{formatPaise(c.spentPaise)} / {formatPaise(c.budgetPaise)}</td>
            <td className="py-2 px-2.5 text-xs">{c.rules.map((r) => `${r.product || 'Any'} ${r.size || ''}: ${formatPaise(r.amountPaise)}`).join(' · ')}</td>
            <td className="py-2 px-2.5 text-xs">{fmt(c.startsAt)} → {c.endsAt ? fmt(c.endsAt) : 'open'}</td>
            <td className="py-2 px-2.5 whitespace-nowrap">
              {c.status === 'ACTIVE' && <LinkButton type="button" onClick={() => act(c, 'PAUSED')}>Pause</LinkButton>}
              {c.status === 'PAUSED' && <LinkButton type="button" onClick={() => act(c, 'ACTIVE')}>Resume</LinkButton>}
              {c.status !== 'ENDED' && <> · <LinkButton type="button" onClick={() => topUp(c)}>Add budget</LinkButton> · <LinkButton type="button" onClick={() => act(c, 'ENDED')}>End</LinkButton></>}
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}

// ------------------------------------------------------------------ fraud flags
function FlagsTab({ onChange }: { onChange: () => void }) {
  const [rows, setRows] = useState<FraudFlag[]>([]);
  const [status, setStatus] = useState('OPEN');
  const [error, setError] = useState('');
  const load = useCallback(() => { api.paged.fraudFlags({ limit: 50, status }).then((r) => setRows(r.data)).catch((e) => setError(errMsg(e))); }, [status]);
  useEffect(() => { load(); }, [load]);

  async function resolve(f: FraudFlag, action: FraudAction) {
    const note = action === 'dismiss' ? undefined : window.prompt('Note (optional)') || undefined;
    if (action === 'block_painter' && !window.confirm('Block this painter and void any held reward?')) return;
    setError('');
    try { await api.resolveFraudFlag(f.id, action, note); load(); onChange(); } catch (err) { setError(errMsg(err)); }
  }
  return (
    <>
      <Flash kind="err">{error}</Flash>
      <div className="mb-3 max-w-[200px]"><Select value={status} onChange={(e) => setStatus(e.target.value)}><option value="OPEN">Open</option><option value="ALL">All</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option><option value="DISMISSED">Dismissed</option></Select></div>
      <Table columns={['Flag', 'Painter', 'Bucket', 'Details', 'When', '']} isEmpty={rows.length === 0} emptyLabel="Nothing to review.">
        {rows.map((f) => (
          <tr key={f.id} className="border-b border-line align-top">
            <td className="py-2 px-2.5"><div className="font-semibold text-xs">{f.type}</div><StatusPill status={f.status} /></td>
            <td className="py-2 px-2.5">{f.painterName || '—'}<div className="mono text-[11px] text-ink-soft">{f.painterMobile}</div></td>
            <td className="py-2 px-2.5 mono">{f.productQr || '—'}</td>
            <td className="py-2 px-2.5 text-xs max-w-[320px]">{f.details}{f.resolutionNote && <div className="text-ink-soft">Note: {f.resolutionNote}</div>}</td>
            <td className="py-2 px-2.5 text-xs">{fmt(f.createdAt)}</td>
            <td className="py-2 px-2.5 whitespace-nowrap">
              {f.status === 'OPEN' && (
                <>
                  {f.rewardCodeId && f.type !== 'RETURN_AFTER_REWARD' ? (<><LinkButton type="button" onClick={() => resolve(f, 'approve')}>Approve</LinkButton> · <LinkButton type="button" onClick={() => resolve(f, 'reject')}>Reject</LinkButton></>) : <LinkButton type="button" onClick={() => resolve(f, 'dismiss')}>Dismiss</LinkButton>}
                  {f.painterId && <> · <LinkButton type="button" onClick={() => resolve(f, 'block_painter')}>Block painter</LinkButton></>}
                </>
              )}
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}

// ------------------------------------------------------------------ payouts
function PayoutsTab({ onChange }: { onChange: () => void }) {
  const [rows, setRows] = useState<PayoutAdminRow[]>([]);
  const [status, setStatus] = useState('PENDING');
  const [error, setError] = useState('');
  const load = useCallback(() => { api.paged.payouts({ limit: 50, status }).then((r) => setRows(r.data)).catch((e) => setError(errMsg(e))); }, [status]);
  useEffect(() => { load(); }, [load]);

  async function paid(p: PayoutAdminRow) {
    const utr = window.prompt(`Pay ${formatPaise(p.amountPaise)} to ${p.upiId}, then enter the UTR / reference:`);
    if (!utr) return;
    try { await api.markPayoutPaid(p.id, utr.trim()); load(); onChange(); } catch (err) { setError(errMsg(err)); }
  }
  async function retry(p: PayoutAdminRow) {
    try { await api.retryPayout(p.id); load(); onChange(); } catch (err) { setError(errMsg(err)); }
  }
  async function failed(p: PayoutAdminRow) {
    const reason = window.prompt('Why did it fail? (the amount returns to the painter wallet)');
    if (!reason) return;
    try { await api.markPayoutFailed(p.id, reason.trim()); load(); onChange(); } catch (err) { setError(errMsg(err)); }
  }
  return (
    <>
      <Flash kind="err">{error}</Flash>
      <div className="mb-3 max-w-[200px]"><Select value={status} onChange={(e) => setStatus(e.target.value)}><option value="PENDING">Pending</option><option value="PROCESSING">Processing</option><option value="SUCCESS">Success</option><option value="FAILED">Failed</option><option value="REVERSED">Reversed</option><option value="ALL">All</option></Select></div>
      <Table columns={['Payout', 'Painter', 'UPI', 'Amount', 'Status', 'Requested', '']} isEmpty={rows.length === 0} emptyLabel="No payouts.">
        {rows.map((p) => (
          <tr key={p.id} className="border-b border-line">
            <td className="py-2 px-2.5 mono">{p.id}</td>
            <td className="py-2 px-2.5">{p.painterName || p.painterId}<div className="mono text-[11px] text-ink-soft">{p.painterMobile}</div></td>
            <td className="py-2 px-2.5 mono">{p.upiId}</td>
            <td className="py-2 px-2.5 font-semibold">{formatPaise(p.amountPaise)}</td>
            <td className="py-2 px-2.5"><StatusPill status={p.status} />{p.utr && <div className="mono text-[11px] text-ink-soft">{p.utr}</div>}</td>
            <td className="py-2 px-2.5 text-xs">{fmt(p.createdAt)}</td>
            <td className="py-2 px-2.5 whitespace-nowrap">{(p.status === 'PENDING' || p.status === 'PROCESSING') && <>{p.status === 'PENDING' && <><LinkButton type="button" onClick={() => retry(p)}>Retry</LinkButton> · </>}<LinkButton type="button" onClick={() => paid(p)}>Mark paid</LinkButton> · <LinkButton type="button" onClick={() => failed(p)}>Mark failed</LinkButton></>}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}

// ------------------------------------------------------------------ print codes
function CodesTab() {
  const [count, setCount] = useState('100');
  const [label, setLabel] = useState('');
  const [fresh, setFresh] = useState<GenerateCodesResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function generate() {
    setBusy(true); setError('');
    try { setFresh(await api.generateRewardCodes(Number(count), label.trim())); } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  }
  return (
    <>
      <Flash kind="err">{error}</Flash>
      <p className="text-sm text-ink-soft mb-3">Kitne bhi reward stickers ek saath banao (max 1000). Ye kisi bucket se bandhe nahi hain. Painter claim karte waqt bucket ka PRD number khud daalta hai. Codes sirf <b>ek baar</b> dikhte hain, turant print ya CSV download kar lo.</p>
      <div className="flex flex-wrap gap-4 items-end mb-4">
        <Field label="Kitne stickers?" className="w-40"><TextInput inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, ''))} /></Field>
        <Field label="Naam / note (optional)" className="min-w-[220px]"><TextInput placeholder="e.g. Oct-2026 run 1" value={label} onChange={(e) => setLabel(e.target.value)} /></Field>
        <Button variant="green" disabled={busy || !Number(count)} onClick={generate}>{busy ? 'Ban rahe hain…' : 'Generate stickers'}</Button>
      </div>
      {fresh && (
        <div className="p-4 rounded-lg border border-green bg-white">
          <div className="font-semibold text-green">{fresh.generated} reward stickers ready ({fresh.label})</div>
          <div className="text-xs text-ink-soft mb-3">Is page se hatne ke baad ye codes dobara nahi dikhenge.</div>
          <div className="flex gap-3 flex-wrap">
            <Button variant="blue" onClick={() => printRewardStickers(fresh.codes)}>Print {fresh.generated} stickers</Button>
            <Button variant="violet" onClick={() => downloadText(`reward-stickers-${fresh.label}.csv`, rewardCodesCsv(fresh.codes))}>Download CSV</Button>
          </div>
        </div>
      )}
    </>
  );
}

// ------------------------------------------------------------------ painters
function PaintersTab({ onChange }: { onChange: () => void }) {
  const [rows, setRows] = useState<PainterAdminRow[]>([]);
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search, 300);
  const [error, setError] = useState('');
  const load = useCallback(() => { api.paged.painters({ limit: 50, search: q.trim() || undefined }).then((r) => setRows(r.data)).catch((e) => setError(errMsg(e))); }, [q]);
  useEffect(() => { load(); }, [load]);

  async function setStatus(p: PainterAdminRow, status: 'ACTIVE' | 'ON_HOLD' | 'BLOCKED') {
    try { await api.setPainterStatus(p.id, status); load(); onChange(); } catch (err) { setError(errMsg(err)); }
  }
  return (
    <>
      <Flash kind="err">{error}</Flash>
      <Field label="Search ID / name / mobile / city / UPI" className="max-w-md mb-3"><TextInput value={search} onChange={(e) => setSearch(e.target.value)} /></Field>
      <Table columns={['Painter', 'Mobile', 'UPI', 'Claims', 'Earned', 'Withdrawn', 'Wallet', 'Status', '']} isEmpty={rows.length === 0} emptyLabel="No painters yet.">
        {rows.map((p) => (
          <tr key={p.id} className="border-b border-line">
            <td className="py-2 px-2.5"><div className="font-semibold">{p.name}</div><div className="mono text-[11px] text-ink-soft">{p.id} · {p.city}</div></td>
            <td className="py-2 px-2.5 mono">{p.mobile}</td>
            <td className="py-2 px-2.5 mono">{p.upiId || '—'}</td>
            <td className="py-2 px-2.5">{p.claims}</td>
            <td className="py-2 px-2.5">{formatPaise(p.totalEarnedPaise)}</td>
            <td className="py-2 px-2.5">{formatPaise(p.totalWithdrawnPaise)}</td>
            <td className="py-2 px-2.5">{formatPaise(p.balancePaise)}</td>
            <td className="py-2 px-2.5"><StatusPill status={p.status} /></td>
            <td className="py-2 px-2.5 whitespace-nowrap">
              {p.status !== 'ACTIVE' && <LinkButton type="button" onClick={() => setStatus(p, 'ACTIVE')}>Activate</LinkButton>}
              {p.status === 'ACTIVE' && <LinkButton type="button" onClick={() => setStatus(p, 'ON_HOLD')}>Hold</LinkButton>}
              {p.status !== 'BLOCKED' && <> · <LinkButton type="button" onClick={() => window.confirm(`Block ${p.name}?`) && setStatus(p, 'BLOCKED')}>Block</LinkButton></>}
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}

// ------------------------------------------------------------------ reconciliation
function HealthTab() {
  const [report, setReport] = useState<ReconcileReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run() {
    setBusy(true); setError('');
    try { setReport(await api.runReconcile()); } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  }
  return (
    <>
      <Flash kind="err">{error}</Flash>
      <p className="text-sm text-ink-soft mb-3">Checks that the wallet ledger balances, every payout has its ledger entries, and campaign spend matches the claims. Read-only.</p>
      <Button variant="blue" disabled={busy} onClick={run}>{busy ? 'Checking…' : 'Run reconciliation'}</Button>
      {report && (
        <div className="mt-4 text-sm grid gap-2">
          <Flash kind={report.ok ? 'ok' : 'err'}>{report.ok ? 'All books agree.' : 'Problems found — see below.'}</Flash>
          <div>Ledger balanced: <b>{report.ledgerBalanced ? 'yes' : 'NO'}</b> (credits {formatPaise(report.totalCreditPaise)} / debits {formatPaise(report.totalDebitPaise)})</div>
          <div>Total owed in painter wallets: <b>{formatPaise(report.totalWalletLiabilityPaise)}</b></div>
          <div>Payouts: {report.payoutsByStatus.map((p) => `${p.status} ${p.count} (${formatPaise(p.totalPaise)})`).join(' · ') || '—'}</div>
          {report.stuckPayouts.length > 0 && <div className="text-red">Payouts waiting over 24h: {report.stuckPayouts.map((p) => p.id).join(', ')}</div>}
          {report.payoutsMissingLedgerDebit.length > 0 && <div className="text-red">Payouts without ledger debit: {report.payoutsMissingLedgerDebit.join(', ')}</div>}
          {report.refundedPayoutsMissingLedgerCredit.length > 0 && <div className="text-red">Failed payouts not refunded: {report.refundedPayoutsMissingLedgerCredit.join(', ')}</div>}
          {report.campaignDrift.length > 0 && <div className="text-red">Campaign spend mismatch: {report.campaignDrift.map((c) => `${c.name} (${formatPaise(c.recordedSpentPaise)} vs ${formatPaise(c.claimsTotalPaise)})`).join('; ')}</div>}
          <div className="text-xs text-ink-soft">Checked {fmt(report.checkedAt)}</div>
        </div>
      )}
    </>
  );
}

// ------------------------------------------------------------------ alerts ("this painter just took money")
const ICON: Record<AdminNotificationItem['type'], string> = { REWARD_CLAIMED: '💰', REWARD_HELD: '⏸️', PAYOUT_PENDING: '🕒', PAYOUT_SUCCESS: '✅', PAYOUT_FAILED: '⚠️' };

/** Polls every 15s. New alerts also pop up as a desktop notification if the browser permission was granted. */
function AlertsTab({ onUnread, onChange }: { onUnread: (n: number) => void; onChange: () => void }) {
  const [items, setItems] = useState<AdminNotificationItem[]>([]);
  const [error, setError] = useState('');
  const [perm, setPerm] = useState<string>(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');
  const seen = useRef<Set<string> | null>(null);

  const load = useCallback(async () => {
    try {
      const { items: list, unread } = await api.getAdminNotifications();
      setItems(list);
      onUnread(unread);
      if (seen.current === null) {
        seen.current = new Set(list.map((n) => n.id));
      } else {
        for (const n of list) {
          if (!seen.current.has(n.id)) {
            seen.current.add(n.id);
            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification(n.title, { body: n.body });
            onChange();
          }
        }
      }
    } catch (e) { setError(errMsg(e)); }
  }, [onUnread, onChange]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 15000);
    return () => clearInterval(t);
  }, [load]);

  async function readAll() { try { await api.markNotificationsRead(); await load(); } catch (e) { setError(errMsg(e)); } }
  async function enableDesktop() { if (typeof Notification !== 'undefined') setPerm(await Notification.requestPermission()); }

  return (
    <>
      <Flash kind="err">{error}</Flash>
      <div className="flex gap-4 flex-wrap items-center mb-3 text-sm">
        <LinkButton type="button" onClick={readAll}>Mark all as read</LinkButton>
        {perm === 'default' && <LinkButton type="button" onClick={enableDesktop}>Enable desktop notifications</LinkButton>}
        <span className="text-ink-soft">Updates every 15 seconds.</span>
      </div>
      <Table columns={['', 'Alert', 'When']} isEmpty={items.length === 0} emptyLabel="No alerts yet. You will see a line here every time a painter claims a reward.">
        {items.map((n) => (
          <tr key={n.id} className={`border-b border-line ${n.read ? '' : 'bg-white font-semibold'}`}>
            <td className="py-2 px-2.5 w-8">{ICON[n.type]}</td>
            <td className="py-2 px-2.5"><div>{n.title}</div><div className="text-xs font-normal text-ink-soft">{n.body}</div></td>
            <td className="py-2 px-2.5 text-xs whitespace-nowrap">{fmt(n.createdAt)}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}
