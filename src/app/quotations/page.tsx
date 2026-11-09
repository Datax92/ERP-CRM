"use client";
import Link from 'next/link';
import { Calculator } from 'lucide-react';
import { ModulePage } from '@/components/ModulePage';
import { pipelineReport } from '@/components/reports';
const report = pipelineReport('quotations');
export default function Page() {
  return <ModulePage col="quotations" subtitle="Prepare offers, track follow-ups, and convert accepted quotations to sales orders." report={report}
    extraActions={<Link href="/cost-sheets?view=workspace" className="btn"><Calculator size={14} />Cost calculator</Link>} />;
}
