"use client";

import { ModulePage } from "@/components/ModulePage";
import { shipmentsReport } from "@/components/reports";

export default function Page() {
  return <ModulePage col="shipments" subtitle="Track every shipment from booking to delivery, and the documents that go with it." report={shipmentsReport} />;
}
