> **TypeScript migration note:** this codebase has been fully converted from
> JS/JSX to strict TypeScript (`.ts`/`.tsx`). All shared domain types live in
> `src/types.ts`. Run `npm run typecheck` to type-check without emitting,
> `npm run lint` to lint, and `npm run build` to type-check + produce a
> production bundle (route-level code splitting via `React.lazy`, vendor
> chunk splitting for `xlsx`/`exceljs`/QR libs — see `vite.config.ts`). No
> business logic or UI was changed as part of the migration.

# TrackPaint — Frontend (Phase 1 of MERN conversion)

Production-structured React frontend for the Acme/ABC Paints TrackPaint demo.
This phase ports the full demo workflow into real components with a clean
service-layer boundary — the backend phase plugs in without touching any page.

## Run it

```
npm install
npm run dev        # http://localhost:5173
```

Demo logins (created by the backend's `npm run seed`; shown as quick-login buttons in dev builds only):

| Role       | Username  | Password  |
|------------|-----------|-----------|
| Admin      | admin      | Admin@123     |
| Warehouse  | warehouse  | Warehouse@123 |
| Dealer     | dealer1    | Dealer@123    |
| Sales Rep  | salesrep1  | SalesRep@123  |
| Customer   | customer1  | Customer@123  |

## What's here

- **All 8 modules**, ported to routed pages with role-based access:
  Manufacturing (3 tabs: **Start Batch** with per-size MRP entry, **Manage
  Products** with separate Add Product and Product List sections, and
  **Activate QR**), Warehouse (dispatch + shortage report), Dealer Sale
  (receive stock, sell to customer, returns, my stock), Customer Verify,
  Dashboard, Accessories, Dealer Portal (orders/ledger/vouchers), Sales
  Team (rep booking + targets).
- **MRP is entered per batch, not per product.** The Product Master only
  stores which sizes a product comes in — the actual ₹ price for that size
  is typed in on the Start Batch form every time a batch is produced, since
  price can change between production runs. `startBatch()` requires it and
  stores it on the batch record; labels, Verify, and Batch History all read
  MRP from the batch, not from the product catalog.
- **Product master is part of Manufacturing**, not a separate section —
  admins add/edit products (Name, Item Code, Size+MRP, USP) right where
  they start batches. Manufacturer details (Manufactured By, Address,
  Email, Website, Helpline) are pre-filled from `COMPANY_INFO` in
  `constants.ts` every time, since they're the same for every product.
- **10 paint products + 5 accessories pre-seeded** — Paint: READY SHADE,
  NIVA Acrylic Emulsion, LAVISH Shine, FINE COAT Primer, RIO SHINE, NIVA
  Acrylic Distemper, DESIRE SHINE, DAMP PROTECT, RIO ULTRA Weatherproof,
  RIO Exterior Emulsion. Accessories: Paint Brush, Paint Roller, Thinner,
  Wall Putty, Distemper — these run through the exact same batch/QR/
  activation pipeline as paint, just with a different **unit** (L / KG /
  Pcs) and unit-appropriate sizes (e.g. "9 inch" for a roller, "20KG" for
  putty). MRPs weren't supplied for the accessories yet, so set them per
  batch on Start Batch before printing labels or going live.
- **Unit-aware product master.** Every product now has a `unit` (Litre /
  Kilogram / Pieces) and a free-text size list matching that unit — Add
  Product and Product List use a tag-style size builder instead of a fixed
  L-only checkbox set, so a size like "4 inch" or "20KG" is just as valid
  as "20L".
- Manufacturing Date is captured per-batch on Start Batch, not on the
  product record, since the same product is produced on many different
  dates.
- **Receiving stock happens on the dealer's side, not the warehouse's** —
  warehouse staff dispatch from the factory, but only the dealer is
  physically present to scan what actually arrives at their shop. That scan
  is what reconciles against the dispatch and flags shortages.
- Every field the client asked for shows up on the **Customer Verify page**
  — that's the compliance-facing display point where a scanned unit's full
  info (including its batch's manufacturing date) is shown.
- **Same business rules as the demo**, preserved exactly: scan-based
  dispatch/receive reconciliation with shortage flagging, carton-vs-single
  QR modes, dealer ledger balance math, order approval flow.
- **Same visual identity** — the ink/blue/ochre/green/violet palette and
  Archivo/Inter/IBM Plex Mono type system are carried over as Tailwind
  tokens (`tailwind.config.js`), not reskinned.
- **Signed QR codes** (`src/lib/qr.ts`) — every product/carton ID now
  carries an HMAC-based signature so a scanner can detect a hand-typed or
  altered code, not just look up an ID.

## Architecture — how the backend plugs in

`src/lib/dataService.ts` is the **only file that should change** when the
Express/Mongo backend exists. Every function in it is already `async` and
shaped like a REST response. Swap each function body for a `fetch('/api/...')`
call — page components never touch storage directly, so nothing else moves.

```
src/
  lib/
    dataService.ts   ← swap point: mock in-memory store → real API calls
    qr.ts            ← QR signing (client-side placeholder, see below)
    constants.ts     ← roles, product master, company info
  context/
    AuthContext.tsx  ← swap to real JWT storage + refresh here
  routes/
    ProtectedRoute.tsx ← UI-level guard; backend must re-check role too
  components/
    ui/              ← Button, Field, Table, StatusPill, etc.
    layout/          ← TopBar, ConveyorTracker, PageShell
  pages/              ← one folder per module
```

`vite.config.ts` already proxies `/api/*` to `http://localhost:4000` in dev,
so once the backend is running, `dataService.ts` calls to relative `/api/...`
paths work in both dev and prod without extra config.

## ⚠ Before this goes to production

1. **QR signing must move server-side.** `src/lib/qr.ts` currently signs
   with a key embedded in the JS bundle — anyone can read it in devtools and
   forge valid-looking codes. It exists only so the UI, print layout, and
   verify flow could be built and tested now. Replace it with server-issued
   signatures (mint + sign at batch-completion time in the backend; the
   client should never hold the signing key). Keep the `id.signature`
   payload shape so nothing downstream changes.
2. **Auth is unhashed and client-side only right now.** `dataService.ts`
   compares plaintext passwords in memory. The real backend needs bcrypt
   hashing, JWT issuance, and role checks enforced server-side on every
   route — `ProtectedRoute.tsx` is a UX convenience, not a security boundary.
3. **OTP for voucher redemption is simulated** (`sendVoucherOtp` returns the
   code directly for demo purposes). A real implementation sends it via SMS
   gateway and never returns it to the client.
4. All data resets on page refresh — it's in-memory, by design, until the
   backend lands.

## QR activation workflow

Every unit is produced **inactive**. It cannot be dispatched, and never
shows up as in-transit or missing stock, until someone at the factory
activates it on the **Activate QR** tab (Manufacturing → Activate QR).
Two ways to activate:
- **Type / Barcode Scanner Gun** — type the code, or plug in a handheld
  USB/Bluetooth barcode scanner (the DMart-checkout-counter kind). These
  work in "keyboard emulation" mode — the scanner just types the code into
  the focused text box and presses Enter, exactly like a person typing. No
  extra integration needed; the field refocuses itself after every scan so
  you can keep firing scan after scan without touching the mouse.
- **Scan with device camera** — uses the laptop/phone's built-in camera via
  `html5-qrcode` to visually decode the QR and activate it automatically,
  no separate scanner hardware needed. Browsers only allow camera access on
  `https://` or `localhost` — works out of the box in `npm run dev` but
  needs HTTPS once deployed.

Scanning a carton QR (either method) activates every unit inside it in one
go. This is the loss-prevention step the client asked for: if a label is
damaged or lost before it's ever scanned, the system record for it still
exists for audit, but it can never enter transit and therefore can never
generate a false shortage or phantom stock count. `dispatchByQuantity` and
`addDispatchScan` in `dataService.ts` both enforce `active === true` before
allowing dispatch.

## Labels & individual QR

Print Labels (Manufacturing → Start Batch → Print labels) now shows the
full key-value detail block under every QR — Item Code, Size, MRP, Mfg
Date, Manufactured By, Address, Email, Website, Helpline — not just a
one-line caption. In Carton QR mode, each carton label has a **Show
Individual QR** button that opens the individual unit QRs inside that
carton, each with the same full detail block and its own activation status
— so a carton can still be handled in bulk while every bucket inside it
keeps a separate, scannable, printable identity.

Activate QR also lists **every produced QR with its current status**
(active/inactive), searchable by QR, batch, or product — so the factory
can see at a glance what's still pending before dispatch.

## Orders, GST invoices, and purchase history

Orders now hold **multiple line items** (product + size + qty, MRP
optional per line) instead of one product per order — a dealer or sales
rep can book a mixed basket in one go. MRP is optional: if every line has
one, the order carries a computed subtotal/18% GST/total; if any line is
missing MRP, those stay null and no invoice auto-generates (admin can
still bill manually via the ledger).

When admin **approves** an order that has a computed total, a GST invoice
is generated automatically — a `CHARGE` entry is posted to that dealer's
ledger with the invoice ID, subtotal, GST, and itemized lines, and the
order is stamped with that `invoiceId`. `GST_RATE` (18%) lives in
`constants.ts`.

`getDealerPurchaseHistory(dealer)` is the single source every purchase
history view reads from — it returns that dealer's full order list (any
status, any booker) plus their ledger (invoices + payments) plus their
balance. The same function backs:
- **Sales Team → Dealer Purchase History** — a rep looking up one of their
  own dealers.
- **Dealer Portal → 📜 Purchase History** — a dealer viewing their own
  full history, including orders a rep booked on their behalf.
- **Dealer Portal → Orders Booked By Me** — filtered to just the orders the
  dealer placed themselves (`bookedBy === null`), separate from the full
  history above.
- **Dashboard → Dealer Purchase History Lookup** — admin looking up any
  dealer by name.

Dashboard also adds **All Dealers — Payment Status** (billed/paid/
outstanding per dealer, reusing `getAllDealersPaymentStatus()`) and
**⚠ Shortage Report** (the same dispatched-but-never-received data as
Warehouse's Shortage Report, surfaced here too for a manufacturer-level
view) alongside the existing Full Product Log and renamed **📥 Pending
Dealer Orders — Approve / Reject**.

## Next: Phase 2 (backend)

Once you're happy with the frontend, the natural next step is the Express +
MongoDB API matching `dataService.ts`'s function signatures — that keeps
this frontend as the shared contract instead of designing the schema blind.
