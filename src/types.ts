// ---------- SHARED DOMAIN TYPES ----------
// This is the single source of truth for the shapes flowing between pages
// and lib/dataService.ts. Keep it in sync with dataService's return shapes —
// when the real backend lands, these types become the frontend/backend
// contract (e.g. generated from an OpenAPI schema), so treat changes here
// as changes to that contract.

export type Role = 'admin' | 'warehouse' | 'dealer' | 'salesrep' | 'customer';

export type ProductStatus = 'FACTORY' | 'TRANSIT' | 'DEALER' | 'SOLD' | 'RETURNED';

export type QrMode = 'single' | 'multi';

export type OrderStatus = 'PENDING' | 'DISPATCHED' | 'REJECTED';

export type LedgerEntryType = 'CHARGE' | 'PAYMENT';

export type DispatchStatus = 'NOT_DISPATCHED' | 'PARTIALLY_DISPATCHED' | 'FULLY_DISPATCHED';

export type ReturnCondition = 'resellable' | 'damaged';

/**
 * A logged-in user. Fields are a superset across all roles (the server-side
 * shape a real backend would return per-role varies; here it's whichever
 * subset applies to `role`) — always narrow on `role` before reading a
 * role-specific field like `dealers` or `businessName`.
 */
export interface User {
  id: string;
  username: string;
  role: Role;
  name: string;
  mobile?: string;
  // dealer-only
  businessName?: string;
  owner?: string;
  address?: string;
  // salesrep-only
  target?: number;
  dealers?: string[];
}

export interface RegisterPayload {
  role: Role;
  username: string;
  password: string;
  businessName?: string;
  owner?: string;
  fullName?: string;
  mobile?: string;
  address?: string;
}

export interface DealerProfile {
  businessName: string;
  owner?: string;
  mobile?: string;
  address?: string;
}

export interface LogEntry {
  event: string;
  who: string;
  time: string;
  // Raw epoch ms alongside the display-formatted `time` above — `time` is a
  // locale string (no year/seconds) and isn't safely re-parseable, so
  // anything that needs to measure elapsed time (e.g. how long a unit sat
  // in TRANSIT) reads `ts` instead. Optional because older/unrelated log
  // entries were never given one.
  ts?: number;
}

export interface Product {
  qr: string;
  qrString: string;
  batchId: string;
  product: string;
  size: string;
  status: ProductStatus;
  active: boolean;
  holder: string;
  cartonId: string | null;
  log: LogEntry[];
  invoiceId?: string;
}

export interface Carton {
  id: string;
  qrString: string;
  batchId: string;
  product: string;
  size: string;
  unitsCount: number;
  qrList: string[];
}

export interface ProductCatalogItem {
  itemCode: string;
  name: string;
  unit: string;
  sizes: string[];
  usp: string;
  manufacturedBy: string;
  address: string;
  email: string;
  website: string;
  helpline: string;
}

export interface AccessoryItem {
  sku: string;
  name: string;
  category: string;
  sizes: string[];
  price: number;
  stock: number;
  reorder: number;
}

export interface Batch {
  id: string;
  product: string;
  size: string;
  unit: string;
  qty: number;
  qrMode: QrMode;
  unitsPerCarton: number | null;
  range: string;
  date: string;
  manufacturingDate: string;
  batchNo: string;
  uspCode: string;
  mrp: number;
  cartonRefs: string[];
}

export interface StartBatchPayload {
  product: string;
  size: string;
  qty: number;
  qrMode: QrMode;
  unitsPerCarton: number;
  manufacturingDate: string;
  mrp: number | string;
  batchNo: string;
  uspCode: string;
}

export interface BatchLabelsSingle {
  mode: 'single';
  batch: Batch;
  items: Product[];
}

export interface BatchLabelsMulti {
  mode: 'multi';
  batch: Batch;
  cartons: Carton[];
}

export type BatchLabels = BatchLabelsSingle | BatchLabelsMulti;

export interface ActivationResult {
  type: 'single' | 'carton';
  id?: string;
  activated: string[];
  alreadyActive: number;
}

export type BatchActivationSummary = Record<string, { total: number; active: number }>;

export interface DispatchOverviewRow {
  batchId: string;
  product: string;
  size: string;
  mrp: number;
  total: number;
  dispatched: number;
  undispatched: number;
  dispatchStatus: DispatchStatus;
}

export interface DispatchScanResult {
  type: 'single' | 'carton';
  id?: string;
  qrs: string[];
}

export interface ReceiveResultItem {
  qr: string;
  product: string;
  size: string;
}

export interface ConfirmReceiptResult {
  received: ReceiveResultItem[];
  shortage: ReceiveResultItem[];
  invoice: LedgerEntry | null;
}

export interface InvoiceLineItem {
  product: string;
  size: string;
  mrp: number;
  qty: number;
}

export interface LedgerEntry {
  dealer: string;
  type: LedgerEntryType;
  amount: number;
  note: string;
  subtotal?: number | null;
  gst?: number | null;
  gstRate?: number;
  items?: InvoiceLineItem[];
  invoiceId?: string;
  orderId?: string;
  date: string;
}

export interface OrderItem {
  product: string;
  size: string;
  qty: number;
  mrp: number | null;
}

export interface OrderItemInput {
  product: string;
  size: string;
  qty: number | string;
  mrp?: number | string | null;
}

export interface Order {
  id: string;
  dealer: string;
  items: OrderItem[];
  subtotal: number | null;
  gst: number | null;
  total: number | null;
  status: OrderStatus;
  bookedBy: string | null;
  invoiceId: string | null;
  date: string;
}

export interface DealerBalance {
  billed: number;
  paid: number;
  outstanding: number;
}

export interface DealerPaymentStatusRow extends DealerBalance {
  dealer: string;
}

export interface RateHistoryRow {
  product: string;
  size: string;
  qty: number;
  mrp: number;
  invoiceId?: string;
  date: string;
}

export interface DealerPurchaseHistory {
  orders: Order[];
  ledger: LedgerEntry[];
  invoices: LedgerEntry[];
  payments: LedgerEntry[];
  balance: DealerBalance;
  duration: { firstInvoiceDate: string; lastInvoiceDate: string; invoiceCount: number } | null;
  rateHistory: RateHistoryRow[];
}

export interface Voucher {
  id: string;
  dealer: string;
  mobile: string;
  code: string;
  discount: number;
  status: 'REDEEMED';
  date: string;
}

export interface DashboardStats {
  totalProduced: number;
  factory: number;
  transit: number;
  dealerStock: number;
  sold: number;
  totalBatches: number;
}

export interface VerifyProductFound {
  found: true;
  product: Product;
  master: ProductCatalogItem;
  manufacturingDate: string | null;
  mrp: number | null;
}

export interface VerifyProductNotFound {
  found: false;
}

export type VerifyProductResult = VerifyProductFound | VerifyProductNotFound;

export interface ProductLookup {
  qr: string;
  product: string;
  size: string;
  status: ProductStatus;
  holder: string;
}

export interface ScannedItem {
  qr: string;
  product?: string;
  size?: string;
  notFound?: boolean;
}

// A unit that's been dispatched (status TRANSIT) but the dealer hasn't yet
// confirmed receipt by scanning it — used by the Warehouse "Pending
// Delivery" screen so the manufacturer can see what's stuck and, if needed,
// mark it delivered manually.
export interface PendingDeliveryRow {
  qr: string;
  product: string;
  size: string;
  batchId: string;
  dealer: string;
  dispatchedAt: string;
  duration: string;
  flaggedShortage: boolean;
}
export interface VerifyProductNotFound {
  found: false;
  reason?: 'signature_mismatch';
}

// ---------- PAINTER REWARD PROGRAMME (barcode sticker -> automatic UPI payout) ----------
// Amounts are always integer PAISE on the wire (Rs 50 = 5000). Use formatPaise() to display.

export function formatPaise(paise: number | null | undefined): string {
  const v = (paise ?? 0) / 100;
  return `₹${Number.isInteger(v) ? v.toLocaleString('en-IN') : v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export type RewardClaimStatus = 'QUEUED' | 'PROCESSING' | 'PAID' | 'FAILED';
export type PainterStatus = 'ACTIVE' | 'BLOCKED';

/** What the painter typed last time - used to pre-fill the form. */
export interface SavedPainter {
  name: string;
  city: string;
  upiId: string;
}

export interface VerifiedSession {
  sessionToken: string;
  expiresInSeconds: number;
  painter: SavedPainter | null;
}

export interface CodeInfo {
  size: string;
  amountPaise: number;
}

export interface ClaimOutcome {
  claimId: string;
  status: RewardClaimStatus;
  amountPaise: number;
  size: string;
  upiId: string;
  failureReason: string | null;
  message: string;
}

/** One row of the painter's own history. */
export interface MyClaim {
  id: string;
  size: string;
  amountPaise: number;
  upiId: string;
  status: RewardClaimStatus;
  failureReason: string | null;
  payoutSeq: number;
  utr: string | null;
  paidAt: string | null;
  createdAt: string;
  message: string;
}

// ---- admin ----
export interface RewardRate {
  size: string;
  amountPaise: number;
  active: boolean;
}

export interface PrintableBarcode {
  serial: string;
  size: string;
  code: string;
}

export interface GenerateBarcodesResult {
  generated: number;
  label: string;
  size: string;
  amountPaise: number;
  codes: PrintableBarcode[];
}

export interface BarcodeRun {
  batchLabel: string;
  size: string;
  firstSerial: string;
  lastSerial: string;
  createdAt: string;
  ACTIVE: number;
  CLAIMED: number;
  VOID: number;
  total: number;
}

export interface RewardClaimRow {
  id: string;
  barcodeSerial: string;
  size: string;
  amountPaise: number;
  painterId: string;
  painterName: string;
  mobile: string;
  city: string;
  upiId: string;
  status: RewardClaimStatus;
  failureReason: string | null;
  payoutSeq: number;
  provider: string;
  utr: string | null;
  paidAt: string | null;
  attempts: number;
  needsReview: boolean;
  createdAt: string;
}

export interface PainterAdminRow {
  id: string;
  name: string;
  mobile: string;
  city: string;
  upiId: string;
  status: PainterStatus;
  claims: number;
  paidPaise: number;
  lastClaimAt: string | null;
  createdAt: string;
}

export interface RewardStats {
  provider: string;
  stickers: { ACTIVE: number; CLAIMED: number; VOID: number };
  painters: number;
  claimsToday: number;
  claimedTodayPaise: number;
  paid: { count: number; totalPaise: number };
  inProgress: { count: number; totalPaise: number };
  failed: { count: number; totalPaise: number };
  needsReview: number;
}
