// ---------- REAL API CLIENT (axios) ----------
// Real REST client. Every page imports its data functions from here.
//
// Env: set VITE_API_URL in your .env (e.g. VITE_API_URL=http://localhost:5000/api)

import axios, { AxiosError, type AxiosInstance } from 'axios';
import type {
  User,
  RegisterPayload,
  DealerProfile,
  Product,
  Carton,
  ProductCatalogItem,
  AccessoryItem,
  Batch,
  StartBatchPayload,
  BatchLabels,
  ActivationResult,
  BatchActivationSummary,
  DispatchOverviewRow,
  DispatchScanResult,
  ConfirmReceiptResult,
  LedgerEntry,
  Order,
  OrderItemInput,
  DealerBalance,
  DealerPaymentStatusRow,
  DealerPurchaseHistory,
  Voucher,
  DashboardStats,
  Painter,
  PainterRegistrationInput,
  Reward,
  Withdrawal,
  PainterDashboardData,
  VerifyProductResult,
  ProductLookup,
  ReturnCondition,
  Role,
  PendingDeliveryRow,
  RewardPainterRow,
} from '../types';

import { ApiRequestError, parseValidationIssues } from './apiError';

export { ApiRequestError };

export interface Pagination {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

// ---------- AXIOS INSTANCE ----------
// Dev falls back to localhost; a production build without VITE_API_URL is a
// deploy mistake, so fail loudly instead of silently calling localhost.
const BASE_URL: string =
  import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'https://new-acme-paint-backend-1.onrender.com/api' : '');
if (!BASE_URL) {
  throw new Error('VITE_API_URL is not set. Configure it in your production environment.');
}

export const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  withCredentials: true, // send the httpOnly refresh-token cookie
  timeout: 20000,
});

// In-memory access token (never localStorage — XSS-exposed storage would
// defeat the point of an httpOnly refresh cookie backing it).
let accessToken: string | null = null;
export function setAccessToken(token: string | null) {
  accessToken = token;
}
export function getAccessToken() {
  return accessToken;
}

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

// On a 401 (expired access token), try exactly one silent refresh via the
// cookie-backed /auth/refresh endpoint, then retry the original request.
let refreshPromise: Promise<string | null> | null = null;
async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = api
      .post('/auth/refresh')
      .then((res) => {
        const token = res.data?.data?.accessToken ?? null;
        setAccessToken(token);
        return token;
      })
      .catch(() => {
        setAccessToken(null);
        return null;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError<{ message?: string }>) => {
    const original = error.config as (typeof error.config & { _retry?: boolean }) | undefined;
    if (error.response?.status === 401 && original && !original._retry && !original.url?.includes('/auth/')) {
      original._retry = true;
      const token = await refreshAccessToken();
      if (token) {
        original.headers = original.headers ?? {};
        original.headers.Authorization = `Bearer ${token}`;
        return api.request(original);
      }
    }
    return Promise.reject(error);
  }
);

/**
 * Normalizes every failed request into an `ApiRequestError` (still a plain
 * `Error`, so existing `err.message` handling keeps working). Validation
 * failures now list WHAT was wrong ("Password must be at least 8
 * characters.") instead of just "Validation failed.", and carry a
 * per-field map for forms to highlight the exact input.
 */
function unwrapError(err: unknown): never {
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
    const message = messages.length ? messages.join('\n') : data?.message || err.message || 'Request failed.';
    throw new ApiRequestError(message, err.response.status, fieldErrors);
  }
  throw err;
}

async function get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  try {
    const res = await api.get(url, { params });
    return res.data.data as T;
  } catch (err) {
    return unwrapError(err);
  }
}

/** Same as `get`, but returns the full `{ data, pagination }` envelope for pages that want to add pagination controls. */
async function getPage<T>(url: string, params?: Record<string, unknown>): Promise<{ data: T[]; pagination: Pagination }> {
  try {
    const res = await api.get(url, { params });
    return { data: res.data.data, pagination: res.data.pagination };
  } catch (err) {
    return unwrapError(err);
  }
}

/** Fetches every page of a paginated list endpoint and concatenates them — used where the existing UI expects one flat array. Prefer `getPage` directly in any new/updated page that adds pagination controls. */
async function getAll<T>(url: string, params: Record<string, unknown> = {}): Promise<T[]> {
  const limit = 100;
  let page = 1;
  let all: T[] = [];
  while (true) {
    const { data, pagination } = await getPage<T>(url, { ...params, page, limit });
    all = all.concat(data);
    if (!pagination?.hasNextPage) break;
    page += 1;
  }
  return all;
}

async function post<T>(url: string, body?: unknown): Promise<T> {
  try {
    const res = await api.post(url, body);
    return res.data.data as T;
  } catch (err) {
    return unwrapError(err);
  }
}

async function put<T>(url: string, body?: unknown): Promise<T> {
  try {
    const res = await api.put(url, body);
    return res.data.data as T;
  } catch (err) {
    return unwrapError(err);
  }
}

async function del<T>(url: string): Promise<T> {
  try {
    const res = await api.delete(url);
    return res.data.data as T;
  } catch (err) {
    return unwrapError(err);
  }
}

// ---------- AUTH ----------
export async function login(username: string, password: string, role: Role): Promise<User> {
  const data = await post<{ user: User; accessToken: string }>('/auth/login', { username, password, role });
  setAccessToken(data.accessToken);
  return data.user;
}

export async function register(payload: RegisterPayload): Promise<User> {
  const data = await post<{ user: User; accessToken: string }>('/auth/register', payload);
  setAccessToken(data.accessToken);
  return data.user;
}

export async function logout(): Promise<void> {
  try {
    // The backend identifies the session from the httpOnly refresh cookie,
    // so this works even when the access token has already expired.
    await post('/auth/logout');
  } finally {
    setAccessToken(null);
  }
}

/** Silent session restore on app start: refresh cookie -> access token -> /auth/me. */
export async function restoreSession(): Promise<User | null> {
  const token = await refreshAccessToken();
  if (!token) return null;
  return fetchCurrentUser();
}

export async function fetchCurrentUser(): Promise<User | null> {
  try {
    return await get<User>('/auth/me');
  } catch {
    return null;
  }
}

export async function listKnownDealerNames(): Promise<string[]> {
  return get('/dealers/known-names');
}

export async function getDealerProfile(name: string): Promise<DealerProfile | null> {
  return get(`/auth/dealers/${encodeURIComponent(name)}/profile`);
}

export async function getSalesRep(name: string): Promise<User | null> {
  return get(`/auth/salesreps/${encodeURIComponent(name)}`);
}

// ---------- CATALOG ----------
export async function listProductCatalog(): Promise<ProductCatalogItem[]> {
  return getAll('/catalog');
}
export async function addProductCatalogItem(item: ProductCatalogItem): Promise<ProductCatalogItem> {
  return post('/catalog', item);
}
export async function updateProductCatalogItem(itemCode: string, updates: Partial<ProductCatalogItem>): Promise<ProductCatalogItem> {
  return put(`/catalog/${encodeURIComponent(itemCode)}`, updates);
}
export async function deleteProductCatalogItem(itemCode: string): Promise<boolean> {
  return del(`/catalog/${encodeURIComponent(itemCode)}`);
}

// ---------- MANUFACTURING ----------
export async function listBatches(): Promise<Batch[]> {
  return getAll('/manufacturing/batches');
}
export async function startBatch(payload: StartBatchPayload): Promise<Batch> {
  return post('/manufacturing/batches', payload);
}
export async function getBatchLabels(batchId: string): Promise<BatchLabels> {
  return get(`/manufacturing/batches/${encodeURIComponent(batchId)}/labels`);
}
export async function getCartonUnits(cartonId: string): Promise<{ carton: Carton; items: Product[] }> {
  return get(`/manufacturing/cartons/${encodeURIComponent(cartonId)}`);
}
export async function getBatchActivationSummary(): Promise<BatchActivationSummary> {
  return get('/manufacturing/batches/activation-summary');
}

// ---------- WAREHOUSE / PRODUCTS ----------
export async function listProducts(): Promise<Product[]> {
  return getAll('/warehouse/products');
}
export async function activateScan(qrOrCartonId: string): Promise<ActivationResult> {
  return post('/warehouse/products/activate', { qr: qrOrCartonId });
}
export async function deactivateProduct(qr: string): Promise<Product> {
  return post(`/warehouse/products/${encodeURIComponent(qr)}/deactivate`);
}
export async function getProductByQr(qr: string): Promise<ProductLookup | null> {
  return get(`/warehouse/products/${encodeURIComponent(qr)}`);
}
export async function getFullProductLog(): Promise<Product[]> {
  return getAll('/warehouse/products/full-log');
}

export async function getDispatchOverview(): Promise<DispatchOverviewRow[]> {
  return get('/warehouse/dispatch/overview');
}
export async function dispatchByQuantity(args: { batchId: string; qty: number; dealer: string }): Promise<string[]> {
  return post('/warehouse/dispatch/by-quantity', args);
}
export async function addDispatchScan(qrOrCartonId: string): Promise<DispatchScanResult> {
  return post('/warehouse/dispatch/scan', { qr: qrOrCartonId });
}
export async function confirmScanDispatch(args: { qrs: string[]; dealer: string }): Promise<string[]> {
  return post('/warehouse/dispatch/confirm-scan', args);
}

export async function confirmReceipt(args: { dealer: string; qrs: string[] }): Promise<ConfirmReceiptResult> {
  return post('/warehouse/receive/confirm', args);
}
export async function getShortages(): Promise<Product[]> {
  return getAll('/warehouse/receive/shortages');
}
export async function getPendingDeliveries(): Promise<PendingDeliveryRow[]> {
  return getAll('/warehouse/receive/pending-deliveries');
}
export async function forceConfirmDelivery(args: { qrs: string[]; confirmedBy: string }): Promise<ConfirmReceiptResult> {
  return post('/warehouse/receive/force-confirm', { qrs: args.qrs });
}


// ---------- DEALER CRM ----------
export async function getDealerStock(dealer: string): Promise<Product[]> {
  return getAll(`/dealers/${encodeURIComponent(dealer)}/stock`);
}
export async function getInvoiceById(invoiceId: string): Promise<LedgerEntry | null> {
  return get(`/dealers/invoices/${encodeURIComponent(invoiceId)}`);
}
export async function sellToCustomer(args: { qr: string; dealer: string; customerName?: string }): Promise<Product> {
  return post('/dealers/sell', args);
}
export async function processReturn(args: { qr: string; reason: string; condition: ReturnCondition; dealer: string }): Promise<Product> {
  return post('/dealers/return', args);
}
export async function getDealerPurchaseHistory(dealer: string): Promise<DealerPurchaseHistory> {
  return get(`/dealers/${encodeURIComponent(dealer)}/purchase-history`);
}
export async function getAllDealersPaymentStatus(): Promise<DealerPaymentStatusRow[]> {
  return getAll('/dealers/payment-status');
}

// ---------- VERIFY (public) ----------
export async function verifyProduct(qrString: string): Promise<VerifyProductResult> {
  return get('/verify', { qr: qrString });
}

// ---------- PAINTERS ----------
export async function registerPainter(payload: PainterRegistrationInput): Promise<{ painter: Painter; existing: boolean }> {
  return post('/painters/register', payload);
}
export async function getPainterDashboard(painterId: string): Promise<PainterDashboardData> {
  return get(`/painters/${encodeURIComponent(painterId)}/dashboard`);
}
export async function claimPainterReward(args: { painterId: string; qrString: string }): Promise<{ reward: Reward; painter: Painter }> {
  return post('/painters/claim-reward', args);
}
export async function requestPainterWithdrawal(args: { painterId: string; amount: number }): Promise<{ withdrawal: Withdrawal; painter: Painter }> {
  return post(`/painters/${encodeURIComponent(args.painterId)}/withdraw`, { amount: args.amount });
}
export async function getPainterByMobile(mobile: string): Promise<Painter | null> {
  return get(`/painters/by-mobile/${encodeURIComponent(mobile)}`);
}

// ---------- ACCESSORIES ----------
export async function listAccessories(): Promise<AccessoryItem[]> {
  return getAll('/accessories');
}
export async function addAccessoryItem(item: Omit<AccessoryItem, 'sku'>): Promise<AccessoryItem> {
  return post('/accessories', item);
}
export async function updateAccessoryItem(args: { sku: string; updates: Partial<AccessoryItem> }): Promise<AccessoryItem> {
  return put(`/accessories/${encodeURIComponent(args.sku)}`, args.updates);
}
export async function stockInAccessory(args: { sku: string; qty: number; source?: string }): Promise<AccessoryItem> {
  return post(`/accessories/${encodeURIComponent(args.sku)}/stock-in`, { qty: args.qty, source: args.source });
}
export async function sellAccessory(args: { sku: string; qty: number; customer?: string }): Promise<AccessoryItem> {
  return post(`/accessories/${encodeURIComponent(args.sku)}/sell`, { qty: args.qty, customer: args.customer });
}

// ---------- ORDERS ----------
export async function listOrders(): Promise<Order[]> {
  return getAll('/orders');
}
export async function placeOrder(args: { dealer: string; items: OrderItemInput[]; bookedBy?: string | null }): Promise<Order> {
  return post('/orders', args);
}
export async function decideOrder(args: { orderId: string; decision: 'approve' | 'reject' }): Promise<Order> {
  return post(`/orders/${encodeURIComponent(args.orderId)}/decision`, { decision: args.decision });
}

// ---------- LEDGER ----------
export async function getLedger(dealer: string): Promise<LedgerEntry[]> {
  return getAll(`/ledger/${encodeURIComponent(dealer)}`);
}
export async function getFullLedger(): Promise<LedgerEntry[]> {
  return getAll('/ledger');
}
export async function recordCharge(args: { dealer: string; amount: number; note: string; subtotal?: number; gst?: number }): Promise<LedgerEntry> {
  return post('/ledger/charge', args);
}
export async function recordPayment(args: { dealer: string; amount: number; note?: string }): Promise<LedgerEntry> {
  return post('/ledger/payment', args);
}
export async function getDealerBalance(dealer: string): Promise<DealerBalance> {
  return get(`/ledger/${encodeURIComponent(dealer)}/balance`);
}

// ---------- VOUCHERS ----------
export async function sendVoucherOtp(): Promise<{ sent: boolean; expiresInSeconds: number }> {
  return post('/vouchers/send-otp');
}
export async function redeemVoucher(args: { code: string; discount: number; otp: string }): Promise<Voucher> {
  return post('/vouchers/redeem', args);
}
export async function listVouchers(dealer: string): Promise<Voucher[]> {
  return getAll(`/vouchers/${encodeURIComponent(dealer)}`);
}

// ---------- DASHBOARD ----------
export async function getDashboardStats(): Promise<DashboardStats> {
  return get('/dashboard/stats');
}

// Admin only: every painter who has claimed the reward, and every individual claim (used by the Excel report).
export async function getRewardPainters(): Promise<RewardPainterRow[]> {
  return getAll('/painters/admin/reward-painters');
}
export async function listAllRewards(): Promise<Reward[]> {
  return getAll('/painters/admin/rewards');
}

// ---------- PAGINATED VARIANTS (for pages you upgrade to real pagination controls) ----------
// Same URL, but returns { data, pagination } instead of a flattened array —
// use these when you add page/limit controls to a list view instead of
// loading every page up front like the getAll()-based helpers above do.
export const paged = {
  products: (params: { page?: number; limit?: number; sort?: string; search?: string; active?: boolean; status?: string; batchId?: string; holder?: string }) =>
  getPage<Product>('/warehouse/products', params),
  batches: (params: { page?: number; limit?: number }) => getPage<Batch>('/manufacturing/batches', params),
  orders: (params: { page?: number; limit?: number; dealer?: string; status?: string }) => getPage<Order>('/orders', params),
  ledger: (dealer: string, params: { page?: number; limit?: number }) => getPage<LedgerEntry>(`/ledger/${encodeURIComponent(dealer)}`, params),
  accessories: (params: { page?: number; limit?: number; category?: string; search?: string }) => getPage<AccessoryItem>('/accessories', params),
  catalog: (params: { page?: number; limit?: number; search?: string }) => getPage<ProductCatalogItem>('/catalog', params),
  dealerStock: (dealer: string, params: { page?: number; limit?: number }) => getPage<Product>(`/dealers/${encodeURIComponent(dealer)}/stock`, params),
  dealerPaymentStatus: (params: { page?: number; limit?: number }) => getPage<DealerPaymentStatusRow>('/dealers/payment-status', params),
  vouchers: (dealer: string, params: { page?: number; limit?: number }) => getPage<Voucher>(`/vouchers/${encodeURIComponent(dealer)}`, params),
  pendingDeliveries: (params: { page?: number; limit?: number }) => getPage<PendingDeliveryRow>('/warehouse/receive/pending-deliveries', params),
  shortages: (params: { page?: number; limit?: number }) => getPage<Product>('/warehouse/receive/shortages', params),
  fullProductLog: (params: { page?: number; limit?: number; sort?: string; search?: string; status?: string }) =>getPage<Product>('/warehouse/products/full-log', params),
  rewardPainters: (params: { page?: number; limit?: number; search?: string }) =>getPage<RewardPainterRow>('/painters/admin/reward-painters', params),
};
