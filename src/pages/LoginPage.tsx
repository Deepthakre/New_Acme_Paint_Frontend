import { useState, type FormEvent, type ReactElement } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ROLE_LABELS, ROLE_HOME } from '../lib/constants';
import { IconDroplet, IconEye, IconEyeOff } from '../components/ui/Icons';
import skavopLogo from '../../assets/skavop-logo.png';
import type { Role } from '../types';
import { useToast } from '../context/ToastContext';
const SELF_REGISTER_ROLES: Role[] = ['dealer', 'salesrep', 'customer'];

interface DemoAccount {
  label: string;
  role: Role;
  user: string;
  pass: string;
}

// Demo logins are for local development only; tree-shaken out of production.
const DEMO_ACCOUNTS: DemoAccount[] = !import.meta.env.DEV ? [] : [
  { label: 'Admin', role: 'admin', user: 'admin', pass: 'Admin@123' },
  { label: 'Warehouse', role: 'warehouse', user: 'warehouse', pass: 'Warehouse@123' },
  { label: 'Dealer', role: 'dealer', user: 'dealer1', pass: 'Dealer@123' },
  { label: 'Sales Rep', role: 'salesrep', user: 'salesrep1', pass: 'SalesRep@123' },
  { label: 'Customer', role: 'customer', user: 'customer1', pass: 'Customer@123' },
];

function RoleIcon({ role, className = 'w-4 h-4' }: { role: Role; className?: string }): ReactElement {
  const paths: Record<Role, ReactElement> = {
    admin: <path d="M12 2 4 5v6c0 5 3.4 8.7 8 9 4.6-.3 8-4 8-9V5l-8-3Z" />,
    warehouse: <path d="M3 10 12 4l9 6v9a1 1 0 0 1-1 1h-4v-6H8v6H4a1 1 0 0 1-1-1v-9Z" />,
    dealer: <path d="M3 7h6l2-2h2l2 2h6v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z" />,
    salesrep: <path d="M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7-1a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 20c.3-3.5 3-6 7-6s6.7 2.5 7 6M16 14c3 0 5.5 2 6 6" />,
    customer: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8c.4-4 3.3-7 7-7s6.6 3 7 7" />,
  };
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {paths[role]}
    </svg>
  );
}

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [role, setRole] = useState<Role>('admin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  function applyDemo(demo: DemoAccount) {
    setRole(demo.role);
    setUsername(demo.user);
    setPassword(demo.pass);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!username.trim() || !password) {
      toast.error(
        !username.trim() && !password ? 'Enter your username and password.' : !username.trim() ? 'Enter your username.' : 'Enter your password.'
      );
      return;
    }
    setBusy(true);
    try {
      const user = await login(username.trim(), password, role);
      toast.success(`Welcome back${user?.name ? `, ${user.name}` : ''}!`);
      navigate(ROLE_HOME[user?.role || role] || '/');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Login failed. Please check your credentials.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-modern-page">
      <section className="login-visual-panel">
        <div className="login-visual-glow login-glow-one" />
        <div className="login-visual-glow login-glow-two" />
        <div className="login-grid" />

        <div className="login-visual-content">
          <div className="login-brand-row">
            <div className="login-brand-mark"><IconDroplet className="w-6 h-6" strokeWidth={2} /></div>
            <div>
              <div className="login-brand-name">Acme<span>Paint(Version3)</span></div>
              <div className="login-brand-sub">Manufacturing Excellence</div>
            </div>
          </div>

          <div className="login-copy-block">
            <div className="login-kicker">PAINT MANUFACTURING PLATFORM</div>
            <h1>From every batch to every wall.</h1>
            <p>Manage production, inventory, dealers, sales and QR traceability from one connected workspace.</p>
          </div>

          <div className="paint-showcase" aria-hidden="true">
            <div className="paint-wall">
              <span className="paint-stroke stroke-teal" />
              <span className="paint-stroke stroke-blue" />
              <span className="paint-stroke stroke-orange" />
            </div>
            <div className="paint-can can-back"><span /></div>
            <div className="paint-can can-front"><span /></div>
            <div className="paint-roller"><i /><b /></div>
          </div>

          <div className="login-feature-row">
            <div><strong>Production</strong><span>Batch control</span></div>
            <div><strong>Traceability</strong><span>QR verification</span></div>
            <div><strong>Distribution</strong><span>Dealer operations</span></div>
          </div>
        </div>
      </section>

      <section className="login-form-panel">
        <div className="login-mobile-brand">
          <div className="login-brand-mark"><IconDroplet className="w-5 h-5" strokeWidth={2} /></div>
          <div>
            <div className="login-brand-name">Acme<span>Paint</span></div>
            <div className="login-brand-sub">Manufacturing Excellence</div>
          </div>
        </div>

        <div className="login-form-card">
          <div className="login-welcome">
            <div className="login-welcome-icon"><RoleIcon role={role} className="w-5 h-5" /></div>
            <div>
              <div className="login-small-label">{ROLE_LABELS[role]} PORTAL</div>
              <h2>Welcome back</h2>
              <p>Sign in to continue to your AcmePaint workspace.</p>
            </div>
          </div>

          <div className="login-role-switcher">
            {(Object.entries(ROLE_LABELS) as [Role, string][]).map(([key, label]) => {
              const isActive = role === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setRole(key)}
                  className={isActive ? 'active' : ''}
                  aria-pressed={isActive}
                >
                  <RoleIcon role={key} className="w-3.5 h-3.5" />
                  {label}
                </button>
              );
            })}
          </div>

          <form onSubmit={handleSubmit} noValidate className="login-fields">
            <div className="login-field">
              <label>Username / Email</label>
              <div className="login-input-wrap">
                <span className="login-input-icon">@</span>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your username"
                  required
                  autoFocus
                />
              </div>
            </div>

            <div className="login-field">
              <label>Password</label>
              <div className="login-input-wrap">
                <span className="login-input-icon">•</span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="login-password-toggle"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <IconEyeOff className="w-4 h-4" /> : <IconEye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={busy} className="login-submit">
              <span>{busy ? 'Authenticating…' : `Sign in as ${ROLE_LABELS[role]}`}</span>
              <span className="login-submit-arrow">→</span>
            </button>
          </form>

          <p className="login-account-note">
            {SELF_REGISTER_ROLES.includes(role) ? (
              <>New {ROLE_LABELS[role].toLowerCase()}? <Link to={`/register?role=${role}`}>Create an account</Link></>
            ) : (
              <>{ROLE_LABELS[role]} accounts are created by the admin — contact your administrator for access.</>
            )}
          </p>

          {DEMO_ACCOUNTS.length > 0 && (
          <div className="login-demo-section">
            <div className="login-demo-heading"><span>Quick demo access</span><em>Select a role</em></div>
            <div className="login-demo-grid">
              {DEMO_ACCOUNTS.map((demo) => {
                const isSelected = role === demo.role && username === demo.user;
                return (
                  <button
                    key={demo.user}
                    type="button"
                    onClick={() => applyDemo(demo)}
                    className={isSelected ? 'selected' : ''}
                  >
                    <RoleIcon role={demo.role} className="w-3.5 h-3.5" />
                    {demo.label}
                  </button>
                );
              })}
            </div>
          </div>
          )}

          <div className="login-secure-note">
            <span>✓</span> Secure access · AcmePaint manufacturing workspace
          </div>
        </div>

        <div className="login-footer">
          <span>© {new Date().getFullYear()} AcmePaints</span>
          <span>·</span>
          <a href="https://skavotech.in/" target="_blank" rel="noopener noreferrer">
            <img src={skavopLogo} alt="" /> Built by Skavop Tech
          </a>
        </div>
      </section>
    </div>
  );
}
