"use client";

import { ModulePage } from "@/components/ModulePage";
import { clientsReport } from "@/components/reports";

const report = clientsReport;

export default function Page() {
  return <ModulePage col="clients" subtitle="Client records. Stages update automatically from RFQs, quotations, orders and payments." report={report} />;
}
