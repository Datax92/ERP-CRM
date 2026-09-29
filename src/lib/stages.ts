import type { CollectionName } from "./types";

/**
 * Workflow statuses. These are fixed (not user-editable) because the open/closed and
 * success/failure reporting in the Excel depends on knowing what each status means.
 */
export type StageDef = { options: string[]; open: string[]; won: string[]; lost: string[] };

export const STAGES: Partial<Record<CollectionName, StageDef>> = {
  rfqs: {
    options: ["Open", "Costing", "Converted", "Regretted", "Lost", "Cancelled"],
    open: ["Open", "Costing"],
    won: ["Converted"],
    lost: ["Regretted", "Lost", "Cancelled"],
  },
  quotations: {
    options: ["Draft", "Sent", "Follow-up", "Negotiation", "Won", "Lost", "Cancelled"],
    open: ["Draft", "Sent", "Follow-up", "Negotiation"],
    won: ["Won"],
    lost: ["Lost", "Cancelled"],
  },
  salesOrders: {
    options: ["Open", "PO Issued", "In Transit", "Delivered", "Closed", "Cancelled"],
    open: ["Open", "PO Issued", "In Transit"],
    won: ["Delivered", "Closed"],
    lost: ["Cancelled"],
  },
  purchaseOrders: {
    options: ["Draft", "Issued", "Confirmed", "Shipped", "Received", "Closed", "Cancelled"],
    open: ["Draft", "Issued", "Confirmed", "Shipped"],
    won: ["Received", "Closed"],
    lost: ["Cancelled"],
  },
  proformaInvoices: {
    // Paid / Partially paid are derived from payments, see derive.ts
    options: ["Draft", "Sent", "Cancelled"],
    open: ["Draft", "Sent"],
    won: [],
    lost: ["Cancelled"],
  },
  deliveries: {
    options: ["Pending", "Dispatched", "In Transit", "Delivered", "Returned", "Cancelled"],
    open: ["Pending", "Dispatched", "In Transit"],
    won: ["Delivered"],
    lost: ["Returned", "Cancelled"],
  },
  schedule: {
    options: ["Pending", "Open", "In progress", "Completed", "Postponed", "Cancelled"],
    open: ["Pending", "Open", "In progress"],
    won: ["Completed"],
    lost: ["Cancelled"],
  },
  costSheets: {
    options: ["Draft", "Costed", "Approved", "Converted", "Cancelled"],
    open: ["Draft", "Costed", "Approved"],
    won: ["Converted"],
    lost: ["Cancelled"],
  },
};

export const CLIENT_LIFECYCLE = ["Lead", "Inquiry received", "Offer given", "Order received", "Delivered"] as const;

export function stageKind(col: CollectionName, status: string | undefined): "open" | "won" | "lost" | "none" {
  const def = STAGES[col];
  if (!def || !status) return "none";
  if (def.open.includes(status)) return "open";
  if (def.won.includes(status)) return "won";
  if (def.lost.includes(status)) return "lost";
  return "none";
}
