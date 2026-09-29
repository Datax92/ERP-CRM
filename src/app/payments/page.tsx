"use client";

import { ModulePage } from "@/components/ModulePage";
import { paymentsReport } from "@/components/reports";

const report = paymentsReport;

export default function Page() {
  return <ModulePage col="payments" subtitle="Payment receipts from clients and payments to vendors." report={report} />;
}
