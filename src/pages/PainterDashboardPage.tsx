import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import PageShell from '../components/layout/PageShell';
import { Panel, Flash } from '../components/ui/Misc';
import Button from '../components/ui/Button';
import * as api from '../lib/apiClient';
import type { PainterDashboardData } from '../types';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-panel border border-line rounded-2xl p-5 shadow-sm">
      <div className="text-xs text-ink-soft font-semibold uppercase">{label}</div>
      <div className="text-2xl font-semibold mt-2">{value}</div>
    </div>
  );
}

export default function PainterDashboardPage() {
  const [params] = useSearchParams();
  const pid = params.get('pid') || localStorage.getItem('acme-painter-id');
  const [data, setData] = useState<PainterDashboardData | null>(null);
  const [error, setError] = useState('');
  const [withdrawBusy, setWithdrawBusy] = useState(false);

  const load = useCallback(async () => {
    if (!pid) {
      setError('Painter account not found. Please scan a reward QR and register first.');
      return;
    }
    localStorage.setItem('acme-painter-id', pid);
    try {
      setData(await api.getPainterDashboard(pid));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load painter dashboard.');
    }
  }, [pid]);

  useEffect(() => {
    load();
  }, [load]);

  async function withdraw() {
    if (!pid) return;
    setError('');
    setWithdrawBusy(true);
    try {
      await api.requestPainterWithdrawal({ painterId: pid, amount: 500 });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Withdrawal request failed.');
    } finally {
      setWithdrawBusy(false);
    }
  }

  if (!data) {
    return (
      <PageShell>
        <Flash kind="err">{error}</Flash>
        <Panel title="Painter Dashboard">
          <p className="text-sm text-ink-soft">Register by scanning an eligible ACME bucket QR.</p>
          <Link className="text-blue font-semibold text-sm" to="/verify">Go to QR verification</Link>
        </Panel>
      </PageShell>
    );
  }
  const { painter, rewards, withdrawals } = data;
  return (
    <PageShell>
      <Flash kind="err">{error}</Flash>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Painter Dashboard</h1>
          <p className="text-ink-soft text-sm">Welcome, {painter.name}</p>
        </div>
        <Link to="/verify"><Button>Scan another bucket</Button></Link>
      </div>
      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <Stat label="Available Reward" value={`₹${painter.walletBalance}`} />
        <Stat label="Total Earned" value={`₹${painter.totalEarned}`} />
        <Stat label="Total Withdrawn" value={`₹${painter.totalWithdrawn}`} />
      </div>
      <Panel title="Withdraw Rewards" subtitle="Minimum withdrawal is ₹500. Payments are sent to your registered UPI ID.">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xl font-semibold">₹{painter.walletBalance}</div>
            <div className="text-xs text-ink-soft mt-1">UPI: {painter.upiId}</div>
          </div>
          <Button variant="green" disabled={painter.walletBalance < 500 || withdrawBusy} onClick={withdraw}>
            {withdrawBusy ? 'Submitting…' : painter.walletBalance >= 500 ? 'Withdraw ₹500' : `Need ₹${500 - painter.walletBalance} more`}
          </Button>
        </div>
      </Panel>
      <Panel title="Reward History" subtitle="Each genuine activated bucket can generate only one successful reward claim. Dealer scanning is not required.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-line">
                <th className="py-3">Reward ID</th><th>Bucket</th><th>Amount</th><th>Status</th><th>Date</th>
              </tr>
            </thead>
            <tbody>
              {rewards.length ? rewards.map((r) => (
                <tr key={r.id} className="border-b border-line">
                  <td className="py-3 mono">{r.id}</td>
                  <td className="mono">{r.productId}</td>
                  <td>₹{r.amount}</td>
                  <td>{r.status}</td>
                  <td>{r.createdAt}</td>
                </tr>
              )) : <tr><td colSpan={5} className="py-5 text-center text-ink-soft">No rewards yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title="Withdrawal History">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-line">
                <th className="py-3">Withdrawal ID</th><th>Amount</th><th>UPI</th><th>Status</th><th>Requested</th>
              </tr>
            </thead>
            <tbody>
              {withdrawals.length ? withdrawals.map((w) => (
                <tr key={w.id} className="border-b border-line">
                  <td className="py-3 mono">{w.id}</td>
                  <td>₹{w.amount}</td>
                  <td>{w.upiId}</td>
                  <td>{w.status}</td>
                  <td>{w.requestedAt}</td>
                </tr>
              )) : <tr><td colSpan={5} className="py-5 text-center text-ink-soft">No withdrawal requests.</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>
    </PageShell>
  );
}
