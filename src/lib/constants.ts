import type { ProductCatalogItem, Role } from '../types';

// ---------- ROLES & ACCESS ----------
// This map is the single source of truth for which routes/tabs each role sees.
// The backend should enforce the same rules server-side (never trust this
// client map alone) — treat it as UI convenience, not the security boundary.
export const ROLE_TABS: Record<Role, string[]> = {
  admin: ['mfg', 'wh', 'dash', 'acc'],
  warehouse: ['wh'],
  dealer: ['crm', 'portal'],
  salesrep: ['sales'],
  customer: ['verify'],
};

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Manufacturer / Admin',
  warehouse: 'Warehouse Staff',
  dealer: 'Dealer',
  salesrep: 'Sales Rep',
  customer: 'Customer',
};

export interface TabMeta {
  key: string;
  num: string;
  label: string;
  path: string;
}

export const TAB_META: TabMeta[] = [
  { key: 'mfg', num: '01', label: 'Manufacturing', path: '/manufacturing' },
  { key: 'wh', num: '02', label: 'Warehouse', path: '/warehouse' },
  { key: 'crm', num: '03', label: 'Dealer Sale', path: '/dealer-sale' },
  { key: 'verify', num: '04', label: 'Customer Verify', path: '/verify' },
  { key: 'dash', num: '05', label: 'Dashboard', path: '/dashboard' },
  { key: 'acc', num: '06', label: 'Accessories', path: '/accessories' },
  { key: 'portal', num: '07', label: 'Dealer Portal', path: '/dealer-portal' },
  { key: 'sales', num: '08', label: 'Sales Team', path: '/sales-team' },
];

export interface JourneyStage {
  key: string;
  label: string;
  icon: string;
}

// A tab is "in the journey" if it corresponds to a stage of the physical
// product (factory -> transit -> dealer -> sold). Used by the conveyor tracker.
export const JOURNEY_STAGES: JourneyStage[] = [
  { key: 'FACTORY', label: 'Factory Stock', icon: '🏭' },
  { key: 'TRANSIT', label: 'In Transit', icon: '🚚' },
  { key: 'DEALER', label: 'Dealer Stock', icon: '🏪' },
  { key: 'SOLD', label: 'Sold', icon: '✅' },
];

export const FACTORY_NAME = 'AcmePaints';

export interface CompanyInfo {
  manufacturedBy: string;
  website: string;
  address: string;
  email: string;
  helpline: string;
}

// Company info is the same for every product from this manufacturer, so
// the product-add form pre-fills these fields instead of asking the admin
// to retype them each time — see ManufacturingPage.tsx.
export const COMPANY_INFO: CompanyInfo = {
  manufacturedBy: 'AcmePaints',
  website: 'https://www.acmepaints.com/',
  address: 'Plot no.10, opp. Zero Degree Lounge, Isasani, Nagpur, Maharashtra 440019',
  email: 'info@acmepaints.com',
  helpline: '+91 94221 17922',
};

// ---------- PRODUCT MASTER ----------
// This is now seed data ONLY. The live, editable catalog lives in
// dataService.ts's in-memory `db.productCatalog` (and later, the backend's
// Products collection) — admins manage it directly from the Manufacturing
// page. Every item carries: name, item code, unit (L / KG / Pcs), the
// sizes it's available in (free-text, unit-appropriate), USP,
// manufactured-by, address, email, website, helpline.
//
// MRP is intentionally NOT stored on the product record — it's entered
// per batch on the Start Batch form, since the price for a given size can
// change between production runs. (Manufacturing Date is also per-batch
// for the same reason — the same product is made on many different dates.)
// Physical thermal label sizes for the TSC TTP-244 Pro used at the factory.
// The factory switches roll stock, so this is a list of presets (not one
// fixed size) — the Print Labels screen lets the admin pick whichever roll
// is currently loaded, and that choice drives the exact @page size sent to
// the printer driver plus the QR/label block sizing.
//
// IMPORTANT — width vs length: the TTP-244 Pro's print head is a maximum of
// 108mm (4.25") wide. That limit is physical, not a setting — a roll wider
// than that cannot pass under the head at all. So for a roll sold as
// "150mm x 100mm", the 100mm side MUST be loaded as the width and the 150mm
// side is the length that feeds through; add a new preset here rather than
// guessing the wrong way round.
export interface ThermalLabelPreset {
  key: string;
  label: string;
  width: number;
  height: number;
}

export const THERMAL_LABEL_PRESETS: ThermalLabelPreset[] = [
  { key: '50x100', label: '50mm × 100mm', width: 50, height: 100 },
  { key: '75x100', label: '75mm × 100mm', width: 75, height: 100 },
  // Sold/labelled as "150mm x 100mm" — loaded as 100mm width x 150mm length.
  { key: '100x150', label: '100mm × 150mm (your "150×100" roll)', width: 100, height: 150 },
];
export const DEFAULT_THERMAL_LABEL_KEY = '75x100';

export const SIZE_OPTIONS = ['20L', '10L', '4L', '1L'];
export const UNIT_OPTIONS = ['L', 'KG', 'Pcs'];
export const GST_RATE = 0.18; // 18% — used for order invoices

function seedProduct(itemCode: string, name: string, unit = 'L', sizes: string[] = SIZE_OPTIONS): ProductCatalogItem {
  return {
    itemCode,
    name,
    unit,
    sizes: [...sizes],
    usp: 'Update this product\'s USP / key information.',
    manufacturedBy: COMPANY_INFO.manufacturedBy,
    address: COMPANY_INFO.address,
    email: COMPANY_INFO.email,
    website: COMPANY_INFO.website,
    helpline: COMPANY_INFO.helpline,
  };
}

export const DEFAULT_PRODUCT_CATALOG: ProductCatalogItem[] = [
  seedProduct('AP-001', 'READY SHADE Premium Emulsion'),
  seedProduct('AP-002', 'NIVA Acrylic Emulsion'),
  seedProduct('AP-003', 'LAVISH Shine Luxury Emulsion'),
  seedProduct('AP-004', 'FINE COAT Water Base Primer'),
  seedProduct('AP-005', 'RIO SHINE Exterior Emulsion'),
  seedProduct('AP-006', 'NIVA Acrylic Distemper', 'KG', ['20KG', '10KG', '4KG', '1KG']),
  seedProduct('AP-007', 'DESIRE SHINE Interior Emulsion'),
  seedProduct('AP-008', 'DAMP PROTECT'),
  seedProduct('AP-009', 'RIO ULTRA Weatherproof'),
  seedProduct('AP-010', 'RIO Exterior Emulsion'),
  seedProduct('AP-011', 'ACME Wall Putty', 'KG', ['40KG']),
  seedProduct('AP-012', 'ACME Paints 24 Carat Gold', 'L', ['50ml', '100ml', '200ml', '500ml']),
  // Accessories — same batch/QR pipeline as paint, unit varies by product.
  seedProduct('AP-ACC-001', 'Paint Brush', 'Pcs', ['2 inch', '3 inch', '4 inch']),
  seedProduct('AP-ACC-002', 'Paint Roller', 'Pcs', ['7 inch', '9 inch']),
  seedProduct('AP-ACC-003', 'Thinner', 'L', ['500ml', '1L', '5L']),
  seedProduct('AP-ACC-004', 'Wall Putty', 'KG', ['5KG', '20KG', '40KG']),
  seedProduct('AP-ACC-005', 'Distemper', 'KG', ['20KG', '10KG', '4KG', '1KG']),
];

// ---------- ACCESSORIES CATALOG (Brushes / Rollers / Tools) ----------
// Shown on the Accessories page. Each entry is one named item + every size
// it comes in (rendered as a size dropdown/tag list on that row, and as a
// per-size choice when stocking in or selling — see AccessoriesPage.tsx).
// Grouping items this way (instead of one SKU per size) keeps the ~60-item
// catalog manageable: one row per product, sizes just add to that row.
export const ACCESSORY_CATEGORIES = [
  'Paint Brushes',
  'Rollers & Textures',
  'Other Tools & Accessories',
  'Thinner / Chemical',
  'Putty / Primer',
  'Other',
];

export interface AccessoryCatalogSeed {
  name: string;
  category: string;
  sizes: string[];
}

function accItem(name: string, category: string, sizes: string[] = []): AccessoryCatalogSeed {
  return { name, category, sizes };
}

export const DEFAULT_ACCESSORY_CATALOG: AccessoryCatalogSeed[] = [
  // ---- Paint Brushes ----
  accItem('AB-50', 'Paint Brushes', ['1"', '2"', '3"', '4"']),
  accItem('GREEN', 'Paint Brushes', ['4"']),
  accItem('RS NEW PAINTER', 'Paint Brushes', ['4"']),
  accItem('KINGFISHER', 'Paint Brushes', ['4"', '5"']),
  accItem('ACME-PAINTER', 'Paint Brushes', ['4"']),
  accItem('ULTIMA', 'Paint Brushes', ['3"', '4"', '5"', '6"']),
  accItem('B-22', 'Paint Brushes', ['4"']),
  accItem('PEPSI', 'Paint Brushes', ['4"']),
  accItem('555', 'Paint Brushes', ['5"']),
  accItem('555 (W)', 'Paint Brushes', ['4"']),
  accItem('B-44 (W)', 'Paint Brushes', ['4"']),
  accItem('HERO', 'Paint Brushes', ['4"']),
  accItem('B-44 (B)', 'Paint Brushes', ['1"', '1.5"', '2"', '2.5"', '3"', '4"']),
  accItem('GREEN PURE', 'Paint Brushes', ['4"']),
  accItem('DELUXE', 'Paint Brushes', ['1"', '2"', '3"', '4"']),
  accItem('RS-PAINTER', 'Paint Brushes', ['4"']),
  accItem('CHITRAHAR', 'Paint Brushes', ['4"']),
  accItem('111 (W)', 'Paint Brushes', ['1"', '1.5"', '2"', '2.5"', '3"', '4"']),
  accItem('CLASSMATE', 'Paint Brushes', ['1"', '3"']),
  accItem('B-44 (White)', 'Paint Brushes', ['3"']),
  accItem('111', 'Paint Brushes', ['3"']),
  accItem('CHAMPION', 'Paint Brushes', ['3"', '4"', '5"', '6"']),
  accItem('LION', 'Paint Brushes', ['3"', '4"']),
  accItem('RS SONA', 'Paint Brushes', ['4"']),
  accItem('JET-50', 'Paint Brushes', ['1"', '2"', '3"', '4"']),
  accItem('AB-40 PREMIUM', 'Paint Brushes', ['4"', '5"']),
  accItem('COCO', 'Paint Brushes', ['4"']),
  accItem('B-44', 'Paint Brushes', ['4"']),
  accItem('WRITING BRUSH', 'Paint Brushes', ['0-16 No.']),

  // ---- Rollers & Textures ----
  accItem('RAGGING ROLLER', 'Rollers & Textures', ['7"']),
  accItem('R-10', 'Rollers & Textures', ['5"']),
  accItem('UNIFIBER YELLOW LINE', 'Rollers & Textures', ['6"', '9"']),
  accItem('GREEN WHITE THREAD', 'Rollers & Textures', ['9"']),
  accItem('YELLO TEXTURE', 'Rollers & Textures', ['6"', '9"']),
  accItem('SPIKE ROLLER', 'Rollers & Textures', ['10"']),
  accItem('WHITE THREAD', 'Rollers & Textures', ['9"']),
  accItem('MICRO FIBRE ROLLER / MICRO FIBER / MICROFIBER', 'Rollers & Textures', ['2"', '4"', '6"', '9"']),
  accItem('YELLOW THREAD', 'Rollers & Textures', ['9"']),
  accItem('GREEN THREAD', 'Rollers & Textures', ['9"']),
  accItem('FLOWER', 'Rollers & Textures', ['9"']),
  accItem('VINTAGE', 'Rollers & Textures', ['9"']),
  accItem('TIGRE ROLLER', 'Rollers & Textures', ['9"']),
  accItem('WHITE SMOOTH', 'Rollers & Textures', ['9"']),
  accItem('WOOD GRAIN', 'Rollers & Textures', ['5"']),
  accItem('FOAM ROLLER', 'Rollers & Textures', ['2"', '3"', '4"', '6"']),

  // ---- Other Tools & Accessories ----
  accItem('SCRAPPER', 'Other Tools & Accessories', ['4"']),
  accItem('TRAY 1st & TRAY 2nd', 'Other Tools & Accessories', ['10"']),
  accItem('SPECTULA', 'Other Tools & Accessories', []),
  accItem('PUTTING PUTTY', 'Other Tools & Accessories', ['2"', '3"', '4"', '6"', '8"']),
  accItem('BANNER SET', 'Other Tools & Accessories', []),
  accItem('WIRE BRUSH', 'Other Tools & Accessories', ['5 & 6 Line']),
  accItem('PLASTIC TROWEL', 'Other Tools & Accessories', []),
  accItem('COMBING', 'Other Tools & Accessories', []),
  accItem('SANDING TROWEL', 'Other Tools & Accessories', []),
  accItem('ROLLER HANDLE', 'Other Tools & Accessories', ['2"', '3"', '4"', '5"', '6"', '9"']),
  accItem('ROLLER HANDLE LONG', 'Other Tools & Accessories', ['4"', '5"']),
];

export const STATUS_LABELS: Record<string, string> = {
  FACTORY: 'Factory',
  TRANSIT: 'In Transit',
  DEALER: 'Dealer Stock',
  SOLD: 'Sold',
  RETURNED: 'Returned',
};

// ---------- SHARED ROLE ROUTING ----------
// Where a logged-in user of each role lands after login/registration.
// Shared by App, LoginPage and RegisterPage so the destination is defined
// exactly once.
export const ROLE_HOME: Record<Role, string> = {
  admin: '/dashboard',
  warehouse: '/warehouse',
  dealer: '/dealer-sale',
  salesrep: '/sales-team',
  customer: '/verify',
};
