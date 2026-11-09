import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('@/lib/db', () => import('./memory-db'));
import { mem, saveRecord, store } from './memory-db';
import { conversionsFor, linkedRecords } from '@/lib/workflow';
import { MODULES } from '@/lib/modules';

beforeEach(() => mem.reset());

it('keeps cost-sheet links, attachments and costing through quotation and sales order', async () => {
  const sheet = await saveRecord('costSheets', {
    id: 'sheet-1', clientId: 'client-1', currency: 'PKR', exchangeRate: 1,
    items: [{ description: 'Pump', qty: 2, unitCost: 100, unitPrice: 150 }],
    freightAmount: 25, commissionType: 'fixed', commissionRate: 10,
    attachments: [{ name: 'specification.pdf', url: 'https://example.test/specification.pdf' }],
  }, { itemsMode: 'sale', serialPrefix: 'CS' });
  const quote = await conversionsFor('costSheets', sheet, store()).find((a) => a.target === 'quotations')!.run();
  expect(quote.costSheetId).toBe(sheet.id);
  expect(quote.freightAmount).toBe(25);
  expect(quote.attachments).toEqual(sheet.attachments);
  expect(linkedRecords('quotations', quote, store()).filter((link) => link.col === 'costSheets')).toHaveLength(1);
  expect(conversionsFor('costSheets', sheet, store()).find((a) => a.target === 'quotations')!.disabled).toBeTruthy();
  const order = await conversionsFor('quotations', quote, store()).find((a) => a.target === 'salesOrders')!.run();
  expect(order.costSheetId).toBe(sheet.id);
  expect(order.commissionRate).toBe(10);
  expect(conversionsFor('costSheets', sheet, store()).find((a) => a.target === 'salesOrders')!.disabled).toBeTruthy();
});

it('does not issue a second purchase order for the unassigned supplier group', async () => {
  const order = await saveRecord('salesOrders', { id: 'so-1', ...MODULES.salesOrders.defaults(store()), items: [{ description: 'Pump', qty: 1, unitCost: 100, unitPrice: 150 }] }, { itemsMode: 'sale' });
  await conversionsFor('salesOrders', order, store()).find((a) => a.target === 'purchaseOrders')!.run();
  expect(conversionsFor('salesOrders', order, store()).find((a) => a.target === 'purchaseOrders')!.disabled).toBeTruthy();
});
