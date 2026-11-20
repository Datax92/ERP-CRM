import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('@/lib/db', () => import('./memory-db'));
import { mem, saveRecord, store } from './memory-db';
import { conversionsFor } from '@/lib/workflow';
import { MODULES } from '@/lib/modules';
import { salesRefOf } from '@/lib/derive';
import { computeCalcSheet } from '@/lib/calcSheet';

beforeEach(() => mem.reset());

const labels = (col: keyof typeof MODULES) => MODULES[col].columns.map((c) => c.label.toLowerCase());

it("arranges the RFQ, offer, sales order and PO columns in the client's sheet order", () => {
  expect(labels('rfqs')).toEqual([
    'creation date', 'region', 'territory', 'sector', 'customer', 'rfq no.', 'rfq date', 'description',
    'total weight', 'qty', 'sale dept. ref.', 'status (open / close)', 'closing date', 'attachments', 'remarks',
  ]);
  expect(labels('quotations').slice(0, 24)).toEqual([
    'creation date', 'region', 'territory', 'sector', 'customer', 'sales ref.', 'rfq ref. no.', 'rfq date',
    'offer no.', 'offer date', 'incoterm', 'payment term', 'total fob value', 'total cfr value', 'budget margin',
    'budget margin (oc)', 'budget margin (ser)', 'currency', 'margin', 'status', 'vendor', 'company', 'origin', 'status remarks',
  ]);
  const so = labels('salesOrders');
  for (const l of ['department', 's/o amount', 'payment due ageing', 's/o ref. no.', 's/o delivery final', 'lc shipment date', 'offer ref. no.', 'target year', 'target month', 's/o delivery ageing', 'maker', 'vendor', 'vendor payment status']) {
    expect(so, l).toContain(l);
  }
  expect(labels('purchaseOrders').slice(0, 5)).toEqual(['creation date', 'vendor name', 'description', 'vendor company', 'so ref. no.']);
});

it('carries the sales ref, territory and calculation sheet from RFQ to offer to sales order to PO', async () => {
  const rfq = await saveRecord('rfqs', { id: 'rfq-1', ...MODULES.rfqs.defaults(store()), clientId: 'c1', salesRef: 'SD-77', territory: 'North', items: [{ description: 'Valve', qty: 3 }] }, { itemsMode: 'basic', serialPrefix: 'RFQ' });
  const quote = await conversionsFor('rfqs', rfq, store()).find((a) => a.target === 'quotations')!.run();
  expect(quote).toMatchObject({ salesRef: 'SD-77', territory: 'North' });
  await saveRecord('quotations', { ...quote, calcSheet: { rows: { freight: '500' } }, budgetMarginPct: 12, items: [{ description: 'Valve', qty: 3, unitCost: 100, unitPrice: 200 }] }, { itemsMode: 'sale' });
  const saved = store().byId.quotations.get(quote.id)!;
  const order = await conversionsFor('quotations', saved, store()).find((a) => a.target === 'salesOrders')!.run();
  expect(order).toMatchObject({ salesRef: 'SD-77', territory: 'North', budgetMarginPct: 12, calcSheet: { rows: { freight: '500' } } });
  expect(order.targetYear).toBe(Number(String(order.date).slice(0, 4)));
  const po = await conversionsFor('salesOrders', store().byId.salesOrders.get(order.id)!, store()).find((a) => a.target === 'purchaseOrders')!.run();
  expect(salesRefOf('purchaseOrders', po, store())).toBe('SD-77');
});

it('derives the FOB and CFR values from the calculation sheet', () => {
  const r = computeCalcSheet({ rows: { packing: '100', inland: '50', exportDecl: '25', fob: '25', freight: '300', insurance: '10' } }, { exWorks: 1000, saleValue: 0 });
  expect(r.fobValue).toBe(1200);
  expect(r.cfrValue).toBe(1500);
});
