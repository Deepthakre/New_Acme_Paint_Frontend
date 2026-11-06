// Painter-facing reward API. Deliberately SEPARATE from the staff client in apiClient.ts: its own axios
// instance and its own in-memory session, so a painter's verification and a staff login can never mix.
//
// There is no painter account / password / cookie. The painter proves their mobile number with an OTP and
// gets a short-lived session token (kept in memory only - a page reload simply asks for the OTP again).
import axios from 'axios';
import { api as staffApi, ApiRequestError } from './apiClient';
import { parseValidationIssues } from './apiError';
import type { ClaimOutcome, CodeInfo, MyClaim, SavedPainter, VerifiedSession } from '../types';

const http = axios.create({ baseURL: staffApi.defaults.baseURL, timeout: 25000 });

export interface PainterSession {
  token: string;
  mobile: string;
  expiresAt: number; // epoch ms
  saved: SavedPainter | null;
}
let session: PainterSession | null = null;

/** The current verified session, or null once it has expired. */
export function getSession(): PainterSession | null {
  if (session && session.expiresAt <= Date.now()) session = null;
  return session;
}
export function clearSession(): void {
  session = null;
}

// Stable anonymous id of this phone's browser - lets the server notice one phone being used for many mobiles.
function getDeviceId(): string {
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

http.interceptors.request.use((config) => {
  config.headers = config.headers ?? {};
  if (session) config.headers.Authorization = `Bearer ${session.token}`;
  config.headers['X-Device-Id'] = getDeviceId();
  return config;
});

function fail(err: unknown): never {
  if (axios.isAxiosError(err)) {
    if (!err.response) {
      throw new ApiRequestError(
        err.code === 'ECONNABORTED'
          ? 'The server took too long to respond. Please try again.'
          : 'Cannot reach the server. Please check your internet connection and try again.'
      );
    }
    const data = err.response.data as { message?: string; errors?: unknown } | undefined;
    const { messages, fieldErrors } = parseValidationIssues(data?.errors);
    if (err.response.status === 401) clearSession();
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

export const rewardApi = {
  sendOtp: (mobile: string) => call<{ sent: boolean; expiresInSeconds: number }>(() => http.post('/rewards/otp/send', { mobile })),

  async verifyOtp(mobile: string, otp: string): Promise<PainterSession> {
    const data = await call<VerifiedSession>(() => http.post('/rewards/otp/verify', { mobile, otp }));
    session = { token: data.sessionToken, mobile, expiresAt: Date.now() + data.expiresInSeconds * 1000 - 5000, saved: data.painter };
    return session;
  },

  /** "This sticker is worth ₹X" - asked right after the OTP. */
  check: (code: string) => call<CodeInfo>(() => http.post('/rewards/check', { code })),

  /** Claim: the money is sent to the UPI ID automatically. */
  claim: (input: { code: string; name: string; city: string; upiId: string }) => call<ClaimOutcome>(() => http.post('/rewards/claim', input)),

  async claims(page = 1): Promise<{ data: MyClaim[]; totalPaidPaise: number; pagination: { hasNextPage: boolean } }> {
    try {
      const r = await http.get('/rewards/claims', { params: { page, limit: 20 } });
      return r.data;
    } catch (e) {
      return fail(e);
    }
  },

  /** Payout failed (usually a wrong UPI ID) - fix it and send again. */
  retry: (claimId: string, upiId: string) => call<ClaimOutcome>(() => http.post(`/rewards/claims/${encodeURIComponent(claimId)}/retry`, { upiId })),
};

export const UPI_RE = /^[a-z0-9._-]{2,64}@[a-z][a-z0-9.-]{1,40}$/;
