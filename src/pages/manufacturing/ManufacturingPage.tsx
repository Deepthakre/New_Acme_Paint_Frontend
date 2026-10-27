import { useEffect, useState, useCallback, useRef, useMemo, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import * as XLSX from 'xlsx';
import PageShell from '../../components/layout/PageShell';
import { Panel, Table, Flash, Modal } from '../../components/ui/Misc';
import { Field, Select, NumberInput, TextInput } from '../../components/ui/Field';
import Button, { LinkButton } from '../../components/ui/Button';
import QrScanner from '../../components/ui/QrScanner';
import * as api from '../../lib/apiClient';
import { verifyUrl, extractScannedId } from '../../lib/qr';
import { buildLabelsHtml, fitLabelText, printThermalLabels, type LabelPaper, type PrintableLabel } from '../../lib/printLabels';
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
  const [labelBatches, setLabelBatches] = useState<BatchLabels[] | null>(null);
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>([]);
  const [loadingSelectedLabels, setLoadingSelectedLabels] = useState(false);

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
    setError('');
    try {
      const data = await api.getBatchLabels(batchId);
      setLabelBatches([data]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load batch labels.');
    }
  }

  async function openSelectedBatchLabels() {
    if (!selectedBatchIds.length) return;
    setError('');
    setLoadingSelectedLabels(true);
    try {
      const data = await Promise.all(selectedBatchIds.map((id) => api.getBatchLabels(id)));
      setLabelBatches(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load selected batch labels.');
    } finally {
      setLoadingSelectedLabels(false);
    }
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
          <div className="flex flex-wrap gap-2">
            {selectedBatchIds.length > 0 && (
              <Button variant="blue" onClick={openSelectedBatchLabels} disabled={loadingSelectedLabels}>
                {loadingSelectedLabels ? 'Loading labels…' : `Print selected (${selectedBatchIds.length})`}
              </Button>
            )}
            {batches.length > 0 && <LinkButton onClick={exportBatchesExcel}>Export Batches (Excel)</LinkButton>}
          </div>
        }
      >
        <Table
          columns={[
            <input
              type="checkbox"
              aria-label="Select all batches"
              checked={batches.length > 0 && selectedBatchIds.length === batches.length}
              ref={(input) => {
                if (input) input.indeterminate = selectedBatchIds.length > 0 && selectedBatchIds.length < batches.length;
              }}
              onChange={(event) => setSelectedBatchIds(event.target.checked ? batches.map((batch) => batch.id) : [])}
            />,
            'Batch', 'Batch No', 'Product', 'Size', 'MRP', 'Qty', 'QR Mode', 'QR Range', 'Mfg Date', 'USP Code', 'Activated', '',
          ]}
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
                  <td className="py-2 px-2.5">
                    <input
                      type="checkbox"
                      aria-label={`Select batch ${b.id}`}
                      checked={selectedBatchIds.includes(b.id)}
                      onChange={(event) => setSelectedBatchIds((current) =>
                        event.target.checked
                          ? [...current, b.id]
                          : current.filter((id) => id !== b.id)
                      )}
                    />
                  </td>
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

      {labelBatches && (
        <LabelSheet
          data={labelBatches}
          catalog={catalog}
          onClose={() => setLabelBatches(null)}
        />
      )}
    </>
  );
}

// Label-paper controls follow the preset and numeric-input workflow used by
// the shipping-label app, while keeping the supported presets visible.
function useLabelPaper() {
  const defaultPreset = THERMAL_LABEL_PRESETS.find((p) => p.key === DEFAULT_THERMAL_LABEL_KEY) || THERMAL_LABEL_PRESETS[0];
  const [widthInput, setWidthInput] = useState(String(defaultPreset.width));
  const [heightInput, setHeightInput] = useState(String(defaultPreset.height));
  const [columns, setColumns] = useState<1 | 2>(1);
  const [rollWidth, setRollWidth] = useState('102');
  const [rotateDesign, setRotateDesign] = useState(false);
  const parsedWidth = Number(widthInput);
  const parsedHeight = Number(heightInput);
  const isWidthValid = Number.isFinite(parsedWidth) && parsedWidth >= 30 && parsedWidth <= 108;
  const isHeightValid = Number.isFinite(parsedHeight) && parsedHeight >= 30 && parsedHeight <= 300;
  const isDimensionsValid = isWidthValid && isHeightValid;
  const width = isWidthValid ? parsedWidth : defaultPreset.width;
  const height = isHeightValid ? parsedHeight : defaultPreset.height;
  const selectedPreset = THERMAL_LABEL_PRESETS.find((p) => p.width === width && p.height === height);
  const minimumRollWidth = width * 2 + 2;
  const measuredRollWidth = Number(rollWidth);
  const isRollWidthValid = isDimensionsValid && (columns === 1 || (
    Number.isFinite(measuredRollWidth) &&
    measuredRollWidth >= minimumRollWidth &&
    measuredRollWidth <= 108
  ));
  const canRotateDesign = width === 100 && height === 70;
  const paper: LabelPaper = {
    width,
    height,
    columns,
    rollWidth: columns === 2 ? measuredRollWidth : width,
    rotate: rotateDesign && canRotateDesign,
  };
  const controls = (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-ink-soft">Sticker size (mm)</span>
          <strong className="text-sm text-ink">{width} × {height}</strong>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Sticker size presets">
          {THERMAL_LABEL_PRESETS.map((preset) => (
            <button
              type="button"
              key={preset.key}
              className={`rounded-md border px-3 py-2 text-xs font-semibold ${
                selectedPreset?.key === preset.key
                  ? 'border-teal bg-teal-soft text-teal'
                  : 'border-line bg-white text-ink-soft hover:bg-gray-50'
              }`}
              aria-pressed={selectedPreset?.key === preset.key}
              onClick={() => {
                setWidthInput(String(preset.width));
                setHeightInput(String(preset.height));
                if (preset.width * 2 + 2 > 108) setColumns(1);
                if (preset.key !== '100x70') setRotateDesign(false);
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <Field label="Custom width (mm)" error={isWidthValid || widthInput === '' ? undefined : 'Enter a width from 30 to 108 mm.'}>
          <NumberInput
            value={widthInput}
            min={30}
            max={108}
            onChange={(e) => {
              setWidthInput(e.target.value);
              setRotateDesign(false);
            }}
          />
        </Field>
        <Field label="Custom height (mm)" error={isHeightValid || heightInput === '' ? undefined : 'Enter a height from 30 to 300 mm.'}>
          <NumberInput
            value={heightInput}
            min={30}
            max={300}
            onChange={(e) => {
              setHeightInput(e.target.value);
              setRotateDesign(false);
            }}
          />
        </Field>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-xs text-ink-soft">Labels across roll</span>
        <div className="flex gap-2" role="group" aria-label="Labels across roll">
          <button
            type="button"
            className={`rounded-md border px-3 py-2 text-xs font-semibold ${columns === 1 ? 'border-teal bg-teal-soft text-teal' : 'border-line bg-white text-ink-soft'}`}
            aria-pressed={columns === 1}
            onClick={() => setColumns(1)}
          >
            1 across
          </button>
          <button
            type="button"
            className={`rounded-md border px-3 py-2 text-xs font-semibold ${columns === 2 ? 'border-teal bg-teal-soft text-teal' : 'border-line bg-white text-ink-soft'}`}
            aria-pressed={columns === 2}
            disabled={minimumRollWidth > 108}
            onClick={() => setColumns(2)}
          >
            2 across
          </button>
        </div>
        {minimumRollWidth > 108 && (
          <small className="text-xs leading-relaxed text-ink-soft">Two {width} mm labels plus the 2 mm gap exceed the printer's 108 mm maximum print width.</small>
        )}
        {columns === 2 && (
          <>
            <Field
              label="Usable roll width (mm)"
              error={!isRollWidthValid ? `Enter a width from ${minimumRollWidth} to 108 mm.` : undefined}
            >
              <NumberInput
                value={rollWidth}
                min={minimumRollWidth}
                max={108}
                step={1}
                onChange={(e) => setRollWidth(e.target.value)}
                placeholder="Measure your roll"
              />
            </Field>
            <small className="text-xs leading-relaxed text-ink-soft">Two labels need at least {minimumRollWidth} mm including the 2 mm gap.</small>
          </>
        )}
      </div>
      {canRotateDesign && (
        <div className="flex flex-col gap-2">
          <span className="text-xs text-ink-soft">100 × 70 mm label orientation</span>
          <div className="flex flex-wrap gap-2" role="group" aria-label="100 × 70 mm label orientation">
            <button
              type="button"
              className={`rounded-md border px-3 py-2 text-xs font-semibold ${!rotateDesign ? 'border-teal bg-teal-soft text-teal' : 'border-line bg-white text-ink-soft'}`}
              aria-pressed={!rotateDesign}
              onClick={() => setRotateDesign(false)}
            >
              Normal
            </button>
            <button
              type="button"
              className={`rounded-md border px-3 py-2 text-xs font-semibold ${rotateDesign ? 'border-teal bg-teal-soft text-teal' : 'border-line bg-white text-ink-soft'}`}
              aria-pressed={rotateDesign}
              onClick={() => setRotateDesign(true)}
            >
              Rotate whole design
            </button>
          </div>
        </div>
      )}
    </div>
  );
  return { paper, controls, isRollWidthValid };
}

function confirmLabelPrint(paper: LabelPaper, labelCount: number): boolean {
  const layout = paper.columns === 2
    ? `2 across on a ${paper.rollWidth} mm roll`
    : `1 across${paper.rotate ? ', rotated 90°' : ''}`;
  return window.confirm(
    `You selected ${paper.width} × ${paper.height} mm (${layout}). Print ${labelCount} ${labelCount === 1 ? 'label' : 'labels'}?`
  );
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
function buildLabelRows(catalogItem: ProductCatalogItem | null, batch: Batch, size: string, qrId: string): [string, string, string?, string?][] {
  return [
    ['QR ID', qrId],
    ['Product Name', batch.product],
    ['Item Code', catalogItem?.itemCode || '—', 'Batch No', batch.batchNo || '—'],
    ['USP No', batch.uspCode || '—', 'Mfg Date', batch.manufacturingDate],
    ['Size / Qty', size, 'MRP', batch.mrp ? `₹${batch.mrp}` : '—'],
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
    <div className="text-[10px] leading-snug w-full" >
      {rows.map(([k, v, pairedKey, pairedValue]) => (
        <div key={k} className="flex flex-wrap gap-x-1">
          <span className="font-semibold text-ink-soft flex-shrink-0">{k}:</span>
          <span className="text-ink break-words min-w-0">{v}</span>
          {pairedKey && pairedValue !== undefined && (
            <>
              <span className="text-ink-soft flex-shrink-0">|</span>
              <span className="font-semibold text-ink-soft flex-shrink-0">{pairedKey}:</span>
              <span className="text-ink break-words min-w-0">{pairedValue}</span>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function batchPrintableLabel(
  item: Carton | Product,
  catalogItem: ProductCatalogItem | null,
  batch: Batch,
  isMulti: boolean
): PrintableLabel {
  const id = 'id' in item ? item.id : item.qr;
  return {
    qrValue: verifyUrl(item.qrString),
    rows: buildLabelRows(catalogItem, batch, batch.size, id),
    footer: isMulti && 'unitsCount' in item ? `${item.unitsCount} units in this carton` : undefined,
  };
}

function LabelPrintPreview({ labels, paper }: { labels: PrintableLabel[]; paper: LabelPaper }) {
  const pageWidth = paper.columns === 2 ? paper.rollWidth : paper.width;
  const previewWidthPx = pageWidth * 3.78;
  const previewLabels = paper.width === 50 && paper.height === 50 ? labels.slice(0, 12) : labels.slice(0, paper.columns);
  const previewRows = Math.ceil(previewLabels.length / paper.columns);
  const previewHeightPx = paper.height * previewRows * 3.78;
  const scale = Math.min(1, 560 / previewWidthPx, 320 / previewHeightPx);
  const html = useMemo(
    () => buildLabelsHtml(previewLabels, paper),
    [previewLabels, paper]
  );

  return (
    <section className="mb-4 rounded-lg border border-line p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <strong className="text-sm">Live roll preview</strong>
        <span className="text-xs text-ink-soft">
          {paper.columns} across · {pageWidth} × {paper.height} mm per row
          {paper.width === 50 && labels.length > previewLabels.length ? ` · first ${previewLabels.length} labels` : ''}
        </span>
      </div>
      <div
        className="max-h-[320px] overflow-auto bg-gray-50"
      >
        <div
          className="relative"
          style={{ width: previewWidthPx * scale, height: previewHeightPx * scale }}
        >
          <iframe
            title="Live label roll preview"
            srcDoc={html}
            onLoad={(event) => {
              const doc = event.currentTarget.contentDocument;
              if (doc) fitLabelText(doc, paper.width);
            }}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: previewWidthPx,
              height: previewHeightPx,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              border: 0,
            }}
          />
        </div>
      </div>
    </section>
  );
}

function LabelSheet({ data, catalog, onClose }: { data: BatchLabels[]; catalog: ProductCatalogItem[]; onClose: () => void }) {
  const items = data.reduce<(Carton | Product)[]>((allItems, batchLabels) => {
    if (batchLabels.mode === 'multi') allItems.push(...batchLabels.cartons);
    else allItems.push(...batchLabels.items);
    return allItems;
  }, []);
  const [individualFor, setIndividualFor] = useState<string | null>(null);
  const { paper: labelSize, controls: paperControls, isRollWidthValid } = useLabelPaper();
  const printableLabels = useMemo(
    () => data.flatMap((batchLabels) => {
      const catalogItem = catalog.find((item) => item.name === batchLabels.batch.product) || null;
      const batchItems: (Carton | Product)[] = batchLabels.mode === 'multi' ? batchLabels.cartons : batchLabels.items;
      return batchItems.map((item) => batchPrintableLabel(item, catalogItem, batchLabels.batch, batchLabels.mode === 'multi'));
    }),
    [data, catalog]
  );

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 print:static print:bg-transparent print:block print:p-0">
      <div className="bg-white rounded-2xl w-full max-w-[1100px] max-h-[85vh] overflow-y-auto p-6 print:max-h-none print:overflow-visible print:max-w-none print:p-0">
        <div className="flex justify-between items-center mb-4 no-print">
          <h3 className="text-lg m-0">
            {data.length === 1 ? data[0].batch.id : `${data.length} selected batches`} — {printableLabels.length} labels
          </h3>
          <div className="flex gap-2">
            <Button
              variant="blue"
              disabled={!isRollWidthValid}
              onClick={() => {
                if (!confirmLabelPrint(labelSize, items.length)) return;
                printThermalLabels(printableLabels, labelSize);
              }}
            >
              Print
            </Button>
            <Button
              variant="blue"
              disabled={!isRollWidthValid}
              onClick={() => {
                if (!printableLabels.length) return;
                if (!confirmLabelPrint(labelSize, 1)) return;
                printThermalLabels(printableLabels.slice(0, 1), labelSize);
              }}
            >
              Test print (1 label)
            </Button>
            <LinkButton onClick={onClose}>Close</LinkButton>
          </div>
        </div>
        <div className="mb-3 no-print">
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(220px,0.75fr)_minmax(0,1.25fr)]">
            <div className="flex flex-col gap-3">{paperControls}</div>
            <LabelPrintPreview labels={printableLabels} paper={labelSize} />
          </div>
          <p className="text-xs text-ink-soft mt-2">
            The preview shows the selected label size, roll row, and rotation. Confirm the size in the print prompt and test one label before printing a batch.
            Two-across printing is available only when both 50 mm labels and the gap fit the TSC's 108 mm print width. The printer driver still needs matching stock configured.
          </p>
        </div>
        {data.length === 1 && data[0].mode === 'multi' && (
          <section className="no-print mt-4 border-t border-line pt-3">
            <h4 className="mb-2 text-sm font-semibold">Carton labels</h4>
            <div className="flex flex-col gap-2">
            {data[0].mode === 'multi' && data[0].cartons.map((carton) => (
                <div key={carton.id} className="flex items-center justify-between gap-3 rounded border border-line p-2">
                  <span className="text-xs">{carton.id} · {carton.unitsCount} units</span>
                  <LinkButton onClick={() => setIndividualFor(carton.id)}>Show Individual QRs</LinkButton>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {individualFor && (
        <IndividualQrModal
          cartonId={individualFor}
          catalogItem={catalog.find((item) => item.name === data[0].batch.product) || null}
          batch={data[0].batch}
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
  paper: LabelPaper;
  paperControls: ReactNode;
  onClose: () => void;
}

// Drill-down from a carton QR to the individual unit QRs inside it — the
// carton label is for bulk handling, but each bucket still needs its own
// scannable, printable identity for retail/verify use.
function IndividualQrModal({ cartonId, catalogItem, batch, paper: labelSize, paperControls, onClose }: IndividualQrModalProps) {
  const [units, setUnits] = useState<Product[] | null>(null);
  const printableLabels = useMemo<PrintableLabel[]>(
    () => units?.map((u) => ({
      qrValue: verifyUrl(u.qrString),
      rows: buildLabelRows(catalogItem, batch, u.size, u.qr),
      footer: `Status: ${u.active ? 'Activated' : 'Not yet activated'}`,
    })) ?? [],
    [units, catalogItem, batch]
  );
  const isRollWidthValid = labelSize.columns === 1 || (
    labelSize.rollWidth >= labelSize.width * 2 + 2 &&
    labelSize.rollWidth <= 108
  );

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
              disabled={!units || !isRollWidthValid}
              onClick={() =>
                units && confirmLabelPrint(labelSize, units.length) &&
                printThermalLabels(printableLabels, labelSize)
              }
            >
              Print
            </Button>
            <LinkButton onClick={onClose}>Close</LinkButton>
          </div>
        </div>
        <div className="mb-3 no-print">
          {paperControls}
          {units && <LabelPrintPreview labels={printableLabels} paper={labelSize} />}
        </div>
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
