/* eslint-disable @typescript-eslint/no-explicit-any */

/** Every Firestore record handled by the generic module UI. */
export type Rec = { id: string; [key: string]: any };

export type CollectionName =
  | "clients"
  | "suppliers"
  | "marketing"
  | "rfqs"
  | "quotations"
  | "salesOrders"
  | "purchaseOrders"
  | "proformaInvoices"
  | "payments"
  | "deliveries"
  | "companyDocs"
  | "investors"
  | "expenses"
  | "financeEntries"
  | "schedule"
  | "costSheets";

export const COLLECTIONS: CollectionName[] = [
  "clients",
  "suppliers",
  "marketing",
  "rfqs",
  "quotations",
  "salesOrders",
  "purchaseOrders",
  "proformaInvoices",
  "payments",
  "deliveries",
  "companyDocs",
  "investors",
  "expenses",
  "financeEntries",
  "schedule",
  "costSheets",
];

export type Attachment = {
  name: string;
  url: string;
  path: string;
  size: number;
  uploadedAt: string;
  thumbUrl?: string;
  deleteUrl?: string;
  provider?: "imgbb" | "firebase";
};

/** basic = description/qty only, cost = + unit cost, sale = + unit cost and offered price */
export type ItemsMode = "basic" | "cost" | "sale";

export type LineItem = {
  description: string;
  product: string;
  brand: string;
  supplierId: string;
  qty: number;
  unit: string;
  unitCost: number;
  unitPrice: number;
};

export type ExtraCostItem = {
  category: string;
  description?: string;
  amount: number;
  currency?: string;
  exchangeRate?: number;
  amountPKR?: number;
  paidTo?: string;
};

export type CommissionItem = {
  name: string;
  role: string;
  type: "percent_sale" | "percent_purchase" | "per_unit" | "fixed";
  rate: number;
  amountPKR: number;
  notes?: string;
};

export type TaxConfig = {
  whtSaleRate: number;
  whtImportRate: number;
  gstOutputRate: number;
  gstInputRate: number;
  incomeTaxRate: number;
  whtSaleAmount: number;
  whtImportAmount: number;
  gstNetPayable: number;
  incomeTaxAmount: number;
  totalTaxPayable: number;
};

export type Settings = {
  regions: string[];
  countries: string[];
  sectors: string[];
  brands: string[];
  products: string[];
  units: string[];
  currencies: string[];
  paymentTerms: string[];
  paymentMethods: string[];
  incoterms: string[];
  followUpStatuses: string[];
  marketingChannels: string[];
  marketingResponses: string[];
  expenseCategories: string[];
  companyDocCategories: string[];
  financeTypes: string[];
  financeCategories: string[];
  taskCategories: string[];
  taskPriorities: string[];
  taskProjects: string[];
  taskHorizons: string[];
  extraCostCategories: string[];
  commissionRoles: string[];
  inactiveDays: number;
  companyName: string;
  imgbbApiKey: string;
};

export type ListKey = {
  [K in keyof Settings]-?: Settings[K] extends string[] ? K : never;
}[keyof Settings];
