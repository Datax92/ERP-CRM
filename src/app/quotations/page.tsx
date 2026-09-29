"use client";

import { ModulePage } from "@/components/ModulePage";
import { pipelineReport } from "@/components/reports";

const report = pipelineReport("quotations");

export default function Page() {
  return <ModulePage col="quotations" subtitle="Offers with costing, offered rate and margin. Convert a won quotation into a sales order." report={report} />;
}
