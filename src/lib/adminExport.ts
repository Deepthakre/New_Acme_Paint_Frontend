import type ExcelJS from 'exceljs';
import * as api from './apiClient';
import type { DashboardStats } from '../types';

// ---------- BRAND PALETTE (matches tailwind.config.js) ----------
// Every sheet gets its own accent from this set, cycled in a fixed order so
// the workbook reads as one deliberately designed report rather than a pile
// of default-grey exports.
const PALETTE = {
  blue: '2C5F8A',
  ochre: 'C1622B',
  green: '3E7A57',
  red: 'B23A48',
  violet: '6C5A8C',
  ink: '1C2321',
  inkSoft: '5B655F',
  line: 'D7DDD8',
  bg: 'EEF1F0',
  white: 'FFFFFF',
};

const STATUS_COLORS: Record<string, string> = {
  FACTORY: PALETTE.blue,
  TRANSIT: PALETTE.ochre,
  DEALER: PALETTE.green,
  SOLD: PALETTE.violet,
  RETURNED: PALETTE.red,
  OK: PALETTE.green,
  LOW: PALETTE.ochre,
  OUT: PALETTE.red,
  PENDING: PALETTE.ochre,
  DISPATCHED: PALETTE.green,
  REJECTED: PALETTE.red,
  APPROVED: PALETTE.green,
  CREDITED: PALETTE.green,
  CHARGE: PALETTE.red,
  PAYMENT: PALETTE.green,
  FULLY_DISPATCHED: PALETTE.green,
  PARTIALLY_DISPATCHED: PALETTE.ochre,
  NOT_DISPATCHED: PALETTE.inkSoft,
};

// Renders an ISO timestamp as e.g. "21 Sep 2026, 04:15 pm" (or "—" when empty).
function fmtDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function argb(hex: string): string {
  return `FF${hex}`;
}

function tint(hex: string, amount: number): string {
  // Lighten a hex color toward white by `amount` (0–1) for banded rows.
  const num = parseInt(hex, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return [mix(r), mix(g), mix(b)].map((c) => c.toString(16).padStart(2, '0')).join('').toUpperCase();
}

// Styles a header row: solid accent fill, bold white text, thin borders,
// frozen so it stays visible while scrolling long sheets.
function styleHeader(ws: ExcelJS.Worksheet, accentHex: string): void {
  const header = ws.getRow(1);
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(accentHex) } };
    cell.font = { bold: true, color: { argb: argb(PALETTE.white) }, size: 11 };
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    cell.border = { bottom: { style: 'thin', color: { argb: argb(PALETTE.ink) } } };
  });
  header.height = 22;
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

// Bands every data row alternately, and gives the whole sheet a thin
// gridline so it looks intentional in Excel/Sheets rather than raw.
function bandRows(ws: ExcelJS.Worksheet, accentHex: string, startRow = 2): void {
  const bandColor = tint(accentHex, 0.88);
  for (let r = startRow; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const isBand = (r - startRow) % 2 === 1;
    row.eachCell({ includeEmpty: true }, (cell) => {
      if (isBand) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(bandColor) } };
      }
      cell.border = { bottom: { style: 'hair', color: { argb: argb(PALETTE.line) } } };
      if (cell.alignment == null) cell.alignment = { vertical: 'middle' };
    });
  }
}

// Colors any cell in a "status-like" column using STATUS_COLORS — small
// colored pill effect via bold colored text, so PENDING/OK/SOLD etc. pop
// out at a glance without needing conditional-formatting rules.
function colorStatusColumn(ws: ExcelJS.Worksheet, colLetter: string, startRow = 2): void {
  const col = ws.getColumn(colLetter);
  col.eachCell({ includeEmpty: false }, (cell, rowNumber) => {
    if (rowNumber < startRow) return;
    const key = String(cell.value || '').toUpperCase();
    const hex = STATUS_COLORS[key];
    if (hex) {
      cell.font = { bold: true, color: { argb: argb(hex) } };
    }
  });
}

function autoWidth(ws: ExcelJS.Worksheet, minWidth = 10, maxWidth = 42): void {
  ws.columns.forEach((col) => {
    let max = minWidth;
     if (!col?.eachCell) return;
    col.eachCell({ includeEmpty: true }, (cell) => {
      const len = String(cell.value ?? '').length;
      if (len > max) max = Math.min(len + 2, maxWidth);
    });
    col.width = max;
  });
}

interface ColumnDef {
  header: string;
  key: string;
  width?: number;
}

interface AddSheetOptions<T extends object> {
  name: string;
  accentHex: string;
  columns: ColumnDef[];
  rows: T[];
  currencyCols?: string[];
  statusCols?: string[];
}

// Adds a sheet from an array of { header, key, width?, currency?, statusCol? }
// column defs + row data, fully styled in one call. Generic over the row
// shape (rather than a plain Record) so callers can pass typed domain
// objects — e.g. DispatchOverviewRow[] — directly, without an intermediate
// spread/mapping step just to satisfy the sheet-writer's types.
function addSheet<T extends object>(wb: ExcelJS.Workbook, { name, accentHex, columns, rows, currencyCols = [], statusCols = [] }: AddSheetOptions<T>): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(name, {
    properties: { tabColor: { argb: argb(accentHex) } },
    pageSetup: { fitToPage: true, fitToWidth: 1 },
  });
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width || 16 }));
  // ExcelJS's addRow accepts arbitrary key/value data; our rows are plain
  // data objects (never class instances with methods), so this pass-through
  // is safe despite T not declaring an index signature itself.
  rows.forEach((r) => ws.addRow(r as unknown as Record<string, unknown>));

  currencyCols.forEach((key) => {
    const col = ws.getColumn(key);
    col.numFmt = '₹#,##0.00';
  });

  styleHeader(ws, accentHex);
  bandRows(ws, accentHex);
  statusCols.forEach((key) => colorStatusColumn(ws, key));
  autoWidth(ws);

  if (rows.length === 0) {
    ws.addRow({});
    ws.getCell('A2').value = 'No data yet.';
    ws.getCell('A2').font = { italic: true, color: { argb: argb(PALETTE.inkSoft) } };
  }

  return ws;
}

// A cover sheet — company name, report date, and a quick KPI summary in
// big colored stat tiles, so opening the file feels like a real report
// rather than a raw table dump.
function addCoverSheet(wb: ExcelJS.Workbook, stats: DashboardStats): ExcelJS.Worksheet {
  const ws = wb.addWorksheet('Overview', {
    properties: { tabColor: { argb: argb(PALETTE.ink) } },
  });
  ws.columns = [{ width: 4 }, { width: 26 }, { width: 26 }, { width: 26 }, { width: 26 }, { width: 26 }];

  ws.mergeCells('B2:F2');
  const title = ws.getCell('B2');
  title.value = 'Acme Paints — Full Admin Report';
  title.font = { bold: true, size: 20, color: { argb: argb(PALETTE.ink) } };

  ws.mergeCells('B3:F3');
  const sub = ws.getCell('B3');
  sub.value = `Generated ${new Date().toLocaleString('en-IN')}`;
  sub.font = { italic: true, size: 11, color: { argb: argb(PALETTE.inkSoft) } };

  const tiles = [
    { label: 'Total Produced', value: stats.totalProduced, color: PALETTE.blue },
    { label: 'In Factory', value: stats.factory, color: PALETTE.blue },
    { label: 'In Transit', value: stats.transit, color: PALETTE.ochre },
    { label: 'Dealer Stock', value: stats.dealerStock, color: PALETTE.green },
    { label: 'Sold', value: stats.sold, color: PALETTE.violet },
  ];

  let col = 2; // column B
  const row = 5;
  tiles.forEach((t) => {
    const colLetter = String.fromCharCode(64 + col);
    const cell = ws.getCell(`${colLetter}${row}`);
    cell.value = { richText: [{ font: { bold: true, size: 18, color: { argb: argb(PALETTE.white) } }, text: `${t.value}\n` }, { font: { size: 10, color: { argb: argb(PALETTE.white) } }, text: t.label }] };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(t.color) } };
    ws.getRow(row).height = 50;
    col += 1;
  });

  ws.mergeCells('B8:F8');
  const note = ws.getCell('B8');
  note.value = 'Every sheet below covers one module — Product Catalog, Accessories, Manufacturing Batches, Full Product Log (QR-level), Warehouse Dispatch, Shortage Report, Dealer Payment Status, Orders, and Invoices & Payments.';
  note.font = { size: 11, color: { argb: argb(PALETTE.inkSoft) } };
  note.alignment = { wrapText: true, vertical: 'top' };
  ws.getRow(8).height = 40;

  return ws;
}

// ---------- MAIN ENTRY POINT ----------
// Pulls every admin-facing module's data and writes one styled .xlsx —
// called from the Dashboard's "Download Full Admin Report" button.
export async function downloadAdminReport(): Promise<void> {
  // Lazy-loaded so the (fairly large) styling library only ever ships to
  // the admin who clicks this button, not to every dealer/customer bundle.
  const ExcelJSModule = (await import('exceljs')).default;
  const [
    stats,
    catalog,
    accessories,
    batches,
    activation,
    productLog,
    dispatchOverview,
    shortages,
    payments,
    orders,
    ledger,
    rewardPainters,
    rewards,  
  ] = await Promise.all([
    api.getDashboardStats(),
    api.listProductCatalog(),
    api.listAccessories(),
    api.listBatches(),
    api.getBatchActivationSummary(),
    api.getFullProductLog(),
    api.getDispatchOverview(),
    api.getShortages(),
    api.getAllDealersPaymentStatus(),
    api.listOrders(),
    api.getFullLedger(),
    api.getRewardPainters(),
    api.listAllRewards(),
  ]);

  const wb = new ExcelJSModule.Workbook();
  wb.creator = 'Acme Paints — Admin Dashboard';
  wb.created = new Date();

  addCoverSheet(wb, stats);

  // ---- Product Catalog ----
  addSheet(wb, {
    name: 'Product Catalog',
    accentHex: PALETTE.blue,
    columns: [
      { header: 'Item Code', key: 'itemCode', width: 14 },
      { header: 'Product Name', key: 'name', width: 28 },
      { header: 'Unit', key: 'unit', width: 10 },
      { header: 'Sizes', key: 'sizes', width: 30 },
      { header: 'Manufactured By', key: 'manufacturedBy', width: 20 },
    ],
    rows: catalog.map((p) => ({ ...p, sizes: (p.sizes || []).join(', ') })),
  });

  // ---- Accessories ----
  addSheet(wb, {
    name: 'Accessories',
    accentHex: PALETTE.violet,
    columns: [
      { header: 'SKU', key: 'sku', width: 12 },
      { header: 'Name', key: 'name', width: 26 },
      { header: 'Category', key: 'category', width: 22 },
      { header: 'Sizes', key: 'sizes', width: 30 },
      { header: 'Price (₹)', key: 'price', width: 12 },
      { header: 'Stock', key: 'stock', width: 10 },
      { header: 'Reorder Level', key: 'reorder', width: 14 },
      { header: 'Status', key: 'statusLabel', width: 12 },
    ],
    rows: accessories.map((a) => ({
      ...a,
      sizes: (a.sizes || []).join(', '),
      statusLabel: a.stock === 0 ? 'OUT' : a.stock <= a.reorder ? 'LOW' : 'OK',
    })),
    currencyCols: ['price'],
    statusCols: ['statusLabel'],
  });

  // ---- Manufacturing Batches ----
  addSheet(wb, {
    name: 'Batches',
    accentHex: PALETTE.blue,
    columns: [
      { header: 'Batch', key: 'id', width: 14 },
      { header: 'Product', key: 'product', width: 26 },
      { header: 'Size', key: 'size', width: 12 },
      { header: 'MRP (₹)', key: 'mrp', width: 12 },
      { header: 'Qty', key: 'qty', width: 10 },
      { header: 'QR Mode', key: 'qrModeLabel', width: 18 },
      { header: 'QR Range', key: 'range', width: 26 },
      { header: 'Mfg Date', key: 'manufacturingDate', width: 14 },
      { header: 'Activated', key: 'activatedLabel', width: 14 },
    ],
    rows: batches.map((b) => {
      const act = activation[b.id] || { total: b.qty, active: 0 };
      return {
        ...b,
        qrModeLabel: b.qrMode === 'multi' ? `Carton (${b.unitsPerCarton}/ctn)` : 'Single',
        activatedLabel: `${act.active} / ${act.total}`,
      };
    }),
    currencyCols: ['mrp'],
  });

  // ---- Full Product Log (QR-level) ----
  addSheet(wb, {
    name: 'Product Log',
    accentHex: PALETTE.ink,
    columns: [
      { header: 'QR', key: 'qr', width: 20 },
      { header: 'Batch', key: 'batchId', width: 14 },
      { header: 'Product', key: 'product', width: 26 },
      { header: 'Size', key: 'size', width: 12 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Holder', key: 'holder', width: 24 },
      { header: 'Active', key: 'activeLabel', width: 10 },
    ],
    rows: productLog.map((p) => ({ ...p, activeLabel: p.active ? 'Yes' : 'No' })),
    statusCols: ['status'],
  });

  // ---- Warehouse Dispatch Overview ----
  addSheet(wb, {
    name: 'Dispatch Overview',
    accentHex: PALETTE.ochre,
    columns: [
      { header: 'Batch', key: 'batchId', width: 14 },
      { header: 'Product', key: 'product', width: 26 },
      { header: 'Size', key: 'size', width: 12 },
      { header: 'MRP (₹)', key: 'mrp', width: 12 },
      { header: 'Total Units', key: 'total', width: 12 },
      { header: 'Dispatched', key: 'dispatched', width: 12 },
      { header: 'Undispatched', key: 'undispatched', width: 14 },
      { header: 'Status', key: 'dispatchStatus', width: 20 },
    ],
    rows: dispatchOverview,
    currencyCols: ['mrp'],
    statusCols: ['dispatchStatus'],
  });

  // ---- Shortage Report ----
  addSheet(wb, {
    name: 'Shortages',
    accentHex: PALETTE.red,
    columns: [
      { header: 'QR', key: 'qr', width: 20 },
      { header: 'Product', key: 'product', width: 26 },
      { header: 'Size', key: 'size', width: 12 },
      { header: 'Expected Holder', key: 'holder', width: 24 },
      { header: 'Status', key: 'status', width: 12 },
    ],
    rows: shortages,
    statusCols: ['status'],
  });

  // ---- Dealer Payment Status ----
  addSheet(wb, {
    name: 'Dealer Payments',
    accentHex: PALETTE.green,
    columns: [
      { header: 'Dealer', key: 'dealer', width: 28 },
      { header: 'Billed (₹)', key: 'billed', width: 14 },
      { header: 'Paid (₹)', key: 'paid', width: 14 },
      { header: 'Outstanding (₹)', key: 'outstanding', width: 16 },
    ],
    rows: payments,
    currencyCols: ['billed', 'paid', 'outstanding'],
  });

  // ---- Orders ----
  addSheet(wb, {
    name: 'Orders',
    accentHex: PALETTE.blue,
    columns: [
      { header: 'Order', key: 'id', width: 12 },
      { header: 'Dealer', key: 'dealer', width: 26 },
      { header: 'Booked By', key: 'bookedByLabel', width: 18 },
      { header: 'Items', key: 'itemsLabel', width: 44 },
      { header: 'Total (₹, incl. GST)', key: 'total', width: 18 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Invoice', key: 'invoiceId', width: 14 },
      { header: 'Date', key: 'date', width: 14 },
    ],
    rows: orders.map((o) => ({
      ...o,
      bookedByLabel: o.bookedBy || 'Self',
      itemsLabel: o.items.map((it) => `${it.product} (${it.size}) × ${it.qty}${it.mrp ? ` @ ₹${it.mrp}` : ''}`).join('; '),
      invoiceId: o.invoiceId || '—',
    })),
    currencyCols: ['total'],
    statusCols: ['status'],
  });

  // ---- Invoices & Payments (full ledger, every dealer) ----
  addSheet(wb, {
    name: 'Invoices & Payments',
    accentHex: PALETTE.violet,
    columns: [
      { header: 'Type', key: 'type', width: 10 },
      { header: 'Invoice', key: 'invoiceId', width: 12 },
      { header: 'Dealer', key: 'dealer', width: 26 },
      { header: 'Items', key: 'itemsLabel', width: 44 },
      { header: 'Amount (₹)', key: 'amount', width: 14 },
      { header: 'GST (₹)', key: 'gst', width: 12 },
      { header: 'Note', key: 'note', width: 30 },
      { header: 'Date', key: 'date', width: 14 },
    ],
    rows: ledger.map((l) => ({
      ...l,
      invoiceId: l.invoiceId || '—',
      itemsLabel: (l.items || []).map((it) => `${it.product} (${it.size}) × ${it.qty} @ ₹${it.mrp}`).join('; '),
    })),
    currencyCols: ['amount', 'gst'],
    statusCols: ['type'],
  });

    // ---- Painter Rewards (one row per painter who has claimed the ₹50 reward) ----
  addSheet(wb, {
    name: 'Painter Rewards',
    accentHex: PALETTE.ochre,
    columns: [
      { header: 'Painter ID', key: 'id', width: 18 },
      { header: 'Name', key: 'name', width: 24 },
      { header: 'Mobile', key: 'mobile', width: 14 },
      { header: 'City', key: 'city', width: 16 },
      { header: 'State', key: 'state', width: 16 },
      { header: 'Painter Type', key: 'painterType', width: 16 },
      { header: 'Experience', key: 'experience', width: 14 },
      { header: 'UPI ID', key: 'upiId', width: 26 },
      { header: 'Rewards Claimed', key: 'claims', width: 16 },
      { header: 'Total Earned (₹)', key: 'totalEarned', width: 16 },
      { header: 'Withdrawn (₹)', key: 'totalWithdrawn', width: 16 },
      { header: 'Wallet Balance (₹)', key: 'walletBalance', width: 18 },
      { header: 'First Claim', key: 'firstClaimLabel', width: 22 },
      { header: 'Last Claim', key: 'lastClaimLabel', width: 22 },
      { header: 'Registered On', key: 'registeredLabel', width: 22 },
    ],
    rows: rewardPainters.map((p) => ({
      ...p,
      firstClaimLabel: fmtDateTime(p.firstClaimedAt),
      lastClaimLabel: fmtDateTime(p.lastClaimedAt),
      registeredLabel: fmtDateTime(p.createdAt),
    })),
    currencyCols: ['totalEarned', 'totalWithdrawn', 'walletBalance'],
  });

  // ---- Reward Claims (one row per ₹50 claim, with the painter's details) ----
  const painterById = new Map(rewardPainters.map((p) => [p.id, p]));
  addSheet(wb, {
    name: 'Reward Claims',
    accentHex: PALETTE.green,
    columns: [
      { header: 'Reward ID', key: 'id', width: 18 },
      { header: 'Painter ID', key: 'painterId', width: 18 },
      { header: 'Painter Name', key: 'painterName', width: 24 },
      { header: 'Mobile', key: 'painterMobile', width: 14 },
      { header: 'UPI ID', key: 'painterUpi', width: 26 },
      { header: 'Bucket QR', key: 'productId', width: 20 },
      { header: 'Reward (₹)', key: 'amount', width: 12 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Claimed At', key: 'claimedLabel', width: 22 },
    ],
    rows: rewards.map((r) => {
      const p = painterById.get(r.painterId);
      return {
        ...r,
        painterName: p?.name ?? '—',
        painterMobile: p?.mobile ?? '—',
        painterUpi: p?.upiId ?? '—',
        claimedLabel: fmtDateTime(r.createdAt),
      };
    }),
    currencyCols: ['amount'],
    statusCols: ['status'],
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `acme-paints-admin-report-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
