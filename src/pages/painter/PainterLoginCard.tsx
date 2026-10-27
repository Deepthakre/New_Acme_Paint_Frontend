import { useEffect, useState, type FormEvent } from 'react';
import { Panel, Flash } from '../../components/ui/Misc';
import { Field, TextInput } from '../../components/ui/Field';
import Button, { LinkButton } from '../../components/ui/Button';
import { painterApi } from '../../lib/painterApi';
import { usePainterAuth } from '../../context/PainterAuthContext';

type Step = 'mobile' | 'otp' | 'profile';

/** Mobile + OTP. First-time numbers are asked for name/city after the OTP is verified - no separate register page, no password. */
export default function PainterLoginCard({ intro }: { intro?: string }) {
  const { setPainter } = usePainterAuth();
  const [step, setStep] = useState<Step>('mobile');
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
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
      await painterApi.sendOtp(mobile);
      setStep('otp');
      setCooldown(30);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send OTP.');
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await painterApi.verifyOtp(mobile, otp, step === 'profile' ? { name, city } : undefined);
      if (res.needsProfile) {
        setStep('profile');
      } else if (res.painter) {
        setPainter(res.painter);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Painter login" subtitle={intro || 'Log in with your mobile number to claim rewards and see your wallet. New here? The same steps create your account.'}>
      <Flash kind="err">{error}</Flash>
      {step === 'mobile' && (
        <form onSubmit={sendOtp} className="grid gap-4 max-w-sm">
          <Field label="Mobile number">
            <TextInput inputMode="numeric" autoComplete="tel" maxLength={10} placeholder="10-digit mobile" value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))} required autoFocus />
          </Field>
          <Button type="submit" variant="green" disabled={busy || mobile.length !== 10}>{busy ? 'Sending…' : 'Send OTP'}</Button>
        </form>
      )}
      {(step === 'otp' || step === 'profile') && (
        <form onSubmit={verify} className="grid gap-4 max-w-sm">
          <div className="text-sm text-ink-soft">OTP sent to <span className="mono">{mobile}</span>. <LinkButton type="button" onClick={() => { setStep('mobile'); setOtp(''); }}>Change number</LinkButton></div>
          <Field label="6-digit OTP">
            <TextInput inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} required autoFocus={step === 'otp'} />
          </Field>
          {step === 'profile' && (
            <>
              <div className="text-sm font-semibold">Welcome! Tell us a little about you.</div>
              <Field label="Your name *"><TextInput value={name} onChange={(e) => setName(e.target.value)} required autoFocus /></Field>
              <Field label="City"><TextInput value={city} onChange={(e) => setCity(e.target.value)} /></Field>
            </>
          )}
          <Button type="submit" variant="green" disabled={busy || otp.length !== 6 || (step === 'profile' && name.trim().length < 2)}>
            {busy ? 'Verifying…' : step === 'profile' ? 'Create account' : 'Verify & continue'}
          </Button>
          <LinkButton type="button" disabled={cooldown > 0 || busy} onClick={() => sendOtp()}>{cooldown > 0 ? `Resend OTP in ${cooldown}s` : 'Resend OTP'}</LinkButton>
        </form>
      )}
    </Panel>
  );
}
