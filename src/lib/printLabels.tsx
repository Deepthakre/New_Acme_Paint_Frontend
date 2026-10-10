import { renderToStaticMarkup } from 'react-dom/server';
import { QRCodeSVG } from 'qrcode.react';

export interface PrintableLabel {
  /** Exact string to encode in the QR. */
  qrValue: string;
  /** Key/value detail rows, printed in this order. */
  rows: [string, string][];
  /** Optional extra line at the bottom (e.g. "12 units in this carton"). */
  footer?: string;
}

export interface LabelPaper {
  /** Label width in mm, as loaded in the printer (the side across the roll). */
  width: number;
  /** Label height in mm (the side along the roll). */
  height: number;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Prints each label as EXACTLY ONE physical label.
 *
 * Why a separate print document instead of window.print() on the app page:
 * the app page's layout/CSS (modal, grid, hidden elements) leaks into the
 * printout and makes one label spill onto the next, leaving blank labels and
 * clipped text. Here every label is a fixed-size box (slightly shorter than
 * the real label so rounding can never push it onto a second page), the QR is
 * small, and the text font is shrunk automatically until ALL rows fit inside
 * the box — so nothing is ever cut off and nothing flows to another label.
 */
export function printThermalLabels(labels: PrintableLabel[], paper: LabelPaper): void {
  if (labels.length === 0) return;

  const { width, height } = paper;
  const isLandscape = width >= height;
  const boxH = height - 0.6; // safety margin: never let a label overflow its page
  const padX = 3; // keeps text away from the left/right edge (no clipping)
  const padY = 2;
  const gap = 3;
  // QR stays large enough to scan easily (never below 30mm); the detail text
  // shrinks to fit in the remaining space instead.
  const qr = isLandscape
    ? Math.max(30, Math.min(boxH - 2 * padY, Math.round(width * 0.4)))
    : Math.max(30, Math.min(width - 2 * padX, Math.round(height * 0.34)));
  const infoH = isLandscape ? boxH - 2 * padY : boxH - 2 * padY - qr - gap;

  const body = labels
    .map((l) => {
      const svg = renderToStaticMarkup(
        <QRCodeSVG value={l.qrValue} size={256} level="M" includeMargin={true} />
      );
      const rows = l.rows
        .map(([k, v]) => `<div class="row"><b>${esc(k)}:</b> ${esc(v)}</div>`)
        .join('');
      const footer = l.footer ? `<div class="row foot">${esc(l.footer)}</div>` : '';
      return `<div class="label"><div class="qr">${svg}</div><div class="info">${rows}${footer}</div></div>`;
    })
    .join('');

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Labels</title><style>
    @page { size: ${width}mm ${height}mm; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; }
    .label {
      width: ${width}mm; height: ${boxH}mm; padding: ${padY}mm ${padX}mm;
      display: flex; flex-direction: ${isLandscape ? 'row' : 'column'}; align-items: flex-start; gap: ${gap}mm;
      overflow: hidden; page-break-after: always; break-after: page; page-break-inside: avoid; break-inside: avoid;
      font-family: Arial, Helvetica, sans-serif; color: #000;
    }
    .label:last-child { page-break-after: auto; break-after: auto; }
    .qr { flex: 0 0 auto; width: ${qr}mm; height: ${qr}mm; }
    .qr svg { width: ${qr}mm; height: ${qr}mm; display: block; }
    .info { flex: 1 1 auto; min-width: 0; width: 100%; height: ${infoH}mm; overflow: hidden; line-height: 1.18; font-size: 14px; }
    .row { overflow-wrap: anywhere; }
    .row b { font-weight: 700; }
    .foot { margin-top: 1mm; padding-top: 0.8mm; border-top: 0.2mm solid #000; }
  </style></head><body>${body}</body></html>`;

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  const doc = iframe.contentDocument;
  if (!win || !doc) {
    iframe.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();

  // Shrink each label's text until every row fits inside its box.
  const fit = () => {
    doc.querySelectorAll<HTMLElement>('.info').forEach((el) => {
      let size = 14;
      el.style.fontSize = `${size}px`;
      while (el.scrollHeight > el.clientHeight + 0.5 && size > 3) {
        size -= 0.25;
        el.style.fontSize = `${size}px`;
      }
    });
  };

  setTimeout(() => {
    fit();
    win.focus();
    win.print();
    setTimeout(() => iframe.remove(), 60_000);
  }, 150);
}
