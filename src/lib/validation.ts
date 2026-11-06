import type { Role } from '../types';

export interface RegisterForm {
  username: string;
  password: string;
  businessName: string;
  owner: string;
  fullName: string;
  mobile: string;
  address: string;
}

export type FieldErrors<T> = Partial<Record<keyof T, string>>;

// Mirrors the server's password policy (validators/auth.validators.ts) so a
// person hears about a weak password BEFORE the request is sent. The server
// still enforces it regardless.
export const PASSWORD_RULES = [
  { id: 'len', label: 'At least 8 characters', message: 'Password must be at least 8 characters.', test: (v: string) => v.length >= 8 },
  { id: 'letter', label: 'At least one letter', message: 'Password must contain at least one letter.', test: (v: string) => /[A-Za-z]/.test(v) },
  { id: 'number', label: 'At least one number', message: 'Password must contain at least one number.', test: (v: string) => /[0-9]/.test(v) },
];

export function validateRegistration(role: Role, f: RegisterForm): FieldErrors<RegisterForm> {
  const e: FieldErrors<RegisterForm> = {};

  if (role === 'dealer') {
    const business = f.businessName.trim();
    if (!business) e.businessName = 'Business name is required.';
    else if (business.length > 150) e.businessName = 'Business name must be 150 characters or fewer.';

    const owner = f.owner.trim();
    if (!owner) e.owner = 'Owner name is required.';
    else if (owner.length > 120) e.owner = 'Owner name must be 120 characters or fewer.';

    const address = f.address.trim();
    if (!address) e.address = 'Business address is required.';
    else if (address.length > 300) e.address = 'Business address must be 300 characters or fewer.';
  } else {
    const full = f.fullName.trim();
    if (!full) e.fullName = 'Full name is required.';
    else if (full.length > 120) e.fullName = 'Full name must be 120 characters or fewer.';
  }

  const mobile = f.mobile.trim();
  if (!mobile) e.mobile = 'Mobile number is required.';
  else if (!/^\d{10}$/.test(mobile)) e.mobile = 'Enter a valid 10-digit mobile number.';

  const username = f.username.trim();
  if (!username) e.username = 'Choose a username.';
  else if (username.length < 3) e.username = 'Username must be at least 3 characters.';
  else if (username.length > 40) e.username = 'Username must be 40 characters or fewer.';
  else if (!/^[a-z0-9._-]+$/i.test(username)) e.username = 'Username can only contain letters, numbers, dots, underscores and hyphens (no spaces).';

  if (!f.password) {
    e.password = 'Choose a password.';
  } else {
    const failed = PASSWORD_RULES.find((r) => !r.test(f.password));
    if (failed) e.password = failed.message;
    else if (f.password.length > 128) e.password = 'Password must be 128 characters or fewer.';
  }

  return e;
}