import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import PageShell from '../../components/layout/PageShell';
import { Panel, Flash } from '../../components/ui/Misc';
import { Field, TextInput } from '../../components/ui/Field';
import Button, { LinkButton } from '../../components/ui/Button';
import QrScanner from '../../components/ui/QrScanner';
import PainterLoginCard from './PainterLoginCard';
import { usePainterAuth } from '../../context/PainterAuthContext';
import { painterApi } from '../../lib/painterApi';
import { formatPaise, type RedeemResult } from '../../types';

/**
 * Opens from the INNER QR (inside the bucket lid): /r/<code>.
 *  1. Painter logs in with mobile + OTP (once).
 *  2. Painter enters the QR ID printed on the OUTER label of the same bucket (proves they hold the real bucket)
 *     and their UPI ID.
 *  3. The reward is sent straight to that UPI ID; the admin gets a notification.
 */
export default function RewardRedeemPage() {
  const { code: codeParam } = useParams();
  const { painter, initializing, logout } = usePainterAuth();
  const [code, setCode] = useState(codeParam || '');
  const [bucketId, setBucketId] = useState('');
  const [upi, setUpi] = useState('');
  const [result, setResult] = useState<RedeemResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);

  // Pre-fill the saved UPI ID once the painter is known.
  useEffect(() => {
    if (painter?.upiId) setUpi((cur) => cur || painter.upiId);
  }, [painter]);

  const redeem = useCallback(async () => {
    setError('');
    setResult(null);
    setBusy(true);
    try {
      setResult(await painterApi.redeem(code.trim(), bucketId.trim(), upi.trim()));
      setCode('');
      setBucketId('');
      // Don't leave a one-time code sitting in the address bar / browser history.
      window.history.replaceState(null, '', '/r');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not claim this reward.');
    } finally {
      setBusy(false);
    }
  }, [code, bucketId, upi]);

  function submit(e: FormEvent) {
    e.preventDefault();
    void redeem();
  }

  if (initializing) return <PageShell><div className="text-sm text-ink-soft">Loading…</div></PageShell>;

  return (
    <PageShell>
      {!painter ? (
        <>
          {codeParam && <Flash kind="ok">Reward code detected. Log in to claim it.</Flash>}
          <PainterLoginCard intro="Log in with your mobile number to claim your reward. It takes less than a minute." />
        </>
      ) : (
        <Panel title="🎨 Claim your reward" subtitle="The reward is sent straight to your UPI ID.">
          <Flash kind="err">{error}</Flash>
          <div className="text-sm mb-4 p-3 rounded-lg border border-line bg-white">
            Claiming as <b>{painter.name}</b> <span className="mono">({painter.mobile})</span> ·{' '}
            <LinkButton type="button" onClick={() => void logout()}>Not you? Log out</LinkButton>
          </div>

          {result && (
            <div className={`p-5 rounded-xl border mb-5 ${result.status === 'CREDITED' && result.payout?.status !== 'FAILED' ? 'border-green bg-white' : 'border-ochre bg-white'}`}>
              <div className={`text-xl font-semibold ${result.status === 'CREDITED' && result.payout?.status !== 'FAILED' ? 'text-green' : 'text-ochre'}`}>
                {result.status === 'ON_HOLD' ? 'Claim received — under review' : result.payout?.status === 'FAILED' ? 'Reward saved in your wallet' : `✓ ${formatPaise(result.amountPaise)} on its way!`}
              </div>
              <div className="text-sm text-ink-soft mt-1">{result.productName} · {result.size}</div>
              <p className="text-sm mt-2">{result.message}</p>
              {result.payout && <div className="text-xs text-ink-soft mt-2">Payment reference: <span className="mono">{result.payout.id}</span></div>}
              <div className="mt-4 flex gap-3 flex-wrap">
                <Link to="/painter"><Button variant="green">My rewards</Button></Link>
                <Button variant="blue" onClick={() => setResult(null)}>Claim another bucket</Button>
              </div>
            </div>
          )}

          {!result && (
            <form onSubmit={submit} className="grid gap-4 max-w-xl">
              <Field label="1. Reward code (QR inside the lid)">
                <div className="flex gap-2">
                  <TextInput className="flex-1" value={code} onChange={(e) => setCode(e.target.value)} placeholder="K7QH-2M9X-PD4T-7A" autoCapitalize="characters" autoComplete="off" required />
                  <Button type="button" variant="violet" onClick={() => setScanning((s) => !s)}>{scanning ? 'Close' : 'Scan'}</Button>
                </div>
              </Field>
              {scanning && (
                <div className="max-w-sm">
                  <QrScanner active={scanning} onScan={(text) => { setScanning(false); setCode(text); }} />
                </div>
              )}
              <Field label="2. Bucket QR ID (printed on the bucket label)">
                <TextInput value={bucketId} onChange={(e) => setBucketId(e.target.value)} placeholder="PRD-2026-000108" autoCapitalize="characters" autoComplete="off" required />
              </Field>
              <Field label="3. Your UPI ID (the money is sent here)">
                <TextInput value={upi} onChange={(e) => setUpi(e.target.value)} placeholder="name@upi" autoCapitalize="none" autoComplete="off" required />
              </Field>
              <Button type="submit" variant="green" disabled={busy || !code.trim() || !bucketId.trim() || !upi.trim()}>{busy ? 'Checking…' : 'Claim & get paid'}</Button>
              <p className="text-xs text-ink-soft">Enter the QR ID exactly as printed next to the QR on the outside of the same bucket. Check your UPI ID carefully — payments cannot be undone.</p>
            </form>
          )}
        </Panel>
      )}
    </PageShell>
  );
}
