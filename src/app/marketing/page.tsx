"use client";

import { useState } from "react";
import { Users } from "lucide-react";
import { ModulePage } from "@/components/ModulePage";
import { MarketingGroups } from "@/components/MarketingGroups";
import { marketingReport } from "@/components/reports";

const report = marketingReport;

export default function Page() {
  const [groups, setGroups] = useState(false);
  return (
    <ModulePage
      col="marketing"
      subtitle="Client outreach by Email, WhatsApp and Call, with status, contact details and next follow-up."
      report={report}
      extraActions={
        <button type="button" className={`btn ${groups ? "erp-filter-on" : ""}`} aria-expanded={groups} onClick={() => setGroups((v) => !v)}>
          <Users size={14} /> Client groups
        </button>
      }
      banner={groups ? <MarketingGroups /> : null}
    />
  );
}
