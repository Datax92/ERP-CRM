import { beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
vi.mock('@/lib/db', () => import('./memory-db'));
vi.mock('@/components/RecordDrawer', () => ({ RecordLink: ({ children }: { children: unknown }) => children }));
import { mem, saveRecord, store } from './memory-db';
import { MODULES } from '@/lib/modules';
import { applyFilters } from '@/components/ModulePage';
import { bestSupplierPrices, clientInfo, deliveryInfo, documentClientId, poInfo, soInfo } from '@/lib/derive';
import { conversionsFor } from '@/lib/workflow';
import { plLines, sumPL } from '@/lib/finance';
import { pipelineReport, marketingReport, clientsReport } from '@/components/reports';
import { productWise } from '@/lib/report';
import type { CollectionName, Rec } from '@/lib/types';

beforeEach(() => mem.reset());
async function save(col: CollectionName, data: Partial<Rec>) {
  const m = MODULES[col];
  const r = { id: '', ...m.defaults(store()), ...data } as Rec;
  return saveRecord(col, { ...r, ...m.compute?.(r) }, { itemsMode: m.itemsMode?.(r), amountField: m.amountField, serialPrefix: m.prefix });
}
const line = { description: 'Pump', product: 'Pump', brand: 'A', qty: 10, unitCost: 80, unitPrice: 100 };

it('compares current supplier prices within the same brand, ignores cancelled quotes and keeps ties', async () => {
  for (const [id, cost, brand, date, status] of [
    ['a', 20, 'A', '2026-01-01', 'Sent'], ['a', 80, 'A', '2026-02-01', 'Sent'],
    ['b', 60, 'A', '2026-02-01', 'Sent'], ['c', 60, 'A', '2026-02-01', 'Sent'],
    ['d', 10, 'B', '2026-02-01', 'Sent'], ['e', 1, 'A', '2026-03-01', 'Cancelled'],
  ]) await save('quotations', { date, status, items: [{ ...line, supplierId: id, unitCost: cost, brand }] });
  expect(bestSupplierPrices(store()).map((p) => p.supplierId).sort()).toEqual(['b', 'c', 'd']);
  await save('suppliers', { id: 'a', name: 'A' });
  await save('suppliers', { id: 'b', name: 'B' });
  expect(applyFilters(MODULES.suppliers, store().suppliers, { q: '', from: '', to: '', sel: { bestPrice: 'Pump · A' } }, store()).map((r) => r.id)).toEqual(['b']);
});

it('filters purchase orders and supplier proformas by their client through the sales order', async () => {
  await save('clients', { id: 'client', name: 'Client One' });
  await save('salesOrders', { id: 'so', clientId: 'client', items: [line] });
  const po = await save('purchaseOrders', { id: 'po', salesOrderId: 'so', items: [line] });
  const pi = await save('proformaInvoices', { type: 'From Supplier', purchaseOrderId: 'po', items: [line] });
  expect(documentClientId(pi, store())).toBe('client');
  expect(applyFilters(MODULES.purchaseOrders, [po], { q: '', from: '', to: '', sel: { clientId: 'Client One' } }, store())).toHaveLength(1);
  expect(renderToStaticMarkup(pipelineReport('purchaseOrders')([po], store()))).toContain('Client One');
});

it('rolls a payment linked only to a proforma into SO, PO and client payment stages', async () => {
  const c = await save('clients', { id: 'client', name: 'Client' });
  const so = await save('salesOrders', { id: 'so', clientId: c.id, items: [line] });
  const po = await save('purchaseOrders', { id: 'po', supplierId: 'supplier', salesOrderId: so.id, items: [line] });
  await save('proformaInvoices', { id: 'client-pi', salesOrderId: so.id, clientId: c.id, items: [line] });
  await save('proformaInvoices', { id: 'supplier-pi', type: 'From Supplier', purchaseOrderId: po.id, supplierId: 'supplier', items: [line] });
  await save('payments', { proformaId: 'client-pi', direction: 'Received', amount: 1000 });
  await save('payments', { proformaId: 'supplier-pi', direction: 'Paid', amount: 800 });
  expect(soInfo(so, store()).payment).toBe('Paid');
  expect(poInfo(po, store()).payment).toBe('Paid');
  expect(clientInfo(c, store()).paymentStage).toBe('Paid');
});

it('values unequal partial deliveries by quantity and excludes cancelled deliveries', async () => {
  await save('salesOrders', { id: 'so', currency: 'USD', exchangeRate: 280, items: [line] });
  const small = await save('deliveries', { salesOrderId: 'so', currency: 'USD', exchangeRate: 280, items: [{ ...line, qty: 2 }] });
  const large = await save('deliveries', { salesOrderId: 'so', currency: 'USD', exchangeRate: 280, items: [{ ...line, qty: 8 }] });
  const cancelled = await save('deliveries', { salesOrderId: 'so', status: 'Cancelled', items: [line] });
  expect(deliveryInfo(small, store()).valuePKR).toBe(200 * 280);
  expect(deliveryInfo(large, store()).valuePKR).toBe(800 * 280);
  expect(deliveryInfo(cancelled, store()).valuePKR).toBe(0);
  const text = renderToStaticMarkup(pipelineReport('deliveries')([small, large], store()));
  expect(text).toContain('Total in foreign currency / PKR');
  expect(text).toContain('USD');
});

it('keeps an order outstanding for delivery until all ordered quantities are delivered', async () => {
  const so = await save('salesOrders', { id: 'so', expectedDeliveryDate: '2026-01-10', items: [line] });
  await save('deliveries', { salesOrderId: so.id, status: 'Delivered', deliveredDate: '2026-01-09', items: [{ ...line, qty: 2 }] });
  expect(soInfo(so, store()).delivered).toBe(false);
  expect(soInfo(so, store()).deliveredDate).toBeUndefined();
  await save('deliveries', { salesOrderId: so.id, status: 'Delivered', deliveredDate: '2026-01-12', items: [{ ...line, qty: 8 }] });
  expect(soInfo(so, store())).toMatchObject({ delivered: true, deliveredDate: '2026-01-12', late: { days: 2, overdue: false } });
});

it('normalizes supplier best prices using the purchase currency instead of the sale currency', async () => {
  await save('quotations', { currency: 'USD', exchangeRate: 280, purchaseCurrency: 'EUR', purchaseExchangeRate: 300, items: [{ ...line, supplierId: 'euro', unitCost: 100 }] });
  await save('quotations', { currency: 'PKR', items: [{ ...line, supplierId: 'local', unitCost: 29000 }] });
  expect(bestSupplierPrices(store()).map((p) => p.supplierId)).toEqual(['local']);
});

it('reads legacy delivery zero prices from the SO but preserves explicit zero prices on new deliveries', async () => {
  await save('salesOrders', { id: 'so', items: [line] });
  const old: Rec = { id: 'old', salesOrderId: 'so', items: [{ ...line, qty: 2, unitPrice: 0, unitCost: 0 }] };
  expect(deliveryInfo(old, store()).valuePKR).toBe(200);
  expect(deliveryInfo({ ...old, costingVersion: 1 }, store()).valuePKR).toBe(0);
});

it('carries attachments and purchase-currency costing from SO to PO and delivery', async () => {
  const attachments = [{ name: 'spec.pdf', url: 'https://example.test/spec.pdf' }];
  const so = await save('salesOrders', { currency: 'USD', exchangeRate: 280, purchaseCurrency: 'EUR', purchaseExchangeRate: 300, items: [line], attachments });
  expect(so.marginPKR).toBe(1000 * 280 - 800 * 300);
  const po = await conversionsFor('salesOrders', so, store()).find((a) => a.target === 'purchaseOrders')!.run();
  expect(po.currency).toBe('EUR');
  expect(po.amountPKR).toBe(800 * 300);
  expect(poInfo(po, store()).salePKR).toBeCloseTo(1000 * 280);
  expect(po.attachments).toEqual(attachments);
  const d = await conversionsFor('salesOrders', so, store()).find((a) => a.target === 'deliveries')!.run();
  expect(d.attachments).toEqual(attachments);
  expect(deliveryInfo(d, store()).marginPKR).toBe(40000);
  expect(productWise([so])[0].cost).toBe(240000);
});

it('keeps zero quantities at zero rather than charging a default unit', async () => {
  for (const col of ['expenses', 'financeEntries'] as const) {
    const r = await save(col, { qty: 0, unitCost: 500 });
    expect(r.amountPKR).toBe(0);
  }
});

it('does not count Not interested as a positive marketing response or In process as Unregistered', async () => {
  await save('marketing', { response: 'Not interested' });
  const html = renderToStaticMarkup(marketingReport(store().marketing, store())).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  expect(html).toContain('Positive responses 0');
  await save('clients', { name: 'In process', registration: 'In process' });
  const clients = renderToStaticMarkup(clientsReport(store().clients, store())).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  expect(clients).toContain('Unregistered 0');
});

it('keeps P/L source references, quantity and description without duplicating revenue from quotations or proformas', async () => {
  await save('salesOrders', { id: 'so', items: [line] });
  await save('quotations', { items: [line] });
  await save('proformaInvoices', { items: [line] });
  await save('expenses', { id: 'expense', description: 'Rent', qty: 2, unitCost: 50 });
  const lines = plLines(store(), 'orders');
  expect(lines).toHaveLength(2);
  expect(lines.find((l) => l.id === 'expense')).toMatchObject({ col: 'expenses', description: 'Rent', qty: 2, opex: 100 });
  expect(sumPL(lines).net).toBe(100);
});
