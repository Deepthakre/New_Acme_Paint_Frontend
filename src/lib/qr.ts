// ---------- SIGNED / TAMPER-EVIDENT QR IDENTITY ----------
//
// IMPORTANT — READ BEFORE SHIPPING:
// True anti-counterfeit signing requires a secret key that never reaches
// the browser. This module produces a *correctly-shaped* signed QR payload
// (id + short signature) so the frontend UI, print layout, and verify flow
// can be built and tested end-to-end right now — but the signature here is
// computed with Web Crypto's SubtleCrypto against a key that lives in this
// bundle, which anyone can extract from devtools. It is NOT secure as-is.
//
// When the backend lands, replace `signPayload` below with a call to
// POST /api/products/:qr/sign (or better: generate + sign server-side at
// batch-completion time and never let the client mint IDs at all). Keep the
// payload shape identical so nothing downstream (verify page, invoice,
// label printing) has to change.

const DEV_ONLY_KEY = 'trackpaint-dev-signing-key-DO-NOT-USE-IN-PRODUCTION';

export interface SignedPayload {
  id: string;
  sig: string;
  qrString: string;
}

export interface VerifyResult {
  valid: boolean;
  id: string;
}

async function hmacHex(message: string, key: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message));
  return Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Builds a signed QR payload for a product/carton ID.
 * Returns { id, sig, qrString } where qrString is what actually gets encoded
 * into the printed QR code: "<id>.<first 12 hex chars of signature>".
 */
export async function signPayload(id: string): Promise<SignedPayload> {
  const fullSig = await hmacHex(id, DEV_ONLY_KEY);
  const sig = fullSig.slice(0, 12);
  return { id, sig, qrString: `${id}.${sig}` };
}

/**
 * Verifies a scanned/typed QR string against the expected signature.
 * Returns { valid, id } — valid=false means either the ID is unknown
 * OR the signature doesn't match (tampered / counterfeit / hand-typed fake).
 */
export async function verifyQrString(qrString: string): Promise<VerifyResult> {
  const [id, sig] = String(qrString).split('.');
  if (!id || !sig) return { valid: false, id: id || qrString };
  const expected = await hmacHex(id, DEV_ONLY_KEY);
  return { valid: expected.slice(0, 12) === sig, id };
}

/**
 * Builds the URL that actually gets encoded into the printed QR image.
 * Encoding a link (instead of the bare "id.sig" string) means a customer's
 * *default* phone camera app can scan the bucket and jump straight into the
 * Verify page with full product details, instead of just popping up plain
 * text they'd have to copy/paste in themselves.
 */
export function verifyUrl(qrString: string): string {
  return `${window.location.origin}/verify?qr=${encodeURIComponent(qrString)}`;
}

export function nextProductId(counter: number): string {
  return `PRD-2026-${String(counter).padStart(6, '0')}`;
}

export function nextCartonId(counter: number): string {
  return `CTN-2026-${String(counter).padStart(5, '0')}`;
}

export function nextBatchId(counter: number): string {
  return `BATCH-${String(counter).padStart(4, '0')}`;
}

/**
 * Every printed QR encodes a full verify link (see verifyUrl above) so a
 * customer's phone camera can jump straight to the Verify page. But every
 * OTHER scan point in the app — Activate QR, Warehouse dispatch scan, Dealer
 * receive/sell/return scan — looks the code up as a bare product/carton ID,
 * not a URL. A HENEX (or any) 2D scanner reading a printed label therefore
 * types the *whole link* into those fields, which would never match on its
 * own. This pulls the real ID back out, whichever form it arrives in:
 *  - a full verify URL ("https://host/verify?qr=PRD-2026-000001.a1b2c3")
 *  - a signed qrString typed/scanned directly ("PRD-2026-000001.a1b2c3")
 *  - a bare ID typed by hand ("PRD-2026-000001" or "CTN-2026-00001")
 */
export function extractScannedId(raw: string | null | undefined): string {
  let value = String(raw || '').trim();
  if (!value) return value;
  try {
    const url = new URL(value);
    const qrParam = url.searchParams.get('qr');
    if (qrParam) value = qrParam;
  } catch {
    // Not a URL — take it as typed/scanned already.
  }
  const [id] = value.split('.');
  return id;
}
