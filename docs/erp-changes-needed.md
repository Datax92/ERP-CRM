# ERP Changes Needed — implementation checklist

Source: `~/Downloads/ERP Changes Needed.docx`, including all four embedded screenshots.

| Request | Implementation |
| --- | --- |
| Access-style client contacts | Region, country, sector, company, address, head office, plant/site, person, job title, email, cell/mobile, WhatsApp, telephone, remarks. Existing workflow columns remain available. |
| Region/sector organization | Combined filters and grouping by region, country, sector, or Region → Country → Sector. Filter options include saved record values. |
| Copy all email addresses | Copies unique valid emails from the complete filtered result (including rows beyond the display limit), with a visible success or clipboard-error message. No messages are sent. |
| Suppliers like clients | Contact fields, sector/country/region filters, email copying, grouping, products and brands; remarks at the end. Existing purchase/payable columns preserved. |
| Open/closed RFQs | Open section for Open/Costing, closed section for converted/unsuccessful/other completed statuses, and All. Existing statuses retained; Close without Success added. |
| Adjustable columns in every record module | Header drag handles, keyboard movement, pointer/keyboard resizing, show/hide checkboxes, reset, and remembered order/width/visibility per module in this browser. At least one column remains visible. |
| Compact table layout | Header filter inputs removed following UI feedback. The existing search and module filters remain above the table. Dragging moves the full column and animates neighboring columns into place. |
| Export | CSV follows the current visible column order and includes the full filtered result. |
| Restrained colors | Existing status badges retained; approved/success green and unsuccessful/unpaid/inactive red. Signed margin/profit cells and totals distinguish positive/negative values. No whole-row rainbow styling. |
| Property CRM asset sale | Sell asset opens an amount/account review dialog. Uses current worth (cost fallback if no valuation), credits an existing selected bank account, retains sold history, and removes the asset from current holdings. One Firestore transaction writes asset, deterministic receipt and audit. Only realized gain/loss enters profit. Duplicate/stale sales and partial commits are rejected; historical holdings before the sale date remain correct. |

Column removal hides a field from the table; it never deletes stored record data. The existing launcher customization continues to control which applications are visible on Home.

## Verification

ERP: production webpack build, TypeScript, targeted ESLint, unit suite, and browser tests against local Firebase emulators. Browser tests include actual HTML drag/drop and pointer resizing, persistence, contact editing, clipboard contents, RFQ sections, the previous workbook workflows, desktop/mobile rendering and console checks.

Property CRM: production webpack build and TypeScript; seven tests covering asset valuation, missing/stale/invalid inputs, duplicate prevention, atomic commit failure, ledger holdings/bank/profit effects, and preservation of sale history. Browser verification uses a temporary copy pointed at local emulators; production credentials and records are not used for test sales.

Final checks: 108 ERP unit tests passed; all 14 regression/browser tests passed, plus the additional financial-column-total case. Seven Property CRM valuation/transaction/ledger tests passed. The Property CRM browser sale saved its real emulator receipt, removed the asset from held stock, and retained sold history after reload with no runtime errors. Both applications passed production webpack builds and TypeScript checks. The original requested changes were released in ERP commit a9fe814 and Property CRM commit 001731f. Subsequent table feedback removes the header filter inputs and adds animated whole-column dragging.
