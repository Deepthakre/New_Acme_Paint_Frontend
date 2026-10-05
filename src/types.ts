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

export type WithdrawalStatus = 'PENDING' | 'PAID' | 'REJECTED';

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
  rewardClaimed?: boolean;
  rewardClaimedBy?: string;
  rewardClaimedAt?: string;
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

export interface Painter {
  id: string;
  name: string;
  mobile: string;
  upiId: string;
  city: string;
  state: string;
  experience: string;
  painterType: string;
  status: 'VERIFIED';
  walletBalance: number;
  totalEarned: number;
  totalWithdrawn: number;
  createdAt: string;
}

/** A painter who has claimed the bucket reward at least once (admin dashboard row). */
export interface RewardPainterRow extends Painter {
  claims: number;
  firstClaimedAt: string | null;
  lastClaimedAt: string | null;
}

export interface PainterRegistrationInput {
  name: string;
  mobile: string;
  upiId: string;
  city: string;
  state?: string;
  experience?: string;
  painterType?: string;
}

export interface Reward {
  id: string;
  painterId: string;
  productId: string;
  qrString: string;
  amount: number;
  type: 'BUCKET_REWARD';
  status: 'CREDITED';
  createdAt: string;
}

export interface Withdrawal {
  id: string;
  painterId: string;
  amount: number;
  upiId: string;
  status: WithdrawalStatus;
  transactionId: string | null;
  utr: string | null;
  requestedAt: string;
  paidAt: string | null;
}

export interface PainterDashboardData {
  painter: Painter;
  rewards: Reward[];
  withdrawals: Withdrawal[];
}

export interface VerifyRewardInfo {
  amount: number;
  eligible: boolean;
  claimed: boolean;
  claimedAt: string | null;
  mode: 'dealer_optional';
  reason: string | null;
}

export interface VerifyProductFound {
  found: true;
  product: Product;
  master: ProductCatalogItem;
  manufacturingDate: string | null;
  mrp: number | null;
  reward: VerifyRewardInfo;
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