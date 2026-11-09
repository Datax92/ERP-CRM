"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BookOpen, CalendarCheck, LayoutList, Plus } from "lucide-react";
import { ModulePage } from "@/components/ModulePage";
import { PageHeader } from "@/components/ui";
import { SchedulePlanner } from "./SchedulePlanner";

export default function SchedulePage() {
  return <Suspense fallback={<p>Loading…</p>}><ScheduleContent /></Suspense>;
}

function ScheduleContent() {
  const params = useSearchParams();
  const [viewMode, setViewMode] = useState<"planner" | "table">("planner");

  return (
    <div>
      {/* View Switcher Bar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-line bg-surface p-1 shadow-[var(--shadow)]">
          <button
            type="button"
            onClick={() => setViewMode("planner")}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-semibold transition ${
              viewMode === "planner"
                ? "bg-accent text-accent-ink shadow-xs"
                : "text-muted hover:text-ink"
            }`}
          >
            <CalendarCheck size={14} />
            <span>Tasks Planner (Daily, Monthly & Long-Term)</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("table")}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-semibold transition ${
              viewMode === "table"
                ? "bg-accent text-accent-ink shadow-xs"
                : "text-muted hover:text-ink"
            }`}
          >
            <LayoutList size={14} />
            <span>All Tasks & Filter Table</span>
          </button>
        </div>
      </div>

      {viewMode === "planner" && !params.has('id') && !params.has('new') ? (
        <div>
          <PageHeader
            title="Tasks & Schedule Planner"
            subtitle="Manage daily action items, monthly operational targets, long-term strategic milestones, and your business diary."
          />
          <SchedulePlanner />
        </div>
      ) : (
        <ModulePage
          col="schedule"
          subtitle="Complete list of all daily, monthly, and yearly long-term tasks with filtering, projects, and export."
        />
      )}
    </div>
  );
}
