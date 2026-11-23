import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('@/lib/db', () => import('./memory-db'));
import { mem, saveRecord, store } from './memory-db';
import { MODULES } from '@/lib/modules';
import { paymentInfo, shipmentInfo } from '@/lib/derive';
import { reportByKey, STANDARD_REPORTS } from '@/lib/standardReports';
import { conversionsFor } from '@/lib/workflow';
import { waNumber } from '@/lib/marketing';
import { DEFAULT_SETTINGS, mergeSettings } from '@/lib/settings';
import { cashFlows, plLines, sumPL } from '@/lib/finance';

beforeEach(() => mem.reset());

const so = (id: string, clientId: string, amount: number) =>
  saveRecord('salesOrders', { id, ...MODULES.salesOrders.defaults(store()), clientId, date: '2026-10-01', items: [{ description: 'Valve', qty: 1, unitCost: amount / 2, unitPrice: amount }] }, { itemsMode: 'sale', serialPrefix: 'SO' });

it('offers the client’s attachment names, numbered, in every module', () => {
  expect(DEFAULT_SETTINGS.attachmentNames.slice(0, 6)).toEqual(['Client PO', 'Supplier proforma invoice', 'Quotation', 'RFQ', 'Technical approvals', 'Supplier PO']);
  const cell = MODULES.salesOrders.columns.find((c) => c.key === 'attachments')!;
  expect(cell.cell({ id: 'x', attachments: [{ label: 'Client PO', name: 'po.pdf' }, { name: 'scan.jpg' }] }, store()).text).toBe('1. Client PO, 2. scan.jpg');
  for (const m of Object.values(MODULES)) expect(m.columns.some((c) => c.key === 'attachments'), m.col).toBe(true);
  expect(mergeSettings({ memorizedReports: undefined as never }).memorizedReports).toEqual([]);
});

it('shows total, paid and remaining payment and whether a payment was full or partial', async () => {
  await saveRecord('clients', { id: 'c1', name: 'Lucky Cement' });
  await so('so1', 'c1', 1000);
  const p1 = await saveRecord('payments', { id: 'p1', direction: 'Received', clientId: 'c1', salesOrderId: 'so1', amount: 400, currency: 'PKR', bankName: 'HBL', accountNumber: 'PK00HABB' }, { amountField: 'amount' });
  let i = paymentInfo(p1, store());
  expect(i).toMatchObject({ total: 1000, paid: 400, remaining: 600, status: 'Partially paid', kind: 'Partial payment' });
  await saveRecord('payments', { id: 'p2', direction: 'Received', clientId: 'c1', salesOrderId: 'so1', amount: 600, currency: 'PKR' }, { amountField: 'amount' });
  i = paymentInfo(p1, store());
  expect(i).toMatchObject({ paid: 1000, remaining: 0, status: 'Paid' });
  const bank = MODULES.payments.columns.find((c) => c.key === 'accountNumber')!;
  expect(bank.cell(p1, store()).text).toBe('PK00HABB');
});

it('analyses each customer: RFQs, quotations, sales orders and business total', async () => {
  await saveRecord('clients', { id: 'c1', name: 'Lucky Cement', region: 'Middle East', sector: 'Cement' });
  await saveRecord('clients', { id: 'c2', name: 'OGDCL', region: 'Punjab', sector: 'Oil & Gas' });
  await saveRecord('rfqs', { id: 'r1', clientId: 'c1', date: '2026-09-01', status: 'Open' });
  await saveRecord('rfqs', { id: 'r2', clientId: 'c1', date: '2026-09-02', status: 'Open' });
  await saveRecord('quotations', { id: 'q1', clientId: 'c1', date: '2026-09-03', status: 'Won', currency: 'PKR', items: [{ qty: 1, unitPrice: 1000 }] }, { itemsMode: 'sale' });
  await so('so1', 'c1', 1000);
  const rows = reportByKey('customerAnalysis')!.run(store(), {}).rows;
  expect(rows[0].cells.slice(0, 9)).toEqual(['Lucky Cement', 'Middle East', 'Cement', 2, 1, 1000, 1, 100, 1000]);
  const filtered = reportByKey('customerAnalysis')!.run(store(), { sector: 'Oil & Gas' }).rows;
  expect(filtered.map((r) => r.cells[0])).toEqual(['OGDCL']);
  for (const r of STANDARD_REPORTS) expect(() => r.run(store(), { from: '2026-01-01', to: '2026-12-31' }), r.key).not.toThrow();
});

it('tracks a shipment from a sales order with its missing documents', async () => {
  await saveRecord('clients', { id: 'c1', name: 'Lucky Cement' });
  await so('so1', 'c1', 1000);
  const ship = await conversionsFor('salesOrders', store().byId.salesOrders.get('so1')!, store()).find((c) => c.target === 'shipments')!.run();
  expect(ship).toMatchObject({ salesOrderId: 'so1', clientId: 'c1', status: 'Booked' });
  expect(ship.serial).toMatch(/^SHP-/);
  const i = shipmentInfo({ ...ship, docsReady: ['Commercial invoice', 'Packing list'] }, store());
  expect(i.missing).not.toContain('Packing list');
  expect(i.missing).toContain('Bill of lading / AWB');
});

it('formats WhatsApp numbers for wa.me links', () => {
  expect(waNumber('0300-1234567')).toBe('923001234567');
  expect(waNumber('+971 50 123 4567')).toBe('971501234567');
  expect(waNumber('0092 300 1234567')).toBe('923001234567');
});

it('keeps client and supplier filters separate, with the revision fields in the right module', async () => {
  await saveRecord('clients', { id: 'c1', name: 'Lucky Cement', region: 'Punjab', country: 'Pakistan', headOffice: 'Karachi', plant: 'Pezu', department: 'Procurement' });
  await saveRecord('suppliers', { id: 's1', name: 'Grundfos', region: 'Europe', country: 'Denmark' });
  const options = (col: 'clients' | 'suppliers', key: string) => MODULES[col].filters.find((f) => f.key === key)!.options(store());
  expect(options('clients', 'region')).toEqual(['Punjab']);
  expect(options('suppliers', 'country')).toEqual(['Denmark']);
  for (const key of ['company', 'headOffice', 'plant', 'department']) expect(MODULES.clients.filters.some((f) => f.key === key), key).toBe(true);
  for (const key of ['sector', 'headOffice', 'plant']) {
    expect(MODULES.suppliers.fields.some((f) => f.name === key), key).toBe(false);
    expect(MODULES.suppliers.columns.some((c) => c.key === key), key).toBe(false);
    expect(MODULES.suppliers.filters.some((f) => f.key === key), key).toBe(false);
  }
});

it('counts a supplier payment bank fee as a bank charge without reducing the payable', async () => {
  await saveRecord('payments', { id: 'p1', direction: 'Paid', date: '2026-11-01', amount: 1000, bankFees: 50, currency: 'PKR' }, { amountField: 'amount' });
  const flows = cashFlows(store());
  expect(flows.map((f) => [f.kind, f.pkr])).toEqual([['Vendor payments', 1000], ['Bank charges', 50]]);
  expect(sumPL(plLines(store(), 'cash'))).toMatchObject({ cost: 1000, opex: 50 });
});
