import { useCallback, useEffect, useState ,useRef } from 'react';
import PageShell from '../../components/layout/PageShell';
import { Panel, Table, StatCard, Modal ,Flash } from '../../components/ui/Misc';
import { Field, Select,TextInput } from '../../components/ui/Field';
import Button, { LinkButton } from '../../components/ui/Button';
import StatusPill from '../../components/ui/StatusPill';
import InvoiceCard from '../../components/ui/InvoiceCard';
import * as api from '../../lib/apiClient';
import { downloadAdminReport } from '../../lib/adminExport';
import { STATUS_LABELS } from '../../lib/constants';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import type { DashboardStats, DealerPaymentStatusRow, DealerProfile, DealerPurchaseHistory, LedgerEntry, Order, Product,ProductStatus  } from '../../types';
import PainterRewardsPanel from './PainterRewardsPanel';
export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  // const [log, setLog] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [payments, setPayments] = useState<DealerPaymentStatusRow[]>([]);
  const [shortages, setShortages] = useState<Product[]>([]);
  const [dealerNames, setDealerNames] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  const refreshOrders = useCallback(async () => {
    const all = await api.listOrders();
    setOrders(all.filter((o) => o.status === 'PENDING'));
  }, []);

  useEffect(() => {
    api.getDashboardStats().then(setStats);
    // api.getFullProductLog().then(setLog);
    api.getAllDealersPaymentStatus().then((rows) => {
      setPayments(rows);
      setDealerNames(rows.map((r) => r.dealer));
    });
    api.getShortages().then(setShortages);
    refreshOrders();
  }, [refreshOrders]);

  async function decide(orderId: string, decision: 'approve' | 'reject') {
    await api.decideOrder({ orderId, decision });
    refreshOrders();
    api.getAllDealersPaymentStatus().then(setPayments); // invoice may have just posted to the ledger
  }

  async function handleFullExport() {
    setExporting(true);
    setExportError('');
    try {
      await downloadAdminReport();
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Could not generate the report.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <PageShell>
      <Panel
        title="📊 Full Admin Report"
        subtitle="One Excel file, styled and colour-coded, covering every module you manage — catalog, accessories, batches, the full QR product log, warehouse dispatch, shortages, dealer payments, orders, and every invoice/payment."
        actions={
          <Button variant="green" onClick={handleFullExport} disabled={exporting}>
            {exporting ? 'Preparing report…' : '⬇ Download Full Admin Report (.xlsx)'}
          </Button>
        }
      >
        {exportError && <div className="text-red text-[13px] font-semibold">{exportError}</div>}
      </Panel>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        <StatCard n={stats?.totalProduced ?? '—'} label="Total Produced" />
        <StatCard n={stats?.factory ?? '—'} label="In Factory" />
        <StatCard n={stats?.transit ?? '—'} label="In Transit" />
        <StatCard n={stats?.dealerStock ?? '—'} label="Dealer Stock" />
        <StatCard n={stats?.sold ?? '—'} label="Sold" />
      </div>

      <Panel title="📥 Pending Dealer Orders — Approve / Reject" subtitle="Dealer and sales-rep-booked orders waiting on your decision. Approving an order with MRP on every line auto-generates its GST invoice.">
        <br />
        <Table
          columns={['Order', 'Dealer', 'Booked By', 'Items', 'Total (incl. GST)', '']}
          isEmpty={orders.length === 0}
          emptyLabel="No pending orders."
        >
          {orders.map((o) => (
            <tr key={o.id} className="border-b border-line align-top">
              <td className="py-2 px-2.5 mono">{o.id}</td>
              <td className="py-2 px-2.5">{o.dealer}</td>
              <td className="py-2 px-2.5">{o.bookedBy || 'Self'}</td>
              <td className="py-2 px-2.5">
                {o.items.map((it, i) => (
                  <div key={i} className="text-[12px]">{it.product} ({it.size}) × {it.qty}</div>
                ))}
              </td>
              <td className="py-2 px-2.5">{o.total ? `₹${o.total}` : '—'}</td>
              <td className="py-2 px-2.5 flex gap-2">
                <LinkButton onClick={() => decide(o.id, 'approve')}>Approve</LinkButton>
                <LinkButton onClick={() => decide(o.id, 'reject')} className="text-red">Reject</LinkButton>
              </td>
            </tr>
          ))}
        </Table>
      </Panel>

      <Panel title="All Dealers — Payment Status">
        <br />
        <Table columns={['Dealer', 'Billed', 'Paid', 'Outstanding']} isEmpty={payments.length === 0}>
          {payments.map((p) => (
            <tr key={p.dealer} className="border-b border-line">
              <td className="py-2 px-2.5">{p.dealer}</td>
              <td className="py-2 px-2.5">₹{p.billed}</td>
              <td className="py-2 px-2.5">₹{p.paid}</td>
              <td className="py-2 px-2.5">
                <span className={p.outstanding > 0 ? 'text-red font-semibold' : 'text-green font-semibold'}>₹{p.outstanding}</span>
              </td>
            </tr>
          ))}
        </Table>
      </Panel>

      <DealerHistoryLookup dealerNames={dealerNames} />

    {/* <Panel title={undefined}><PainterRewardsPanel /></Panel>    */}
    <PainterRewardsPanel></PainterRewardsPanel>

      <Panel title="⚠ Shortage Report" subtitle="Dispatched but never confirmed received.">
        <br />
        <Table columns={['QR', 'Product', 'Size', 'Expected Holder', 'Status']} isEmpty={shortages.length === 0} emptyLabel="No shortages — everything dispatched has been accounted for.">
          {shortages.map((p) => (
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

      <FullProductLogPanel />
    </PageShell>
  );
}

const LOG_PAGE_SIZE = 10;
const LOG_STATUS_OPTIONS: ProductStatus[] = ['FACTORY', 'TRANSIT', 'DEALER', 'SOLD', 'RETURNED'];

function FullProductLogPanel() {
  const [rows, setRows] = useState<Product[]>([]);
  const [total, setTotal] = useState(0); // total units matching current filters (from server)
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false); // first page / filter change
  const [loadingMore, setLoadingMore] = useState(false); // "Show more" click
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [statusFilter, setStatusFilter] = useState<ProductStatus | 'all'>('all');

  // Only the latest request may update state — stops a slow older response
  // (e.g. while the user keeps typing) from overwriting a newer one.
  const reqIdRef = useRef(0);

  const fetchPage = useCallback(
    async (pageNo: number, replace: boolean) => {
      const reqId = ++reqIdRef.current;
      if (replace) setLoading(true);
      else setLoadingMore(true);
      setError('');
      try {
        const { data, pagination } = await api.paged.fullProductLog({
          page: pageNo,
          limit: LOG_PAGE_SIZE,
          sort: '-_id', // unique + stable, so "Show more" never skips/duplicates rows
          search: debouncedSearch.trim() || undefined,
          status: statusFilter === 'all' ? undefined : statusFilter,
        });
        if (reqId !== reqIdRef.current) return; // stale response — ignore
        setRows((prev) => {
          if (replace) return data;
          const seen = new Set(prev.map((p) => p.qr));
          return [...prev, ...data.filter((p) => !seen.has(p.qr))];
        });
        setPage(pagination.page);
        setTotal(pagination.totalItems);
        setHasMore(pagination.hasNextPage);
      } catch (err) {
        if (reqId !== reqIdRef.current) return;
        setError(err instanceof Error ? err.message : 'Could not load the product log.');
      } finally {
        if (reqId === reqIdRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [debouncedSearch, statusFilter]
  );

  // Page 1 loads on mount and again (from the top) whenever search/status changes.
  useEffect(() => {
    fetchPage(1, true);
  }, [fetchPage]);

  return (
    <Panel
      title="Full Product Log"
      subtitle={`Showing ${rows.length} of ${total}${
        statusFilter === 'all' ? '' : ` ${STATUS_LABELS[statusFilter]}`
      } units, newest first. Full data (all rows) is in the Product Log sheet of the Full Admin Report above.`}
    >
      <br />
      <Flash kind="err">{error}</Flash>
      <div className="flex flex-wrap gap-3 mb-4 items-end">
        <Field label="Search QR / Batch / Product / Holder" className="flex-1 min-w-[220px]">
          <TextInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="PRD-2026-004522, BATCH-0046, Royale Blue, dealer name…"
          />
        </Field>
        <Field label="Status">
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as ProductStatus | 'all')}>
            <option value="all">All</option>
            {LOG_STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Table
        columns={['QR', 'Batch', 'Product', 'Size', 'Status', 'Holder']}
        isEmpty={rows.length === 0}
        emptyLabel={loading ? 'Loading…' : 'No units match.'}
      >
        {rows.map((p) => (
          <tr key={p.qr} className="border-b border-line">
            <td className="py-2 px-2.5 mono">{p.qr}</td>
            <td className="py-2 px-2.5 mono">{p.batchId}</td>
            <td className="py-2 px-2.5">{p.product}</td>
            <td className="py-2 px-2.5">{p.size}</td>
            <td className="py-2 px-2.5"><StatusPill status={p.status} /></td>
            <td className="py-2 px-2.5">{p.holder}</td>
          </tr>
        ))}
      </Table>

      {hasMore && (
        <div className="flex justify-center mt-4">
          <LinkButton type="button" onClick={() => fetchPage(page + 1, false)} disabled={loadingMore || loading}>
            {loadingMore ? 'Loading…' : `Show more (${Math.min(LOG_PAGE_SIZE, Math.max(total - rows.length, 0))} more)`}
          </LinkButton>
        </div>
      )}
    </Panel>
  );
}

function DealerHistoryLookup({ dealerNames }: { dealerNames: string[] }) {
  const [dealer, setDealer] = useState('');
  const [history, setHistory] = useState<DealerPurchaseHistory | null>(null);
  const [dealerProfile, setDealerProfile] = useState<DealerProfile | null>(null);
  const [openInvoice, setOpenInvoice] = useState<LedgerEntry | null>(null);

  useEffect(() => {
    if (dealerNames.length && !dealer) setDealer(dealerNames[0]);
  }, [dealerNames, dealer]);

  useEffect(() => {
    if (dealer) {
      api.getDealerPurchaseHistory(dealer).then(setHistory);
      api.getDealerProfile(dealer).then(setDealerProfile);
      setOpenInvoice(null);
    }
  }, [dealer]);

  return (
    <>
      <Panel title="Dealer Purchase History Lookup" subtitle="Every order, invoice and rate this dealer has ever been billed at — same view a sales rep sees for them.">
        <br />
        <Field label="Dealer" className="mb-4 max-w-xs">
          <Select value={dealer} onChange={(e) => setDealer(e.target.value)}>
            {dealerNames.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </Select>
        </Field>

        {history && (
          <>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div className="bg-white border border-line rounded-2xl p-4 shadow-sm">
                <div className="font-display text-lg font-extrabold">₹{history.balance.billed}</div>
                <div className="text-xs text-ink-soft font-semibold uppercase">Total Billed</div>
              </div>
              <div className="bg-white border border-line rounded-2xl p-4 shadow-sm">
                <div className="font-display text-lg font-extrabold">₹{history.balance.paid}</div>
                <div className="text-xs text-ink-soft font-semibold uppercase">Total Paid</div>
              </div>
              <div className="bg-white border border-line rounded-2xl p-4 shadow-sm">
                <div className="font-display text-lg font-extrabold text-red">₹{history.balance.outstanding}</div>
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

            <div className="text-sm font-semibold mb-2 mt-5">Rate History — every product/size this dealer has been billed at</div>
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
