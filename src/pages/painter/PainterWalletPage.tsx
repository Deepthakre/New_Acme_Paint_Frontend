import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import PageShell from '../../components/layout/PageShell';
import { Panel, Table, Flash, StatCard } from '../../components/ui/Misc';
import { Field, TextInput } from '../../components/ui/Field';
import Button, { LinkButton } from '../../components/ui/Button';
import StatusPill from '../../components/ui/StatusPill';
import PainterLoginCard from './PainterLoginCard';
import { usePainterAuth } from '../../context/PainterAuthContext';
import { painterApi } from '../../lib/painterApi';
import { formatPaise, type Payout, type WalletEntry, type WalletSummary } from '../../types';

const TYPE_LABEL: Record<string, string> = { REWARD: 'Bucket reward', PAYOUT: 'Withdrawal', PAYOUT_REVERSAL: 'Withdrawal refunded', ADJUSTMENT: 'Adjustment' };
const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

export default function PainterWalletPage() {
  const { painter, initializing, setPainter, logout } = usePainterAuth();
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [entries, setEntries] = useState<WalletEntry[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [upi, setUpi] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  // One idempotency key per withdraw "intent": a retry of the SAME click re-sends the same key, so it can never pay twice.
  const withdrawKey = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [w, l, p] = await Promise.all([painterApi.wallet(), painterApi.ledger(1), painterApi.payouts(1)]);
      setWallet(w);
      setEntries(l.data);
      setPayouts(p.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your wallet.');
    }
  }, []);

  useEffect(() => {
    if (painter) {
      setUpi(painter.upiId);
      void load();
    }
  }, [painter, load]);

  async function saveUpi(e: FormEvent) {
    e.preventDefault();
    setError(''); setOk(''); setBusy(true);
    try {
      setPainter(await painterApi.updateUpi(upi.trim()));
      setOk('UPI ID saved.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save UPI ID.');
    } finally {
      setBusy(false);
    }
  }

  async function withdraw(e: FormEvent) {
    e.preventDefault();
    if (!wallet) return;
    const rupees = Number(amount);
    if (!Number.isFinite(rupees) || rupees <= 0) { setError('Enter an amount.'); return; }
    setError(''); setOk(''); setBusy(true);
    if (!withdrawKey.current) withdrawKey.current = crypto.randomUUID();
    try {
      await painterApi.withdraw(Math.round(rupees * 100), withdrawKey.current);
      withdrawKey.current = null; // finished: the next withdrawal is a new intent
      setAmount('');
      setOk('Withdrawal requested. It will be sent to your UPI ID shortly.');
      await load();
    } catch (err) {
      // Definitive rejections (4xx) mean the request did NOT happen -> next try is a fresh intent. Network errors keep the key so a retry is safe.
      if (err instanceof Error && 'status' in err && typeof (err as { status?: number }).status === 'number') withdrawKey.current = null;
      setError(err instanceof Error ? err.message : 'Withdrawal failed.');
    } finally {
      setBusy(false);
    }
  }

  if (initializing) return <PageShell><div className="text-sm text-ink-soft">Loading…</div></PageShell>;
  if (!painter) return <PageShell><PainterLoginCard /></PageShell>;

  const canWithdraw = wallet && wallet.upiId && wallet.balancePaise >= wallet.minWithdrawPaise;

  return (
    <PageShell>
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold">Welcome, {painter.name}</h2>
          <p className="text-sm text-ink-soft">Painter ID <span className="mono">{painter.id}</span></p>
        </div>
        <div className="flex gap-3">
          <Link to="/r"><Button variant="green">Claim a bucket reward</Button></Link>
          <LinkButton type="button" onClick={() => void logout()}>Log out</LinkButton>
        </div>
      </div>

      <Flash kind="err">{error}</Flash>
      <Flash kind="ok">{ok}</Flash>
      {painter.status === 'ON_HOLD' && <Flash kind="err">Your account is under review. Claims are reviewed manually and withdrawals are paused.</Flash>}

      {wallet && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          <StatCard n={formatPaise(wallet.balancePaise)} label="Available balance" />
          <StatCard n={formatPaise(wallet.totalEarnedPaise)} label="Total earned" />
          <StatCard n={formatPaise(wallet.totalWithdrawnPaise)} label="Total withdrawn" />
          <StatCard n={formatPaise(wallet.pendingPayoutPaise)} label="Payout in progress" />
        </div>
      )}

      <Panel title="Payout UPI ID" subtitle="Rewards are paid to this UPI ID. For your safety, withdrawals pause for 24 hours after you change it.">
        <form onSubmit={saveUpi} className="flex flex-wrap gap-4 items-end">
          <Field label="UPI ID" className="flex-1 min-w-[240px]"><TextInput placeholder="name@upi" value={upi} onChange={(e) => setUpi(e.target.value)} required /></Field>
          <Button type="submit" variant="blue" disabled={busy || upi.trim() === painter.upiId}>Save UPI ID</Button>
        </form>
      </Panel>

      <Panel title="Withdraw to UPI" subtitle={wallet ? `Minimum ${formatPaise(wallet.minWithdrawPaise)} · maximum ${formatPaise(wallet.maxWithdrawPaise)} per withdrawal.` : undefined}>
        <form onSubmit={withdraw} className="flex flex-wrap gap-4 items-end">
          <Field label="Amount (₹)" className="w-48"><TextInput inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} placeholder={wallet ? String(wallet.minWithdrawPaise / 100) : ''} /></Field>
          <Button type="submit" variant="green" disabled={busy || !canWithdraw || !amount}>{busy ? 'Submitting…' : 'Withdraw'}</Button>
          {wallet && !wallet.upiId && <span className="text-sm text-ink-soft">Add your UPI ID first.</span>}
          {wallet && wallet.upiId && wallet.balancePaise < wallet.minWithdrawPaise && <span className="text-sm text-ink-soft">Need {formatPaise(wallet.minWithdrawPaise - wallet.balancePaise)} more to withdraw.</span>}
        </form>
      </Panel>

      <Panel title="Wallet history">
        <Table columns={['Date', 'Details', 'Amount']} isEmpty={entries.length === 0} emptyLabel="No rewards yet. Scan the QR inside a bucket to earn.">
          {entries.map((en, i) => (
            <tr key={en._id ?? i} className="border-b border-line">
              <td className="py-2 px-2.5">{fmt(en.createdAt)}</td>
              <td className="py-2 px-2.5">{TYPE_LABEL[en.type] || en.type}<div className="text-[11px] text-ink-soft">{en.note}</div></td>
              <td className={`py-2 px-2.5 font-semibold ${en.direction === 'CREDIT' ? 'text-green' : 'text-red'}`}>{en.direction === 'CREDIT' ? '+' : '−'}{formatPaise(en.amountPaise)}</td>
            </tr>
          ))}
        </Table>
      </Panel>

      <Panel title="Withdrawals">
        <Table columns={['ID', 'Amount', 'UPI', 'Status', 'Requested']} isEmpty={payouts.length === 0} emptyLabel="No withdrawals yet.">
          {payouts.map((p) => (
            <tr key={p.id} className="border-b border-line">
              <td className="py-2 px-2.5 mono">{p.id}</td>
              <td className="py-2 px-2.5">{formatPaise(p.amountPaise)}</td>
              <td className="py-2 px-2.5 mono">{p.upiId}</td>
              <td className="py-2 px-2.5"><StatusPill status={p.status} />{p.utr && <div className="mono text-[11px] text-ink-soft">UTR {p.utr}</div>}{p.failureReason && <div className="text-[11px] text-red">{p.failureReason}</div>}</td>
              <td className="py-2 px-2.5">{fmt(p.createdAt)}</td>
            </tr>
          ))}
        </Table>
      </Panel>
    </PageShell>
  );
}
