# Property UI and ERP requirement review

Reference sources: `C:/Users/am0ff/Downloads/Book1-1.xlsx`, Sheet1, and the client-owned source at `C:/Users/am0ff/Property`. The requested `.xls` path was actually an `.xlsx` file. The reference project was read without modification.

## Interface

Reused Property's SVG application icons, brand paths, Inter typography, navbar styling, launcher styling, login effects, wallpapers, theme palettes, and appearance controls. Adapted navigation and data connections to ERP's existing Firebase collections. Property-specific real-estate fields are not substituted for the ERP trade workflow.

- Home launcher and shortcuts; reorder apps with drag or accessible arrow controls.
- Top navigation, section menus, quick creation, global search, follow-up/task alerts, currency converter, account menu.
- Compact headers, tables, and expandable currency totals; centered record dialogs with keyboard focus handling.
- Theme, wallpaper, icon-pack and shortcut preferences saved locally in this browser.
- Business dashboard at `/dashboard`; cost sheets and task records support direct links.

## Spreadsheet coverage

| Sheet1 module | ERP route | Reviewed behavior |
| --- | --- | --- |
| Company | `/company` | Documents, attachments, expiry status, yearly tax and legal expenses |
| Clients | `/clients` | Region, country, sector, registration, linked stages, activity |
| Suppliers | `/suppliers` | Region, products, brands, comparable pricing |
| Marketing | `/marketing` | Email/WhatsApp/advertising, responses and follow-ups |
| RFQ | `/rfqs` | Items, statuses, region/sector/client/date filters, quotation conversion |
| Quotation | `/quotations` | Cost, selling price, margin, follow-up, feedback, order conversion |
| Sales order | `/sales-orders` | Client order, supplier POs, shipment dates, Incoterms, delivery and receipts |
| Purchase order | `/purchase-orders` | Supplier, payment terms, vendor payments, shipment and arrival |
| Proforma invoice | `/proforma-invoices` | Client/supplier direction, linked payments and outstanding balances |
| Investors | `/investors` | Loan, bank and investor finance records |
| Delivery | `/deliveries` | Dispatch, delivered date, delay, related order/payment details |
| Account/Finance | `/finance` | Cash movements, balances and year comparisons |
| Expenses/Charity/Zakat | `/expenses` | Categorized spending and monthly/yearly reporting |
| Profit/Loss | `/profit-loss` | Orders/cash basis and period comparisons |

These modules already existed. The update preserves their domain fields, reports, and relationships while changing the shared interface.

## Functional corrections

- Cost-sheet conversion uses the returned saved ID, so a first-time quotation retains its source link.
- Saving a cost sheet preserves existing attachments, references, serial number and creation date.
- New sheets reset costs, parties, rates, commissions and taxes; sample loading starts a separate unsaved sheet.
- Costing assumptions and attachments carry through quotation and sales-order conversions.
- Existing cost-sheet sales orders and supplier-less purchase orders disable duplicate conversion actions.
- Opening another saved cost sheet cannot retain items from the previous sheet when the selected sheet has no items.
- Unrelated live collection updates no longer overwrite unsaved workspace edits.
- Record dialogs protect unsaved edits on Close, Escape and backdrop dismissal. Delete failures are displayed.
- Search and quick-create links open cost-sheet and task records correctly.
- Report tab selection survives record opening/closing and browser navigation.
- Authentication changes clear the previous store. Failed ownership checks and data subscriptions show retryable errors instead of an endless loading screen.

## Validation

Run `npm test`, `npm run typecheck`, `npm run build`, and `npm run test:e2e`.

Validation during this update: 94 unit tests passed, all five existing browser tests passed, and production static export succeeded. Desktop and phone screenshots were reviewed. A new workspace cost sheet was converted through the browser into a linked quotation; theme persistence was checked across reloads.

Browser testing uses local Firebase emulators (`demo-erp`) with disposable records. No deployment or live database write is part of this change. External attachment hosting and live-account authorization have not been tested against production.

The repository had existing ESLint issues before this update, primarily legacy `any` types, unused imports and hook patterns. The shared UI files added or substantially rewritten here are checked separately; repository-wide lint is not claimed to be clean.
