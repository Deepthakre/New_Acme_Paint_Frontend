import { renderToStaticMarkup } from 'react-dom/server';
import { QRCodeSVG } from 'qrcode.react';

export interface PrintableLabel {
  /** Exact string to encode in the QR. */
  qrValue: string;
  /** Key/value detail rows, printed in this order. */
  rows: [string, string, string?, string?][];
  /** Optional extra line at the bottom. */
  footer?: string;
}

export interface LabelPaper {
  /** Label width in mm (side across the roll). */
  width: number;
  /** Label height in mm (side along the roll). */
  height: number;
  /** Number of labels printed side by side on each roll row. */
  columns: 1 | 2;
  /** Usable roll width in mm; used when printing two labels across. */
  rollWidth: number;
  /** Rotates the complete 100 x 70 mm design. */
  rotate: boolean;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Starting font size in px; the print document reduces it if the rows overflow.
function startFontFor(width: number, height: number): number {
  if (width <= 50) return 6.67;
  if (width === 100 && height === 70) return 10;
  if (width === 100 && height === 100) return 11.5;
  return 8;
}

function renderProductLabel(label: PrintableLabel, qrMarkup: string): string {
  const entries = label.rows.flatMap(([key, value, pairedKey, pairedValue]) => [
    { key, value },
    ...(pairedKey && pairedValue !== undefined ? [{ key: pairedKey, value: pairedValue }] : []),
  ]);
  const company = entries.find((entry) => entry.key === 'Manufactured By');
  const footerKeys = new Set(['Manufactured By', 'Address', 'Email', 'Website', 'Helpline']);
  const details = entries.filter((entry) => !footerKeys.has(entry.key));
  const address = entries.find((entry) => entry.key === 'Address');
  const contactEntries = entries.filter((entry) => ['Email', 'Website', 'Helpline'].includes(entry.key));
  const detailMarkup = details.map(({ key, value }) =>
    `<div class="product-detail${key === 'Product Name' ? ' product-name' : ''}${key === 'QR ID' ? ' product-qr-id' : ''}"><span class="k">${esc(key)}:</span> <span class="v">${esc(value)}</span></div>`
  ).join('');
  const contactMarkup = contactEntries.map(({ key, value }) =>
    `<span class="product-contact"><strong>${esc(key)}:</strong> ${esc(value)}</span>`
  ).join('');
  const note = label.footer ? `<div class="product-note">${esc(label.footer)}</div>` : '';

  return `<div class="product-label">
    <header class="product-header">${esc(company?.value || 'Product Information')}</header>
    <div class="product-main"><div class="product-qr">${qrMarkup}</div><div class="product-details">${detailMarkup}</div></div>
    <footer class="product-footer">
      ${company ? `<span class="product-contact"><strong>Manufactured By:</strong> ${esc(company.value)}</span>` : ''}
      ${address ? `<div class="product-address"><strong>Address:</strong> ${esc(address.value)}</div>` : ''}
      <div class="product-contacts">${contactMarkup}</div>
      ${note}
    </footer>
  </div>`;
}

export function buildLabelsHtml(labels: PrintableLabel[], paper: LabelPaper): string {
  const { width, height } = paper;
  const pageWidth = paper.columns === 2 ? paper.rollWidth : width;
  const isCompactSquare = width === 50 && height === 50;
  const isLargeSquare = width === 100 && height === 100;
  const isProductLabel = width === 100 && height === 70;
  const isLandscape = width > height;
  const rotateDesign = paper.rotate && width === 100 && height === 70;
  const padding = isCompactSquare ? 1 : isProductLabel ? 1.5 : 2;
  const padX = padding;
  const padY = padding;
  const gap = isCompactSquare ? 1 : 2;
  const qr = isCompactSquare ? 13 : isLargeSquare ? 28 : isProductLabel ? 28 : width === 100 ? 25 : 18;
  const infoH = isLandscape ? height - 2 * padY : height - 2 * padY - qr - gap;
  const startFont = startFontFor(width, height);

  const labelMarkup = labels
    .map((l) => {
      const svg = renderToStaticMarkup(
        <QRCodeSVG value={l.qrValue} size={256} level="M" includeMargin={true} />
      );
      if (isProductLabel) {
        const productLabel = renderProductLabel(l, `<div class="qr">${svg}</div>`);
        const contents = rotateDesign
          ? `<div class="rotated-content product-rotated-content">${productLabel}</div>`
          : productLabel;
        return `<section class="label product-label-section${rotateDesign ? ' rotated-label' : ''}">${contents}</section>`;
      }
      const rowMarkup = l.rows
        .map(([k, v, pairedKey, pairedValue]) => {
          const row = `<div class="row"><span class="k">${esc(k)}:</span> <span class="v">${esc(v)}</span></div>`;
          const pairedRow = pairedKey && pairedValue !== undefined
            ? `<div class="row"><span class="k">${esc(pairedKey)}:</span> <span class="v">${esc(pairedValue)}</span></div>`
            : '';
          return row + pairedRow;
        });
      const rows = rowMarkup.join('');
      const footer = l.footer ? `<div class="foot">${esc(l.footer)}</div>` : '';
      const labelContent = `<div class="qr">${svg}</div><div class="info">${rows}${footer}</div>`;
      const contents = rotateDesign
        ? `<div class="rotated-content">${labelContent}</div>`
        : labelContent;
      return `<section class="label${isCompactSquare ? ' compact-square' : ''}${isLargeSquare ? ' large-square' : ''}${rotateDesign ? ' rotated-label' : ''}">${contents}</section>`;
    });
  const rows: string[] = [];
  for (let index = 0; index < labels.length; index += paper.columns) {
    rows.push(`<div class="label-row">${labelMarkup.slice(index, index + paper.columns).join('')}</div>`);
  }

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Labels</title><style>
    @page { size: ${pageWidth}mm ${height}mm; margin: 0; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .label-row {
      width: ${pageWidth}mm; height: ${height}mm; display:flex; flex-flow:row nowrap; gap: 2mm;
      justify-content: ${paper.columns === 2 ? 'center' : 'start'}; overflow:hidden;
      page-break-after: always; break-after: page; page-break-inside: avoid; break-inside: avoid;
    }
    .label-row:last-child { page-break-after: auto; break-after: auto; }
    .label {
      position: relative; width: ${width}mm; height: ${height}mm; padding: ${padY}mm ${padX}mm;
      flex: 0 0 ${width}mm;
      display: flex; flex-direction: ${isLandscape ? 'row' : 'column'}; align-items: flex-start; gap: ${gap}mm;
      overflow: hidden; font-family: Arial, Helvetica, sans-serif; color: #000;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .rotated-label { display:block; padding:0; }
    .rotated-content {
      position:absolute; top:50%; left:50%; width:${height}mm; height:${width}mm;
      padding:${padY}mm ${padX}mm; overflow:hidden; display:flex; flex-direction:row;
      align-items:center; gap:${gap}mm; transform:translate(-50%,-50%) rotate(90deg);
      transform-origin:center;
    }
    .rotated-content .info { width:auto; height:auto; flex:1; }
    .product-label-section { display:block; padding:0; }
    .product-label {
      width:100%; height:100%; display:flex; flex-direction:column; gap:.5mm;
      padding:${padY}mm ${padX}mm; overflow:hidden; font-family:Arial, Helvetica, sans-serif;
    }
    .product-header {
      text-align: center;
      flex:0 0 auto; padding:0 0 10px; border-bottom:.45mm solid #111;
      font-size:15px; line-height:1.1; font-weight:800; letter-spacing:.15px;
      text-transform:uppercase; overflow:hidden; white-space:nowrap; text-overflow:ellipsis;
    }
    .product-main { margin: 10px 0px;min-height:0; flex:0 0 auto; display:flex; align-items:center; gap:3mm; }
    .product-qr { flex:0 0 ${qr}mm; width:${qr}mm; height:${qr}mm; }
    .product-qr svg { display:block; width:100%; height:100%; }
    .product-details {
      min-width:0; flex:1 1 auto; overflow:hidden; font-size:10px; line-height:1.22;
    }
    .product-detail { margin:0 0 .7mm; overflow-wrap:anywhere; }
    .product-name { font-size:12px; line-height:1.15; font-weight:700; margin-bottom:1mm; }
    .product-qr-id { font-size:9px; font-weight:700; }
    .product-footer {
      flex:0 0 auto; padding-top:10px; border-top:.35mm solid #111;
      overflow:hidden; font-size:9px !important; line-height:1.2;
    }
    .product-address { margin-top:.4mm; overflow-wrap:anywhere; }
    .product-contacts { display:flex; flex-wrap:wrap; column-gap:2mm; row-gap:.3mm; }
    .product-contact { overflow-wrap:anywhere; }
    .product-note { margin-top:.4mm; font-weight:700; }
    .product-rotated-content {
      width:${height}mm; height:${width}mm; display:block; padding:0;
    }
    .compact-square .qr { margin:.3mm 0; }
    .compact-square .info { font-size:6.67px; line-height:1; }
    .large-square .qr { margin:1mm 0; }
    .large-square .info { font-size:11.5px; line-height:1.1; }
    .qr { flex: 0 0 auto; width: ${qr}mm; height: ${qr}mm; }
    .qr svg { width: ${qr}mm; height: ${qr}mm; display: block; }
    .info {
      flex: 1 1 auto; min-width: 0; width: 100%; height: ${infoH}mm; overflow: hidden;
      line-height: 1.08; font-size: ${startFont}px;
    }
    .row { margin: 0 0 .4mm 0; overflow-wrap: anywhere; }
    .k { font-weight: 700; }
    .v { font-weight: 400; }
    .foot { margin-top: 1mm; padding-top: 0.8mm; border-top: 0.2mm solid #000; }
  </style></head><body>${rows.join('')}</body></html>`;

  return html;
}

export function fitLabelText(doc: Document, width: number, height: number): void {
  doc.querySelectorAll<HTMLElement>('.info, .product-details, .product-footer').forEach((el) => {
    const baseSize = Number.parseFloat(doc.defaultView?.getComputedStyle(el).fontSize || '');
    let size = Number.isFinite(baseSize) ? baseSize : startFontFor(width, height);
    el.style.fontSize = `${size}px`;
    const minimumSize = el.classList.contains('product-footer') ? 6 : width <= 50 ? 3.5 : 3;
    while (el.scrollHeight > el.clientHeight + 0.5 && size > minimumSize) {
      size -= 0.25;
      el.style.fontSize = `${size}px`;
    }
  });
}

export function printThermalLabels(labels: PrintableLabel[], paper: LabelPaper): void {
  if (labels.length === 0) return;
  if (
    paper.columns === 2 &&
    (paper.width * 2 + 2 > 108 || paper.rollWidth < paper.width * 2 + 2 || paper.rollWidth > 108)
  ) {
    window.alert(`Two-across printing needs a usable roll width from ${paper.width * 2 + 2} mm to 108 mm.`);
    return;
  }
  const html = buildLabelsHtml(labels, paper);

  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) {
    window.alert('Your browser blocked the print window. Allow pop-ups for this app and try again.');
    return;
  }

  const doc = win.document;
  win.addEventListener('afterprint', () => win.close(), { once: true });
  doc.open();
  doc.write(html);
  doc.close();

  setTimeout(() => {
    fitLabelText(doc, paper.width, paper.height);
    win.focus();
    win.print();
  }, 150);
}