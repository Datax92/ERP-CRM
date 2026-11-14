import { expect, test, type Page } from '@playwright/test';
import { withTotals } from '../../src/lib/calc';

// This suite writes exclusively to the demo emulator on loopback.
const base = 'http://127.0.0.1:8080/v1/projects/demo-erp/databases/(default)/documents';
const auth = 'http://127.0.0.1:9099';
function value(v: unknown): object {
  if (v == null) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(value) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, value(x)])) } };
}
async function put(col: string, id: string, data: object) {
  const res = await fetch(`${base}/${col}/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, value(v)])) }),
  });
  expect(res.ok, `${col}/${id}: ${await res.text()}`).toBeTruthy();
}
async function login(page: Page) {
  await page.goto('/');
  await page.getByLabel(/^Email/).fill('workbook@test.local');
  await page.getByLabel(/^Password/).fill('test1234');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeAttached();
  await expect(page.getByRole('button', { name: 'Customize', exact: true })).toBeVisible();
}
test.beforeAll(async () => {
  await fetch('http://127.0.0.1:8080/emulator/v1/projects/demo-erp/databases/(default)/documents', { method: 'DELETE' });
  await fetch(`${auth}/emulator/v1/projects/demo-erp/accounts`, { method: 'DELETE' });
  const response = await fetch(`${auth}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'workbook@test.local', password: 'test1234' }),
  });
  expect(response.ok).toBeTruthy();
  const account = await response.json();
  await put('members', account.localId, { enabled: true });
  await put('clients', 'client', { name: 'Workbook Client', region: 'Punjab', sector: 'Power & Energy', registration: 'Registered' });
  await put('suppliers', 'high', { name: 'High Price', brands: ['A'], products: ['Pump'] });
  await put('suppliers', 'low', { name: 'Low Price', brands: ['A'], products: ['Pump'] });
  const line = { description: 'Workbook pump', product: 'Pump', brand: 'A', unit: 'Nos', qty: 10, unitCost: 80, unitPrice: 100, supplierId: 'low' };
  const common = { date: '2026-01-01', currency: 'PKR', exchangeRate: 1, attachments: [] };
  for (const [id, cost] of [['high', 80], ['low', 60]] as const) await put('quotations', `quote-${id}`, withTotals({ id: `quote-${id}`, ...common, serial: `W-QT-${id}`, clientId: 'client', status: 'Sent', items: [{ ...line, supplierId: id, unitCost: cost }] }, 'sale'));
  await put('quotations', 'quote-fx', withTotals({ id: 'quote-fx', ...common, serial: 'W-QT-FX', clientId: 'client', status: 'Sent', currency: 'USD', exchangeRate: 280, purchaseCurrency: 'EUR', purchaseExchangeRate: 300, items: [{ ...line, product: 'Turbine', brand: 'B' }] }, 'sale'));
  await put('salesOrders', 'so', withTotals({ id: 'so', ...common, serial: 'W-SO', clientId: 'client', status: 'Open', items: [line] }, 'sale'));
  await put('purchaseOrders', 'po', withTotals({ id: 'po', ...common, serial: 'W-PO', supplierId: 'low', salesOrderId: 'so', status: 'Issued', items: [line] }, 'cost'));
  await put('proformaInvoices', 'pi', withTotals({ id: 'pi', ...common, serial: 'W-PI', salesOrderId: 'so', type: 'To Client', clientId: 'client', status: 'Sent', items: [line] }, 'sale'));
  await put('payments', 'receipt', { ...common, serial: 'W-PAY', direction: 'Received', proformaId: 'pi', amount: 1000, amountPKR: 1000, method: 'Bank Transfer' });
  for (const [id, qty] of [['small', 2], ['large', 8]] as const) await put('deliveries', id, withTotals({ id, ...common, serial: `W-DN-${id}`, clientId: 'client', salesOrderId: 'so', costingVersion: 1, status: 'Pending', items: [{ ...line, qty }] }, 'sale'));
  await put('expenses', 'rent', { ...common, serial: 'W-EXP', description: 'Workbook rent', kind: 'Expense', qty: 2, unitCost: 50, amountValue: 100, amountPKR: 100, attachments: [{ name: 'receipt.pdf', url: 'https://example.test/receipt.pdf', size: 100, path: 'test' }] });
});

test('launcher customization: remove, persist, restore, and pointer-drag apps', async ({ page }) => {
  await login(page);
  const apps = page.getByRole('navigation', { name: 'All applications' });
  await expect(page.getByRole('textbox', { name: 'Find an application' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Customize', exact: true }).click();
  await expect(apps.getByRole('button', { name: /^Move / })).toHaveCount(0);
  await apps.getByRole('button', { name: 'Remove Dashboard', exact: true }).click();
  await expect(apps.getByRole('link', { name: 'Dashboard', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Customize', exact: true })).toBeVisible();
  await expect(apps.getByRole('link', { name: 'Dashboard', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Customize', exact: true }).click();
  await apps.getByRole('button', { name: 'Add an icon here' }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Dashboard', exact: true }).click();
  await expect(apps.getByRole('link', { name: 'Dashboard', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  const cells = apps.locator('[data-launch-cell]');
  const from = await cells.nth(0).locator('.tile-ic').boundingBox();
  const to = await cells.nth(1).locator('.tile-ic').boundingBox();
  const targetText = await cells.nth(1).innerText();
  expect(from && to).toBeTruthy();
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height / 2, { steps: 10 });
  await expect(page.locator('.tile-ghost')).toBeVisible();
  await page.mouse.up();
  await expect(cells.nth(0)).toContainText(targetText);
  await page.reload();
  await expect(cells.nth(0)).toContainText(targetText);
});

test('supplier best-price and purchase-order client filters work in the browser', async ({ page }) => {
  await login(page);
  await page.goto('/suppliers/');
  await page.getByLabel('Best price for product / brand', { exact: true }).selectOption('Pump · A');
  await expect(page.getByRole('cell', { name: 'Low Price', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'High Price', exact: true })).toHaveCount(0);
  await page.goto('/purchase-orders/');
  await page.getByLabel('Client', { exact: true }).selectOption('Workbook Client');
  await expect(page.getByRole('cell', { name: 'W-PO', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Reports & graphs' }).click();
  await expect(page.getByText('Comparison by client', { exact: true })).toBeVisible();
  await expect(page.getByText('Workbook Client', { exact: true }).last()).toBeVisible();
});

test('delivery reports use actual quantities and P/L exposes source transactions', async ({ page }) => {
  await login(page);
  await page.goto('/deliveries/');
  const small = page.getByRole('row').filter({ hasText: 'W-DN-small' });
  const large = page.getByRole('row').filter({ hasText: 'W-DN-large' });
  await expect(small).toContainText('PKR 200');
  await expect(large).toContainText('PKR 800');
  await page.getByRole('tab', { name: 'Reports & graphs' }).click();
  await expect(page.getByText('Total in foreign currency / PKR', { exact: true })).toBeVisible();
  await page.goto('/sales-orders/');
  await page.getByRole('cell', { name: 'W-SO', exact: true }).click();
  const summary = page.getByRole('dialog').locator('dl > div').filter({ has: page.locator('dt', { hasText: /^Payment$/ }) });
  await expect(summary.locator('dd')).toHaveText('Paid');
  await page.goto('/profit-loss/');
  await expect(page.getByText('Profit / loss transaction details', { exact: true })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'Workbook rent' })).toContainText('1 attachment(s)');
  await page.getByRole('link', { name: 'W-EXP', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').getByText('receipt.pdf', { exact: true })).toBeVisible();
});


test('company document attachment uploads, saves, and survives a reload', async ({ page }) => {
  await login(page);
  await page.goto('/company/?new=1');
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/^Title/).fill('Browser attachment check');
  await dialog.locator('input[type="file"]').setInputFiles({ name: 'browser-receipt.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% Local emulator attachment test\n%%EOF') });
  await expect(dialog.getByRole('link', { name: 'browser-receipt.pdf' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('dialog').getByRole('link', { name: 'browser-receipt.pdf' })).toBeVisible();
});


test('mixed-currency quotation shows purchase costs and margins consistently in the form', async ({ page }) => {
  await login(page);
  await page.goto('/quotations/?id=quote-fx');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const overview = dialog.locator('section').filter({ has: page.getByRole('heading', { name: 'Overview', exact: true }) });
  const cost = overview.locator('dl > div').filter({ has: page.locator('dt', { hasText: /^Total cost$/ }) });
  await expect(cost.locator('dd')).toHaveText('EUR 800');
  const items = dialog.locator('section').filter({ has: page.getByRole('heading', { name: 'Items, costing & offered price', exact: true }) });
  await expect(items.getByText('EUR 800', { exact: true })).toBeVisible();
  await expect(items.getByText('USD 142.86', { exact: true })).toBeVisible();
});

test('marketing, investor, finance and expense forms save their workbook fields', async ({ page }) => {
  await login(page);
  const dialog = page.getByRole('dialog');
  const save = async () => {
    await dialog.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
  };
  await page.goto('/marketing/?new=1');
  await dialog.getByLabel(/Prospect name/).fill('Browser Prospect');
  await dialog.getByLabel(/Subject \/ campaign/).fill('Browser campaign');
  await dialog.getByLabel(/^Channel/).selectOption('WhatsApp');
  await dialog.getByLabel(/^Client response/).selectOption('Interested');
  await save();
  await expect(dialog.getByLabel(/Subject \/ campaign/)).toHaveValue('Browser campaign');

  await page.goto('/investors/?new=1');
  await dialog.getByLabel(/Investor \/ lender name/).fill('Browser Lender');
  await dialog.getByLabel(/^Bank$/).fill('Test Bank');
  await dialog.getByLabel(/^Amount/).first().fill('50000');
  await save();
  await expect(dialog.getByLabel(/^Amount/).first()).toHaveValue('50000');

  await page.goto('/finance/?new=1');
  await dialog.getByLabel(/^Description/).fill('Browser bank charge');
  await dialog.getByLabel(/^Category/).selectOption('Bank Charges');
  await dialog.getByLabel(/^Qty/).fill('2');
  await dialog.getByLabel(/^Unit amount/).fill('25');
  await save();
  await expect(dialog.getByText('PKR 50', { exact: true }).first()).toBeVisible();

  await page.goto('/expenses/?new=1');
  await dialog.getByLabel(/^Description/).fill('Browser zero quantity');
  await dialog.getByLabel(/^Qty/).fill('0');
  await dialog.getByLabel(/^Unit cost/).fill('500');
  await expect(dialog.getByText('PKR 0', { exact: true }).first()).toBeVisible();
  await save();
  await expect(dialog.getByText('PKR 0', { exact: true }).first()).toBeVisible();
});
