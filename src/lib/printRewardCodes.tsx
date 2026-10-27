import { renderToStaticMarkup } from 'react-dom/server';
import { QRCodeSVG } from 'qrcode.react';
import type { PrintableRewardCode } from '../types';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const dashed = (c: string) => c.replace(/(.{4})(?=.)/g, '$1-');
export const rewardUrl = (code: string) => `${window.location.origin}/r/${code}`;

/**
 * Prints the INNER reward stickers (A4 grid, one sticker per bucket). The plain
 * codes exist only in memory here - the server stores hashes only - so this is
 * the one moment to print them. Give the print vendor only the batch they print.
 */
export function printRewardStickers(codes: PrintableRewardCode[]): void {
  if (!codes.length) return;
  const cells = codes
    .map((c) => {
      const svg = renderToStaticMarkup(<QRCodeSVG value={rewardUrl(c.code)} size={256} level="M" includeMargin />);
         return `<div class="cell"><div class="qr">${svg}</div><div class="t">SCAN &amp; GET CASH REWARD</div><div class="code">${esc(dashed(c.code))}</div></div>`;
    })
    .join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Inner reward QR</title><style>
    @page { size: A4; margin: 8mm; }
    * { box-sizing: border-box; } body { margin:0; font-family: Arial, sans-serif; }
    .grid { display:grid; grid-template-columns: repeat(4, 1fr); gap: 3mm; }
    .cell { border: 0.2mm dashed #999; padding: 2mm; text-align:center; break-inside: avoid; }
    .qr svg { width: 32mm; height: 32mm; } .t { font-size: 7px; font-weight: 700; }
    .code { font-family: monospace; font-size: 10px; letter-spacing: .5px; }
  </style></head><body><div class="grid">${cells}</div></body></html>`;
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!doc || !win) { iframe.remove(); return; }
  doc.open(); doc.write(html); doc.close();
  setTimeout(() => { win.focus(); win.print(); setTimeout(() => iframe.remove(), 1500); }, 300);
}

/** CSV for a vendor that prints from a file (code, url, product, size). Header row included. */
export function rewardCodesCsv(codes: PrintableRewardCode[]): string {
    const rows = codes.map((c) => [c.code, rewardUrl(c.code)].map((v) => `"${v.replace(/"/g, '""')}"`).join(','));
  return ['code,url', ...rows].join('\n');
}

export function downloadText(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
