"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, CalendarCheck, LayoutList, Plus } from "lucide-react";
import { ModulePage } from "@/components/ModulePage";
import { PageHeader } from "@/components/ui";
import { SchedulePlanner } from "./SchedulePlanner";

export default function SchedulePage() {
  const router = useRouter();
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
            <span>Daily Planner & Agenda</span>
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
            <span>All Records & Filter Table</span>
          </button>
        </div>
      </div>

      {viewMode === "planner" ? (
        <div>
          <PageHeader
            title="Daily Schedule & Diary"
            subtitle="Plan today's agenda, check off completed tasks, record client follow-ups, and write your daily business diary."
          />
          <SchedulePlanner />
        </div>
      ) : (
        <ModulePage
          col="schedule"
          subtitle="Complete list of all scheduled tasks, follow-ups, and daily logs with filtering and export."
        />
      )}
    </div>
  );
}
