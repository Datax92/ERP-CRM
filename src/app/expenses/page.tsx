"use client";

import { ModulePage } from "@/components/ModulePage";
import { expensesReport } from "@/components/reports";

const report = expensesReport;

export default function Page() {
  return <ModulePage col="expenses" subtitle="Business expenses, charity and zakat." report={report} />;
}
