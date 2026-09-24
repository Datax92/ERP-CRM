"use client";

import { ModulePage } from "@/components/ModulePage";
import { pipelineReport } from "@/components/reports";

const report = pipelineReport("proformaInvoices");

export default function Page() {
  return <ModulePage col="proformaInvoices" subtitle="Proformas issued to clients and received from suppliers, with pending amounts." report={report} />;
}
