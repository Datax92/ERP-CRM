"use client";

import { ModulePage } from "@/components/ModulePage";
import { companyReport } from "@/components/reports";

const report = companyReport;

export default function Page() {
  return <ModulePage col="companyDocs" subtitle="Prequalification documents, taxes, legal expenses and other company records." report={report} />;
}
