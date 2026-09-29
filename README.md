# Trade ERP

Custom ERP for a trading / supply business, built from the client's Excel (`Book1 ERP.xlsx`) and the
requirements conversation. Next.js (static export) + Firebase (Auth, Firestore, Storage). One user..

## Workflow

```
Client ─► RFQ ─(convert)─► Quotation ─(convert)─► Sales Order ─┬─► Purchase Order(s) to supplier ─► Supplier PI / Payment to vendor
                                                                ├─► Proforma invoice to client ───► Payment receipt
                                                                └─► Delivery (shipment dates, Incoterm, late days)
Payments + Expenses/Charity/Zakat + Investors + Company taxes ─► Account/Finance ─► Profit/Loss
```

Each step copies items, client, region/sector, currency and attachments from the previous one, so data is typed once.
Client stages (RFQ / quotation / PO / payment stage, active/inactive) and all reports are **calculated from the
records** — nothing is entered twice.

## Modules (Excel columns 1–14, plus Payments)

| Excel module | Page | Notes |
|---|---|---|
| Company | `/company` | Prequalification docs, taxes, legal expenses, other; expiry status; yearly taxes/legal |
| Clients data | `/clients` | Region, country, sector, registration; derived stages; inactive days |
| Suppliers data | `/suppliers` | Brands/products; best price by product (from real costing lines) |
| Marketing | `/marketing` | Email / WhatsApp / advertisement approaches and responses |
| RFQ | `/rfqs` | Items requested; open/closed; converted to proposal |
| Quotation | `/quotations` | Costing, offered rate, total, margin, margin %, follow-up, feedback, foreign/PKR |
| Sales order | `/sales-orders` | Client PO no., shipment dates, Incoterm, PO issued, delivered, late days |
| Purchase order | `/purchase-orders` | Supplier, terms (advance/credit/LC), confirmation, delivery period, vendor payment |
| Proforma invoice | `/proforma-invoices` | To client **or** from supplier; paid / pending derived from payments |
| Investors | `/investors` | Loans, bank finance, investors; outstanding |
| Delivery | `/deliveries` | Dispatch/delivered dates, order confirmation, on-time rate, delivery period |
| Account / Finance | `/finance` | Cash flow from all modules, cash position, year-on-year comparison graphs |
| Expenses / Charity / Zakat | `/expenses` | Monthly and yearly graphs |
| Profit / Loss | `/profit-loss` | Orders basis or cash basis; per-order profit; year comparison |
| (conversation) Payments | `/payments` | Payment receipts and payments to vendors, method, receipt attachment |

Every page has the same filter row (search, date range, region/sector/client/product/status…) which drives both the
table and the **Reports & graphs** tab. Tables export to CSV (opens in Excel).

## Code map

- `src/lib/modules.ts` — every module's fields, table columns and filters (add a field here and it appears in the form).
- `src/lib/workflow.ts` — conversions between steps and the linked-records panel.
- `src/lib/derive.ts` — calculated statuses (client stages, payment status, late days, best price).
- `src/lib/finance.ts` — cash flow and profit/loss.
- `src/components/reports.tsx`, `FinanceDashboard.tsx` — reports and graphs.
- `firestore.rules`, `storage.rules` — single-owner security.

## Run locally (no Firebase account needed)

Requires Node 20+, `firebase-tools`, and **Java 21+** for the emulators (if an older Java is first on PATH, set
`JAVA_HOME` to the Java 21 folder — `npm run emulators` uses it).

```bash
npm install
npm run emulators          # terminal 1 – local Auth/Firestore/Storage (data kept in ./emulator-data)
npm run seed               # optional – ~14 months of demo data (run once)
npm run dev:local          # terminal 2 – http://localhost:3000
```

Create a login in the emulator UI (http://127.0.0.1:4000/auth) and sign in. The first account to sign in becomes the
owner; any other account is refused.

## Demo data

Every demo record is tagged `demo: true`, so it can be removed without touching real records:

```bash
node scripts/seed-demo.mjs --project <id>          # load demo data into a cloud project (must be empty)
node scripts/clear-demo.mjs --project <id> --yes   # remove all demo records before real use
```

Both use your `firebase login` credentials. Without `--project` they act on the local emulator.

## Tests

```bash
npm test          # requirement tests: every Excel module and reporting row, the linked workflow, P/L maths
npm run test:e2e  # browser tests against the local emulator (wipes it): full workflow + every page, no console errors
```

## Put it on the cloud

1. Create a Firebase project (console.firebase.google.com). Enable **Authentication → Email/Password**,
   **Firestore**, and **Storage** (Storage needs the Blaze pay-as-you-go plan on new projects; small usage stays in
   the free quota).
2. Authentication → Users → **Add user** with the owner's email and password. Then Authentication → Settings →
   User actions → **untick "Enable create (sign-up)"** so nobody else can create an account.
3. Add a Web app, copy its config into `.env.local` (template: `.env.example`).
4. `firebase login`, `firebase use --add <project-id>`, then `npm run deploy` (builds and deploys hosting + security rules).
5. Sign in with the owner account **first** — that claims ownership.

Live at **https://erp-cac37.web.app** (Firebase Hosting site `erp-cac37`, deploy target `app`). The project's default
site `madpaper-7779d.web.app` (target `legacy`) only redirects there. For a new project, point both targets at its
sites with `firebase target:apply hosting …`, or drop the `legacy` entry from `firebase.json`.

Works on phones (responsive layout, offline cache). Export any table to CSV at any time.

## Assumptions to confirm with the client

- **Proforma direction** — Excel says "PI issued supplier", the conversation says PI is sent to the client. Both are
  supported via the *type* field.
- **Line items** — documents hold several items (Excel shows one description/qty per document).
- **Excel labels** — "Total/Open quotation" under SO/PO/PI/Delivery is read as total/open SOs, POs, etc.
- **RFQ has no costing** in the Excel, so RFQs record items only; costing starts at the quotation.
- **Shipment dates** live on the sales order / purchase order / delivery (Excel places them on SO and PO).
- **Registration** = a client's vendor registration (registered / unregistered / in process).
- **Active client** = any activity within 90 days (changeable in Settings).
- **Profit/Loss** — orders basis (sales orders booked vs PO cost) or cash basis (payments). Company taxes/legal
  amounts count as expenses — don't enter them twice.
- **Best price** — lowest unit cost per product, taken from quotation costing lines (with supplier) and POs.
- **Workflow statuses** are fixed (open/closed reporting depends on them); dropdown lists are editable in Settings.
- **Document generation** (quotation/invoice on letterhead) is not built yet — attach the external document for now.
- Exchange rates can be fetched from open.er-api.com (free daily reference rate) or typed in.
