"use client";

import { ModulePage } from "@/components/ModulePage";
import { pipelineReport } from "@/components/reports";

const report = pipelineReport("salesOrders");

export default function Page() {
  return <ModulePage col="salesOrders" subtitle="Confirmed client orders. Issue POs to suppliers, proformas, deliveries and payments from here." report={report} />;
}
