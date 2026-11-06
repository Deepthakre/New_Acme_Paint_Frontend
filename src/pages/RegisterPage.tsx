import { useRef, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Button from '../components/ui/Button';
import { Field, TextInput, Select } from '../components/ui/Field';
import { ApiRequestError } from '../lib/apiClient';
import { PASSWORD_RULES, validateRegistration, type FieldErrors, type RegisterForm } from '../lib/validation';
import type { RegisterPayload, Role } from '../types';

const SELF_REGISTER_ROLES: Role[] = ['dealer', 'customer', 'salesrep'];
const ROLE_HOME: Partial<Record<Role, string>> = { dealer: '/dealer-sale', salesrep: '/sales-team', customer: '/verify' };

function isSelfRegisterRole(value: string | null): value is Role {
  return SELF_REGISTER_ROLES.includes(value as Role);
}

// Live red/green checklist under the password box — the person sees exactly
// which rule is still missing while typing, instead of finding out on submit.
function PasswordChecklist({ value }: { value: string }) {
  const started = value.length > 0;
  return (
    <ul className="flex flex-col gap-1 -mt-1" aria-label="Password requirements">
      {PASSWORD_RULES.map((rule) => {
        const ok = rule.test(value);
        const tone = !started ? 'text-ink-soft' : ok ? 'text-green' : 'text-red';
        return (
          <li key={rule.id} className={`text-[12px] font-semibold flex items-center gap-1.5 ${tone}`}>
            <span aria-hidden="true">{!started ? '○' : ok ? '✓' : '✕'}</span>
            {rule.label}
          </li>
        );
      })}
    </ul>
  );
}

export default function RegisterPage() {
  const { register } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const roleParam = searchParams.get('role');
  const initialRole: Role = isSelfRegisterRole(roleParam) ? roleParam : 'dealer';
  const [role, setRole] = useState<Role>(initialRole);
  const [form, setForm] = useState<RegisterForm>({
    username: '', password: '', businessName: '', owner: '', fullName: '', mobile: '', address: '',
  });
  const [errors, setErrors] = useState<FieldErrors<RegisterForm>>({});
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  function set<K extends keyof RegisterForm>(field: K, value: RegisterForm[K]) {
    setForm((f) => ({ ...f, [field]: value }));
    // Editing a field clears its own error straight away.
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  }

  // Validates on blur so a mistake is flagged the moment the person leaves the box.
  function checkField(field: keyof RegisterForm) {
    const found = validateRegistration(role, form)[field];
    setErrors((prev) => ({ ...prev, [field]: found }));
  }

  // Props shared by every text input: value, change, blur-validation, red border when invalid.
  function bind(field: keyof RegisterForm) {
    return {
      value: form[field],
      onChange: (e: { target: { value: string } }) => set(field, e.target.value),
      onBlur: () => checkField(field),
      'aria-invalid': errors[field] ? (true as const) : undefined,
    };
  }

  function focusFirstInvalid() {
    // After React has re-rendered with aria-invalid on the bad inputs.
    window.setTimeout(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const found = validateRegistration(role, form);
    setErrors(found);
    const problems = Object.values(found).filter((m): m is string => Boolean(m));
    if (problems.length > 0) {
      const shown = problems.slice(0, 3);
      const more = problems.length - shown.length;
      toast.error(
        problems.length === 1
          ? problems[0]
          : `Please fix the following:\n${shown.map((m) => `• ${m}`).join('\n')}${more > 0 ? `\n• …and ${more} more` : ''}`
      );
      focusFirstInvalid();
      return;
    }

    // Send only the fields that belong to this account type, trimmed.
    const base = { role, username: form.username.trim(), password: form.password, mobile: form.mobile.trim() };
    const payload: RegisterPayload =
      role === 'dealer'
        ? { ...base, businessName: form.businessName.trim(), owner: form.owner.trim(), address: form.address.trim() }
        : { ...base, fullName: form.fullName.trim() };

    setBusy(true);
    try {
      await register(payload);
      toast.success('Account created successfully. Welcome aboard!');
      navigate(ROLE_HOME[role] || '/verify');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Registration failed. Please try again.';
      if (err instanceof ApiRequestError) {
        // Pin server-side complaints (e.g. "username already taken") to the exact input.
        const fromServer: FieldErrors<RegisterForm> = {};
        (Object.keys(form) as (keyof RegisterForm)[]).forEach((field) => {
          if (err.fieldErrors[field]) fromServer[field] = err.fieldErrors[field];
        });
        if (err.status === 409) fromServer.username = message;
        if (Object.keys(fromServer).length > 0) {
          setErrors((prev) => ({ ...prev, ...fromServer }));
          focusFirstInvalid();
        }
      }
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page-simple">
      <div className="auth-form-card wide">
        <h1 className="text-[20px] font-semibold text-ink tracking-tightish mb-1">Create an account</h1>
        <p className="text-ink-soft text-[13px] mb-6 leading-relaxed">Dealers, sales reps, and customers can self-register here. Admin and Warehouse accounts are provisioned by the admin.</p>

        {/* noValidate: our own checks (with clear messages) run instead of the browser's generic bubbles. */}
        <form ref={formRef} onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <Field label="Account type">
            <Select
              value={role}
              onChange={(e) => {
                setRole(e.target.value as Role);
                setErrors({});
              }}
            >
              <option value="dealer">Dealer</option>
              <option value="salesrep">Sales Rep</option>
              <option value="customer">Customer</option>
            </Select>
          </Field>

          {role === 'dealer' ? (
            <>
              <Field label="Business name" error={errors.businessName}>
                <TextInput {...bind('businessName')} required />
              </Field>
              <Field label="Owner name" error={errors.owner}>
                <TextInput {...bind('owner')} required />
              </Field>
              <Field label="Business address" error={errors.address}>
                <TextInput {...bind('address')} required />
              </Field>
            </>
          ) : (
            <Field label="Full name" error={errors.fullName}>
              <TextInput {...bind('fullName')} required />
            </Field>
          )}

          {role === 'salesrep' && (
            <p className="text-[12px] text-ink-soft -mt-2">
              Your account is created with no dealers assigned and a 0-unit target — your team lead / admin will assign your dealers and set your monthly target.
            </p>
          )}

          <Field label="Mobile number" error={errors.mobile}>
            <TextInput
              {...bind('mobile')}
              // Digits only, max 10 — typing a space or letter simply doesn't register.
              onChange={(e) => set('mobile', e.target.value.replace(/\D/g, '').slice(0, 10))}
              inputMode="numeric"
              maxLength={10}
              placeholder="10-digit mobile number"
              required
            />
          </Field>
          <Field label="Choose a username" error={errors.username}>
            <TextInput {...bind('username')} autoComplete="username" placeholder="letters, numbers, . _ -" required />
          </Field>
          <Field label="Choose a password" error={errors.password}>
            <TextInput type="password" {...bind('password')} autoComplete="new-password" required />
          </Field>
          <PasswordChecklist value={form.password} />

          <Button type="submit" disabled={busy} className="w-full mt-2">
            {busy ? 'Creating…' : 'Create account'}
          </Button>
        </form>

        <p className="text-center text-[13px] text-ink-soft mt-5">
          Already have an account?{' '}
          <Link to="/login" className="text-blue font-semibold">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}