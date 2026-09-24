"use client";

import { ModulePage } from "@/components/ModulePage";
import { pipelineReport } from "@/components/reports";

const report = pipelineReport("deliveries");

export default function Page() {
  return <ModulePage col="deliveries" subtitle="Shipments to clients: dates, Incoterms, confirmation and late days." report={report} />;
}
