import { renderToStaticMarkup } from 'react-dom/server';
import { QRCodeSVG } from 'qrcode.react';
import type { PrintableBarcode } from '../types';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const dashed = (c: string) => c.replace(/(.{4})(?=.)/g, '$1-');

/**
 * The public address of the painter site. Set VITE_PUBLIC_URL (e.g. https://app.acmepaints.com) so stickers
 * printed from a laptop/localhost still point to the real website.
 */
export function publicBaseUrl(): string {
  const configured = (import.meta.env.VITE_PUBLIC_URL as string | undefined)?.trim();
  return (configured || window.location.origin).replace(/\/+$/, '');
}
export const rewardUrl = (code: string) => `${publicBaseUrl()}/r/${code}`;
export const isLocalUrl = () => /localhost|127\.0\.0\.1|^http:\/\/192\.168\./.test(publicBaseUrl());

/** Markup of ONE 50 x 50 mm sticker. Used for printing and for the on-screen preview. */
export function stickerMarkup(c: PrintableBarcode): string {
  const svg = renderToStaticMarkup(<QRCodeSVG value={rewardUrl(c.code)} size={256} level="M" includeMargin />);
  return `<div class="s">
    <div class="qr">${svg}</div>
    <div class="t">SCAN &amp; GET CASH REWARD</div>
    <div class="code">${esc(dashed(c.code))}</div>
    <div class="f"><span>${esc(c.serial)}</span><span>${esc(c.size)}</span></div>
  </div>`;
}

export const STICKER_CSS = `
  .s { width: 50mm; height: 50mm; box-sizing: border-box; padding: 1.5mm 2mm 1.5mm; display: flex; flex-direction: column; align-items: center; justify-content: space-between; overflow: hidden; background: #fff; color: #000; font-family: Arial, Helvetica, sans-serif; }
  .s .qr svg { width: 33mm; height: 33mm; display: block; }
  .s .t { font-size: 2.7mm; font-weight: 700; letter-spacing: .1mm; text-align: center; line-height: 1; }
  .s .code { font-family: 'Courier New', monospace; font-size: 2.6mm; font-weight: 700; letter-spacing: .15mm; line-height: 1; }
  .s .f { width: 100%; display: flex; justify-content: space-between; font-size: 2.1mm; line-height: 1; color: #000; }
`;

/**
 * Prints the stickers on 50 x 50 mm paper: one sticker per page. The plain codes exist only in memory here
 * (the server stores hashes only), so this is the moment to print.
 * In the print dialog choose paper 50 x 50 mm, margins "None", scale 100%.
 */
export function printRewardStickers(codes: PrintableBarcode[]): void {
  if (!codes.length) return;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Reward stickers 50x50</title><style>
    @page { size: 50mm 50mm; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; }
    ${STICKER_CSS}
    .s { page-break-after: always; break-after: page; }
    .s:last-child { page-break-after: auto; break-after: auto; }
  </style></head><body>${codes.map(stickerMarkup).join('')}</body></html>`;

  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!doc || !win) {
    iframe.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  setTimeout(() => {
    win.focus();
    win.print();
    setTimeout(() => iframe.remove(), 2000);
  }, 400);
}

/** CSV for a print vendor: serial, size, code, url. */
export function barcodesCsv(codes: PrintableBarcode[]): string {
  const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return ['serial,size,code,url', ...codes.map((c) => [c.serial, c.size, c.code, rewardUrl(c.code)].map(q).join(','))].join('\n');
}

export function downloadText(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
