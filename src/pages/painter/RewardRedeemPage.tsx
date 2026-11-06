import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import PageShell from '../../components/layout/PageShell';
import { Panel, Flash } from '../../components/ui/Misc';
import { Field, TextInput } from '../../components/ui/Field';
import Button, { LinkButton } from '../../components/ui/Button';
import QrScanner from '../../components/ui/QrScanner';
import PainterVerify from './PainterVerify';
import { rewardApi, getSession, UPI_RE, type PainterSession } from '../../lib/rewardApi';
import { formatPaise, type ClaimOutcome, type CodeInfo } from '../../types';

/**
 * Opens from the sticker inside the bucket:  /r/<code>
 *   1. mobile + OTP  2. we show "this sticker is worth ₹X"  3. name, city, UPI ID  4. confirm  5. money is sent automatically.
 */
export default function RewardRedeemPage() {
  const { code: codeParam } = useParams();
  const [code, setCode] = useState(codeParam || '');
  const [session, setSession] = useState<PainterSession | null>(() => getSession());
  const [info, setInfo] = useState<CodeInfo | null>(null);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [upi, setUpi] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<ClaimOutcome | null>(null);
  const [fixUpi, setFixUpi] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const prefilled = useRef(false);

  // A 401 means the OTP session ran out: ask for the OTP again, but keep the code and what was typed.
  const handleError = useCallback((err: unknown, fallback: string) => {
    const status = (err as { status?: number })?.status;
    if (status === 401) setSession(null);
    setError(err instanceof Error ? err.message : fallback);
  }, []);

  // Pre-fill the form with the details this mobile used before.
  useEffect(() => {
    if (session?.saved && !prefilled.current) {
      prefilled.current = true;
      setName((v) => v || session.saved!.name);
      setCity((v) => v || session.saved!.city);
      setUpi((v) => v || session.saved!.upiId);
    }
  }, [session]);

  // Once verified and a code is present: ask the server what this sticker is worth.
  useEffect(() => {
    if (!session || !code.trim() || result) {
      setInfo(null);
      return undefined;
    }
    let cancelled = false;
    setError('');
    rewardApi
      .check(code.trim())
      .then((i) => { if (!cancelled) setInfo(i); })
      .catch((err) => { if (!cancelled) { setInfo(null); handleError(err, 'Could not check this code.'); } });
    return () => { cancelled = true; };
  }, [session, code, result, handleError]);

  const upiOk = UPI_RE.test(upi.trim().toLowerCase());
  const canSubmit = !!info && name.trim().length >= 2 && city.trim().length >= 2 && upiOk;

  async function claim() {
    setError('');
    setBusy(true);
    try {
      const r = await rewardApi.claim({ code: code.trim(), name: name.trim(), city: city.trim(), upiId: upi.trim().toLowerCase() });
      setResult(r);
      setFixUpi(r.upiId);
      setCode('');
      setConfirming(false);
      window.history.replaceState(null, '', '/r'); // do not leave the one-time code in the address bar / history
    } catch (err) {
      setConfirming(false);
      handleError(err, 'Could not claim this reward.');
    } finally {
      setBusy(false);
    }
  }

  async function retry() {
    if (!result) return;
    setError('');
    setBusy(true);
    try {
      const r = await rewardApi.retry(result.claimId, fixUpi.trim().toLowerCase());
      setResult(r);
      setFixUpi(r.upiId);
    } catch (err) {
      handleError(err, 'Could not retry.');
    } finally {
      setBusy(false);
    }
  }

  function again() {
    setResult(null);
    setInfo(null);
    setError('');
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (canSubmit) setConfirming(true);
  }

  // ------------------------------------------------------------------ result
  if (result) {
    const paid = result.status === 'PAID';
    const failed = result.status === 'FAILED';
    return (
      <PageShell>
        <Panel title={failed ? 'Payment did not go through' : paid ? '✓ Reward sent!' : '✓ Reward on its way!'} subtitle={`${result.size} bucket · ${formatPaise(result.amountPaise)}`}>
          <Flash kind="err">{error}</Flash>
          <div className={`p-5 rounded-xl border mb-5 bg-white ${failed ? 'border-red' : 'border-green'}`}>
            <div className={`text-2xl font-semibold ${failed ? 'text-red' : 'text-green'}`}>{formatPaise(result.amountPaise)}</div>
            <p className="text-sm mt-2">{result.message}</p>
            <div className="text-xs text-ink-soft mt-2">Reference: <span className="mono">{result.claimId}</span></div>
          </div>
          {failed && (
            <div className="grid gap-3 max-w-md mb-5">
              <Field label="Correct UPI ID · सही UPI ID डालें"><TextInput value={fixUpi} onChange={(e) => setFixUpi(e.target.value)} autoCapitalize="none" autoComplete="off" /></Field>
              <Button variant="green" disabled={busy || !UPI_RE.test(fixUpi.trim().toLowerCase())} onClick={retry}>{busy ? 'Sending…' : 'Send again'}</Button>
            </div>
          )}
          <div className="flex gap-3 flex-wrap">
            <Link to="/painter"><Button variant="green">My rewards</Button></Link>
            <Button variant="blue" onClick={again}>Claim another bucket</Button>
          </div>
        </Panel>
      </PageShell>
    );
  }

  // ------------------------------------------------------------------ not verified yet
  if (!session) {
    return (
      <PageShell>
        {error && <Flash kind="err">{error}</Flash>}
        {codeParam && <Flash kind="ok">Reward sticker detected. Verify your mobile number to claim it.</Flash>}
        <PainterVerify intro="Verify your mobile number to claim your cash reward. It takes less than a minute." onVerified={(s) => { setSession(s); setError(''); }} />
      </PageShell>
    );
  }

  // ------------------------------------------------------------------ verified: details + claim
  return (
    <PageShell>
      <Panel title="🎨 Claim your cash reward · इनाम पाएँ" subtitle="The money is sent straight to your UPI ID - automatically.">
        <Flash kind="err">{error}</Flash>
        <div className="text-sm mb-4 p-3 rounded-lg border border-line bg-white">
          Mobile verified: <b className="mono">{session.mobile}</b>
        </div>

        {!codeParam && !code && (
          <div className="mb-4 grid gap-3 max-w-xl">
            <Field label="Reward code (QR sticker inside the bucket)">
              <div className="flex gap-2">
                <TextInput className="flex-1" value={code} onChange={(e) => setCode(e.target.value)} placeholder="K7QH-2M9X-PD4T-7A" autoCapitalize="characters" autoComplete="off" />
                <Button type="button" variant="violet" onClick={() => setScanning((s) => !s)}>{scanning ? 'Close' : 'Scan'}</Button>
              </div>
            </Field>
            {scanning && <QrScanner active={scanning} onScan={(text) => { setScanning(false); setCode(text); }} />}
          </div>
        )}
        {code && !info && !error && <div className="text-sm text-ink-soft mb-4">Checking your sticker…</div>}
        {code && error && (
          <div className="mb-4"><LinkButton type="button" onClick={() => { setCode(''); setError(''); window.history.replaceState(null, '', '/r'); }}>Scan / enter a different code</LinkButton></div>
        )}

        {info && !confirming && (
          <form onSubmit={onSubmit} className="grid gap-4 max-w-xl">
            <div className="p-4 rounded-xl border border-green bg-white">
              <div className="text-xs uppercase font-semibold text-ink-soft">Your reward · आपका इनाम</div>
              <div className="text-3xl font-semibold text-green">{formatPaise(info.amountPaise)}</div>
              <div className="text-sm text-ink-soft">for this {info.size} bucket</div>
            </div>
            <Field label="Your name · आपका नाम"><TextInput value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required /></Field>
            <Field label="City · शहर"><TextInput value={city} onChange={(e) => setCity(e.target.value)} autoComplete="address-level2" required /></Field>
            <Field label="Your UPI ID · आपका UPI ID" error={upi && !upiOk ? 'Enter a valid UPI ID, e.g. name@upi' : undefined}>
              <TextInput value={upi} onChange={(e) => setUpi(e.target.value)} placeholder="name@upi" autoCapitalize="none" autoComplete="off" required />
            </Field>
            <Button type="submit" variant="green" disabled={!canSubmit}>Continue</Button>
            <p className="text-xs text-ink-soft">Check your UPI ID carefully - a payment sent to a wrong UPI ID cannot be taken back.</p>
          </form>
        )}

        {info && confirming && (
          <div className="grid gap-4 max-w-xl">
            <div className="p-5 rounded-xl border border-ochre bg-white">
              <div className="text-sm">Please confirm · कृपया पुष्टि करें</div>
              <div className="text-2xl font-semibold mt-1">{formatPaise(info.amountPaise)} → <span className="mono break-all">{upi.trim().toLowerCase()}</span></div>
              <div className="text-sm text-ink-soft mt-2">{name.trim()} · {city.trim()} · {session.mobile}</div>
            </div>
            <div className="flex gap-3 flex-wrap">
              <Button variant="green" disabled={busy} onClick={claim}>{busy ? 'Sending…' : `Yes, send ${formatPaise(info.amountPaise)}`}</Button>
              <Button variant="violet" disabled={busy} onClick={() => setConfirming(false)}>Edit details</Button>
            </div>
          </div>
        )}
      </Panel>
    </PageShell>
  );
}
