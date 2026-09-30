"use client";

import { useState } from "react";
import { Calculator, FileText } from "lucide-react";
import { ModulePage } from "@/components/ModulePage";
import { PageHeader } from "@/components/ui";
import { CostSheetWorkspace } from "@/app/cost-sheets/CostSheetWorkspace";
import { pipelineReport } from "@/components/reports";

const report = pipelineReport("quotations");

export default function Page() {
  const [viewMode, setViewMode] = useState<"table" | "costing">("table");

  return (
    <div>
      {/* Top Segmented View Switcher */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-line bg-surface p-1 shadow-[var(--shadow)]">
          <button
            type="button"
            onClick={() => setViewMode("table")}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-semibold transition ${
              viewMode === "table"
                ? "bg-accent text-accent-ink shadow-xs"
                : "text-muted hover:text-ink"
            }`}
          >
            <FileText size={14} />
            <span>Quotations & Pipeline</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("costing")}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-semibold transition ${
              viewMode === "costing"
                ? "bg-accent text-accent-ink shadow-xs"
                : "text-muted hover:text-ink"
            }`}
          >
            <Calculator size={14} />
            <span>Deal Costing & Sourcing Calculator</span>
          </button>
        </div>
      </div>

      {viewMode === "table" ? (
        <ModulePage
          col="quotations"
          subtitle="Offers with landed costing, offered rates, broker commissions, and net margins. Convert won quotes into sales orders."
          report={report}
        />
      ) : (
        <div>
          <PageHeader
            title="Quotation Deal Costing Engine"
            subtitle="Full commercial costing inside Quotations: Sourcing costs, Landed expenses (freight, duties, cartage, demurrage), Broker commissions, Taxes (WHT & GST), and Net Take-Home Margin."
          />
          <CostSheetWorkspace />
        </div>
      )}
    </div>
  );
}
