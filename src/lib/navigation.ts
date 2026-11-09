export type AppItem = { href: string; label: string; icon: string };
export const NAV: { group: string; items: AppItem[] }[] = [
  { group: 'Overview', items: [
    { href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { href: '/schedule', label: 'Tasks & Planner', icon: 'tasks' },
  ] },
  { group: 'Contacts', items: [
    { href: '/clients', label: 'Clients', icon: 'agents' },
    { href: '/suppliers', label: 'Suppliers', icon: 'inventory' },
    { href: '/marketing', label: 'Marketing', icon: 'commission' },
  ] },
  { group: 'Sales', items: [
    { href: '/rfqs', label: 'RFQs', icon: 'projects' },
    { href: '/quotations', label: 'Quotations', icon: 'proforma' },
    { href: '/cost-sheets', label: 'Cost Sheets', icon: 'landed' },
    { href: '/sales-orders', label: 'Sales Orders', icon: 'sales' },
  ] },
  { group: 'Purchasing', items: [
    { href: '/purchase-orders', label: 'Purchase Orders', icon: 'purchase' },
    { href: '/proforma-invoices', label: 'Proforma Invoices', icon: 'saleInvoice' },
    { href: '/deliveries', label: 'Deliveries', icon: 'inventory' },
  ] },
  { group: 'Finance', items: [
    { href: '/payments', label: 'Payments', icon: 'cash' },
    { href: '/finance', label: 'Account / Finance', icon: 'bank' },
    { href: '/expenses', label: 'Expenses / Charity / Zakat', icon: 'expenses' },
    { href: '/investors', label: 'Investors', icon: 'finance' },
    { href: '/profit-loss', label: 'Profit / Loss', icon: 'pnl' },
  ] },
  { group: 'Administration', items: [
    { href: '/company', label: 'Company', icon: 'assets' },
    { href: '/settings', label: 'Settings', icon: 'admin' },
    { href: '/appearance', label: 'Appearance', icon: 'appearance' },
  ] },
];
export const APPS = NAV.flatMap((group) => group.items);
export const navGroupFor = (pathname: string) => NAV.find((g) => g.items.some((i) => pathname.replace(/\/$/, '') === i.href))?.group || 'Overview';
