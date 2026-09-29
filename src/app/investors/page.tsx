"use client";

import { ModulePage } from "@/components/ModulePage";
import { investorsReport } from "@/components/reports";

const report = investorsReport;

export default function Page() {
  return <ModulePage col="investors" subtitle="Loans, bank finance and investor money." report={report} />;
}
