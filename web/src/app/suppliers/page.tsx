"use client";

import { ModulePage } from "@/components/ModulePage";
import { suppliersReport } from "@/components/reports";

const report = suppliersReport;

export default function Page() {
  return <ModulePage col="suppliers" subtitle="Supplier records, brands and products, purchases and best prices." report={report} />;
}
