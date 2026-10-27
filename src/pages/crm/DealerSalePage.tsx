import { useEffect, useRef, useState, type FormEvent } from 'react';
import PageShell from '../../components/layout/PageShell';
import { Panel, Table, Flash, Modal } from '../../components/ui/Misc';
import { Field, TextInput, Select } from '../../components/ui/Field';
import Button, { LinkButton } from '../../components/ui/Button';
import StatusPill from '../../components/ui/StatusPill';
import InvoiceCard from '../../components/ui/InvoiceCard';
import { useAuth } from '../../context/AuthContext';
import * as api from '../../lib/apiClient';
import { extractScannedId } from '../../lib/qr';
import type { ConfirmReceiptResult, DealerProfile, LedgerEntry, Product, ScannedItem } from '../../types';

type DealerSaleTab = 'receive' | 'sell' | 'returns' | 'stock';

export default function DealerSalePage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<DealerSaleTab>('sell');
  const [stock, setStock] = useState<Product[]>([]);

  async function refreshStock() {
    if (!user) return;
    setStock(await api.getDealerStock(user.name));
  }
  useEffect(() => {
    refreshStock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!user) return null;

  return (
    <PageShell>
      <div className="flex gap-2 mb-5">
        {(
          [
            ['receive', 'Receive Stock'],
            ['sell', 'Sell to Customer'],
            ['returns', 'Process Return'],
            ['stock', 'My Stock'],
          ] as [DealerSaleTab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-md text-sm font-semibold ${tab === key ? 'bg-blue text-white' : 'bg-white border border-line text-ink-soft'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'receive' && <ReceivePanel dealer={user.name} onDone={refreshStock} />}
      {tab === 'sell' && <SellPanel dealer={user.name} onSold={refreshStock} />}
      {tab === 'returns' && <ReturnPanel dealer={user.name} onDone={refreshStock} />}
      {tab === 'stock' && <StockPanel stock={stock} dealer={user.name} />}
    </PageShell>
  );
}

function ReceivePanel({ dealer, onDone }: { dealer: string; onDone: () => void }) {
  const [scanValue, setScanValue] = useState('');
  const [scanned, setScanned] = useState<ScannedItem[]>([]);
  const [result, setResult] = useState<ConfirmReceiptResult | null>(null);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleScan(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const qr = extractScannedId(scanValue);
    setScanValue('');
    // Refocus immediately so a handheld 2D barcode scanner (e.g. HENEX,
    // set up as a USB/Bluetooth "keyboard wedge") can keep firing
    // scan → Enter → scan → Enter back-to-back without anyone touching
    // the mouse — same as a retail checkout scanner.
    inputRef.current?.focus();
    if (!qr) return;
    if (scanned.some((s) => s.qr === qr)) return; // already scanned
    const info = await api.getProductByQr(qr);
    setScanned((prev) => [...prev, info ? { qr, product: info.product, size: info.size } : { qr, notFound: true }]);
  }

  function removeScan(qr: string) {
    setScanned((prev) => prev.filter((s) => s.qr !== qr));
  }

  async function handleConfirmReceipt() {
    setError('');
    try {
      const res = await api.confirmReceipt({ dealer, qrs: scanned.map((s) => s.qr) });
      setResult(res);
      setScanned([]);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not confirm receipt.');
    }
  }

  return (
    <Panel
      title="Receive Stock"
      subtitle="Scan every unit as it arrives at your shop. Anything dispatched to you but not scanned here shows up on the factory's Shortage Report — nothing disappears silently."
    >
      <br/>
      <Flash kind="err">{error}</Flash>
      {result && (
        <Flash kind={result.shortage.length ? 'err' : 'ok'}>
          Received {result.received.length} unit(s).{' '}
          {result.shortage.length > 0 && `${result.shortage.length} unit(s) were dispatched to you but not scanned — flagged as shortage.`}
        </Flash>
      )}

      <p className="text-xs text-ink-soft mb-3">
        Type the code, or connect a handheld 2D barcode scanner (USB/Bluetooth, e.g. HENEX) — it types the scanned
        code into this box and presses Enter automatically. The box stays focused after every scan, so you can keep
        scanning one unit after another without touching the mouse.
      </p>
      <form onSubmit={handleScan} className="flex gap-3 items-end mb-3">
        <Field label="Scan or type QR" className="flex-1">
          <TextInput ref={inputRef} value={scanValue} onChange={(e) => setScanValue(e.target.value)} autoFocus placeholder="PRD-2026-004522" />
        </Field>
        <Button type="submit" variant="blue">Add scan</Button>
      </form>

      <div className="text-[13px] text-ink-soft mb-2">{scanned.length} unit(s) scanned</div>
      {scanned.length > 0 && (
        <Button variant="green" onClick={handleConfirmReceipt} className="mb-4">
          Confirm receipt
        </Button>
      )}

      {scanned.length > 0 && (
        <div className="border border-line rounded-2xl mb-4 overflow-hidden shadow-sm">
          <Table columns={['QR', 'Product', 'Size', '']} isEmpty={false}>
            {scanned.map((s) => (
              <tr key={s.qr} className="border-b border-line">
                <td className="py-2 px-2.5 mono">{s.qr}</td>
                <td className="py-2 px-2.5">{s.notFound ? <span className="text-red">QR not recognized</span> : s.product}</td>
                <td className="py-2 px-2.5">{s.notFound ? '—' : s.size}</td>
                <td className="py-2 px-2.5">
                  <LinkButton onClick={() => removeScan(s.qr)} className="text-red">Remove</LinkButton>
                </td>
              </tr>
            ))}
          </Table>
        </div>
      )}

      {result && result.received.length > 0 && (
        <div className="mt-5">
          <div className="text-sm font-semibold mb-2">Items just received</div>
          <Table columns={['QR', 'Product', 'Size']} isEmpty={false}>
            {result.received.map((p) => (
              <tr key={p.qr} className="border-b border-line">
                <td className="py-2 px-2.5 mono">{p.qr}</td>
                <td className="py-2 px-2.5">{p.product}</td>
                <td className="py-2 px-2.5">{p.size}</td>
              </tr>
            ))}
          </Table>
        </div>
      )}

      {result && result.shortage.length > 0 && (
        <div className="mt-5">
          <div className="text-sm font-semibold mb-2 text-red">Dispatched but not scanned (shortage)</div>
          <Table columns={['QR', 'Product', 'Size']} isEmpty={false}>
            {result.shortage.map((p) => (
              <tr key={p.qr} className="border-b border-line">
                <td className="py-2 px-2.5 mono">{p.qr}</td>
                <td className="py-2 px-2.5">{p.product}</td>
                <td className="py-2 px-2.5">{p.size}</td>
              </tr>
            ))}
          </Table>
        </div>
      )}
    </Panel>
  );
}

function SellPanel({ dealer, onSold }: { dealer: string; onSold: () => void }) {
  const [qr, setQr] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  async function handleSell(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setMsg('');
    try {
      const p = await api.sellToCustomer({ qr: extractScannedId(qr), dealer, customerName });
      setMsg(`Sold ${p.product} (${p.size}) — QR ${p.qr} — to ${customerName || 'walk-in customer'}.`);
      setQr('');
      setCustomerName('');
      onSold();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sale failed.');
    }
  }

  return (
    <Panel title="Sell to Customer" subtitle="Scan the unit's QR to close its journey and hand over ownership.">
      <Flash kind="err">{error}</Flash>
      <Flash kind="ok">{msg}</Flash>
      <br/>
      <form onSubmit={handleSell} className="flex flex-wrap gap-4 items-end">
        <Field label="Product QR">
          <TextInput value={qr} onChange={(e) => setQr(e.target.value)} placeholder="PRD-2026-004522" required autoFocus />
        </Field>
        <Field label="Customer name (optional)">
          <TextInput value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Walk-in customer" />
        </Field>
        <Button type="submit" variant="green">Complete Sale</Button>
      </form>
    </Panel>
  );
}

function ReturnPanel({ dealer, onDone }: { dealer: string; onDone: () => void }) {
  const [qr, setQr] = useState('');
  const [reason, setReason] = useState('Customer changed mind');
  const [condition, setCondition] = useState<'resellable' | 'damaged'>('resellable');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  async function handleReturn(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setMsg('');
    try {
      const p = await api.processReturn({ qr: extractScannedId(qr), reason, condition, dealer });
      setMsg(`Return processed for ${p.qr} — marked as ${condition === 'resellable' ? 'back in dealer stock' : 'returned to factory'}.`);
      setQr('');
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Return failed.');
    }
  }

  return (
    <Panel title="Process a Return">
      <Flash kind="err">{error}</Flash>
      <Flash kind="ok">{msg}</Flash>
      <br/>
      <form onSubmit={handleReturn} className="flex flex-wrap gap-4 items-end">
        <Field label="Product QR">
          <TextInput value={qr} onChange={(e) => setQr(e.target.value)} required />
        </Field>
        <Field label="Reason">
          <Select value={reason} onChange={(e) => setReason(e.target.value)}>
            <option>Customer changed mind</option>
            <option>Wrong shade delivered</option>
            <option>Damaged packaging</option>
            <option>Other</option>
          </Select>
        </Field>
        <Field label="Condition">
          <Select value={condition} onChange={(e) => setCondition(e.target.value as 'resellable' | 'damaged')}>
            <option value="resellable">Resellable — back to stock</option>
            <option value="damaged">Damaged — send to factory</option>
          </Select>
        </Field>
        <Button type="submit" variant="ochre">Process Return</Button>
      </form>
    </Panel>
  );
}

function StockPanel({ stock, dealer }: { stock: Product[]; dealer: string }) {
  const [dealerProfile, setDealerProfile] = useState<DealerProfile | null>(null);
  const [openInvoice, setOpenInvoice] = useState<LedgerEntry | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    api.getDealerProfile(dealer).then(setDealerProfile);
  }, [dealer]);

  async function viewInvoice(invoiceId: string) {
    setLoadingId(invoiceId);
    const inv = await api.getInvoiceById(invoiceId);
    setLoadingId(null);
    setOpenInvoice(inv);
  }

  return (
    <>
      <Panel title="My Dealer Stock">
        <br/>
        <Table columns={['QR', 'Product', 'Size', 'Status', 'Invoice']} isEmpty={stock.length === 0} emptyLabel="No stock received yet.">
          {stock.map((p) => (
            <tr key={p.qr} className="border-b border-line">
              <td className="py-2 px-2.5 mono">{p.qr}</td>
              <td className="py-2 px-2.5">{p.product}</td>
              <td className="py-2 px-2.5">{p.size}</td>
              <td className="py-2 px-2.5"><StatusPill status={p.status} /></td>
              <td className="py-2 px-2.5">
                {p.invoiceId ? (
                  <LinkButton onClick={() => viewInvoice(p.invoiceId!)}>
                    {loadingId === p.invoiceId ? 'Opening…' : `View Invoice (${p.invoiceId})`}
                  </LinkButton>
                ) : (
                  <span className="text-ink-soft text-[12px]">—</span>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </Panel>

      {openInvoice && (
        <Modal title={`Invoice ${openInvoice.invoiceId}`} onClose={() => setOpenInvoice(null)}>
          <InvoiceCard invoice={openInvoice} dealer={dealer} dealerProfile={dealerProfile} />
        </Modal>
      )}
    </>
  );
}
