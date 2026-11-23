import { describe, it, expect } from 'vitest';
import { MODULES, statusTone } from '@/lib/modules';
import { stageKind } from '@/lib/stages';

describe('document requirements', () => {
  it('keeps client and supplier contact fields editable and visible, with remarks last', () => {
    for (const name of ['clients', 'suppliers'] as const) {
      const m = MODULES[name];
      const own = name === 'clients' ? ['sector', 'headOffice', 'plant', 'department'] : [];
      for (const key of [...own, 'country', 'address', 'contactPerson', 'jobTitle', 'email', 'phone', 'mobile', 'whatsapp', 'remarks']) {
        expect(m.fields.some(f => f.name === key), `${name} field ${key}`).toBe(true);
        expect(m.columns.some(c => c.key === key), `${name} column ${key}`).toBe(true);
      }
      expect(m.columns.at(-1)?.key).toBe('remarks');
    }
  });
  it('closes unsuccessful RFQs without changing legacy classifications', () => {
    expect(stageKind('rfqs', 'Close without Success')).toBe('lost');
    expect(stageKind('rfqs', 'Converted')).toBe('won');
    expect(stageKind('rfqs', 'Costing')).toBe('open');
  });
  it('does not color unpaid or inactive records green', () => {
    for (const s of ['Unpaid', 'Inactive', 'Close without Success', 'Lost']) expect(statusTone(s)).toBe('bad');
    expect(statusTone('Approved')).toBe('good');
    expect(statusTone('Partially paid')).toBe('warn');
  });
});
