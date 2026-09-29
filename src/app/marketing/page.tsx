"use client";

import { ModulePage } from "@/components/ModulePage";
import { marketingReport } from "@/components/reports";

const report = marketingReport;

export default function Page() {
  return <ModulePage col="marketing" subtitle="Client approaches by email, WhatsApp and advertisement, and their response." report={report} />;
}
