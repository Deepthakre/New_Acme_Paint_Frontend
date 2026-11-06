import { useEffect, useState, type FormEvent } from 'react';
import PageShell from '../../components/layout/PageShell';
import { Panel, Table, Flash, Modal } from '../../components/ui/Misc';
import { Field, TextInput, NumberInput, Select } from '../../components/ui/Field';
import Button, { LinkButton } from '../../components/ui/Button';
import StatusPill from '../../components/ui/StatusPill';
import InvoiceCard from '../../components/ui/InvoiceCard';
import { useAuth } from '../../context/AuthContext';
import * as api from '../../lib/apiClient';
import type { DealerBalance, DealerProfile, DealerPurchaseHistory, LedgerEntry, Order, ProductCatalogItem, Voucher } from '../../types';

type PortalTab = 'orders' | 'history' | 'ledger' | 'vouchers';

export default function DealerPortalPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<PortalTab>('orders');

  if (!user) return null;

  return (
    <PageShell>
      <div className="flex gap-2 mb-5">
        {(
          [
            ['orders', 'Orders Booked By Me'],
            ['history', '📜 Purchase History'],
            ['ledger', 'Billing & Ledger'],
            ['vouchers', 'Vouchers'],
          ] as [PortalTab, string][]
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
      {tab === 'orders' && <OrdersTab dealer={user.name} />}
      {tab === 'history' && <HistoryTab dealer={user.name} />}
      {tab === 'ledger' && <LedgerTab dealer={user.name} />}
      {tab === 'vouchers' && <VouchersTab dealer={user.name} mobile={user.mobile || ''} />}
    </PageShell>
  );
}

function OrdersTab({ dealer }: { dealer: string }) {
  const [catalog, setCatalog] = useState<ProductCatalogItem[]>([]);
  const [product, setProduct] = useState('');
  const [size, setSize] = useState('');
  const [qty, setQty] = useState(10);
  const [orders, setOrders] = useState<Order[]>([]);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const availableSizes = catalog.find((p) => p.name === product)?.sizes || [];

  async function refresh() {
    const all = await api.listOrders();
    // "Booked By Me" = orders the dealer placed themselves, not ones a
    // sales rep booked on their behalf (those still show in Purchase History).
    setOrders(all.filter((o) => o.dealer === dealer && !o.bookedBy));
  }
  useEffect(() => {
    refresh();
    api.listProductCatalog().then((list) => {
      setCatalog(list);
      if (list[0]) {
        setProduct(list[0].name);
        setSize(list[0].sizes[0] || '');
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleProductChange(name: string) {
    setProduct(name);
    const p = catalog.find((x) => x.name === name);
    setSize(p?.sizes[0] || '');
  }

  async function handleOrder(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setMsg('');
    try {
      const order = await api.placeOrder({ dealer, items: [{ product, size, qty: Number(qty), mrp: null }] });
      setMsg(`Order ${order.id} placed — pending approval.`);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not place order.');
    }
  }

  return (
    <>
      <Panel title="Place an Order">
        <Flash kind="err">{error}</Flash>
        <Flash kind="ok">{msg}</Flash>
        <br />
        <form onSubmit={handleOrder} className="flex flex-wrap gap-4 items-end">
          <Field label="Product">
            <Select value={product} onChange={(e) => handleProductChange(e.target.value)}>
              {catalog.map((p) => (
                <option key={p.itemCode} value={p.name}>{p.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Size">
            <Select value={size} onChange={(e) => setSize(e.target.value)}>
              {availableSizes.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </Field>
          <Field label="Quantity">
            <NumberInput min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} required />
          </Field>
          <Button type="submit" variant="blue" disabled={catalog.length === 0}>Place Order</Button>
        </form>
      </Panel>
      <Panel title="Orders Booked By Me">
        <br />
        <Table columns={['Order', 'Items', 'Status', 'Date']} isEmpty={orders.length === 0} emptyLabel="You haven't placed any orders yourself yet.">
          {orders.slice().reverse().map((o) => (
            <tr key={o.id} className="border-b border-line align-top">
              <td className="py-2 px-2.5 mono">{o.id}</td>
              <td className="py-2 px-2.5">
                {o.items.map((it, i) => (
                  <div key={i} className="text-[12px]">{it.product} ({it.size}) × {it.qty}</div>
                ))}
              </td>
              <td className="py-2 px-2.5"><StatusPill status={o.status} /></td>
              <td className="py-2 px-2.5 text-ink-soft">{o.date}</td>
            </tr>
          ))}
        </Table>
      </Panel>
    </>
  );
}

// Full history — every order regardless of who booked it (self or a sales
// rep), every invoice raised against this dealer (from an approved order OR
// a QR stock receipt), and a simple duration/rate summary. Same data a
// sales rep or the manufacturer sees for this dealer (DashboardPage).
function HistoryTab({ dealer }: { dealer: string }) {
  const [history, setHistory] = useState<DealerPurchaseHistory | null>(null);
  const [dealerProfile, setDealerProfile] = useState<DealerProfile | null>(null);
  const [openInvoice, setOpenInvoice] = useState<LedgerEntry | null>(null);

  useEffect(() => {
    api.getDealerPurchaseHistory(dealer).then(setHistory);
    api.getDealerProfile(dealer).then(setDealerProfile);
  }, [dealer]);

  if (!history) return null;

  return (
    <>
      <Panel title={`📜 Purchase History — ${dealer}`}>
        <br />
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div className="bg-white border border-line rounded-2xl p-4 shadow-sm">
            <div className="font-display text-xl font-extrabold">₹{history.balance.billed}</div>
            <div className="text-xs text-ink-soft font-semibold uppercase">Total Billed</div>
          </div>
          <div className="bg-white border border-line rounded-2xl p-4 shadow-sm">
            <div className="font-display text-xl font-extrabold">₹{history.balance.paid}</div>
            <div className="text-xs text-ink-soft font-semibold uppercase">Total Paid</div>
          </div>
          <div className="bg-white border border-line rounded-2xl p-4 shadow-sm">
            <div className="font-display text-xl font-extrabold text-red">₹{history.balance.outstanding}</div>
            <div className="text-xs text-ink-soft font-semibold uppercase">Outstanding</div>
          </div>
        </div>
        {history.duration && (
          <div className="text-[12px] text-ink-soft mb-4">
            Buying with us since <strong>{history.duration.firstInvoiceDate}</strong> — most recent invoice{' '}
            <strong>{history.duration.lastInvoiceDate}</strong> — {history.duration.invoiceCount} invoice(s) total.
          </div>
        )}

        <div className="text-sm font-semibold mb-2">Invoices</div>
        <Table columns={['Invoice', 'Source', 'Items', 'Total (incl. GST)', 'Date', '']} isEmpty={history.invoices.length === 0} emptyLabel="No invoices yet.">
          {history.invoices.map((inv) => (
            <tr key={inv.invoiceId} className="border-b border-line align-top">
              <td className="py-2 px-2.5 mono">{inv.invoiceId}</td>
              <td className="py-2 px-2.5">{inv.orderId ? `Order ${inv.orderId}` : 'Stock Receipt'}</td>
              <td className="py-2 px-2.5">
                {(inv.items || []).map((it, i) => (
                  <div key={i} className="text-[12px]">{it.product} ({it.size}) × {it.qty} @ ₹{it.mrp}</div>
                ))}
              </td>
              <td className="py-2 px-2.5">₹{inv.amount.toFixed(2)}</td>
              <td className="py-2 px-2.5 text-ink-soft">{inv.date}</td>
              <td className="py-2 px-2.5"><LinkButton onClick={() => setOpenInvoice(inv)}>View Bill</LinkButton></td>
            </tr>
          ))}
        </Table>

        <div className="text-sm font-semibold mb-2 mt-5">Orders</div>
        <Table columns={['Order', 'Booked By', 'Items', 'Total (incl. GST)', 'Status', 'Invoice', 'Date']} isEmpty={history.orders.length === 0}>
          {history.orders.map((o) => (
            <tr key={o.id} className="border-b border-line align-top">
              <td className="py-2 px-2.5 mono">{o.id}</td>
              <td className="py-2 px-2.5">{o.bookedBy || 'Self'}</td>
              <td className="py-2 px-2.5">
                {o.items.map((it, i) => (
                  <div key={i} className="text-[12px]">{it.product} ({it.size}) × {it.qty}{it.mrp ? ` @ ₹${it.mrp}` : ''}</div>
                ))}
              </td>
              <td className="py-2 px-2.5">{o.total ? `₹${o.total}` : '—'}</td>
              <td className="py-2 px-2.5"><StatusPill status={o.status} /></td>
              <td className="py-2 px-2.5 mono text-[11px]">{o.invoiceId || '—'}</td>
              <td className="py-2 px-2.5 text-ink-soft">{o.date}</td>
            </tr>
          ))}
        </Table>
      </Panel>

      {openInvoice && (
        <Modal title={`Bill ${openInvoice.invoiceId}`} onClose={() => setOpenInvoice(null)}>
          <InvoiceCard invoice={openInvoice} dealer={dealer} dealerProfile={dealerProfile} />
        </Modal>
      )}
    </>
  );
}

function LedgerTab({ dealer }: { dealer: string }) {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [balance, setBalance] = useState<DealerBalance | null>(null);

  useEffect(() => {
    api.getLedger(dealer).then(setEntries);
    api.getDealerBalance(dealer).then(setBalance);
  }, [dealer]);

  return (
    <>
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-white border border-line rounded-2xl p-4 shadow-sm">
          <div className="font-display text-2xl font-extrabold">₹{balance?.billed ?? 0}</div>
          <div className="text-xs text-ink-soft font-semibold uppercase">Total Billed</div>
        </div>
        <div className="bg-white border border-line rounded-2xl p-4 shadow-sm">
          <div className="font-display text-2xl font-extrabold">₹{balance?.paid ?? 0}</div>
          <div className="text-xs text-ink-soft font-semibold uppercase">Total Paid</div>
        </div>
        <div className="bg-white border border-line rounded-2xl p-4 shadow-sm">
          <div className="font-display text-2xl font-extrabold text-red">₹{balance?.outstanding ?? 0}</div>
          <div className="text-xs text-ink-soft font-semibold uppercase">Outstanding</div>
        </div>
      </div>
      <Panel title="Ledger History">
        <br />
        <Table columns={['Type', 'Amount', 'Note', 'Date']} isEmpty={entries.length === 0}>
          {entries.slice().reverse().map((e, i) => (
            <tr key={i} className="border-b border-line">
              <td className="py-2 px-2.5"><StatusPill status={e.type === 'CHARGE' ? 'PENDING' : 'DISPATCHED'}>{e.type}</StatusPill></td>
              <td className="py-2 px-2.5">₹{e.amount}</td>
              <td className="py-2 px-2.5">{e.note}</td>
              <td className="py-2 px-2.5 text-ink-soft">{e.date}</td>
            </tr>
          ))}
        </Table>
      </Panel>
    </>
  );
}

type VoucherStep = 'request' | 'verify';

function VouchersTab({ dealer, mobile }: { dealer: string; mobile: string }) {
  const [step, setStep] = useState<VoucherStep>('request');
  const [enteredOtp, setEnteredOtp] = useState('');
  const [code, setCode] = useState('');
  const [discount, setDiscount] = useState(100);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  async function refresh() {
    setVouchers(await api.listVouchers(dealer));
  }
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSendOtp() {
    setError('');
    try {
      await api.sendVoucherOtp();
      setStep('verify');
      setMsg(`OTP sent to your registered mobile ending ${mobile.slice(-4)}. It expires in 5 minutes.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send OTP.');
    }
  }

  async function handleRedeem(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    try {
      // The OTP is verified by the server, never in the browser.
      await api.redeemVoucher({ code, discount: Number(discount), otp: enteredOtp });
      setMsg('Voucher redeemed successfully.');
      setStep('request');
      setEnteredOtp('');
      setCode('');
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not redeem voucher.');
    }
  }

  return (
    <>
      <Panel title="Redeem Loyalty Voucher">
        <Flash kind="err">{error}</Flash>
        <Flash kind="ok">{msg}</Flash>
        <br />
        {step === 'request' ? (
          <div className="flex flex-wrap gap-4 items-end">
            <Field label="Voucher code">
              <TextInput value={code} onChange={(e) => setCode(e.target.value)} placeholder="TP-LOYAL-2026" />
            </Field>
            <Field label="Discount amount (₹)">
              <NumberInput min={0} value={discount} onChange={(e) => setDiscount(Number(e.target.value))} />
            </Field>
            <Button type="button" variant="violet" onClick={handleSendOtp} disabled={!code || !mobile}>
              Send OTP
            </Button>
          </div>
        ) : (
          <form onSubmit={handleRedeem} className="flex flex-wrap gap-4 items-end">
            <Field label="Enter OTP">
              <TextInput
                value={enteredOtp}
                onChange={(e) => setEnteredOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="6-digit code"
                required
                autoFocus
              />
            </Field>
            <Button type="submit" variant="violet">Confirm Redemption</Button>
          </form>
        )}
      </Panel>
      <Panel title="Voucher History">
        <br />
        <Table columns={['Voucher', 'Code', 'Discount', 'Status', 'Date']} isEmpty={vouchers.length === 0}>
          {vouchers.slice().reverse().map((v) => (
            <tr key={v.id} className="border-b border-line">
              <td className="py-2 px-2.5 mono">{v.id}</td>
              <td className="py-2 px-2.5">{v.code}</td>
              <td className="py-2 px-2.5">₹{v.discount}</td>
              <td className="py-2 px-2.5"><StatusPill status="DISPATCHED">{v.status}</StatusPill></td>
              <td className="py-2 px-2.5 text-ink-soft">{v.date}</td>
            </tr>
          ))}
        </Table>
      </Panel>
    </>
  );
}
