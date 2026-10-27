// Painter-facing API client. Deliberately SEPARATE from the staff client in
// apiClient.ts: its own axios instance, its own in-memory access token and its
// own refresh cookie (/api/painters), so a painter session and a staff session
// can never leak into each other.
import axios, { AxiosError } from 'axios';
import { api as staffApi, ApiRequestError } from './apiClient';
import { parseValidationIssues } from './apiError';
import type {
  PainterProfile,
  PainterVerifyResult,
  PainterRegistrationInput,
  WalletSummary,
  WalletEntry,
  Payout,
  RedeemResult,
} from '../types';

const painterHttp = axios.create({
  baseURL: staffApi.defaults.baseURL,
  withCredentials: true,
  timeout: 20000,
});

let accessToken: string | null = null;
export function setPainterToken(t: string | null) {
  accessToken = t;
}

// Stable anonymous device id: lets the server notice one phone farming many accounts.
export function getDeviceId(): string {
  try {
    let id = localStorage.getItem('acme-device-id');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('acme-device-id', id);
    }
    return id;
  } catch {
    return 'unknown-device';
  }
}

painterHttp.interceptors.request.use((config) => {
  config.headers = config.headers ?? {};
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  config.headers['X-Device-Id'] = getDeviceId();
  return config;
});

let refreshing: Promise<string | null> | null = null;
async function refreshToken(): Promise<string | null> {
  if (!refreshing) {
    refreshing = painterHttp
      .post('/painters/refresh')
      .then((r) => {
        accessToken = r.data?.data?.accessToken ?? null;
        return accessToken;
      })
      .catch(() => {
        accessToken = null;
        return null;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

painterHttp.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as (typeof error.config & { _retry?: boolean }) | undefined;
    if (error.response?.status === 401 && original && !original._retry && !original.url?.includes('/painters/otp') && !original.url?.includes('/painters/refresh')) {
      original._retry = true;
      const t = await refreshToken();
      if (t) {
        original.headers = original.headers ?? {};
        original.headers.Authorization = `Bearer ${t}`;
        return painterHttp.request(original);
      }
    }
    return Promise.reject(error);
  }
);

function fail(err: unknown): never {
  if (axios.isAxiosError(err)) {
    if (!err.response) throw new ApiRequestError('Cannot reach the server. Please check your internet connection and try again.');
    const data = err.response.data as { message?: string; errors?: unknown } | undefined;
    const { messages, fieldErrors } = parseValidationIssues(data?.errors);
    throw new ApiRequestError(messages.length ? messages.join('\n') : data?.message || 'Request failed.', err.response.status, fieldErrors);
  }
  throw err;
}

async function call<T>(fn: () => Promise<{ data: { data: T } }>): Promise<T> {
  try {
    return (await fn()).data.data;
  } catch (e) {
    return fail(e);
  }
}

export const painterApi = {
  sendOtp: (mobile: string) => call<{ sent: boolean; expiresInSeconds: number }>(() => painterHttp.post('/painters/otp/send', { mobile })),

  async verifyOtp(mobile: string, otp: string, profile?: PainterRegistrationInput): Promise<PainterVerifyResult> {
    const data = await call<PainterVerifyResult & { accessToken?: string }>(() => painterHttp.post('/painters/otp/verify', { mobile, otp, ...profile }));
    if (data.accessToken) accessToken = data.accessToken;
    return data;
  },

  /** Silent session restore after a page reload (refresh cookie -> new access token). */
  async restore(): Promise<PainterProfile | null> {
    try {
      const r = await painterHttp.post('/painters/refresh');
      accessToken = r.data?.data?.accessToken ?? null;
      return (r.data?.data?.painter as PainterProfile) ?? null;
    } catch {
      accessToken = null;
      return null;
    }
  },

  async logout(): Promise<void> {
    try {
      await painterHttp.post('/painters/logout');
    } finally {
      accessToken = null;
    }
  },

  me: () => call<PainterProfile>(() => painterHttp.get('/painters/me')),
  updateUpi: (upiId: string) => call<PainterProfile>(() => painterHttp.put('/painters/me/upi', { upiId })),

  /** code = inner QR (lid), bucketQrId = the QR ID printed on the outer label, upiId = where the money goes. */
  redeem: (code: string, bucketQrId: string, upiId: string) =>
    call<RedeemResult>(() => painterHttp.post('/rewards/redeem', { code, bucketQrId, ...(upiId ? { upiId } : {}) })),

  wallet: () => call<WalletSummary>(() => painterHttp.get('/wallet')),
  ledger: (page = 1) => painterHttp.get('/wallet/ledger', { params: { page, limit: 20 } }).then((r) => r.data as { data: WalletEntry[]; pagination: { hasNextPage: boolean } }).catch(fail),
  payouts: (page = 1) => painterHttp.get('/wallet/payouts', { params: { page, limit: 20 } }).then((r) => r.data as { data: Payout[]; pagination: { hasNextPage: boolean } }).catch(fail),

  /** The Idempotency-Key is generated ONCE per click of the button, so a retry of the same request can never pay twice. */
  withdraw: (amountPaise: number, idempotencyKey: string) =>
    call<{ payout: Payout; replay: boolean }>(() => painterHttp.post('/wallet/withdraw', { amountPaise }, { headers: { 'Idempotency-Key': idempotencyKey } })),
};
