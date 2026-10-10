import { useEffect, useState, useCallback, useRef, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import * as XLSX from 'xlsx';
import PageShell from '../../components/layout/PageShell';
import { Panel, Table, Flash, Modal } from '../../components/ui/Misc';
import { Field, Select, NumberInput, TextInput } from '../../components/ui/Field';
import Button, { LinkButton } from '../../components/ui/Button';
import QrScanner from '../../components/ui/QrScanner';
import * as api from '../../lib/apiClient';
import { verifyUrl, extractScannedId } from '../../lib/qr';
import { printThermalLabels } from '../../lib/printLabels';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import {
  COMPANY_INFO,
  UNIT_OPTIONS,
  ACCESSORY_CATEGORIES,
  THERMAL_LABEL_PRESETS,
  DEFAULT_THERMAL_LABEL_KEY,
} from '../../lib/constants';
import type {
  AccessoryItem,
  ActivationResult,
  Batch,
  BatchActivationSummary,
  BatchLabels,
  Carton,
  Product,
  ProductCatalogItem,
} from '../../types';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// Batch No is always today's date reduced to just the day-of-month — no
// year, no month, e.g. the 8th of any month always reads "08". It's set
// automatically (not typed in) since it always tracks the current date.
function currentBatchNo(): string {
  return String(new Date().getDate()).padStart(2, '0');
}

type ManufacturingTab = 'batch' | 'products' | 'activate';

export default function ManufacturingPage() {
  const [tab, setTab] = useState<ManufacturingTab>('batch');
  const [catalog, setCatalog] = useState<ProductCatalogItem[]>([]);
  const [accessories, setAccessories] = useState<AccessoryItem[]>([]);

  const refreshCatalog = useCallback(async () => {
    setCatalog(await api.listProductCatalog());
  }, []);
  const refreshAccessories = useCallback(async () => {
    setAccessories(await api.listAccessories());
  }, []);
  useEffect(() => {
    refreshCatalog();
    refreshAccessories();
  }, [refreshCatalog, refreshAccessories]);

  return (
    <PageShell>
      <section className="mfg-hero no-print">
        <div className="mfg-hero-copy">
          <div className="mfg-hero-eyebrow"><span className="mfg-hero-dot" /> PRODUCTION CONTROL</div>
          <h1>Manufacturing &amp; QR Operations</h1>
          <p>Start production batches, manage your paint catalogue and activate factory QR labels from one focused workspace.</p>
          <div className="mfg-hero-meta">
            <span><i /> Factory workflow active</span>
            <span>QR labels remain inactive until scanned</span>
          </div>
        </div>
        <div className="mfg-hero-art" aria-hidden="true">
          <div className="mfg-paint-swipe swipe-one" />
          <div className="mfg-paint-swipe swipe-two" />
          <div className="mfg-can can-one"><span /></div>
          <div className="mfg-can can-two"><span /></div>
          <div className="mfg-roller"><b /><i /></div>
        </div>
      </section>

      <div className="mfg-tabs no-print" role="tablist" aria-label="Manufacturing sections">
        {(
          [
            ['batch', 'Start Batch'],
            ['products', 'Manage Products'],
            ['activate', 'Activate QR'],
          ] as [ManufacturingTab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            role="tab"
            aria-selected={tab === key}
            className={`mfg-tab ${tab === key ? 'is-active' : ''}`}
          >
            <span className={`mfg-tab-icon ${key}`} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {tab === 'batch' && <BatchPanel catalog={catalog} accessories={accessories} />}
      {tab === 'products' && (
        <section className="mfg-products-workspace" aria-label="Product catalogue management">
          <div className="mfg-products-intro">
            <div className="mfg-products-intro-icon" aria-hidden="true">▦</div>
            <div>
              <div className="mfg-products-kicker">PRODUCT CATALOGUE</div>
              <h2>Manage your paint products</h2>
              <p>Create and maintain product masters, pack sizes and manufacturer information used throughout production and QR workflows.</p>
            </div>
            <div className="mfg-products-count"><strong>{catalog.length}</strong><span>products</span></div>
          </div>
          <AddProductPanel onChanged={refreshCatalog} />
          <ProductListPanel catalog={catalog} onChanged={refreshCatalog} />
        </section>
      )}
      {tab === 'activate' && <ActivatePanel />}
    </PageShell>
  );
}

interface BatchableItem {
  key: string;
  name: string;
  sizes: string[];
  unit: string;
  catalogItem: ProductCatalogItem | null;
}

interface BatchableGroup {
  category: string;
  items: BatchableItem[];
}

// A single item the "Start a Production Batch" form can produce a QR run
// for — either a Product Master entry (paint) or an Accessories catalog
// entry (brush / roller / tool). Both are shaped the same way here so the
// Category → Item → Size cascade below can treat them identically.
function buildBatchableGroups(catalog: ProductCatalogItem[], accessories: AccessoryItem[]): BatchableGroup[] {
  const groups: BatchableGroup[] = [
    {
      category: 'Paints',
      items: catalog.map((p) => ({
        key: p.itemCode,
        name: p.name,
        sizes: p.sizes,
        unit: p.unit || 'L',
        catalogItem: p,
      })),
    },
  ];
  ACCESSORY_CATEGORIES.forEach((cat) => {
    const items: BatchableItem[] = accessories
      .filter((a) => a.category === cat)
      .map((a) => ({
        key: a.sku,
        name: a.name,
        sizes: a.sizes && a.sizes.length ? a.sizes : ['Standard'],
        unit: 'Pcs',
        catalogItem: null,
      }));
    if (items.length) groups.push({ category: cat, items });
  });
  return groups.filter((g) => g.items.length);
}

// ---------- START BATCH + BATCH HISTORY ----------
// MRP is entered right here, per batch/size — not stored on the product
// record — since the price for a given size can change between production
// runs.
function BatchPanel({ catalog, accessories }: { catalog: ProductCatalogItem[]; accessories: AccessoryItem[] }) {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [activation, setActivation] = useState<BatchActivationSummary>({});
  const groups = buildBatchableGroups(catalog, accessories);
  const [category, setCategory] = useState('');
  const [product, setProduct] = useState('');
  const [size, setSize] = useState('');
  const [mrp, setMrp] = useState<number | string>('');
  const [qty, setQty] = useState(100);
  const [manufacturingDate, setManufacturingDate] = useState(todayIso());
  const [batchNo] = useState(currentBatchNo); // always today's date, day-only — never hand-edited
  const [uspCode, setUspCode] = useState('');
  const [qrMode, setQrMode] = useState<'single' | 'multi'>('single');
  const [unitsPerCarton, setUnitsPerCarton] = useState(12);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [labelBatch, setLabelBatch] = useState<BatchLabels | null>(null);

  const currentGroup = groups.find((g) => g.category === category);
  const currentItem = currentGroup?.items.find((i) => i.name === product);
  const availableSizes = currentItem?.sizes || [];

  const refresh = useCallback(async () => {
    setBatches(await api.listBatches());
    setActivation(await api.getBatchActivationSummary());
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Default to the first category/item/size once data has loaded, and
  // whenever a category is picked for the first time.
  useEffect(() => {
    if (groups.length && !category) {
      const g = groups[0];
      setCategory(g.category);
      setProduct(g.items[0]?.name || '');
      setSize(g.items[0]?.sizes[0] || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups.length, category]);

  function handleCategoryChange(cat: string) {
    setCategory(cat);
    const g = groups.find((x) => x.category === cat);
    const firstItem = g?.items[0];
    setProduct(firstItem?.name || '');
    setSize(firstItem?.sizes[0] || '');
    setMrp('');
  }

  function handleProductChange(name: string) {
    setProduct(name);
    const item = currentGroup?.items.find((i) => i.name === name);
    setSize(item?.sizes[0] || '');
    setMrp('');
  }

  function handleSizeChange(newSize: string) {
    setSize(newSize);
    setMrp('');
  }

  async function handleStartBatch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setMsg('');
    setBusy(true);
    try {
      const batch = await api.startBatch({
        product, size, qty: Number(qty), qrMode, unitsPerCarton: Number(unitsPerCarton), manufacturingDate, mrp, batchNo, uspCode,
      });
      setMsg(`Batch ${batch.id} started — ${batch.qty} units @ ₹${batch.mrp}, QR range ${batch.range}. All units are INACTIVE until scanned on the Activate QR tab.`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start batch.');
    } finally {
      setBusy(false);
    }
  }

  async function openLabels(batchId: string) {
    const data = await api.getBatchLabels(batchId);
    setLabelBatch(data);
  }

  function exportBatchesExcel() {
    const rows = batches.map((b) => {
      const act = activation[b.id] || { total: b.qty, active: 0 };
      return {
        Batch: b.id,
        'Batch No': b.batchNo || '',
        Product: b.product,
        Size: b.size,
        MRP: b.mrp,
        Qty: b.qty,
        'QR Mode': b.qrMode === 'multi' ? `Carton (${b.unitsPerCarton}/ctn)` : 'Single',
        'QR Range': b.range,
        'Mfg Date': b.manufacturingDate,
        'USP Code': b.uspCode || '',
        Activated: `${act.active} / ${act.total}`,
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Batches');
    XLSX.writeFile(wb, 'trackpaint-batches.xlsx');
  }

  return (
    <>
      <Panel
        title="Start a Production Batch"
        subtitle="Every unit gets a factory-signed QR the moment the batch is confirmed — but stays INACTIVE until scanned on the Activate QR tab, so a damaged or lost label can never enter transit. Pick a category first — brushes, rollers and tools get their own item + size list, just like paints do."
      >
        <br />
        <Flash kind="err">{error}</Flash>
        <Flash kind="ok">{msg}</Flash>
        {groups.length === 0 ? (
          <p className="text-sm text-ink-soft">
            No products yet — switch to the <strong>Manage Products</strong> tab above to add one before starting a batch.
          </p>
        ) : (
          <form onSubmit={handleStartBatch} className="flex flex-wrap gap-x-6 gap-y-5 items-end">
            <Field label="Category">
              <Select value={category} onChange={(e) => handleCategoryChange(e.target.value)}>
                {groups.map((g) => (
                  <option key={g.category} value={g.category}>{g.category}</option>
                ))}
              </Select>
            </Field>
            <Field label={category === 'Paints' ? 'Product' : 'Item'}>
              <Select value={product} onChange={(e) => handleProductChange(e.target.value)}>
                {currentGroup?.items.map((i) => (
                  <option key={i.key} value={i.name}>{i.name}</option>
                ))}
              </Select>
            </Field>
            <Field label={category === 'Paints' ? 'Pack size' : 'Size'}>
              <Select value={size} onChange={(e) => handleSizeChange(e.target.value)}>
                {availableSizes.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </Select>
            </Field>
            <Field label="MRP for this size (₹)">
              <NumberInput min={1} placeholder="e.g. 6499" value={mrp} onChange={(e) => setMrp(e.target.value)} required />
            </Field>
            <Field label="Quantity">
              <NumberInput min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} required />
            </Field>
            <Field label="Manufacturing Date">
              <TextInput type="date" value={manufacturingDate} onChange={(e) => setManufacturingDate(e.target.value)} required />
            </Field>
            <Field label="Batch No">
              <TextInput value={batchNo} readOnly title="Always today's date, day only — set automatically" />
            </Field>
            <Field label="USP Code">
              <TextInput placeholder="Enter USP code" value={uspCode} onChange={(e) => setUspCode(e.target.value)} />
            </Field>
            <Field label="QR mode">
              <Select value={qrMode} onChange={(e) => setQrMode(e.target.value as 'single' | 'multi')}>
                <option value="single">Single-piece QR</option>
                <option value="multi">Carton QR (multi-unit)</option>
              </Select>
            </Field>
            {qrMode === 'multi' && (
              <Field label="Units per carton">
                <NumberInput min={1} value={unitsPerCarton} onChange={(e) => setUnitsPerCarton(Number(e.target.value))} required />
              </Field>
            )}
            <Button type="submit" variant="green" disabled={busy}>
              {busy ? 'Generating QR…' : 'Start Batch'}
            </Button>
          </form>
        )}
      </Panel>

      <Panel
        title="Batch History"
        actions={
          batches.length > 0 && (
            <LinkButton onClick={exportBatchesExcel}>Export Batches (Excel)</LinkButton>
          )
        }
      >
        <Table
          columns={['Batch', 'Batch No', 'Product', 'Size', 'MRP', 'Qty', 'QR Mode', 'QR Range', 'Mfg Date', 'USP Code', 'Activated', '']}
          isEmpty={batches.length === 0}
          emptyLabel="No batches produced yet."
        >
          {batches
            .slice()
            .reverse()
            .map((b) => {
              const act = activation[b.id] || { total: b.qty, active: 0 };
              return (
                <tr key={b.id} className="border-b border-line">
                  <td className="py-2 px-2.5 mono">{b.id}</td>
                  <td className="py-2 px-2.5 mono">{b.batchNo || '—'}</td>
                  <td className="py-2 px-2.5">{b.product}</td>
                  <td className="py-2 px-2.5">{b.size}</td>
                  <td className="py-2 px-2.5">₹{b.mrp}</td>
                  <td className="py-2 px-2.5">{b.qty}</td>
                  <td className="py-2 px-2.5">{b.qrMode === 'multi' ? `Carton (${b.unitsPerCarton}/ctn)` : 'Single'}</td>
                  <td className="py-2 px-2.5 mono text-[11px]">{b.range}</td>
                  <td className="py-2 px-2.5 text-ink-soft">{b.manufacturingDate}</td>
                  <td className="py-2 px-2.5">{b.uspCode || '—'}</td>
                  <td className="py-2 px-2.5">
                    <span className={act.active === act.total ? 'text-green font-semibold' : 'text-ochre font-semibold'}>
                      {act.active} / {act.total}
                    </span>
                  </td>
                  <td className="py-2 px-2.5">
                    <LinkButton onClick={() => openLabels(b.id)}>Print labels</LinkButton>
                  </td>
                </tr>
              );
            })}
        </Table>
      </Panel>

      {labelBatch && (
        <LabelSheet
          data={labelBatch}
          catalogItem={catalog.find((p) => p.name === labelBatch.batch.product) || null}
          onClose={() => setLabelBatch(null)}
        />
      )}
    </>
  );
}

type LabelRotation = 0 | 90 | 270;

// Shared label-paper settings for the label print dialogs: a preset (or a custom
// size typed in mm) plus an optional rotation for printers that print sideways.
function useLabelPaper() {
  const [key, setKey] = useState(DEFAULT_THERMAL_LABEL_KEY);
  // null = "Auto": use the rotation built into the chosen label preset.
  const [rotationOverride, setRotationOverride] = useState<LabelRotation | null>(null);
  const [customW, setCustomW] = useState('100');
  const [customH, setCustomH] = useState('75');
  const preset = THERMAL_LABEL_PRESETS.find((p) => p.key === key) || THERMAL_LABEL_PRESETS[0];
  const isCustom = key === 'custom';
  const rotation: LabelRotation = rotationOverride ?? (isCustom ? 0 : preset.rotation ?? 0);
  const width = isCustom ? Math.max(20, Number(customW) || 100) : preset.width;
  const height = isCustom ? Math.max(20, Number(customH) || 75) : preset.height;
  const paper = { width, height, rotation };
  const controls = (
    <div className="flex flex-wrap items-end gap-3">
      <Field label="Label size (roll in printer)">
        <Select
          value={key}
          onChange={(e) => {
            setKey(e.target.value);
            setRotationOverride(null);
          }}
        >
          {THERMAL_LABEL_PRESETS.map((p) => (
            <option key={p.key} value={p.key}>{p.label}</option>
          ))}
          <option value="custom">Custom size (type in mm)…</option>
        </Select>
      </Field>
      {isCustom && (
        <>
          <Field label="Width (mm)">
            <NumberInput value={customW} min={20} onChange={(e) => setCustomW(e.target.value)} style={{ width: 90 }} />
          </Field>
          <Field label="Height (mm)">
            <NumberInput value={customH} min={20} onChange={(e) => setCustomH(e.target.value)} style={{ width: 90 }} />
          </Field>
        </>
      )}
      <Field label="Rotate print (only if it comes out the wrong way)">
        <Select
          value={rotationOverride === null ? 'auto' : String(rotationOverride)}
          onChange={(e) => setRotationOverride(e.target.value === 'auto' ? null : (Number(e.target.value) as LabelRotation))}
        >
          <option value="auto">Auto (recommended)</option>
          <option value="0">No rotation</option>
          <option value="90">Rotate 90° right</option>
          <option value="270">Rotate 90° left</option>
        </Select>
      </Field>
    </div>
  );
  return { paper, controls };
}

interface LabelInfoRowsProps {
  catalogItem: ProductCatalogItem | null;
  batch: Batch;
  size: string;
  qrId: string;
}

// A single label's key-value info block — shared by the unit label and the
// individual-QR-inside-a-carton view so both print the same full detail set.
// `catalogItem` is null for accessories (brushes/rollers/tools aren't in the
// Product Master), so those fall back to the company's own details — same
// manufacturer info that already prints on every paint label.
function buildLabelRows(catalogItem: ProductCatalogItem | null, batch: Batch, size: string, qrId: string): [string, string][] {
  return [
    ['QR ID', qrId],
    ['Product Name', batch.product],
    ['Item Code', catalogItem?.itemCode || '—'],
    ['Batch No', batch.batchNo || '—'],
    ['USP No', batch.uspCode || '—'],
    ['Size / Qty', size],
    ['MRP', batch.mrp ? `₹${batch.mrp}` : '—'],
    ['Mfg Date', batch.manufacturingDate],
    ['Manufactured By', catalogItem?.manufacturedBy || COMPANY_INFO.manufacturedBy],
    ['Address', catalogItem?.address || COMPANY_INFO.address],
    ['Email', catalogItem?.email || COMPANY_INFO.email],
    ['Website', catalogItem?.website || COMPANY_INFO.website],
    ['Helpline', catalogItem?.helpline || COMPANY_INFO.helpline],
  ];
}

function LabelInfoRows({ catalogItem, batch, size, qrId }: LabelInfoRowsProps) {
  const rows = buildLabelRows(catalogItem, batch, size, qrId);
  return (
    <div className="text-[10px] leading-snug w-full">
      {rows.map(([k, v]) => (
        <div key={k} className="flex gap-1">
          <span className="font-semibold text-ink-soft flex-shrink-0">{k}:</span>
          <span className="text-ink break-words">{v}</span>
        </div>
      ))}
    </div>
  );
}

function LabelSheet({ data, catalogItem, onClose }: { data: BatchLabels; catalogItem: ProductCatalogItem | null; onClose: () => void }) {
  const items: (Carton | Product)[] = data.mode === 'multi' ? data.cartons : data.items;
  const [individualFor, setIndividualFor] = useState<string | null>(null);
  const { paper: labelSize, controls: paperControls } = useLabelPaper();

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 print:static print:bg-transparent print:block print:p-0">
      <div className="bg-white rounded-2xl w-full max-w-[900px] max-h-[85vh] overflow-y-auto p-6 print:max-h-none print:overflow-visible print:max-w-none print:p-0">
        <div className="flex justify-between items-center mb-4 no-print">
          <h3 className="text-lg m-0">
            {data.batch.id} — {items.length} {data.mode === 'multi' ? 'carton' : 'unit'} labels
          </h3>
          <div className="flex gap-2">
            <Button
              variant="blue"
              onClick={() =>
                printThermalLabels(
                  items.map((it) => {
                    const id = 'id' in it ? it.id : it.qr;
                    return {
                      qrValue: verifyUrl(it.qrString),
                      rows: buildLabelRows(catalogItem, data.batch, data.batch.size, id),
                      footer: data.mode === 'multi' && 'unitsCount' in it ? `${it.unitsCount} units in this carton` : undefined,
                    };
                  }),
                  labelSize
                )
              }
            >
              Print
            </Button>
            <Button
              variant="blue"
              onClick={() => {
                const it = items[0];
                if (!it) return;
                const id = 'id' in it ? it.id : it.qr;
                printThermalLabels(
                  [
                    {
                      qrValue: verifyUrl(it.qrString),
                      rows: buildLabelRows(catalogItem, data.batch, data.batch.size, id),
                      footer: data.mode === 'multi' && 'unitsCount' in it ? `${it.unitsCount} units in this carton` : undefined,
                    },
                  ],
                  labelSize
                );
              }}
            >
              Test print (1 label)
            </Button>
            <LinkButton onClick={onClose}>Close</LinkButton>
          </div>
        </div>
        <div className="mb-3 no-print">
          {paperControls}
          <p className="text-xs text-ink-soft mt-2">
            QR and all details print together on ONE label. In the print dialog set Paper size = your label size
            (75 x 100 mm for the default), Margins = None, Scale = 100%. Use "Test print (1 label)" first. If text
            reads upside-down, set Rotate print to the other direction; if it is cut, type your roll's exact size
            under Custom size.
          </p>
        </div>
        <div className="print-area thermal-label-sheet grid grid-cols-2 gap-4">
          {items.map((it) => {
            const id = 'id' in it ? it.id : it.qr;
            return (
              <div key={id} className="thermal-label border border-line rounded-lg p-3 flex gap-3">
                <QRCodeSVG value={verifyUrl(it.qrString)} size={110} className="flex-shrink-0" />
                <div className="label-info flex-1 min-w-0">
                  <LabelInfoRows catalogItem={catalogItem} batch={data.batch} size={data.batch.size} qrId={id} />
                  {data.mode === 'multi' && 'unitsCount' in it && (
                    <div className="mt-2 pt-2 border-t border-line flex items-center justify-between">
                      <span className="text-[10px] text-ink-soft">{it.unitsCount} units in this carton</span>
                      <LinkButton className="no-print" onClick={() => setIndividualFor(it.id)}>
                        Show Individual QR
                      </LinkButton>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {individualFor && (
        <IndividualQrModal
          cartonId={individualFor}
          catalogItem={catalogItem}
          batch={data.batch}
          paper={labelSize}
          paperControls={paperControls}
          onClose={() => setIndividualFor(null)}
        />
      )}
    </div>
  );
}

interface IndividualQrModalProps {
  cartonId: string;
  catalogItem: ProductCatalogItem | null;
  batch: Batch;
  paper: { width: number; height: number; rotation: LabelRotation };
  paperControls: ReactNode;
  onClose: () => void;
}

// Drill-down from a carton QR to the individual unit QRs inside it — the
// carton label is for bulk handling, but each bucket still needs its own
// scannable, printable identity for retail/verify use.
function IndividualQrModal({ cartonId, catalogItem, batch, paper: labelSize, paperControls, onClose }: IndividualQrModalProps) {
  const [units, setUnits] = useState<Product[] | null>(null);

  useEffect(() => {
    api.getCartonUnits(cartonId).then((data) => setUnits(data.items));
  }, [cartonId]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4 print:static print:bg-transparent print:block print:p-0">
      <div className="bg-white rounded-2xl w-full max-w-[900px] max-h-[85vh] overflow-y-auto p-6 print:max-h-none print:overflow-visible print:max-w-none print:p-0">
        <div className="flex justify-between items-center mb-4 no-print">
          <h3 className="text-lg m-0">{cartonId} — Individual Unit QRs</h3>
          <div className="flex gap-2">
            <Button
              variant="blue"
              disabled={!units}
              onClick={() =>
                units &&
                printThermalLabels(
                  units.map((u) => ({
                    qrValue: verifyUrl(u.qrString),
                    rows: buildLabelRows(catalogItem, batch, u.size, u.qr),
                    footer: `Status: ${u.active ? 'Activated' : 'Not yet activated'}`,
                  })),
                  labelSize
                )
              }
            >
              Print
            </Button>
            <LinkButton onClick={onClose}>Close</LinkButton>
          </div>
        </div>
        <div className="mb-3 no-print">{paperControls}</div>
        {!units ? (
          <p className="text-sm text-ink-soft">Loading…</p>
        ) : (
          <div className="print-area thermal-label-sheet grid grid-cols-2 gap-4">
            {units.map((u) => (
              <div key={u.qr} className="thermal-label border border-line rounded-lg p-3 flex gap-3">
                <QRCodeSVG value={verifyUrl(u.qrString)} size={80} className="flex-shrink-0" />
                <div className="label-info flex-1 min-w-0">
                  <LabelInfoRows catalogItem={catalogItem} batch={batch} size={u.size} qrId={u.qr} />
                  <div className="mt-2 pt-2 border-t border-line text-[10px] text-ink-soft">
                    Status: {u.active ? 'Activated' : 'Not yet activated'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- ACTIVATE QR ----------
type ActivateMode = 'manual' | 'scan';

function ActivatePanel() {
  const [mode, setMode] = useState<ActivateMode>('manual');
  const [scanValue, setScanValue] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const activate = useCallback(async (code: string) => {
    setError('');
    setMsg('');
    try {
      const result: ActivationResult = await api.activateScan(code);
      if (result.type === 'carton') {
        setMsg(
          result.activated.length > 0
            ? `Activated ${result.activated.length} unit(s) in this carton.` +
              (result.alreadyActive ? ` ${result.alreadyActive} were already active.` : '')
            : 'This carton was already fully activated.'
        );
      } else {
        setMsg(result.activated.length ? `Activated ${result.activated[0]}.` : 'This unit was already active.');
      }
      setRefreshTick((t) => t + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Activation failed.');
    }
  }, []);

  async function handleManualSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!scanValue.trim()) return;
    setBusy(true);
    await activate(extractScannedId(scanValue));
    setScanValue('');
    setBusy(false);
    // Refocus so a handheld barcode scanner gun (USB/Bluetooth) can keep
    // firing scan → Enter → scan → Enter without anyone touching the mouse —
    // the same flow as a retail checkout scanner.
    inputRef.current?.focus();
  }

  const handleCameraScan = useCallback((decodedText: string) => {
    activate(extractScannedId(decodedText));
  }, [activate]);

  return (
    <>
      <Panel
        title="Activate Printed QR Codes"
        subtitle="Every unit is produced inactive. Scan its printed QR (or a carton QR to activate everything inside) to mark it ready for dispatch. Anything never scanned — damaged, misprinted, or lost before activation — stays inactive and can never be dispatched or show up as transit/missing stock."
      >
        <Flash kind="err">{error}</Flash>
        <Flash kind="ok">{msg}</Flash>
        <br />
        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => setMode('manual')}
            className={`text-xs font-semibold px-3 py-1.5 rounded-md ${mode === 'manual' ? 'bg-blue text-white' : 'border border-line text-ink-soft'}`}
          >
            Type / Barcode Scanner Gun
          </button>
          <button
            type="button"
            onClick={() => setMode('scan')}
            className={`text-xs font-semibold px-3 py-1.5 rounded-md ${mode === 'scan' ? 'bg-blue text-white' : 'border border-line text-ink-soft'}`}
          >
            Scan with device camera
          </button>
        </div>
        <br />
        {mode === 'manual' ? (
          <>
            <p className="text-xs text-ink-soft mb-3">
              Type the code, or connect a handheld barcode scanner (USB/Bluetooth, like a retail checkout scanner) — it
              types the scanned code into this box and presses Enter automatically. The box stays focused after every
              scan so you can keep scanning one after another.
            </p>

            <form onSubmit={handleManualSubmit} className="flex gap-3 items-end">
              <Field label="Scan or type QR / Carton ID" className="flex-1">
                <TextInput
                  ref={inputRef}
                  value={scanValue}
                  onChange={(e) => setScanValue(e.target.value)}
                  placeholder="PRD-2026-004522 or CTN-2026-00012"
                  autoFocus
                />
              </Field>
              <Button type="submit" variant="green" disabled={busy}>
                {busy ? 'Activating…' : 'Activate'}
              </Button>
            </form>
          </>
        ) : (
          <div>
            <p className="text-xs text-ink-soft mb-3">
              Point the camera at a printed QR — it activates automatically the moment it's recognized. Keep the camera
              on to activate more, one after another.
            </p>
            <QrScanner active={mode === 'scan'} onScan={handleCameraScan} />
          </div>
        )}
      </Panel>

      <ActivationListPanel refreshTick={refreshTick} />
    </>
  );
}

type ActivateStatusFilter = 'all' | 'active' | 'inactive';

// List of every produced QR with its current activation status — filterable
// by batch or QR text, so the factory can see at a glance what's still
// pending before dispatch.
const PAGE_SIZE = 10;

function ActivationListPanel({ refreshTick }: { refreshTick: number }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0); // total rows matching current filters (from server)
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false); // first page / filter change
  const [loadingMore, setLoadingMore] = useState(false); // "Show more" click

  const [filter, setFilter] = useState('');
  const debouncedFilter = useDebouncedValue(filter, 300);
  const [statusFilter, setStatusFilter] = useState<ActivateStatusFilter>('all');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  // The unit currently pending an inactivate confirmation — set when
  // "Inactivate" is picked from a row's ⋮ menu, cleared on cancel/confirm.
  const [confirmTarget, setConfirmTarget] = useState<Product | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState('');

  // Guards against out-of-order responses (e.g. user keeps typing while an
  // older request is still in flight) — only the latest request may update state.
  const reqIdRef = useRef(0);

  const fetchPage = useCallback(
    async (pageNo: number, replace: boolean) => {
      const reqId = ++reqIdRef.current;
      if (replace) setLoading(true);
      else setLoadingMore(true);
      setError('');
      try {
        const { data, pagination } = await api.paged.products({
          page: pageNo,
          limit: PAGE_SIZE,
          sort: '-_id', // unique + stable, so "Show more" never skips/duplicates rows
          search: debouncedFilter.trim() || undefined,
          active: statusFilter === 'all' ? undefined : statusFilter === 'active',
        });
        if (reqId !== reqIdRef.current) return; // stale response — ignore
        setProducts((prev) => {
          if (replace) return data;
          const seen = new Set(prev.map((p) => p.qr));
          return [...prev, ...data.filter((p) => !seen.has(p.qr))];
        });
        setPage(pagination.page);
        setTotal(pagination.totalItems);
        setHasMore(pagination.hasNextPage);
      } catch (err) {
        if (reqId !== reqIdRef.current) return;
        setError(err instanceof Error ? err.message : 'Could not load QR codes.');
      } finally {
        if (reqId === reqIdRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [debouncedFilter, statusFilter]
  );

  // Page 1 loads on mount, whenever search/status changes, and after any
  // activation scan above (refreshTick) — the list then starts again at 10.
  useEffect(() => {
    fetchPage(1, true);
  }, [fetchPage, refreshTick]);

  function askInactivate(p: Product) {
    setConfirmError('');
    setConfirmTarget(p);
  }

  async function handleConfirmInactivate() {
    if (!confirmTarget) return;
    const target = confirmTarget;
    setConfirmBusy(true);
    setConfirmError('');
    try {
      await api.deactivateProduct(target.qr);
      setMsg(`${target.qr} has been marked Inactive.`);
      setError('');
      setConfirmTarget(null);
      // Update the rows already on screen instead of refetching, so the
      // pages the user has already loaded via "Show more" don't collapse.
      if (statusFilter === 'active') {
        setProducts((prev) => prev.filter((p) => p.qr !== target.qr));
        setTotal((t) => Math.max(0, t - 1));
      } else {
        setProducts((prev) => prev.map((p) => (p.qr === target.qr ? { ...p, active: false } : p)));
      }
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : 'Could not inactivate this QR.');
    } finally {
      setConfirmBusy(false);
    }
  }

  return (
    <Panel
      title="All Produced QR Codes"
      subtitle={`Showing ${products.length} of ${total}${
        statusFilter === 'all' ? '' : statusFilter === 'active' ? ' active' : ' inactive'
      } QR codes. Search by QR, batch, or product to check a specific unit's status.`}
    >
      <Flash kind="err">{error}</Flash>
      <Flash kind="ok">{msg}</Flash>
      <div className="flex flex-wrap gap-3 mb-4 items-end">
        <Field label="Search QR / Batch / Product" className="flex-1 min-w-[220px]">
          <TextInput value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="PRD-2026-004522, BATCH-0046, Royale Blue…" />
        </Field>
        <Field label="Status">
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as ActivateStatusFilter)}>
            <option value="all">All</option>
            <option value="active">Active only</option>
            <option value="inactive">Inactive only</option>
          </Select>
        </Field>
      </div>

      <Table
        columns={['QR', 'Batch', 'Product', 'Size', 'Status', '']}
        isEmpty={products.length === 0}
        emptyLabel={loading ? 'Loading…' : 'No QR codes found.'}
      >
        {products.map((p) => (
          <tr key={p.qr} className="border-b border-line">
            <td className="py-2 px-2.5 mono">{p.qr}</td>
            <td className="py-2 px-2.5 mono">{p.batchId}</td>
            <td className="py-2 px-2.5">{p.product}</td>
            <td className="py-2 px-2.5">{p.size}</td>
            <td className="py-2 px-2.5">
              <span className={p.active ? 'text-green font-semibold' : 'text-ochre font-semibold'}>
                {p.active ? 'Active' : 'Inactive'}
              </span>
            </td>
            <td className="py-2 px-2.5 text-right">
              {p.active && <RowActionsMenu onInactivate={() => askInactivate(p)} />}
            </td>
          </tr>
        ))}
      </Table>

      {hasMore && (
        <div className="flex justify-center mt-4">
          <LinkButton type="button" onClick={() => fetchPage(page + 1, false)} disabled={loadingMore || loading}>
            {loadingMore ? 'Loading…' : `Show more (${Math.min(PAGE_SIZE, Math.max(total - products.length, 0))} more)`}
          </LinkButton>
        </div>
      )}

      {confirmTarget && (
        <Modal title="Inactivate this QR?" onClose={() => !confirmBusy && setConfirmTarget(null)}>
          <div className="max-w-[360px]">
            <p className="text-sm text-ink mb-4">
              Are you sure you want to mark <span className="mono font-semibold">{confirmTarget.qr}</span>{' '}
              ({confirmTarget.product}, {confirmTarget.size}) as <span className="text-ochre font-semibold">Inactive</span>?
              It will no longer be eligible for dispatch until it's re-activated.
            </p>
            <Flash kind="err">{confirmError}</Flash>
            <div className="flex justify-end gap-2">
              <LinkButton type="button" onClick={() => setConfirmTarget(null)} disabled={confirmBusy}>
                Cancel
              </LinkButton>
              <Button type="button" variant="ochre" onClick={handleConfirmInactivate} disabled={confirmBusy}>
                {confirmBusy ? 'Inactivating…' : 'Yes, Inactivate'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </Panel>
  );
}

// Small ⋮ (vertical-dots) menu shown next to an Active row. Currently just
// exposes "Inactivate", but is written to take more menu items later
// without changing how it's wired into the table.
function RowActionsMenu({ onInactivate }: { onInactivate: () => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  return (
    <div className="relative inline-block" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Row actions"
        className="w-7 h-7 inline-flex items-center justify-center rounded-md text-ink-soft hover:bg-bg hover:text-ink transition"
      >
        <svg width="4" height="16" viewBox="0 0 4 16" fill="currentColor" aria-hidden="true">
          <circle cx="2" cy="2" r="2" />
          <circle cx="2" cy="8" r="2" />
          <circle cx="2" cy="14" r="2" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 z-20 min-w-[140px] bg-white border border-line rounded-md shadow-lg py-1"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onInactivate();
            }}
            className="w-full text-left px-3 py-1.5 text-xs font-semibold text-red hover:bg-bg"
          >
            Inactivate
          </button>
        </div>
      )}
    </div>
  );
}

// ---------- MANAGE PRODUCTS: ADD PRODUCT (separate section) ----------
const BLANK_FORM: Omit<ProductCatalogItem, 'sizes'> = {
  itemCode: '',
  name: '',
  unit: 'L',
  usp: '',
  manufacturedBy: COMPANY_INFO.manufacturedBy,
  address: COMPANY_INFO.address,
  email: COMPANY_INFO.email,
  website: COMPANY_INFO.website,
  helpline: COMPANY_INFO.helpline,
};

interface SizeTagInputProps {
  unit: string;
  sizes: string[];
  onAdd: (size: string) => void;
  onRemove: (size: string) => void;
}

// Free-text size tag builder — the value typed gets the selected unit
// suffix appended automatically for L/KG (e.g. "20" + L -> "20L"), while
// Pcs sizes (like "2 inch", "9 inch") are typed as-is.
function SizeTagInput({ unit, sizes, onAdd, onRemove }: SizeTagInputProps) {
  const [value, setValue] = useState('');

  function handleAdd(e: FormEvent | KeyboardEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    const formatted = unit === 'Pcs' ? trimmed : /^[\d.]+$/.test(trimmed) ? `${trimmed}${unit}` : trimmed;
    if (!sizes.includes(formatted)) onAdd(formatted);
    setValue('');
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-2">
        {sizes.map((s) => (
          <span key={s} className="flex items-center gap-1.5 bg-bg border border-line rounded-full px-3 py-1 text-xs font-semibold">
            {s}
            <button type="button" onClick={() => onRemove(s)} className="text-red hover:brightness-75">×</button>
          </span>
        ))}
        {sizes.length === 0 && <span className="text-xs text-ink-soft">No sizes added yet.</span>}
      </div>
      <div className="flex gap-2">
        <TextInput
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={unit === 'Pcs' ? 'e.g. 4 inch' : `e.g. 20 (becomes 20${unit})`}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(e); }}
        />
        <LinkButton type="button" onClick={handleAdd}>Add size</LinkButton>
      </div>
    </div>
  );
}

function AddProductPanel({ onChanged }: { onChanged: () => void }) {
  const [form, setForm] = useState(BLANK_FORM);
  const [sizes, setSizes] = useState<string[]>([]);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  function set<K extends keyof typeof BLANK_FORM>(field: K, value: (typeof BLANK_FORM)[K]) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleUnitChange(unit: string) {
    setForm((f) => ({ ...f, unit }));
    setSizes([]); // sizes are unit-specific, so switching units clears them
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setMsg('');
    if (sizes.length === 0) {
      setError('Add at least one size this product comes in.');
      return;
    }
    try {
      await api.addProductCatalogItem({ ...form, sizes });
      setMsg(`Added ${form.name} (${form.itemCode}). Set its MRP when you start a batch.`);
      setForm(BLANK_FORM);
      setSizes([]);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add product.');
    }
  }

  return (
    <Panel
      title="Add Product"
      subtitle="Name, code, unit, sizes and USP go here. MRP isn't set here — it's entered per batch on Start Batch, since price can change between production runs. Manufacturer details are pre-filled since they're the same for every product."
    >
      <Flash kind="err">{error}</Flash>
      <Flash kind="ok">{msg}</Flash>
      <br />
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="flex flex-wrap gap-x-6 gap-y-5">
          <Field label="Product Name">
            <TextInput value={form.name} onChange={(e) => set('name', e.target.value)} required />
          </Field>
          <Field label="Item / Product Code">
            <TextInput value={form.itemCode} onChange={(e) => set('itemCode', e.target.value)} required />
          </Field>
          <Field label="Unit">
            <Select value={form.unit} onChange={(e) => handleUnitChange(e.target.value)}>
              {UNIT_OPTIONS.map((u) => (
                <option key={u} value={u}>{u === 'L' ? 'Litre (L)' : u === 'KG' ? 'Kilogram (KG)' : 'Pieces (Pcs)'}</option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label={`Sizes this product comes in (${form.unit})`}>
          <SizeTagInput
            unit={form.unit}
            sizes={sizes}
            onAdd={(s) => setSizes((cur) => [...cur, s])}
            onRemove={(s) => setSizes((cur) => cur.filter((x) => x !== s))}
          />
        </Field>

        <Field label="USP / Key Product Information">
          <textarea
            className="px-2.5 py-2 border border-line rounded-lg text-sm bg-white w-full min-h-[70px]"
            value={form.usp}
            onChange={(e) => set('usp', e.target.value)}
            required
          />
        </Field>

        <div className="border-t border-line pt-4">
          <div className="text-xs font-semibold text-ink-soft uppercase mb-3">
            Manufacturer details — pre-filled, same for every product (edit only if it changes)
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-5">
            <Field label="Manufactured By">
              <TextInput value={form.manufacturedBy} onChange={(e) => set('manufacturedBy', e.target.value)} required />
            </Field>
            <Field label="Manufacturer Address" className="flex-1 min-w-[280px]">
              <TextInput value={form.address} onChange={(e) => set('address', e.target.value)} required />
            </Field>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-5 mt-5">
            <Field label="Email">
              <TextInput type="email" value={form.email} onChange={(e) => set('email', e.target.value)} required />
            </Field>
            <Field label="Website">
              <TextInput value={form.website} onChange={(e) => set('website', e.target.value)} required />
            </Field>
            <Field label="Helpline Number">
              <TextInput value={form.helpline} onChange={(e) => set('helpline', e.target.value)} required />
            </Field>
          </div>
        </div>

        <Button type="submit" variant="blue" className="self-start">Add Product</Button>
      </form>
    </Panel>
  );
}

// ---------- MANAGE PRODUCTS: PRODUCT LIST (separate section, with inline edit) ----------
function ProductListPanel({ catalog, onChanged }: { catalog: ProductCatalogItem[]; onChanged: () => void }) {
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [form, setForm] = useState(BLANK_FORM);
  const [sizes, setSizes] = useState<string[]>([]);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  function set<K extends keyof typeof BLANK_FORM>(field: K, value: (typeof BLANK_FORM)[K]) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleUnitChange(unit: string) {
    setForm((f) => ({ ...f, unit }));
    setSizes([]);
  }

  function startEdit(item: ProductCatalogItem) {
    setEditingCode(item.itemCode);
    setForm({
      itemCode: item.itemCode,
      name: item.name,
      unit: item.unit || 'L',
      usp: item.usp,
      manufacturedBy: item.manufacturedBy,
      address: item.address,
      email: item.email,
      website: item.website,
      helpline: item.helpline,
    });
    setSizes([...item.sizes]);
  }

  function cancelEdit() {
    setEditingCode(null);
    setForm(BLANK_FORM);
    setSizes([]);
  }

  async function handleSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setMsg('');
    if (sizes.length === 0) {
      setError('Select at least one size.');
      return;
    }
    if (!editingCode) return;
    try {
      await api.updateProductCatalogItem(editingCode, { ...form, sizes });
      setMsg(`Updated ${form.name}.`);
      cancelEdit();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update product.');
    }
  }

  async function handleDelete(itemCode: string) {
    setError('');
    setMsg('');
    try {
      await api.deleteProductCatalogItem(itemCode);
      setMsg('Product removed.');
      if (editingCode === itemCode) cancelEdit();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete product.');
    }
  }

  return (
    <Panel title="Product List">
      <Flash kind="err">{error}</Flash>
      <Flash kind="ok">{msg}</Flash>

      {editingCode && (
        <form onSubmit={handleSave} className="flex flex-col gap-5 mb-5 border border-line rounded-2xl p-4 bg-bg">
          <div className="text-sm font-semibold">Editing — {editingCode}</div>
          <div className="flex flex-wrap gap-x-6 gap-y-5">
            <Field label="Product Name">
              <TextInput value={form.name} onChange={(e) => set('name', e.target.value)} required />
            </Field>
            <Field label="USP">
              <TextInput value={form.usp} onChange={(e) => set('usp', e.target.value)} required />
            </Field>
            <Field label="Unit">
              <Select value={form.unit} onChange={(e) => handleUnitChange(e.target.value)}>
                {UNIT_OPTIONS.map((u) => (
                  <option key={u} value={u}>{u === 'L' ? 'Litre (L)' : u === 'KG' ? 'Kilogram (KG)' : 'Pieces (Pcs)'}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label={`Sizes (${form.unit})`}>
            <SizeTagInput
              unit={form.unit}
              sizes={sizes}
              onAdd={(s) => setSizes((cur) => [...cur, s])}
              onRemove={(s) => setSizes((cur) => cur.filter((x) => x !== s))}
            />
          </Field>
          <div className="flex flex-wrap gap-x-6 gap-y-5">
            <Field label="Manufactured By">
              <TextInput value={form.manufacturedBy} onChange={(e) => set('manufacturedBy', e.target.value)} required />
            </Field>
            <Field label="Address" className="flex-1 min-w-[240px]">
              <TextInput value={form.address} onChange={(e) => set('address', e.target.value)} required />
            </Field>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-5">
            <Field label="Email">
              <TextInput type="email" value={form.email} onChange={(e) => set('email', e.target.value)} required />
            </Field>
            <Field label="Website">
              <TextInput value={form.website} onChange={(e) => set('website', e.target.value)} required />
            </Field>
            <Field label="Helpline">
              <TextInput value={form.helpline} onChange={(e) => set('helpline', e.target.value)} required />
            </Field>
          </div>
          <div className="flex gap-2">
            <Button type="submit" variant="blue">Save Changes</Button>
            <LinkButton type="button" onClick={cancelEdit}>Cancel</LinkButton>
          </div>
        </form>
      )}

      <Table
        columns={['Item Code', 'Name', 'Unit', 'Sizes', 'Manufactured By', 'Helpline', '']}
        isEmpty={catalog.length === 0}
        emptyLabel="No products yet — add one above."
      >
        {catalog.map((it) => (
          <tr key={it.itemCode} className="border-b border-line align-top">
            <td className="py-2 px-2.5 mono">{it.itemCode}</td>
            <td className="py-2 px-2.5">{it.name}</td>
            <td className="py-2 px-2.5">{it.unit || 'L'}</td>
            <td className="py-2 px-2.5">{it.sizes.join(', ')}</td>
            <td className="py-2 px-2.5">{it.manufacturedBy}</td>
            <td className="py-2 px-2.5">{it.helpline}</td>
            <td className="py-2 px-2.5">
              <div className="flex gap-2">
                <LinkButton onClick={() => startEdit(it)}>Edit</LinkButton>
                <LinkButton onClick={() => handleDelete(it.itemCode)} className="text-red">Delete</LinkButton>
              </div>
            </td>
          </tr>
        ))}
      </Table>
    </Panel>
  );
}
