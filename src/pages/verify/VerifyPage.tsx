import { useState, useEffect, useCallback, type FormEvent, type ReactNode } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import PageShell from '../../components/layout/PageShell';
import { Panel, Flash } from '../../components/ui/Misc';
import { Field, TextInput, Select } from '../../components/ui/Field';
import Button from '../../components/ui/Button';
import ConveyorTracker from '../../components/layout/ConveyorTracker';
import * as api from '../../lib/apiClient';
import { useAuth } from '../../context/AuthContext';
import type { PainterRegistrationInput, VerifyProductFound, VerifyProductResult } from '../../types';

const EMPTY: PainterRegistrationInput = { name: '', mobile: '', upiId: '', city: '', state: 'Maharashtra', experience: '', painterType: 'Painter' };

function DetailRow({ label, value, mono, className = '' }: { label: string; value: ReactNode; mono?: boolean; className?: string }) {
  return (
    <div className={className}>
      <div className="text-ink-soft text-xs font-semibold uppercase">{label}</div>
      <div className={mono ? 'mono' : 'font-medium'}>{value}</div>
    </div>
  );
}

export default function VerifyPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [qrString, setQrString] = useState(searchParams.get('qr') || '');
  const [result, setResult] = useState<VerifyProductFound | null>(null);
  const [tamperFlag, setTamperFlag] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [claimBusy, setClaimBusy] = useState(false);
  const [activateBusy, setActivateBusy] = useState(false);
  const [activateMsg, setActivateMsg] = useState('');
  const [form, setForm] = useState<PainterRegistrationInput>(EMPTY);
  const [registeredPainter, setRegisteredPainter] = useState<{ name: string } | null>(null);

   const runVerify = useCallback(async (value: string) => {
    setError(''); setResult(null); setTamperFlag(false); setBusy(true);
    try {
      const data: VerifyProductResult = await api.verifyProduct(value.trim());
      if (!data.found) {
        // The backend already checks the HMAC signature server-side (with
        // the real secret, which never reaches this bundle) before ever
        // doing a database lookup — so "not found because the signature
        // didn't match" and "not found because it just doesn't exist" are
        // both reported here, not by re-deriving a signature client-side.
        if (data.reason === 'signature_mismatch') {
          setTamperFlag(true);
          setError('This QR signature does not match its product ID. Treat this bucket as unverified.');
        } else {
          setError('This QR code was not found. It may be fake, mistyped, or not yet registered.');
        }
        return;
      }
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setBusy(false);
    }
  }, []);

  // Lets a logged-in factory/warehouse user activate a unit right from this
  // same scan — without this, scanning a freshly printed label here (which
  // is exactly what happens by default, since the printed QR encodes this
  // /verify link) never marks the unit active, because activation is
  // otherwise ONLY reachable from Manufacturing → "Activate QR", a separate
  // tab the scanner never lands on. Still a deliberate, explicit click —
  // nothing here activates automatically just from opening the page.
  const canActivate = Boolean(user && (user.role === 'admin' || user.role === 'warehouse'));
  async function handleActivateHere() {
    if (!qrString) return;
    setActivateMsg(''); setError(''); setActivateBusy(true);
    try {
      await api.activateScan(String(qrString).split('.')[0]);
      setActivateMsg('Activated — ready for dispatch.');
      await runVerify(qrString);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Activation failed.');
    } finally {
      setActivateBusy(false);
    }
  }

  useEffect(() => {
    const fromLink = searchParams.get('qr');
    if (fromLink) runVerify(fromLink);
  }, [searchParams, runVerify]);

  function set<K extends keyof PainterRegistrationInput>(field: K, value: PainterRegistrationInput[K]) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function registerAndClaim(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (tamperFlag) { setError('This QR has a signature mismatch and cannot earn a reward.'); return; }
    setError(''); setClaimBusy(true);
    try {
      const { painter } = await api.registerPainter(form);
      setRegisteredPainter(painter);
      const claimed = await api.claimPainterReward({ painterId: painter.id, qrString });
      setResult((r) => (r ? { ...r, reward: { ...r.reward, eligible: false, claimed: true } } : r));
      navigate(`/painter?pid=${encodeURIComponent(painter.id)}&reward=${claimed.reward.amount}`, { replace: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration/claim failed.');
    } finally {
      setClaimBusy(false);
    }
  }

  return (
    <PageShell>
      <Panel title="Verify Your Paint" subtitle="Scan the QR printed on the bucket to confirm authenticity and check reward eligibility.">
        <Flash kind="err">{error}</Flash>
        <form onSubmit={(e) => { e.preventDefault(); runVerify(qrString); }} className="flex flex-wrap gap-4 items-end mb-2">
          <Field label="QR code" className="flex-1 min-w-[240px]">
            <TextInput value={qrString} onChange={(e) => setQrString(e.target.value)} placeholder="PRD-2026-004624.a1b2c3d4e5f6" required autoFocus />
          </Field>
          <Button type="submit" variant="violet" disabled={busy}>{busy ? 'Checking…' : 'Verify'}</Button>
        </form>
      </Panel>

      {tamperFlag && <Panel title="⚠ Signature mismatch"><p className="text-red text-sm">This QR signature does not match its product ID. Treat this bucket as unverified.</p></Panel>}

      {result?.found && (
        <>
          <Panel title={result.product.product} subtitle={`${result.product.size} · Item code ${result.master.itemCode}`}>
            <ConveyorTracker current={result.product.status} />
            <p className="text-sm text-ink-soft mb-4">{result.master.usp}</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm border-t border-line pt-4">
              <DetailRow label="QR ID" value={result.product.qr} mono />
              <DetailRow label="Current status" value={result.product.status} />
              <DetailRow label="Activation" value={result.product.active ? 'Active — ready for dispatch' : 'Not yet activated'} />
              <DetailRow label="Item / Product Code" value={result.master.itemCode} />
              <DetailRow label="Size / Quantity" value={result.product.size} />
              <DetailRow label="MRP" value={result.mrp ? `₹${result.mrp}` : '—'} />
              <DetailRow label="Manufacturing Date" value={result.manufacturingDate || '—'} />
              <DetailRow label="Manufactured By" value={result.master.manufacturedBy} />
              <DetailRow label="Manufacturer Address" value={result.master.address} />
              <DetailRow label="Helpline" value={result.master.helpline} className="col-span-2" />
            </div>
            {canActivate && (
              <div className="mt-4 pt-4 border-t border-line flex items-center justify-between gap-4">
                {activateMsg && <div className="text-sm font-semibold text-green">{activateMsg}</div>}
                {!result.product.active ? (
                  <>
                    <div className="text-sm text-ink-soft">Scanned this label at the factory? Activate it now — no need to switch to Manufacturing → Activate QR.</div>
                    <Button variant="green" disabled={activateBusy} onClick={handleActivateHere}>
                      {activateBusy ? 'Activating…' : 'Activate for Dispatch'}
                    </Button>
                  </>
                ) : (
                  !activateMsg && <div className="text-sm text-ink-soft">Already activated.</div>
                )}
              </div>
            )}
          </Panel>

          <Panel title="🎨 Painter Reward" subtitle="One genuine ACME bucket can generate one ₹50 painter reward. Reward rules depend on the manufacturer-selected mode.">
            {result.reward.claimed ? (
              <div className="p-4 rounded-lg border border-green bg-white">
                <div className="font-semibold text-green">Reward already claimed</div>
                <div className="text-sm text-ink-soft mt-1">This bucket cannot be claimed again.</div>
              </div>
            ) : !result.reward.eligible ? (
              <div className="p-4 rounded-lg border border-line bg-white">
                <div className="font-semibold">Reward not available yet</div>
                <div className="text-sm text-ink-soft mt-1">{result.reward.reason}</div>
              </div>
            ) : registeredPainter ? (
              <div className="p-4 rounded-lg border border-line bg-white">Ready to claim ₹50 for {registeredPainter.name}.</div>
            ) : (
              <form onSubmit={registerAndClaim} className="grid md:grid-cols-2 gap-4">
                <Field label="Painter name *"><TextInput value={form.name} onChange={(e) => set('name', e.target.value)} required /></Field>
                <Field label="Mobile number *"><TextInput inputMode="numeric" maxLength={10} value={form.mobile} onChange={(e) => set('mobile', e.target.value.replace(/\D/g, ''))} required /></Field>
                <Field label="UPI ID *"><TextInput placeholder="name@upi" value={form.upiId} onChange={(e) => set('upiId', e.target.value)} required /></Field>
                <Field label="City *"><TextInput value={form.city} onChange={(e) => set('city', e.target.value)} required /></Field>
                <Field label="State"><TextInput value={form.state} onChange={(e) => set('state', e.target.value)} /></Field>
                <Field label="Painter type"><Select value={form.painterType} onChange={(e) => set('painterType', e.target.value)}><option>Painter</option><option>Contractor</option><option>Applicator</option></Select></Field>
                <Field label="Experience"><TextInput placeholder="e.g. 5 years" value={form.experience} onChange={(e) => set('experience', e.target.value)} /></Field>
                <div className="md:col-span-2 flex items-center justify-between gap-4 border-t border-line pt-4">
                  <div className="text-sm">
                    <div className="font-semibold">Reward available: ₹50</div>
                    <div className="text-ink-soft">Registration + successful claim credits ₹50 to your ACME wallet. Dealer scan/sale is optional — the reward works whether the dealer scanned the bucket or not.</div>
                  </div>
                  <Button type="submit" variant="green" disabled={claimBusy}>{claimBusy ? 'Registering & crediting…' : 'Register & Claim ₹50'}</Button>
                </div>
              </form>
            )}
          </Panel>
        </>
      )}
    </PageShell>
  );
}
