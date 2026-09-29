"use client";

import { useState } from "react";
import { Calculator, LayoutList } from "lucide-react";
import { ModulePage } from "@/components/ModulePage";
import { PageHeader } from "@/components/ui";
import { CostSheetWorkspace } from "./CostSheetWorkspace";

export default function CostSheetsPage() {
  const [viewMode, setViewMode] = useState<"workspace" | "table">("workspace");

  return (
    <div>
      {/* View Switcher Bar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-line bg-surface p-1 shadow-[var(--shadow)]">
          <button
            type="button"
            onClick={() => setViewMode("workspace")}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-semibold transition ${
              viewMode === "workspace"
                ? "bg-accent text-accent-ink shadow-xs"
                : "text-muted hover:text-ink"
            }`}
          >
            <Calculator size={14} />
            <span>Deal Costing Engine & Workspace</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("table")}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-semibold transition ${
              viewMode === "table"
                ? "bg-accent text-accent-ink shadow-xs"
                : "text-muted hover:text-ink"
            }`}
          >
            <LayoutList size={14} />
            <span>All Cost Sheets & Records Table</span>
          </button>
        </div>
      </div>

      {viewMode === "workspace" ? (
        <div>
          <PageHeader
            title="Trading Cost Sheets (Deal Costing)"
            subtitle="Full commercial deal profitability: Sales, Purchases, Landed Expenses (Freight, Customs, C&F, Demurrage, Insurance, Cartage), Broker Commissions, Taxes (WHT & GST), and Net Margin analysis."
          />
          <CostSheetWorkspace />
        </div>
      ) : (
        <ModulePage
          col="costSheets"
          subtitle="Complete list of all trade cost sheets, deal margins, supplier costings, and profit summaries."
        />
      )}
    </div>
  );
}
