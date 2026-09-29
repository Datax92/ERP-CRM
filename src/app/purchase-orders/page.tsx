"use client";

import { ModulePage } from "@/components/ModulePage";
import { pipelineReport } from "@/components/reports";

const report = pipelineReport("purchaseOrders");

export default function Page() {
  return <ModulePage col="purchaseOrders" subtitle="Orders issued to suppliers, with vendor payments, confirmation and shipment dates." report={report} />;
}
