import type { Settings, ListKey } from "./types";

/** Starting values only — every list is editable on the Settings page. */
export const DEFAULT_SETTINGS: Settings = {
  companyName: "My Company",
  inactiveDays: 90,
  regions: [
    "Punjab",
    "Sindh",
    "Khyber Pakhtunkhwa",
    "Balochistan",
    "Islamabad Capital Territory",
    "Gilgit-Baltistan",
    "Azad Jammu & Kashmir",
    "Middle East",
    "Europe",
    "East Asia",
    "South Asia",
    "Americas",
    "Africa",
  ],
  countries: [
    "Pakistan",
    "China",
    "United Arab Emirates",
    "Saudi Arabia",
    "Turkey",
    "Germany",
    "Italy",
    "United Kingdom",
    "United States",
    "Japan",
    "South Korea",
  ],
  sectors: [
    "Oil & Gas",
    "Power & Energy",
    "Water & Sanitation",
    "Manufacturing",
    "Textile",
    "Pharmaceutical",
    "Food & Beverage",
    "Construction",
    "Government",
    "Healthcare",
    "Telecom",
    "Other",
  ],
  brands: [],
  products: [],
  units: ["Nos", "Pcs", "Set", "Lot", "Kg", "Meter", "Litre", "Box"],
  currencies: ["PKR", "USD", "EUR", "GBP", "CNY", "AED", "SAR"],
  paymentTerms: ["Advance", "Partial Advance", "Credit", "LC (Letter of Credit)", "Cash on Delivery", "Other"],
  paymentMethods: ["Bank Transfer", "Cheque", "Cash", "LC", "Online", "Other"],
  incoterms: ["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"],
  followUpStatuses: ["Not started", "Awaiting response", "Follow-up due", "Followed up", "Negotiating", "Closed"],
  marketingChannels: ["Email", "WhatsApp", "Advertisement", "Phone Call", "Visit", "Exhibition", "Other"],
  marketingResponses: ["No response", "Interested", "Not interested", "Requested quotation", "Became client"],
  expenseCategories: ["General", "Salaries", "Rent", "Utilities", "Travel", "Freight & Customs", "Legal", "Office", "Other"],
  companyDocCategories: ["Prequalification", "Tax", "Legal", "Registration", "Certificate", "Other"],
  financeTypes: ["Loan", "Bank Finance", "Investor", "Other"],
  financeCategories: ["Bank Charges", "Other Income", "Owner Contribution", "Owner Withdrawal", "Transfer", "Adjustment", "Other"],
};

export const LIST_LABELS: Record<ListKey, string> = {
  regions: "Regions",
  countries: "Countries",
  sectors: "Sectors",
  brands: "Brands",
  products: "Products",
  units: "Units",
  currencies: "Currencies",
  paymentTerms: "Payment terms",
  paymentMethods: "Payment methods",
  incoterms: "Incoterms",
  followUpStatuses: "Follow-up statuses",
  marketingChannels: "Marketing channels",
  marketingResponses: "Marketing responses",
  expenseCategories: "Expense categories",
  companyDocCategories: "Company document categories",
  financeTypes: "Investor / finance types",
  financeCategories: "Account entry categories",
};

export function mergeSettings(stored: Partial<Settings> | undefined): Settings {
  const merged = { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
  for (const k of Object.keys(LIST_LABELS) as ListKey[]) merged[k] = [...new Set((merged[k] ?? []).map((v) => String(v).trim()).filter(Boolean))];
  return merged;
}
