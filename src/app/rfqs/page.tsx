"use client";

import { ModulePage } from "@/components/ModulePage";
import { pipelineReport } from "@/components/reports";

const report = pipelineReport("rfqs");

export default function Page() {
  return <ModulePage col="rfqs" subtitle="Customer inquiries. Convert an RFQ into a quotation when you send an offer." report={report} />;
}
