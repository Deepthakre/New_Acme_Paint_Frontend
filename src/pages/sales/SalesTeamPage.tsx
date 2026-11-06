import { useEffect, useState, type FormEvent } from 'react';
import PageShell from '../../components/layout/PageShell';
import { Panel, Table, Flash, ProgressBar, Modal } from '../../components/ui/Misc';
import { Field, Select, NumberInput } from '../../components/ui/Field';
import Button, { LinkButton } from '../../components/ui/Button';
import StatusPill from '../../components/ui/StatusPill';
import InvoiceCard from '../../components/ui/InvoiceCard';
import { useAuth } from '../../context/AuthContext';
import * as api from '../../lib/apiClient';
import { GST_RATE } from '../../lib/constants';
import type { DealerProfile, DealerPurchaseHistory, LedgerEntry, Order, OrderItemInput, ProductCatalogItem, User } from '../../types';

type SalesTab = 'book' | 'history';

export default function SalesTeamPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<SalesTab>('book');

  if (!user) return null;

  return (
    <PageShell>
      <div className="flex gap-2 mb-5">
        {(
          [
            ['book', 'Book Order for Dealer'],
            ['history', 'Dealer Purchase History'],
          ] as [SalesTab, string][]
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
      {tab === 'book' && <BookOrderTab user={user} />}
      {tab === 'history' && <DealerHistoryTab user={user} />}
    </PageShell>
  );
}

interface CartLine {
  product: string;
  size: string;
  qty: number;
  mrp: number | null;
}

function BookOrderTab({ user }: { user: User }) {
  const [catalog, setCatalog] = useState<ProductCatalogItem[]>([]);
  const [dealer, setDealer] = useState(user.dealers?.[0] || '');
  const [product, setProduct] = useState('');
  const [size, setSize] = useState('');
  const [qty, setQty] = useState<number | string>(20);
  const [mrp, setMrp] = useState<number | string>(''); // optional per line
  const [cart, setCart] = useState<CartLine[]>([]); // multiple products in one order
  const [orders, setOrders] = useState<Order[]>([]);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const availableSizes = catalog.find((p) => p.name === product)?.sizes || [];

  async function refresh() {
    const all = await api.listOrders();
    setOrders(all.filter((o) => o.bookedBy === user.name));
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

  const totalBooked = orders.reduce((s, o) => s + o.items.reduce((si, it) => si + it.qty, 0), 0);
  const targetPct = user.target ? Math.round((totalBooked / user.target) * 100) : 0;

  function addToCart() {
    if (!product || !size || !qty) return;
    setCart((c) => [...c, { product, size, qty: Number(qty), mrp: mrp !== '' ? Number(mrp) : null }]);
    setQty(20);
    setMrp('');
  }

  function removeFromCart(idx: number) {
    setCart((c) => c.filter((_, i) => i !== idx));
  }

  const cartPriced = cart.filter((it): it is CartLine & { mrp: number } => it.mrp !== null);
  const subtotal = cartPriced.reduce((s, it) => s + it.mrp * it.qty, 0);
  const gst = Math.round(subtotal * GST_RATE * 100) / 100;
  const total = Math.round((subtotal + gst) * 100) / 100;

  async function handleBook(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setMsg('');
    const items: OrderItemInput[] =
      cart.length > 0 ? cart : product && size && qty ? [{ product, size, qty: Number(qty), mrp: mrp !== '' ? Number(mrp) : null }] : [];
    if (items.length === 0) {
      setError('Add at least one product to the order.');
      return;
    }
    try {
      const order = await api.placeOrder({ dealer, items, bookedBy: user.name });
      setMsg(`Booked order ${order.id} for ${dealer} — pending admin approval.` + (order.total ? ` Estimated total ₹${order.total} (incl. GST).` : ''));
      setCart([]);
      setQty(20);
      setMrp('');
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not book order.');
    }
  }

  return (
    <>
      <Panel title="Target Progress" subtitle={`Monthly target: ${user.target ?? '—'} units`}>
        <br />
        <div className="text-sm font-semibold mb-1">{totalBooked} / {user.target ?? 0} units booked</div>
        <ProgressBar pct={targetPct} />
      </Panel>

      <Panel title="Book Order for Dealer" subtitle="MRP is optional — add it per product if you want an estimated GST invoice, or leave it blank and admin will bill manually. Add multiple products before submitting.">
        <Flash kind="err">{error}</Flash>
        <Flash kind="ok">{msg}</Flash>
        <br />
        <Field label="Dealer" className="mb-4 max-w-xs">
          <Select value={dealer} onChange={(e) => setDealer(e.target.value)}>
            {(user.dealers || []).map((d) => (
              <option key={d}>{d}</option>
            ))}
          </Select>
        </Field>

        <div className="flex flex-wrap gap-4 items-end mb-3">
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
            <NumberInput min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
          </Field>
          <Field label="MRP (₹) — optional">
            <NumberInput min={0} placeholder="Leave blank if unknown" value={mrp} onChange={(e) => setMrp(e.target.value)} />
          </Field>
          <LinkButton type="button" onClick={addToCart} disabled={catalog.length === 0}>+ Add to order</LinkButton>
        </div>

        {cart.length > 0 && (
          <div className="border border-line rounded-2xl p-3 mb-4 shadow-sm">
            <Table columns={['Product', 'Size', 'Qty', 'MRP', 'Line Total', '']} isEmpty={false}>
              {cart.map((it, i) => (
                <tr key={i} className="border-b border-line">
                  <td className="py-2 px-2.5">{it.product}</td>
                  <td className="py-2 px-2.5">{it.size}</td>
                  <td className="py-2 px-2.5">{it.qty}</td>
                  <td className="py-2 px-2.5">{it.mrp ? `₹${it.mrp}` : '—'}</td>
                  <td className="py-2 px-2.5">{it.mrp ? `₹${it.mrp * it.qty}` : '—'}</td>
                  <td className="py-2 px-2.5">
                    <LinkButton onClick={() => removeFromCart(i)} className="text-red">Remove</LinkButton>
                  </td>
                </tr>
              ))}
            </Table>
            {subtotal > 0 && (
              <div className="text-sm mt-3 pt-3 border-t border-line flex flex-col gap-1 items-end">
                <div>Subtotal: ₹{subtotal}</div>
                <div>GST ({(GST_RATE * 100).toFixed(0)}%): ₹{gst}</div>
                <div className="font-bold text-base">Estimated Total: ₹{total}</div>
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleBook}>
          <Button type="submit" variant="blue" disabled={catalog.length === 0}>
            Book Order{cart.length > 1 ? ` (${cart.length} products)` : ''}
          </Button>
        </form>
      </Panel>

      <Panel title="My Booked Orders">
        <br />
        <Table columns={['Order', 'Dealer', 'Items', 'Total (incl. GST)', 'Status', 'Invoice']} isEmpty={orders.length === 0}>
          {orders.slice().reverse().map((o) => (
            <tr key={o.id} className="border-b border-line align-top">
              <td className="py-2 px-2.5 mono">{o.id}</td>
              <td className="py-2 px-2.5">{o.dealer}</td>
              <td className="py-2 px-2.5">
                {o.items.map((it, i) => (
                  <div key={i} className="text-[12px]">{it.product} ({it.size}) × {it.qty}</div>
                ))}
              </td>
              <td className="py-2 px-2.5">{o.total ? `₹${o.total}` : '—'}</td>
              <td className="py-2 px-2.5"><StatusPill status={o.status} /></td>
              <td className="py-2 px-2.5 mono text-[11px]">{o.invoiceId || '—'}</td>
            </tr>
          ))}
        </Table>
      </Panel>
    </>
  );
}

function DealerHistoryTab({ user }: { user: User }) {
  const [dealer, setDealer] = useState(user.dealers?.[0] || '');
  const [history, setHistory] = useState<DealerPurchaseHistory | null>(null);
  const [dealerProfile, setDealerProfile] = useState<DealerProfile | null>(null);
  const [openInvoice, setOpenInvoice] = useState<LedgerEntry | null>(null);

  useEffect(() => {
    if (dealer) {
      api.getDealerPurchaseHistory(dealer).then(setHistory);
      api.getDealerProfile(dealer).then(setDealerProfile);
      setOpenInvoice(null);
    }
  }, [dealer]);

  return (
    <>
      <Panel title={`📜 Purchase History — ${dealer || 'Select a dealer'}`}>
        <br />
        <Field label="Dealer" className="mb-4 max-w-xs">
          <Select value={dealer} onChange={(e) => setDealer(e.target.value)}>
            {(user.dealers || []).map((d) => (
              <option key={d}>{d}</option>
            ))}
          </Select>
        </Field>

        {history && (
          <>
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
                Dealer since <strong>{history.duration.firstInvoiceDate}</strong> — last billed{' '}
                <strong>{history.duration.lastInvoiceDate}</strong> — {history.duration.invoiceCount} invoice(s) total.
              </div>
            )}

            <div className="text-sm font-semibold mb-2">Invoices</div>
            <Table columns={['Invoice', 'Source', 'Items', 'Total (incl. GST)', 'Date', '']} isEmpty={history.invoices.length === 0} emptyLabel="No invoices for this dealer yet.">
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

            <div className="text-sm font-semibold mb-2 mt-5">Rate History</div>
            <Table columns={['Product', 'Size', 'Qty', 'Rate (₹)', 'Invoice', 'Date']} isEmpty={history.rateHistory.length === 0} emptyLabel="No rate history yet.">
              {history.rateHistory.map((r, i) => (
                <tr key={i} className="border-b border-line">
                  <td className="py-2 px-2.5">{r.product}</td>
                  <td className="py-2 px-2.5">{r.size}</td>
                  <td className="py-2 px-2.5">{r.qty}</td>
                  <td className="py-2 px-2.5">₹{r.mrp}</td>
                  <td className="py-2 px-2.5 mono text-[11px]">{r.invoiceId}</td>
                  <td className="py-2 px-2.5 text-ink-soft">{r.date}</td>
                </tr>
              ))}
            </Table>

            <div className="text-sm font-semibold mb-2 mt-5">Orders</div>
            <Table columns={['Order', 'Booked By', 'Items', 'Total', 'Status', 'Invoice', 'Date']} isEmpty={history.orders.length === 0}>
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
          </>
        )}
      </Panel>

      {openInvoice && (
        <Modal title={`Bill ${openInvoice.invoiceId}`} onClose={() => setOpenInvoice(null)}>
          <InvoiceCard invoice={openInvoice} dealer={dealer} dealerProfile={dealerProfile} />
        </Modal>
      )}
    </>
  );
}
