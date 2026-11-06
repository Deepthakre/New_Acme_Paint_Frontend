import { useEffect, useRef, useState, type FormEvent } from 'react';
import PageShell from '../../components/layout/PageShell';
import { Panel, Table, Flash } from '../../components/ui/Misc';
import { Field, Select, NumberInput, TextInput } from '../../components/ui/Field';
import Button from '../../components/ui/Button';
import StatusPill from '../../components/ui/StatusPill';
import { useAuth } from '../../context/AuthContext';
import * as api from '../../lib/apiClient';
import { extractScannedId } from '../../lib/qr';
import type { Batch, DispatchOverviewRow, PendingDeliveryRow, Product } from '../../types';

type WarehouseTab = 'dispatch' | 'pending' | 'shortage';

export default function WarehousePage() {
  const [tab, setTab] = useState<WarehouseTab>('dispatch');
  return (
    <PageShell>
      <div className="flex gap-2 mb-5 no-print">
        {(
          [
            ['dispatch', 'Dispatch'],
            ['pending', 'Pending Delivery'],
            ['shortage', 'Shortage Report'],
          ] as [WarehouseTab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-md text-sm font-semibold ${
              tab === key ? 'bg-blue text-white' : 'bg-white border border-line text-ink-soft'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'dispatch' && <DispatchPanel />}
      {tab === 'pending' && <PendingDeliveryPanel />}
      {tab === 'shortage' && <ShortagePanel />}
    </PageShell>
  );
}

type DispatchMode = 'qty' | 'scan';
type StatusFilter = 'all' | 'dispatched' | 'undispatched';

const STATUS_LABEL: Record<DispatchOverviewRow['dispatchStatus'], { text: string; pill: string }> = {
  FULLY_DISPATCHED: { text: 'Fully Dispatched', pill: 'OK' },
  PARTIALLY_DISPATCHED: { text: 'Partially Dispatched', pill: 'LOW' },
  NOT_DISPATCHED: { text: 'Not Dispatched', pill: 'OUT' },
};

function DispatchPanel() {
  const [mode, setMode] = useState<DispatchMode>('qty');
  const [batches, setBatches] = useState<Batch[]>([]);
  const [batchId, setBatchId] = useState('');
  const [qty, setQty] = useState(10);
  const [dealer, setDealer] = useState('');
  const [dealers, setDealers] = useState<string[]>([]);
  const [scanValue, setScanValue] = useState('');
  const [scanned, setScanned] = useState<string[]>([]);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [overview, setOverview] = useState<DispatchOverviewRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const scanInputRef = useRef<HTMLInputElement>(null);

  function loadOverview() {
    api.getDispatchOverview().then(setOverview);
  }

  useEffect(() => {
    api.listBatches().then((b) => {
      setBatches(b);
      if (b[0]) setBatchId(b[0].id);
    });
    api.listKnownDealerNames().then((d) => {
      setDealers(d);
      if (d[0]) setDealer(d[0]);
    });
    loadOverview();
  }, []);

  async function handleQtyDispatch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setMsg('');
    try {
      const moved = await api.dispatchByQuantity({ batchId, qty: Number(qty), dealer });
      setMsg(`Dispatched ${moved.length} units from ${batchId} to ${dealer}.`);
      loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dispatch failed.');
    }
  }

  async function handleScan(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const value = extractScannedId(scanValue);
    setScanValue('');
    // Refocus immediately so a handheld 2D barcode scanner (e.g. HENEX,
    // set up as a USB/Bluetooth "keyboard wedge") can keep firing
    // scan → Enter → scan → Enter back-to-back without anyone touching
    // the mouse — same as a retail checkout scanner.
    scanInputRef.current?.focus();
    if (!value) return;
    try {
      const result = await api.addDispatchScan(value);
      setScanned((prev) => [...new Set([...prev, ...result.qrs])]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed.');
    }
  }

  async function confirmScannedDispatch() {
    setError('');
    setMsg('');
    try {
      const moved = await api.confirmScanDispatch({ qrs: scanned, dealer });
      setMsg(`Dispatched ${moved.length} scanned units to ${dealer}.`);
      setScanned([]);
      loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dispatch failed.');
    }
  }

  const filteredOverview = overview.filter((row) => {
    if (statusFilter === 'dispatched') return row.dispatched > 0;
    if (statusFilter === 'undispatched') return row.dispatched === 0;
    return true;
  });

  return (
    <Panel title="Dispatch to Dealer">
      <Flash kind="err">{error}</Flash>
      <Flash kind="ok">{msg}</Flash>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setMode('qty')}
          className={`text-xs font-semibold px-3 py-1.5 rounded-md ${mode === 'qty' ? 'bg-blue text-white' : 'border border-line text-ink-soft'}`}
        >
          By quantity
        </button>
        <button
          onClick={() => setMode('scan')}
          className={`text-xs font-semibold px-3 py-1.5 rounded-md ${mode === 'scan' ? 'bg-blue text-white' : 'border border-line text-ink-soft'}`}
        >
          By QR scan
        </button>
      </div>

      <Field label="Dispatch to dealer" className="mb-4 max-w-xs">
        <Select value={dealer} onChange={(e) => setDealer(e.target.value)}>
          {dealers.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </Select>
      </Field>

      {mode === 'qty' ? (
        <form onSubmit={handleQtyDispatch} className="flex flex-wrap gap-x-6 gap-y-5 items-end">
          <Field label="From batch">
            <Select value={batchId} onChange={(e) => setBatchId(e.target.value)}>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.id} — {b.product} {b.size}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Quantity">
            <NumberInput min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} required />
          </Field>
          <Button type="submit" variant="ochre">Dispatch</Button>
        </form>
      ) : (
        <>
          <p className="text-xs text-ink-soft mb-3">
            Type the code, or connect a handheld 2D barcode scanner (USB/Bluetooth, e.g. HENEX) — it types the
            scanned code into this box and presses Enter automatically. The box stays focused after every scan, so
            you can keep scanning one unit after another without touching the mouse.
          </p>
          <form onSubmit={handleScan} className="flex gap-3 items-end mb-3">
            <Field label="Scan or type QR / Carton ID" className="flex-1">
              <TextInput
                ref={scanInputRef}
                value={scanValue}
                onChange={(e) => setScanValue(e.target.value)}
                placeholder="PRD-2026-004522 or CTN-2026-00012"
                autoFocus
              />
            </Field>
            <Button type="submit" variant="blue">Add scan</Button>
          </form>
          <div className="text-[13px] text-ink-soft mb-2">{scanned.length} unit(s) queued for dispatch</div>
          {scanned.length > 0 && (
            <Button variant="ochre" onClick={confirmScannedDispatch}>
              Confirm dispatch of {scanned.length} unit(s)
            </Button>
          )}
        </>
      )}

      {/* ===== Product Dispatch Status: which products are dispatched / still in factory ===== */}
      <div className="mt-7 pt-6 border-t border-line">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <h3 className="text-[15px] font-bold text-ink m-0">Product Dispatch Status</h3>
          <div className="flex gap-2">
            {(
              [
                ['all', 'All Products'],
                ['dispatched', 'Dispatched'],
                ['undispatched', 'Undispatched'],
              ] as [StatusFilter, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setStatusFilter(key)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-md ${
                  statusFilter === key ? 'bg-blue text-white' : 'border border-line text-ink-soft'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <Table
          columns={['Batch', 'Product', 'Size', 'MRP', 'Total Qty', 'Dispatched', 'In Factory', 'Status']}
          isEmpty={filteredOverview.length === 0}
          emptyLabel="No batches match this filter."
        >
          {filteredOverview.map((row) => (
            <tr key={row.batchId} className="border-b border-line">
              <td className="py-2 px-2.5 mono">{row.batchId}</td>
              <td className="py-2 px-2.5">{row.product}</td>
              <td className="py-2 px-2.5">{row.size}</td>
              <td className="py-2 px-2.5">₹{row.mrp}</td>
              <td className="py-2 px-2.5">{row.total}</td>
              <td className="py-2 px-2.5">{row.dispatched}</td>
              <td className="py-2 px-2.5">{row.undispatched}</td>
              <td className="py-2 px-2.5">
                <StatusPill status={STATUS_LABEL[row.dispatchStatus].pill}>
                  {STATUS_LABEL[row.dispatchStatus].text}
                </StatusPill>
              </td>
            </tr>
          ))}
        </Table>
      </div>
    </Panel>
  );
}

// Dealer dispatched to them but never scanned it at "Receive Stock" — so it
// just sits in TRANSIT with no signal. This lets the manufacturer/warehouse
// close it out manually: pick the stuck unit(s) and mark them delivered
// from their own side, with who confirmed it, when, and how long it sat in
// transit all recorded on the product's log.
function PendingDeliveryPanel() {
  const { user } = useAuth();
  const [items, setItems] = useState<PendingDeliveryRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  function load() {
    api.getPendingDeliveries().then(setItems);
  }
  useEffect(() => {
    load();
  }, []);

  function toggle(qr: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(qr)) next.delete(qr);
      else next.add(qr);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === items.length ? new Set() : new Set(items.map((i) => i.qr))));
  }

  async function markDelivered() {
    setBusy(true);
    setError('');
    setMsg('');
    try {
      const res = await api.forceConfirmDelivery({ qrs: [...selected], confirmedBy: user?.name || 'Manufacturer' });
      setMsg(`Marked ${res.received.length} unit(s) as delivered.${res.invoice ? ` Invoice ${res.invoice.invoiceId} raised.` : ''}`);
      setSelected(new Set());
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not mark as delivered.');
    } finally {
      setBusy(false);
      setConfirmOpen(false);
    }
  }

  return (
    <Panel
      title="Pending Delivery"
      subtitle="Dispatched to a dealer but not yet confirmed received — the dealer either hasn't scanned it at Receive Stock yet, or never will. Select unit(s) and mark them delivered yourself if you've confirmed the delivery another way (call, WhatsApp, physical proof, etc.)."
      actions={
        selected.size > 0 && (
          <Button variant="ochre" onClick={() => setConfirmOpen(true)} disabled={busy}>
            Mark {selected.size} unit(s) as delivered
          </Button>
        )
      }
    >
      <Flash kind="err">{error}</Flash>
      <Flash kind="ok">{msg}</Flash>

      {confirmOpen && (
        <div className="border border-ochre bg-ochre/10 rounded-lg p-4 mb-4">
          <p className="text-[13px] text-ink mb-3">
            This marks {selected.size} unit(s) as delivered to the dealer without a dealer-side scan. It'll be
            logged as a manual confirmation by <strong>{user?.name}</strong>, with the date/time and how long each
            unit sat in transit. Are you sure?
          </p>
          <div className="flex gap-2">
            <Button variant="ochre" onClick={markDelivered} disabled={busy}>
              {busy ? 'Confirming…' : 'Yes, mark as delivered'}
            </Button>
            <Button variant="blue" onClick={() => setConfirmOpen(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <Table
        columns={['', 'QR', 'Batch', 'Product', 'Size', 'Dealer', 'Dispatched On', 'In Transit For', '']}
        isEmpty={items.length === 0}
        emptyLabel="Nothing pending — every dispatched unit has been received."
      >
        {items.map((row) => (
          <tr key={row.qr} className="border-b border-line">
            <td className="py-2 px-2.5">
              <input type="checkbox" checked={selected.has(row.qr)} onChange={() => toggle(row.qr)} />
            </td>
            <td className="py-2 px-2.5 mono">{row.qr}</td>
            <td className="py-2 px-2.5 mono">{row.batchId}</td>
            <td className="py-2 px-2.5">{row.product}</td>
            <td className="py-2 px-2.5">{row.size}</td>
            <td className="py-2 px-2.5">{row.dealer}</td>
            <td className="py-2 px-2.5">{row.dispatchedAt}</td>
            <td className="py-2 px-2.5">{row.duration}</td>
            <td className="py-2 px-2.5">{row.flaggedShortage && <StatusPill status="OUT">Flagged</StatusPill>}</td>
          </tr>
        ))}
      </Table>
      {items.length > 0 && (
        <button onClick={toggleAll} className="text-xs font-semibold text-blue mt-3">
          {selected.size === items.length ? 'Clear selection' : 'Select all'}
        </button>
      )}
    </Panel>
  );
}

function ShortagePanel() {
  const [items, setItems] = useState<Product[]>([]);
  useEffect(() => {
    api.getShortages().then(setItems);
  }, []);
  return (
    <Panel title="Shortage Report" subtitle="Units marked dispatched but never scanned at receipt.">
      <Table columns={['QR', 'Product', 'Size', 'Expected Holder', 'Status']} isEmpty={items.length === 0} emptyLabel="No shortages — everything dispatched has been accounted for.">
        {items.map((p) => (
          <tr key={p.qr} className="border-b border-line">
            <td className="py-2 px-2.5 mono">{p.qr}</td>
            <td className="py-2 px-2.5">{p.product}</td>
            <td className="py-2 px-2.5">{p.size}</td>
            <td className="py-2 px-2.5">{p.holder}</td>
            <td className="py-2 px-2.5"><StatusPill status={p.status} /></td>
          </tr>
        ))}
      </Table>
    </Panel>
  );
}
