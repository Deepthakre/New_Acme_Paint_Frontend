import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ROLE_TABS, ROLE_LABELS, TAB_META } from '../../lib/constants';
import {
  IconFactory, IconWarehouse, IconStorefront, IconShieldCheck, IconGauge,
  IconBoxes, IconClipboardList, IconUsers, IconLogOut, IconDroplet, IconX,
} from '../ui/Icons';

const TAB_ICONS: Record<string, (props: { className?: string }) => ReactNode> = {
  mfg: IconFactory, wh: IconWarehouse, crm: IconStorefront, verify: IconShieldCheck,
  dash: IconGauge, acc: IconBoxes, portal: IconClipboardList, sales: IconUsers,
};

export default function TopBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  // Modal a11y: focus Cancel (the safe action) on open, close on Escape.
  useEffect(() => {
    if (!showLogoutConfirm) return;
    cancelBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loggingOut) setShowLogoutConfirm(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showLogoutConfirm, loggingOut]);

  if (!user) return null;

  const allowedKeys = ROLE_TABS[user.role] || [];
  const tabs = TAB_META.filter((t) => allowedKeys.includes(t.key));

  function requestLogout() {
    setShowLogoutConfirm(true);
  }

  async function confirmLogout() {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
      setShowLogoutConfirm(false);
      navigate('/login', { replace: true });
    }
  }

  const current = tabs.find((t) => location.pathname === t.path || location.pathname.startsWith(`${t.path}/`));

  return (
    <>
      <aside className={`app-sidebar no-print ${open ? 'mobile-open' : ''}`}>
        <div className="sidebar-brand">
          <div className="brand-mark"><IconDroplet className="w-5 h-5" strokeWidth={2.2} /></div>
          <div>
            <div className="brand-name">Acme<span>Paint</span></div>
            <div className="brand-sub">MANUFACTURING OS</div>
          </div>
          <button className="sidebar-close lg:hidden" onClick={() => setOpen(false)} aria-label="Close navigation">
            <IconX className="w-4 h-4" />
          </button>
        </div>

        <div className="sidebar-section-label">WORKSPACE</div>
        <nav className="sidebar-nav">
          {tabs.map((t) => {
            const Icon = TAB_ICONS[t.key];
            return (
              <NavLink
                key={t.key}
                to={t.path}
                onClick={() => setOpen(false)}
                className={({ isActive }) => `sidebar-link ${isActive ? 'is-active' : ''}`}
              >
                <span className="sidebar-icon">{Icon && <Icon className="w-[18px] h-[18px]" />}</span>
                <span>{t.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-spacer" />
        <div className="sidebar-profile">
          <div className="avatar">{user.name?.slice(0, 1).toUpperCase() || 'U'}</div>
          <div className="profile-copy">
            <div className="profile-name">{user.name}</div>
            <div className="profile-role">{ROLE_LABELS[user.role]}</div>
          </div>
          <button onClick={requestLogout} className="logout-icon" aria-label="Log out" title="Log out">
            <IconLogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      <div className="mobile-topbar no-print">
        <button className="mobile-menu" onClick={() => setOpen(true)} aria-label="Open navigation">
          <span /><span /><span />
        </button>
        <div className="mobile-title">
          <div className="brand-mark small"><IconDroplet className="w-4 h-4" /></div>
          <div>
            <div className="brand-name">Acme<span>Paint</span></div>
            <div className="mobile-page">{current?.label || 'Workspace'}</div>
          </div>
        </div>
        <button onClick={requestLogout} className="mobile-logout" aria-label="Log out">
          <IconLogOut className="w-4 h-4" />
        </button>
      </div>

      {open && <button className="mobile-scrim no-print" aria-label="Close navigation" onClick={() => setOpen(false)} />}

      {showLogoutConfirm && (
        <div className="logout-confirm-backdrop no-print" role="presentation" onMouseDown={(e) => {
          if (e.target === e.currentTarget && !loggingOut) setShowLogoutConfirm(false);
        }}>
          <div className="logout-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="logout-confirm-title">
            <div className="logout-confirm-icon">
              <IconLogOut className="w-5 h-5" />
            </div>
            <button
              type="button"
              className="logout-confirm-close"
              aria-label="Close logout confirmation"
              onClick={() => setShowLogoutConfirm(false)}
            >
              <IconX className="w-4 h-4" />
            </button>
            <h2 id="logout-confirm-title">Logout from AcmePaint?</h2>
            <p>Are you sure you want to sign out of your current session?</p>
            <div className="logout-confirm-actions">
              <button ref={cancelBtnRef} type="button" className="logout-cancel-btn" disabled={loggingOut} onClick={() => setShowLogoutConfirm(false)}>
                Cancel
              </button>
              <button type="button" className="logout-confirm-btn" disabled={loggingOut} onClick={confirmLogout}>
                {loggingOut ? 'Logging out…' : 'Yes, Logout'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
