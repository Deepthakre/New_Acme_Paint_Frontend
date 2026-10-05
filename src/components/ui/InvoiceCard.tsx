import { COMPANY_INFO } from '../../lib/constants';
import Button, { LinkButton } from './Button';
import type { DealerProfile, LedgerEntry } from '../../types';

interface InvoiceCardProps {
  invoice: LedgerEntry | null;
  dealer?: string;
  dealerProfile?: DealerProfile | null;
  onClose?: () => void;
  printable?: boolean;
}

// A real-looking GST tax invoice — company letterhead, Bill To, itemized
// rate/qty/amount lines, GST breakup, grand total. Used in three places so
// the same bill always looks the same wherever it's read from:
//  1. Right after a dealer confirms a stock receipt (DealerSalePage)
//  2. The dealer's own "Purchase History" tab (DealerPortalPage)
//  3. The manufacturer's "Dealer Purchase History Lookup" (DashboardPage)
export default function InvoiceCard({ invoice, dealer, dealerProfile, onClose, printable = true }: InvoiceCardProps) {
  if (!invoice) return null;
  const gstPct = Math.round((invoice.gstRate ?? 0.18) * 100);

  return (
    <div className="bg-white border border-line/70 rounded-2xl shadow-sm p-5 max-w-[640px]">
      <div className="print-area">
        <div className="flex justify-between items-start border-b border-line pb-3 mb-3">
          <div>
            <div className="font-display text-lg font-extrabold">{COMPANY_INFO.manufacturedBy}</div>
            <div className="text-[11px] text-ink-soft max-w-[280px]">{COMPANY_INFO.address}</div>
            <div className="text-[11px] text-ink-soft">{COMPANY_INFO.email} · {COMPANY_INFO.helpline}</div>
          </div>
          <div className="text-right">
            <div className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">Tax Invoice</div>
            <div className="font-mono text-sm font-bold">{invoice.invoiceId}</div>
            <div className="text-[11px] text-ink-soft">{invoice.date}</div>
          </div>
        </div>

        <div className="mb-3">
          <div className="text-[11px] font-bold uppercase tracking-wide text-ink-soft mb-0.5">Bill To</div>
          <div className="text-sm font-semibold">{dealer || invoice.dealer}</div>
          {dealerProfile?.owner && <div className="text-[12px] text-ink-soft">Attn: {dealerProfile.owner}</div>}
          {dealerProfile?.address && <div className="text-[12px] text-ink-soft">{dealerProfile.address}</div>}
          {dealerProfile?.mobile && <div className="text-[12px] text-ink-soft">{dealerProfile.mobile}</div>}
        </div>

        <table className="w-full text-[12px] mb-3">
          <thead>
            <tr className="border-b border-line text-left text-ink-soft">
              <th className="py-1.5 font-semibold">Product</th>
              <th className="py-1.5 font-semibold">Size</th>
              <th className="py-1.5 font-semibold text-right">Qty</th>
              <th className="py-1.5 font-semibold text-right">MRP (₹)</th>
              <th className="py-1.5 font-semibold text-right">Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            {(invoice.items || []).map((it, i) => (
              <tr key={i} className="border-b border-line/50">
                <td className="py-1.5">{it.product}</td>
                <td className="py-1.5">{it.size}</td>
                <td className="py-1.5 text-right">{it.qty}</td>
                <td className="py-1.5 text-right">{it.mrp}</td>
                <td className="py-1.5 text-right">{(it.mrp * it.qty).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-end">
          <div className="w-[220px] text-[13px]">
            <div className="flex justify-between py-0.5">
              <span className="text-ink-soft">Subtotal</span>
              <span>₹{typeof invoice.subtotal === 'number' ? invoice.subtotal.toFixed(2) : invoice.subtotal}</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="text-ink-soft">GST ({gstPct}%)</span>
              <span>₹{typeof invoice.gst === 'number' ? invoice.gst.toFixed(2) : invoice.gst}</span>
            </div>
            <div className="flex justify-between py-1.5 mt-1 border-t border-line font-bold text-[15px]">
              <span>Total</span>
              <span>₹{invoice.amount.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {invoice.note && <div className="text-[11px] text-ink-soft mt-2">{invoice.note}</div>}
      </div>

      {printable && (
        <div className="flex gap-2 mt-4 no-print">
          <Button variant="blue" onClick={() => window.print()}>Print / Save PDF</Button>
          {onClose && <LinkButton onClick={onClose}>Close</LinkButton>}
        </div>
      )}
    </div>
  );
}
