"use client";

import { ModulePage } from "@/components/ModulePage";
import { FinanceDashboard } from "@/components/FinanceDashboard";

export default function Page() {
  return (
    <ModulePage
      col="financeEntries"
      defaultTab="reports"
      subtitle="Cash flow across payments, expenses, investors and company costs. Record bank charges, other income and owner transactions as account entries."
      report={(_rows, s, f) => <FinanceDashboard s={s} from={f.from} to={f.to} />}
    />
  );
}
