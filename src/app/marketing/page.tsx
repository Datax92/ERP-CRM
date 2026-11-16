"use client";

import { ModulePage } from "@/components/ModulePage";
import { marketingReport } from "@/components/reports";

const report = marketingReport;

export default function Page() {
  return <ModulePage col="marketing" subtitle="Client outreach by Email, WhatsApp and Call, with status, contact details and next follow-up." report={report} />;
}
