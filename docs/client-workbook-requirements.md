# Client workbook implementation map

Source: `~/Downloads/Book1.xlsx`, Sheet1, columns A–AA, rows 4–31. Read on 2026-11-14; the original workbook is unchanged.

The workbook has 14 module columns. Module names below use corrected spelling; repeated “quotation” labels in the sales-order, purchase-order, proforma and delivery columns refer to the respective module's documents.

| Workbook column | Module | Implementation and verification |
| --- | --- | --- |
| A | Company | Prequalification, tax, legal and other document categories; attachments; expiry/status reporting; yearly tax, legal and other expense totals. Existing requirement tests cover document expiry and accounting inclusion. |
| C | Clients | Region, country, sector, contact/details and attachments; registration filters; separate RFQ, quotation, PO and payment stages and filters. In-process registrations are not counted as unregistered. |
| E | Suppliers | Region/country, brands/products, contact details and attachments; region, product and brand filters. Added actual best-price filtering, grouped by product AND brand, using latest supplier prices, saved purchase FX and ties; excludes lost/cancelled documents. |
| G | Marketing | Email, WhatsApp and product advertisements, dates, responses and attachments; date/product/channel/response reports and client activity. Added client/activity filters and inactivity columns; negative interest responses do not count as positive. This module records approaches; it does not automatically send messages. |
| I | RFQ | Serial, descriptions and quantities, attachments; date/client comparisons, region/sector filters, open/closed counts and quotation conversion. Fixed numeric quantity sorting. |
| K | Quotation | Item costing and sale price, attachments; follow-up and feedback; open/success/failure reports; SO conversion; foreign/PKR totals and margins. Corrected purchase-currency margin and product-cost calculations. |
| M | Sales order | Quotation conversion, client PO, supplier PO issue, follow-up, feedback, incoterms and shipment/delivery dates; values, margin, FX and lateness reports. Partial deliveries no longer imply full delivery. |
| O | Purchase order | Supplier PO, order confirmation, delivery period, origin/arrival dates, vendor payments, attachments, feedback and follow-up. Added client filter/comparison through linked SO alongside supplier reporting; PO creation uses purchase currency and preserves attachments. |
| Q | Proforma invoice | Client-issued and supplier-received proformas, follow-up, feedback, order confirmation, delivery state, vendor payments/receipts and methods; foreign/PKR totals. Mixed client/supplier reports retain margin metrics. Payments linked only by proforma now reach order/client/vendor balances. |
| S | Investors | Loan, bank-finance and investor funding; bank, principal, currency, repayments and maturity. Existing outstanding/type/bank reports and finance integration retained. The workbook does not specify interest accrual rules. |
| U | Delivery | Serial, description, quantity, costing, attachments, feedback, confirmation, delivery status and payment details. Added editable costing/currency, value/cost/margin columns, foreign/PKR reports and list totals. Allocation follows delivered quantities; legacy unpriced lines resolve via SO; cancelled/returned records have zero reported value. |
| W | Account / Finance | Serial, description, qty × costing, attachments and cash-flow graphs across source modules. Added quantity and unit-cost columns; explicit zero quantity remains zero. Proforma-only payment links resolve party names. |
| Y | Expenses / Charity / Zakat | Serial, description, quantity, costing and attachments; monthly/yearly/category graphs and P/L integration. Added quantity/unit-cost columns and corrected zero-quantity calculation. |
| AA | Profit / Loss | Existing orders/cash-basis statements and graphs, with added source transaction table showing document, description, quantity, income, cost, net and attachment links. No duplicate posting of quotations/proformas. |

## Interpretations requiring client confirmation

- Profit/Loss row-level fields are implemented as drill-downs to the originating records. The workbook does not define a separate journal or manual adjustment workflow. A question was raised before implementing this interpretation.
- “Best price” compares latest recorded unit costs for the same product and brand, using saved purchase exchange rates. Shipping/landed costs, validity windows and minimum order quantities are not defined in the workbook.
- Delivery receipts and vendor payments shown per delivery are apportioned from linked order payments by value/cost shares; the app does not create new payment transactions when a delivery is entered.
- Account/Finance and Profit/Loss graphs retain the existing accounting basis. The workbook provides no new tax, recognition, interest or loan-repayment scheduling rules.

Regression coverage: `tests/unit/requirements.test.ts` walks the workbook workflow and report rows; `tests/unit/client-workbook.test.ts` checks the gaps above using real module/filter/calculation/report code with an in-memory database. No production data is modified by these tests.

## Browser verification — 2026-11-14

- Tested an exported production build in isolated Google Chrome against the local `demo-erp` Firebase Auth, Firestore and Storage emulators. No production accounts, passwords or records were used.
- All 11 Playwright scenarios passed without retries: launcher remove/restore/drag persistence; supplier and client filters; delivery/payment/P&L details; PDF upload and reload; mixed-currency cost/margin display; remaining module data-entry forms; the full RFQ-to-delivery workflow; every module page on desktop and phone; console-error sweep; dark mode and design screenshots.
- An additional 390px viewport check of Home plus all 14 workbook module report screens found no document-level horizontal overflow and no runtime exceptions. Wide tables retain their internal scroll containers.
- Browser testing exposed and corrected filter accessible names, the quotation overview/item editor's purchase-currency display and margins, and zero-quantity draft expense/finance totals.
- The full unit suite remains at 105 passing tests. TypeScript and the Webpack production build passed. The fields component has two pre-existing lint warnings (effect dependencies and the attachment thumbnail image).
- These are local checks, not a production deployment or client acceptance of the interpretations listed above.
