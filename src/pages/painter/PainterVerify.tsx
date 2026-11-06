import { useEffect, useState, type FormEvent } from 'react';
import { Panel, Flash } from '../../components/ui/Misc';
import { Field, TextInput } from '../../components/ui/Field';
import Button, { LinkButton } from '../../components/ui/Button';
import { rewardApi, type PainterSession } from '../../lib/rewardApi';

/**
 * Step "verify your mobile": mobile number -> 6-digit OTP. No password, no registration form.
 * (Name / city / UPI ID are asked later, together with the claim.)
 */
export default function PainterVerify({ intro, onVerified }: { intro?: string; onVerified: (s: PainterSession) => void }) {
  const [step, setStep] = useState<'mobile' | 'otp'>('mobile');
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function sendOtp(e?: FormEvent) {
    e?.preventDefault();
    setError('');
    setBusy(true);
    try {
      await rewardApi.sendOtp(mobile);
      setStep('otp');
      setCooldown(30);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the OTP.');
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      onVerified(await rewardApi.verifyOtp(mobile, otp));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Verify your mobile number · मोबाइल नंबर verify करें" subtitle={intro || 'We send a 6-digit OTP to your mobile. No password needed.'}>
      <Flash kind="err">{error}</Flash>
      {step === 'mobile' ? (
        <form onSubmit={sendOtp} className="grid gap-4 max-w-sm">
          <Field label="Mobile number · मोबाइल नंबर">
            <TextInput inputMode="numeric" autoComplete="tel" maxLength={10} placeholder="10-digit mobile" value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))} required autoFocus />
          </Field>
          <Button type="submit" variant="green" disabled={busy || !/^[6-9]\d{9}$/.test(mobile)}>{busy ? 'Sending…' : 'Send OTP'}</Button>
        </form>
      ) : (
        <form onSubmit={verify} className="grid gap-4 max-w-sm">
          <div className="text-sm text-ink-soft">
            OTP sent to <span className="mono">{mobile}</span>.{' '}
            <LinkButton type="button" onClick={() => { setStep('mobile'); setOtp(''); setError(''); }}>Change number</LinkButton>
          </div>
          <Field label="6-digit OTP">
            <TextInput inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} required autoFocus />
          </Field>
          <Button type="submit" variant="green" disabled={busy || otp.length !== 6}>{busy ? 'Verifying…' : 'Verify'}</Button>
          <LinkButton type="button" disabled={cooldown > 0 || busy} onClick={() => sendOtp()}>{cooldown > 0 ? `Resend OTP in ${cooldown}s` : 'Resend OTP'}</LinkButton>
        </form>
      )}
    </Panel>
  );
}
