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
  /**
   * Turns the whole printed content. Use it when the printer prints the label
   * sideways: 90 = rotate clockwise, 270 = rotate counter-clockwise.
   */
  rotation?: 0 | 90 | 270;
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
export function buildLabelsHtml(labels: PrintableLabel[], paper: LabelPaper): string {
  const { width, height } = paper;
  const rotation = paper.rotation ?? 0;
  const rotated = rotation !== 0;
  const isLandscape = width >= height;
  // Content box: always a little smaller than the real label so rounding can
  // never push one label onto a second page.
  const cw = rotated ? width - 0.6 : width;
  const ch = height - 0.6;
  // Physical page handed to the printer (axes swap when content is rotated).
  const pageW = rotated ? height : width;
  const pageH = rotated ? width : height;
  const pdH = pageH - 0.6; // page <div> is also slightly shorter than the page
  const big = width >= 140; // 4 x 6 inch class label: more room, so larger text and padding
  const padX = big ? 6 : 4; // keeps text away from the edges (no clipping)
  const padY = big ? 5 : 3;
  const gap = big ? 5 : 3;
  // Small but still easy to scan (never below 22mm); the text shrinks to fit.
  const qr = isLandscape
    ? Math.max(22, Math.min(ch - 2 * padY, Math.round(width * (big ? 0.22 : 0.3))))
    : Math.max(22, Math.min(cw - 2 * padX, Math.round(height * 0.26)));
  const infoH = isLandscape ? ch - 2 * padY : ch - 2 * padY - qr - gap;
  const startFont = big ? 15 : 11;
  const transform =
    rotation === 90 ? `translateX(${ch}mm) rotate(90deg)` : rotation === 270 ? `translateY(${cw}mm) rotate(-90deg)` : 'none';

  const body = labels
    .map((l) => {
      const svg = renderToStaticMarkup(
        <QRCodeSVG value={l.qrValue} size={256} level="M" includeMargin={true} />
      );
      const rows = l.rows.map(([k, v]) => `<div class="k">${esc(k)}</div><div class="v">${esc(v)}</div>`).join('');
      const footer = l.footer ? `<div class="foot">${esc(l.footer)}</div>` : '';
      return `<div class="page"><div class="label"><div class="qr">${svg}</div><div class="info">${rows}${footer}</div></div></div>`;
    })
    .join('');

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Labels</title><style>
    @page { size: ${pageW}mm ${pageH}mm; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; }
    .page {
      width: ${pageW}mm; height: ${pdH}mm; position: relative; overflow: hidden;
      page-break-after: always; break-after: page; page-break-inside: avoid; break-inside: avoid;
    }
    .page:last-child { page-break-after: auto; break-after: auto; }
    .label {
      position: absolute; top: 0; left: 0; transform-origin: 0 0; transform: ${transform};
      width: ${cw}mm; height: ${ch}mm; padding: ${padY}mm ${padX}mm;
      display: flex; flex-direction: ${isLandscape ? 'row' : 'column'}; align-items: flex-start; gap: ${gap}mm;
      overflow: hidden; font-family: Arial, Helvetica, sans-serif; color: #000;
    }
    .qr { flex: 0 0 auto; width: ${qr}mm; height: ${qr}mm; }
    .qr svg { width: ${qr}mm; height: ${qr}mm; display: block; }
    /* Aligned "Key : value" list: keys in one column, values in the next. */
    .info {
      flex: 1 1 auto; min-width: 0; width: 100%; height: ${infoH}mm; overflow: hidden;
      display: grid; grid-template-columns: max-content minmax(0, 1fr); column-gap: 2.5mm; row-gap: 0.7mm;
      align-content: start; line-height: 1.2; font-size: ${startFont}px;
    }
    .k { font-weight: 700; white-space: nowrap; }
    .k::after { content: " :"; }
    .v { overflow-wrap: anywhere; }
    .foot { grid-column: 1 / -1; margin-top: 1mm; padding-top: 0.8mm; border-top: 0.2mm solid #000; }
  </style></head><body>${body}</body></html>`;

  return html;
}

export function printThermalLabels(labels: PrintableLabel[], paper: LabelPaper): void {
  if (labels.length === 0) return;
  const html = buildLabelsHtml(labels, paper);
  const startFont = paper.width >= 140 ? 15 : 11;

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
      let size = startFont;
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
