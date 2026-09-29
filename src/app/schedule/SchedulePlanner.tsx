"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  Calendar,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock,
  ExternalLink,
  Filter,
  Flame,
  LayoutList,
  Plus,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  Star,
  Target,
  Trash2,
  Users,
} from "lucide-react";
import { useStore } from "@/components/DataProvider";
import { RecordDrawer } from "@/components/RecordDrawer";
import { daysFromToday, fmtDate, fmtMonth, num, today } from "@/lib/calc";
import { deleteRecord, newId, patchRecord, saveRecord } from "@/lib/db";
import { labelOf, MODULES } from "@/lib/modules";
import type { CollectionName, Rec } from "@/lib/types";

export type SchedulePlannerProps = {
  onOpenRecord?: (col: CollectionName, id: string) => void;
};

export type PlannerTab = "daily" | "monthly" | "yearly" | "table" | "diary";

export function SchedulePlanner({ onOpenRecord }: SchedulePlannerProps) {
  const s = useStore();
  const currentIsoDate = today();
  const currentYearStr = currentIsoDate.slice(0, 4);
  const currentMonthStr = currentIsoDate.slice(0, 7);

  // Active view tab
  const [activeTab, setActiveTab] = useState<PlannerTab>("daily");

  // Navigation dates
  const [selectedDate, setSelectedDate] = useState<string>(currentIsoDate);
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthStr);
  const [selectedYear, setSelectedYear] = useState<string>(currentYearStr);

  // Quick Add Universal / Tab States
  const [quickTitle, setQuickTitle] = useState("");
  const [quickHorizon, setQuickHorizon] = useState<"Daily" | "Monthly" | "Yearly / Long-term">("Daily");
  const [quickProject, setQuickProject] = useState("A&SONS WORK");
  const [quickTime, setQuickTime] = useState("10:00");
  const [quickCategory, setQuickCategory] = useState("Client Follow-up");
  const [quickPriority, setQuickPriority] = useState("Low");
  const [quickIsMilestone, setQuickIsMilestone] = useState(false);
  const [quickIsGroup, setQuickIsGroup] = useState(false);
  const [quickClientId, setQuickClientId] = useState("");
  const [quickBusy, setQuickBusy] = useState(false);
  const [seedingBusy, setSeedingBusy] = useState(false);

  // Table Filter States
  const [tableSearch, setTableSearch] = useState("");
  const [tableHorizon, setTableHorizon] = useState<string>("All");
  const [tableStatus, setTableStatus] = useState<string>("All");
  const [tableProject, setTableProject] = useState<string>("All");
  const [tablePriority, setTablePriority] = useState<string>("All");
  const [tableMilestoneOnly, setTableMilestoneOnly] = useState(false);

  // Daily Diary state
  const [diaryNote, setDiaryNote] = useState("");
  const [diarySaving, setDiarySaving] = useState(false);
  const [diarySavedStatus, setDiarySavedStatus] = useState(false);

  // Edit record drawer state
  const [openDrawerId, setOpenDrawerId] = useState<string | null>(null);

  // All tasks in the schedule collection
  const allTasks: Rec[] = s.schedule ?? [];

  // Helper to determine horizon
  function taskHorizon(t: Rec): "Daily" | "Monthly" | "Yearly / Long-term" {
    if (t.horizon === "Yearly / Long-term" || t.horizon === "Yearly" || (!t.horizon && t.targetYear && !t.targetMonth && !t.date)) {
      return "Yearly / Long-term";
    }
    if (t.horizon === "Monthly" || (!t.horizon && t.targetMonth && !t.date)) {
      return "Monthly";
    }
    return "Daily";
  }

  // 1. Daily tasks (for selected date)
  const dayTasks = useMemo(() => {
    return allTasks
      .filter((t) => {
        if (t.isDailyLog) return false;
        const h = taskHorizon(t);
        if (h === "Daily") {
          return t.date === selectedDate;
        }
        return false;
      })
      .sort((a, b) => {
        const pWeight: Record<string, number> = { Urgent: 1, High: 2, Medium: 3, Low: 4 };
        const pa = pWeight[a.priority] ?? 4;
        const pb = pWeight[b.priority] ?? 4;
        if (pa !== pb) return pa - pb;
        return (a.time || "").localeCompare(b.time || "");
      });
  }, [allTasks, selectedDate]);

  // 2. Monthly tasks (for selected month, or daily tasks due this month)
  const monthTasks = useMemo(() => {
    return allTasks
      .filter((t) => {
        if (t.isDailyLog) return false;
        const h = taskHorizon(t);
        if (h === "Monthly") {
          return !t.targetMonth || t.targetMonth === selectedMonth || (t.date && t.date.startsWith(selectedMonth));
        }
        // Also show tasks that have targetMonth set to selectedMonth
        if (t.targetMonth === selectedMonth) return true;
        return false;
      })
      .sort((a, b) => {
        const pWeight: Record<string, number> = { Urgent: 1, High: 2, Medium: 3, Low: 4 };
        const pa = pWeight[a.priority] ?? 4;
        const pb = pWeight[b.priority] ?? 4;
        return pa - pb;
      });
  }, [allTasks, selectedMonth]);

  // 3. Yearly & Long-Term tasks (for selected year)
  const yearTasks = useMemo(() => {
    return allTasks
      .filter((t) => {
        if (t.isDailyLog) return false;
        const h = taskHorizon(t);
        if (h === "Yearly / Long-term") {
          return !t.targetYear || String(t.targetYear) === selectedYear || (t.date && t.date.startsWith(selectedYear));
        }
        if (String(t.targetYear) === selectedYear) return true;
        return false;
      })
      .sort((a, b) => {
        if (a.isMilestone && !b.isMilestone) return -1;
        if (!a.isMilestone && b.isMilestone) return 1;
        const pWeight: Record<string, number> = { Urgent: 1, High: 2, Medium: 3, Low: 4 };
        const pa = pWeight[a.priority] ?? 4;
        const pb = pWeight[b.priority] ?? 4;
        return pa - pb;
      });
  }, [allTasks, selectedYear]);

  // 4. All tasks for the master Table view
  const tableTasks = useMemo(() => {
    return allTasks
      .filter((t) => {
        if (t.isDailyLog) return false;
        const h = taskHorizon(t);

        // Search filter
        if (tableSearch.trim()) {
          const q = tableSearch.toLowerCase().trim();
          const matchTitle = (t.title || "").toLowerCase().includes(q);
          const matchSerial = (t.serial || "").toLowerCase().includes(q);
          const matchProject = (t.project || "").toLowerCase().includes(q);
          const matchNotes = (t.notes || "").toLowerCase().includes(q);
          if (!matchTitle && !matchSerial && !matchProject && !matchNotes) return false;
        }

        // Horizon filter
        if (tableHorizon !== "All" && h !== tableHorizon) return false;

        // Status filter
        if (tableStatus === "Open / Pending") {
          if (t.status === "Completed" || t.status === "Cancelled") return false;
        } else if (tableStatus === "Completed") {
          if (t.status !== "Completed") return false;
        }

        // Project filter
        if (tableProject !== "All") {
          const p = t.project || "A&SONS WORK";
          if (p !== tableProject) return false;
        }

        // Priority filter
        if (tablePriority !== "All" && t.priority !== tablePriority) return false;

        // Milestone filter
        if (tableMilestoneOnly && !t.isMilestone) return false;

        return true;
      })
      .sort((a, b) => {
        // Unfinished first
        const aDone = a.status === "Completed" ? 1 : 0;
        const bDone = b.status === "Completed" ? 1 : 0;
        if (aDone !== bDone) return aDone - bDone;
        return (b.createdAt || "").localeCompare(a.createdAt || "");
      });
  }, [allTasks, tableSearch, tableHorizon, tableStatus, tableProject, tablePriority, tableMilestoneOnly]);

  // Project options for filters
  const projectOptions = useMemo(() => {
    const set = new Set<string>(["A&SONS WORK"]);
    allTasks.forEach((t) => {
      if (t.project) set.add(t.project);
    });
    return Array.from(set);
  }, [allTasks]);

  // Daily progress metrics
  const dayCompletedCount = dayTasks.filter((t) => t.status === "Completed").length;
  const dayProgressPct = dayTasks.length > 0 ? Math.round((dayCompletedCount / dayTasks.length) * 100) : 0;
  const dayUrgentCount = dayTasks.filter((t) => (t.priority === "Urgent" || t.priority === "High") && t.status !== "Completed").length;

  // Monthly progress metrics
  const monthCompletedCount = monthTasks.filter((t) => t.status === "Completed").length;
  const monthProgressPct = monthTasks.length > 0 ? Math.round((monthCompletedCount / monthTasks.length) * 100) : 0;

  // Yearly progress metrics
  const yearCompletedCount = yearTasks.filter((t) => t.status === "Completed").length;
  const yearMilestoneCount = yearTasks.filter((t) => t.isMilestone).length;
  const yearMilestoneCompletedCount = yearTasks.filter((t) => t.isMilestone && t.status === "Completed").length;
  const yearProgressPct = yearTasks.length > 0 ? Math.round((yearCompletedCount / yearTasks.length) * 100) : 0;

  // Load Diary entry for selected day
  const diaryEntry = useMemo(() => {
    return allTasks.find((t) => t.date === selectedDate && t.isDailyLog);
  }, [allTasks, selectedDate]);

  useEffect(() => {
    if (diaryEntry) {
      setDiaryNote(diaryEntry.diaryNotes || diaryEntry.notes || "");
    } else {
      setDiaryNote("");
    }
    setDiarySavedStatus(false);
  }, [diaryEntry, selectedDate]);

  // Navigate date
  function changeDate(days: number) {
    const current = Date.parse(selectedDate);
    if (!Number.isNaN(current)) {
      const next = new Date(current + days * 86400000);
      setSelectedDate(next.toLocaleDateString("en-CA"));
    }
  }

  // Navigate month
  function changeMonth(delta: number) {
    const [y, m] = selectedMonth.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    const nextY = d.getFullYear();
    const nextM = String(d.getMonth() + 1).padStart(2, "0");
    setSelectedMonth(`${nextY}-${nextM}`);
  }

  // Navigate year
  function changeYear(delta: number) {
    setSelectedYear(String(Number(selectedYear) + delta));
  }

  // 7-Day Week Strip calculation
  const weekStrip = useMemo(() => {
    const curr = Date.parse(selectedDate) || Date.now();
    const currDate = new Date(curr);
    const dayOfWeek = currDate.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(currDate.getTime() + mondayOffset * 86400000);

    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday.getTime() + i * 86400000);
      const iso = d.toLocaleDateString("en-CA");
      const dayName = d.toLocaleDateString("en-US", { weekday: "short" });
      const dayNum = d.getDate();
      const count = allTasks.filter((t) => t.date === iso && !t.isDailyLog && taskHorizon(t) === "Daily").length;
      const completed = allTasks.filter((t) => t.date === iso && t.status === "Completed" && !t.isDailyLog && taskHorizon(t) === "Daily").length;
      return { iso, dayName, dayNum, count, completed, isToday: iso === today() };
    });
  }, [selectedDate, allTasks]);

  // Quick Add Task
  async function handleQuickAdd(e: React.FormEvent, forceHorizon?: "Daily" | "Monthly" | "Yearly / Long-term") {
    e.preventDefault();
    const title = quickTitle.trim();
    if (!title) return;

    const horizon = forceHorizon || quickHorizon;
    setQuickBusy(true);
    try {
      await saveRecord(
        "schedule",
        {
          id: newId("schedule"),
          title,
          horizon,
          project: quickProject.trim() || "A&SONS WORK",
          date: horizon === "Daily" ? selectedDate : horizon === "Monthly" ? `${selectedMonth}-01` : `${selectedYear}-12-31`,
          targetMonth: horizon === "Monthly" ? selectedMonth : undefined,
          targetYear: horizon === "Yearly / Long-term" ? selectedYear : undefined,
          time: horizon === "Daily" ? quickTime || "10:00" : undefined,
          category: quickCategory,
          priority: quickPriority,
          status: "Pending",
          isMilestone: quickIsMilestone || horizon === "Yearly / Long-term",
          isGroup: quickIsGroup,
          clientId: quickClientId || undefined,
          notes: "",
        },
        { serialPrefix: "TSK" }
      );
      setQuickTitle("");
      setQuickIsMilestone(false);
      setQuickIsGroup(false);
    } catch {
      // Ignore
    } finally {
      setQuickBusy(false);
    }
  }

  // Toggle completion
  async function toggleComplete(task: Rec) {
    const nextStatus = task.status === "Completed" ? "Pending" : "Completed";
    await patchRecord("schedule", task.id, { status: nextStatus });
  }

  // Postpone task to tomorrow
  async function postponeToTomorrow(task: Rec) {
    const current = Date.parse(task.date || selectedDate);
    const tomorrow = new Date(current + 86400000).toLocaleDateString("en-CA");
    await patchRecord("schedule", task.id, { date: tomorrow, status: "Postponed" });
  }

  // Postpone monthly task to next month
  async function postponeToNextMonth(task: Rec) {
    const currentM = task.targetMonth || selectedMonth;
    const [y, m] = currentM.split("-").map(Number);
    const nextDate = new Date(y, m, 1);
    const nextM = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}`;
    await patchRecord("schedule", task.id, { targetMonth: nextM, status: "Postponed" });
  }

  // Delete task
  async function deleteTask(id: string, title: string) {
    if (!window.confirm(`Delete task "${title}"?`)) return;
    await deleteRecord("schedule", id);
  }

  // Save Daily Diary notes
  async function saveDiary() {
    setDiarySaving(true);
    try {
      if (diaryEntry) {
        await patchRecord("schedule", diaryEntry.id, {
          diaryNotes: diaryNote,
          notes: diaryNote,
        });
      } else {
        await saveRecord(
          "schedule",
          {
            id: newId("schedule"),
            isDailyLog: true,
            date: selectedDate,
            title: `Daily Diary · ${selectedDate}`,
            category: "General Note",
            priority: "Medium",
            status: "Completed",
            diaryNotes: diaryNote,
            notes: diaryNote,
          },
          { serialPrefix: "LOG" }
        );
      }
      setDiarySavedStatus(true);
      setTimeout(() => setDiarySavedStatus(false), 3000);
    } finally {
      setDiarySaving(false);
    }
  }

  // Seed standard sample tasks (from client screenshot)
  async function handleSeedSampleTasks() {
    setSeedingBusy(true);
    try {
      const curY = selectedYear || currentYearStr;
      const curM = selectedMonth || currentMonthStr;
      const samples = [
        { title: "ADVERTISEMENT", horizon: "Monthly", targetMonth: curM, date: `${curM}-01`, project: "A&SONS WORK", priority: "Low", status: "Pending", category: "Admin & Operations", isMilestone: false, isGroup: false },
        { title: "RECEIPT RFQs", horizon: "Daily", date: selectedDate, time: "10:00", project: "A&SONS WORK", priority: "Low", status: "Pending", category: "Client Follow-up", isMilestone: false, isGroup: false },
        { title: "CASH COUNTING MACHINE", horizon: "Monthly", targetMonth: curM, date: `${curM}-15`, project: "A&SONS WORK", priority: "Low", status: "Pending", category: "Admin & Operations", isMilestone: false, isGroup: false },
        { title: "SUBMISSION QOUTATION", horizon: "Daily", date: selectedDate, time: "11:30", project: "A&SONS WORK", priority: "Low", status: "Pending", category: "Quotation & Pricing", isMilestone: false, isGroup: false },
        { title: "OFFICE IN FAISAL TOWN", horizon: "Yearly / Long-term", targetYear: curY, date: `${curY}-12-31`, project: "A&SONS WORK", priority: "Low", status: "Pending", category: "Admin & Operations", isMilestone: true, isGroup: false },
        { title: "VENDOR REGISTRATION", horizon: "Yearly / Long-term", targetYear: curY, date: `${curY}-10-31`, project: "A&SONS WORK", priority: "Low", status: "Pending", category: "Supplier Negotiation", isMilestone: true, isGroup: false },
        { title: "WEBSITE FOR A&SONS", horizon: "Yearly / Long-term", targetYear: curY, date: `${curY}-11-30`, project: "A&SONS WORK", priority: "Low", status: "Pending", category: "Admin & Operations", isMilestone: true, isGroup: false },
        { title: `TAX RETURN-${curY}`, horizon: "Yearly / Long-term", targetYear: curY, date: `${curY}-09-30`, project: "A&SONS WORK", priority: "Low", status: "Pending", category: "Admin & Operations", isMilestone: true, isGroup: false },
      ];

      for (const item of samples) {
        await saveRecord("schedule", { id: newId("schedule"), ...item, notes: "" }, { serialPrefix: "TSK" });
      }
    } finally {
      setSeedingBusy(false);
    }
  }

  // Format month title (e.g. September 2026)
  const monthDateObj = useMemo(() => {
    const [y, m] = selectedMonth.split("-").map(Number);
    return new Date(y, m - 1, 1);
  }, [selectedMonth]);

  const formattedMonthTitle = monthDateObj.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const formattedDayTitle = new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="space-y-5">
      {/* Top Main Navigation Tabs */}
      <div className="card border border-line bg-surface p-2.5 shadow-[var(--shadow)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveTab("daily")}
              className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
                activeTab === "daily"
                  ? "bg-accent text-accent-ink shadow-xs"
                  : "text-muted hover:bg-surface-2 hover:text-ink"
              }`}
            >
              <CalendarCheck size={14} />
              <span>📅 Daily Agenda ({dayTasks.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("monthly")}
              className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
                activeTab === "monthly"
                  ? "bg-accent text-accent-ink shadow-xs"
                  : "text-muted hover:bg-surface-2 hover:text-ink"
              }`}
            >
              <CalendarDays size={14} />
              <span>🗓️ Monthly Goals ({monthTasks.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("yearly")}
              className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
                activeTab === "yearly"
                  ? "bg-accent text-accent-ink shadow-xs"
                  : "text-muted hover:bg-surface-2 hover:text-ink"
              }`}
            >
              <Target size={14} />
              <span>🎯 Yearly & Long-Term ({yearTasks.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("table")}
              className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
                activeTab === "table"
                  ? "bg-accent text-accent-ink shadow-xs"
                  : "text-muted hover:bg-surface-2 hover:text-ink"
              }`}
            >
              <LayoutList size={14} />
              <span>📋 All Tasks List ({allTasks.filter((x) => !x.isDailyLog).length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("diary")}
              className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
                activeTab === "diary"
                  ? "bg-accent text-accent-ink shadow-xs"
                  : "text-muted hover:bg-surface-2 hover:text-ink"
              }`}
            >
              <BookOpen size={14} />
              <span>📖 Business Diary</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSeedSampleTasks}
              disabled={seedingBusy}
              className="btn btn-ghost h-8 px-2.5 text-xs text-muted hover:text-ink"
              title="Add standard A&SONS WORK sample tasks (Daily, Monthly, and Long-Term Milestones)"
            >
              <Sparkles size={13} className="text-brass" />
              <span>{seedingBusy ? "Adding…" : "Load A&SONS Tasks"}</span>
            </button>

            <button
              type="button"
              onClick={() => setOpenDrawerId("new")}
              className="btn btn-primary h-8 px-3 text-xs font-semibold"
            >
              <Plus size={14} />
              <span>Detailed Entry</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. DAILY AGENDA TAB                                                      */}
      {/* ========================================================================= */}
      {activeTab === "daily" && (
        <div className="space-y-4">
          {/* Day Navigation & 7-Day Strip */}
          <div className="card border border-line bg-surface p-4 shadow-[var(--shadow)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 rounded-lg border border-line bg-surface-2/60 p-1">
                  <button
                    type="button"
                    className="btn btn-ghost h-8 w-8 p-0"
                    onClick={() => changeDate(-1)}
                    title="Previous Day"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    type="button"
                    className={`btn h-8 px-3 text-xs font-semibold ${
                      selectedDate === currentIsoDate
                        ? "bg-accent text-accent-ink"
                        : "btn-ghost"
                    }`}
                    onClick={() => setSelectedDate(currentIsoDate)}
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost h-8 w-8 p-0"
                    onClick={() => changeDate(1)}
                    title="Next Day"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>

                <input
                  type="date"
                  className="field h-9 text-xs font-medium"
                  value={selectedDate}
                  onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
                />

                <h2 className="text-base font-bold text-ink sm:text-lg">
                  {formattedDayTitle}
                </h2>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-muted">
                  Daily Progress: <strong className="text-ink">{dayCompletedCount}/{dayTasks.length}</strong>
                </span>
                <span className="font-mono text-sm font-bold text-accent">
                  {dayProgressPct}%
                </span>
              </div>
            </div>

            {/* 7-Day Weekly Strip */}
            <div className="mt-3.5 grid grid-cols-7 gap-1.5 border-t border-line/70 pt-3">
              {weekStrip.map((item) => {
                const isSelected = item.iso === selectedDate;
                return (
                  <button
                    key={item.iso}
                    type="button"
                    onClick={() => setSelectedDate(item.iso)}
                    className={`flex flex-col items-center rounded-lg border p-2 transition text-center ${
                      isSelected
                        ? "border-accent bg-accent/10 ring-1 ring-accent"
                        : item.isToday
                          ? "border-brass/60 bg-brass/5 hover:bg-brass/10"
                          : "border-line bg-surface hover:bg-surface-2"
                    }`}
                  >
                    <span className="text-[11px] font-medium text-muted uppercase">
                      {item.dayName}
                    </span>
                    <span
                      className={`mt-0.5 text-base font-bold ${
                        isSelected ? "text-accent" : "text-ink"
                      }`}
                    >
                      {item.dayNum}
                    </span>
                    <span className="mt-1 flex items-center gap-1 text-[10px]">
                      {item.count > 0 ? (
                        <span
                          className={`rounded px-1.5 py-0.2 font-semibold ${
                            item.completed === item.count
                              ? "bg-good/15 text-good"
                              : "bg-surface-2 text-ink/80"
                          }`}
                        >
                          {item.completed}/{item.count}
                        </span>
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            {/* Left Column: Tasks List */}
            <div className="space-y-4 lg:col-span-8">
              {/* Daily Quick Add */}
              <form
                onSubmit={(e) => handleQuickAdd(e, "Daily")}
                className="card border border-line bg-surface p-3 shadow-xs"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    placeholder="Add a daily action item (e.g. SUBMISSION QOUTATION, RECEIPT RFQs)…"
                    className="field flex-1 text-sm font-medium"
                    value={quickTitle}
                    onChange={(e) => setQuickTitle(e.target.value)}
                    autoFocus
                  />

                  <input
                    type="time"
                    className="field h-9 w-28 text-xs font-mono"
                    value={quickTime}
                    onChange={(e) => setQuickTime(e.target.value)}
                    title="Scheduled time"
                  />

                  <input
                    type="text"
                    placeholder="Project"
                    className="field h-9 w-32 text-xs"
                    value={quickProject}
                    onChange={(e) => setQuickProject(e.target.value)}
                    title="Project Name"
                  />

                  <select
                    className="field h-9 max-w-28 text-xs"
                    value={quickPriority}
                    onChange={(e) => setQuickPriority(e.target.value)}
                  >
                    <option value="Urgent">🔥 Urgent</option>
                    <option value="High">⚡ High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>

                  <button
                    type="submit"
                    disabled={quickBusy || !quickTitle.trim()}
                    className="btn btn-primary h-9 px-4 text-xs font-semibold"
                  >
                    <Plus size={14} /> Add Daily Task
                  </button>
                </div>
              </form>

              {/* Tasks List */}
              <div className="card overflow-hidden border border-line bg-surface shadow-[var(--shadow)]">
                <div className="border-b border-line bg-surface-2/60 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted">
                      Daily Tasks for {formattedDayTitle} ({dayTasks.length})
                    </h3>
                    <div className="flex items-center gap-2 text-xs text-muted">
                      {dayUrgentCount > 0 && (
                        <span className="inline-flex items-center gap-1 rounded bg-bad/15 px-2 py-0.5 text-[11px] font-bold text-bad">
                          <Flame size={12} /> {dayUrgentCount} High/Urgent
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {dayTasks.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted">
                    <CalendarCheck size={32} className="mx-auto text-faint mb-2 opacity-50" />
                    <p className="font-medium text-ink">No daily tasks scheduled for {formattedDayTitle}</p>
                    <p className="text-xs text-faint mt-1">
                      Use the quick-add bar above to plan calls, quotations, RFQs, and follow-ups.
                    </p>
                  </div>
                ) : (
                  <ul className="divide-y divide-line">
                    {dayTasks.map((task) => (
                      <TaskRowItem
                        key={task.id}
                        task={task}
                        s={s}
                        onToggle={() => toggleComplete(task)}
                        onOpen={() => setOpenDrawerId(task.id)}
                        onPostpone={() => postponeToTomorrow(task)}
                        postponeLabel="Tomorrow"
                        onDelete={() => deleteTask(task.id, task.title)}
                        onOpenRecord={onOpenRecord}
                      />
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Right Column: Mini Diary / Journal */}
            <div className="space-y-4 lg:col-span-4">
              <div className="card border border-line bg-surface p-4 shadow-[var(--shadow)]">
                <div className="flex items-center justify-between border-b border-line pb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="grid size-7 place-items-center rounded-md bg-brass/10 text-brass">
                      <BookOpen size={15} />
                    </div>
                    <h3 className="text-sm font-semibold text-ink">
                      Daily Diary Note
                    </h3>
                  </div>
                  {diarySavedStatus && (
                    <span className="text-xs font-semibold text-good">
                      ✓ Saved
                    </span>
                  )}
                </div>

                <p className="mt-2 text-xs text-muted">
                  Executive notes and verbal agreements for {selectedDate}.
                </p>

                <textarea
                  className="field mt-3 min-h-[200px] w-full text-xs font-mono leading-relaxed"
                  placeholder="Daily notes & updates...&#10;• Verbal commitments&#10;• Currency rate observations&#10;• Key calls & next steps"
                  value={diaryNote}
                  onChange={(e) => setDiaryNote(e.target.value)}
                />

                <div className="mt-3 flex items-center justify-between">
                  <span className="text-[11px] text-faint">
                    Permanent log
                  </span>
                  <button
                    type="button"
                    className="btn btn-primary h-8 px-3 text-xs font-semibold"
                    onClick={saveDiary}
                    disabled={diarySaving}
                  >
                    <Save size={13} />
                    <span>{diarySaving ? "Saving…" : "Save Diary"}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. MONTHLY GOALS TAB                                                     */}
      {/* ========================================================================= */}
      {activeTab === "monthly" && (
        <div className="space-y-4">
          {/* Month Navigator Header */}
          <div className="card border border-line bg-surface p-4 shadow-[var(--shadow)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 rounded-lg border border-line bg-surface-2/60 p-1">
                  <button
                    type="button"
                    className="btn btn-ghost h-8 w-8 p-0"
                    onClick={() => changeMonth(-1)}
                    title="Previous Month"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    type="button"
                    className={`btn h-8 px-3 text-xs font-semibold ${
                      selectedMonth === currentMonthStr
                        ? "bg-accent text-accent-ink"
                        : "btn-ghost"
                    }`}
                    onClick={() => setSelectedMonth(currentMonthStr)}
                  >
                    This Month
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost h-8 w-8 p-0"
                    onClick={() => changeMonth(1)}
                    title="Next Month"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>

                <input
                  type="month"
                  className="field h-9 text-xs font-medium"
                  value={selectedMonth}
                  onChange={(e) => e.target.value && setSelectedMonth(e.target.value)}
                />

                <h2 className="text-base font-bold text-ink sm:text-lg">
                  {formattedMonthTitle} Operational Goals
                </h2>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs text-muted">
                  Completed: <strong className="text-ink">{monthCompletedCount}/{monthTasks.length}</strong>
                </span>
                <span className="font-mono text-sm font-bold text-accent">
                  {monthProgressPct}%
                </span>
              </div>
            </div>

            {/* Monthly Progress Bar */}
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full bg-accent transition-all duration-300"
                style={{ width: `${monthProgressPct}%` }}
              />
            </div>
          </div>

          {/* Quick Add for Monthly Task */}
          <form
            onSubmit={(e) => handleQuickAdd(e, "Monthly")}
            className="card border border-line bg-surface p-3 shadow-xs"
          >
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                placeholder="Add a monthly task (e.g. ADVERTISEMENT, CASH COUNTING MACHINE, Tax filing)…"
                className="field flex-1 text-sm font-medium"
                value={quickTitle}
                onChange={(e) => setQuickTitle(e.target.value)}
                autoFocus
              />

              <input
                type="text"
                placeholder="Project"
                className="field h-9 w-36 text-xs"
                value={quickProject}
                onChange={(e) => setQuickProject(e.target.value)}
                title="Project Name"
              />

              <select
                className="field h-9 max-w-28 text-xs"
                value={quickPriority}
                onChange={(e) => setQuickPriority(e.target.value)}
              >
                <option value="Urgent">🔥 Urgent</option>
                <option value="High">⚡ High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>

              <label className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs text-muted cursor-pointer hover:bg-surface-2">
                <input
                  type="checkbox"
                  className="size-3.5 accent-[var(--accent)]"
                  checked={quickIsMilestone}
                  onChange={(e) => setQuickIsMilestone(e.target.checked)}
                />
                <span>⭐ Milestone</span>
              </label>

              <button
                type="submit"
                disabled={quickBusy || !quickTitle.trim()}
                className="btn btn-primary h-9 px-4 text-xs font-semibold"
              >
                <Plus size={14} /> Add Monthly Goal
              </button>
            </div>
          </form>

          {/* Monthly Tasks List */}
          <div className="card overflow-hidden border border-line bg-surface shadow-[var(--shadow)]">
            <div className="border-b border-line bg-surface-2/60 px-4 py-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted">
                  Monthly Tasks & Objectives for {formattedMonthTitle} ({monthTasks.length})
                </h3>
                <span className="text-xs text-muted">
                  Check off goals as they are achieved
                </span>
              </div>
            </div>

            {monthTasks.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted">
                <CalendarDays size={32} className="mx-auto text-faint mb-2 opacity-50" />
                <p className="font-medium text-ink">No monthly tasks planned for {formattedMonthTitle}</p>
                <p className="text-xs text-faint mt-1">
                  Use the quick-add bar above to set monthly operational targets like marketing campaigns, equipment purchases, or monthly reconciliations.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {monthTasks.map((task) => (
                  <TaskRowItem
                    key={task.id}
                    task={task}
                    s={s}
                    onToggle={() => toggleComplete(task)}
                    onOpen={() => setOpenDrawerId(task.id)}
                    onPostpone={() => postponeToNextMonth(task)}
                    postponeLabel="Next Month"
                    onDelete={() => deleteTask(task.id, task.title)}
                    onOpenRecord={onOpenRecord}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. YEARLY & LONG-TERM MILESTONES TAB                                      */}
      {/* ========================================================================= */}
      {activeTab === "yearly" && (
        <div className="space-y-4">
          {/* Year Navigator Header */}
          <div className="card border border-line bg-surface p-4 shadow-[var(--shadow)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 rounded-lg border border-line bg-surface-2/60 p-1">
                  <button
                    type="button"
                    className="btn btn-ghost h-8 w-8 p-0"
                    onClick={() => changeYear(-1)}
                    title="Previous Year"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    type="button"
                    className={`btn h-8 px-3 text-xs font-semibold ${
                      selectedYear === currentYearStr
                        ? "bg-accent text-accent-ink"
                        : "btn-ghost"
                    }`}
                    onClick={() => setSelectedYear(currentYearStr)}
                  >
                    This Year ({currentYearStr})
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost h-8 w-8 p-0"
                    onClick={() => changeYear(1)}
                    title="Next Year"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>

                <h2 className="text-base font-bold text-ink sm:text-lg">
                  🎯 Year {selectedYear} Strategic Milestones & Long-Term Projects
                </h2>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs text-muted">
                  Milestones: <strong className="text-ink">{yearMilestoneCompletedCount}/{yearMilestoneCount}</strong> · Total: <strong className="text-ink">{yearCompletedCount}/{yearTasks.length}</strong>
                </span>
                <span className="font-mono text-sm font-bold text-accent">
                  {yearProgressPct}%
                </span>
              </div>
            </div>

            {/* Yearly Progress Bar */}
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full bg-accent transition-all duration-300"
                style={{ width: `${yearProgressPct}%` }}
              />
            </div>
          </div>

          {/* Quick Add for Yearly / Long-Term Goal */}
          <form
            onSubmit={(e) => handleQuickAdd(e, "Yearly / Long-term")}
            className="card border border-line bg-surface p-3 shadow-xs"
          >
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                placeholder="Add a long-term goal or milestone (e.g. OFFICE IN FAISAL TOWN, WEBSITE FOR A&SONS, TAX RETURN-2026)…"
                className="field flex-1 text-sm font-medium"
                value={quickTitle}
                onChange={(e) => setQuickTitle(e.target.value)}
                autoFocus
              />

              <input
                type="text"
                placeholder="Project"
                className="field h-9 w-36 text-xs"
                value={quickProject}
                onChange={(e) => setQuickProject(e.target.value)}
                title="Project Name"
              />

              <input
                type="text"
                className="field h-9 w-20 text-xs font-mono text-center"
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                title="Target Year"
              />

              <select
                className="field h-9 max-w-28 text-xs"
                value={quickPriority}
                onChange={(e) => setQuickPriority(e.target.value)}
              >
                <option value="Urgent">🔥 Urgent</option>
                <option value="High">⚡ High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>

              <label className="flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/5 px-2.5 py-1.5 text-xs text-ink cursor-pointer">
                <input
                  type="checkbox"
                  className="size-3.5 accent-[var(--accent)]"
                  checked={quickIsMilestone}
                  onChange={(e) => setQuickIsMilestone(e.target.checked)}
                />
                <span className="font-semibold text-accent">⭐ Milestone</span>
              </label>

              <button
                type="submit"
                disabled={quickBusy || !quickTitle.trim()}
                className="btn btn-primary h-9 px-4 text-xs font-semibold"
              >
                <Plus size={14} /> Add Long-Term Goal
              </button>
            </div>
          </form>

          {/* Yearly Milestones Cards & List */}
          <div className="card overflow-hidden border border-line bg-surface shadow-[var(--shadow)]">
            <div className="border-b border-line bg-surface-2/60 px-4 py-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted">
                  Long-Term Goals & Milestones for {selectedYear} ({yearTasks.length})
                </h3>
                <span className="text-xs text-muted">
                  ⭐ Major business milestones are prioritized
                </span>
              </div>
            </div>

            {yearTasks.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted">
                <Target size={32} className="mx-auto text-faint mb-2 opacity-50" />
                <p className="font-medium text-ink">No long-term milestones recorded for {selectedYear}</p>
                <p className="text-xs text-faint mt-1">
                  Add major annual goals such as branch expansion, company website launch, tax filings, or new vendor prequalifications.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {yearTasks.map((task) => (
                  <TaskRowItem
                    key={task.id}
                    task={task}
                    s={s}
                    onToggle={() => toggleComplete(task)}
                    onOpen={() => setOpenDrawerId(task.id)}
                    onDelete={() => deleteTask(task.id, task.title)}
                    onOpenRecord={onOpenRecord}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. ALL TASKS TABLE VIEW (Matches Client Screenshot Table)                */}
      {/* ========================================================================= */}
      {activeTab === "table" && (
        <div className="space-y-4">
          {/* Universal Quick Add Bar */}
          <form
            onSubmit={(e) => handleQuickAdd(e)}
            className="card border border-line bg-surface p-3 shadow-xs"
          >
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                placeholder="Create any task (e.g. ADVERTISEMENT, OFFICE IN FAISAL TOWN, RECEIPT RFQs)…"
                className="field flex-1 text-sm font-medium min-w-[200px]"
                value={quickTitle}
                onChange={(e) => setQuickTitle(e.target.value)}
                autoFocus
              />

              <select
                className="field h-9 text-xs font-semibold"
                value={quickHorizon}
                onChange={(e) => setQuickHorizon(e.target.value as any)}
                title="Time Horizon"
              >
                <option value="Daily">📅 Daily</option>
                <option value="Monthly">🗓️ Monthly</option>
                <option value="Yearly / Long-term">🎯 Yearly / Long-Term</option>
              </select>

              <input
                type="text"
                placeholder="Project"
                className="field h-9 w-32 text-xs"
                value={quickProject}
                onChange={(e) => setQuickProject(e.target.value)}
                title="Project Name"
              />

              <select
                className="field h-9 max-w-28 text-xs"
                value={quickPriority}
                onChange={(e) => setQuickPriority(e.target.value)}
              >
                <option value="Urgent">🔥 Urgent</option>
                <option value="High">⚡ High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>

              <label className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs text-muted cursor-pointer hover:bg-surface-2">
                <input
                  type="checkbox"
                  className="size-3.5 accent-[var(--accent)]"
                  checked={quickIsMilestone}
                  onChange={(e) => setQuickIsMilestone(e.target.checked)}
                />
                <span>⭐ Milestone</span>
              </label>

              <button
                type="submit"
                disabled={quickBusy || !quickTitle.trim()}
                className="btn btn-primary h-9 px-4 text-xs font-semibold"
              >
                <Plus size={14} /> Add Task
              </button>
            </div>
          </form>

          {/* Table Filters Bar (Matches client screenshot filter style) */}
          <div className="card border border-line bg-surface p-3 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 flex-1">
                {/* Search box */}
                <div className="relative min-w-[200px] flex-1 max-w-xs">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
                  <input
                    type="text"
                    placeholder="Search subject or task ID…"
                    className="field h-8 pl-8 text-xs w-full"
                    value={tableSearch}
                    onChange={(e) => setTableSearch(e.target.value)}
                  />
                </div>

                {/* Horizon filter */}
                <select
                  className="field h-8 text-xs"
                  value={tableHorizon}
                  onChange={(e) => setTableHorizon(e.target.value)}
                >
                  <option value="All">All Horizons</option>
                  <option value="Daily">📅 Daily Only</option>
                  <option value="Monthly">🗓️ Monthly Only</option>
                  <option value="Yearly / Long-term">🎯 Yearly / Long-Term</option>
                </select>

                {/* Status filter */}
                <select
                  className="field h-8 text-xs"
                  value={tableStatus}
                  onChange={(e) => setTableStatus(e.target.value)}
                >
                  <option value="All">All Statuses</option>
                  <option value="Open / Pending">Open / Pending</option>
                  <option value="Completed">Completed</option>
                </select>

                {/* Project filter */}
                <select
                  className="field h-8 text-xs"
                  value={tableProject}
                  onChange={(e) => setTableProject(e.target.value)}
                >
                  <option value="All">All Projects</option>
                  {projectOptions.map((proj) => (
                    <option key={proj} value={proj}>
                      {proj}
                    </option>
                  ))}
                </select>

                {/* Priority filter */}
                <select
                  className="field h-8 text-xs"
                  value={tablePriority}
                  onChange={(e) => setTablePriority(e.target.value)}
                >
                  <option value="All">All Priorities</option>
                  <option value="Urgent">Urgent</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>

                {/* Milestone toggle button */}
                <button
                  type="button"
                  onClick={() => setTableMilestoneOnly(!tableMilestoneOnly)}
                  className={`btn h-8 px-2.5 text-xs font-medium border ${
                    tableMilestoneOnly
                      ? "border-accent bg-accent/10 text-accent font-semibold"
                      : "border-line text-muted hover:text-ink"
                  }`}
                >
                  <Star size={13} className={tableMilestoneOnly ? "fill-accent text-accent" : ""} />
                  <span>⭐ Milestones Only</span>
                </button>
              </div>

              <span className="text-xs text-muted">
                Showing <strong className="text-ink">{tableTasks.length}</strong> tasks
              </span>
            </div>
          </div>

          {/* Interactive Tasks Table */}
          <div className="card overflow-x-auto border border-line bg-surface shadow-[var(--shadow)]">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-line bg-surface-2/70 text-muted font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="w-10 px-3 py-2.5 text-center">Done</th>
                  <th className="px-3 py-2.5">Subject</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Project</th>
                  <th className="px-3 py-2.5">Horizon</th>
                  <th className="px-3 py-2.5">Priority</th>
                  <th className="px-3 py-2.5 text-center">Is Milestone</th>
                  <th className="px-3 py-2.5 text-center">Is Group</th>
                  <th className="px-3 py-2.5">Target / Due</th>
                  <th className="px-3 py-2.5">ID</th>
                  <th className="w-14 px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {tableTasks.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-8 text-center text-muted">
                      No tasks found matching current filters.
                    </td>
                  </tr>
                ) : (
                  tableTasks.map((t) => {
                    const isDone = t.status === "Completed";
                    const h = taskHorizon(t);
                    const p = (t.priority || "Low").toLowerCase();

                    // Period text
                    let periodText = t.date ? fmtDate(t.date) : "—";
                    if (h === "Monthly" && t.targetMonth) {
                      periodText = fmtMonth(t.targetMonth) || t.targetMonth;
                    } else if (h === "Yearly / Long-term" && t.targetYear) {
                      periodText = `Year ${t.targetYear}`;
                    }

                    return (
                      <tr
                        key={t.id}
                        className={`transition-colors hover:bg-surface-2/40 ${
                          isDone ? "bg-surface-2/20 opacity-70" : ""
                        }`}
                      >
                        {/* Done toggle checkbox */}
                        <td className="px-3 py-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => toggleComplete(t)}
                            className="text-muted hover:text-accent transition"
                            title={isDone ? "Mark Pending" : "Mark Completed"}
                          >
                            {isDone ? (
                              <CheckCircle2 size={16} className="text-good fill-good/15 inline" />
                            ) : (
                              <Circle size={16} className="hover:stroke-accent inline" />
                            )}
                          </button>
                        </td>

                        {/* Subject */}
                        <td className="px-3 py-2.5 font-medium">
                          <span
                            onClick={() => setOpenDrawerId(t.id)}
                            className={`cursor-pointer hover:text-accent hover:underline ${
                              isDone ? "line-through text-muted" : "text-ink font-semibold"
                            }`}
                          >
                            {t.title}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                              isDone
                                ? "bg-good/15 text-good"
                                : t.status === "In progress"
                                  ? "bg-accent/15 text-accent"
                                  : "bg-surface-2 text-muted"
                            }`}
                          >
                            {isDone ? "Completed" : t.status || "Open"}
                          </span>
                        </td>

                        {/* Project */}
                        <td className="px-3 py-2.5 whitespace-nowrap text-muted font-medium">
                          {t.project || "A&SONS WORK"}
                        </td>

                        {/* Horizon */}
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span
                            className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                              h === "Yearly / Long-term"
                                ? "bg-brass/15 text-brass"
                                : h === "Monthly"
                                  ? "bg-accent-soft text-accent"
                                  : "bg-surface-2 text-ink/80"
                            }`}
                          >
                            {h === "Yearly / Long-term" ? "🎯 Yearly" : h === "Monthly" ? "🗓️ Monthly" : "📅 Daily"}
                          </span>
                        </td>

                        {/* Priority */}
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 font-medium">
                            <span
                              className={`size-1.5 rounded-full ${
                                p === "urgent"
                                  ? "bg-bad"
                                  : p === "high"
                                    ? "bg-warn"
                                    : p === "medium"
                                      ? "bg-accent"
                                      : "bg-muted"
                              }`}
                            />
                            <span>{t.priority || "Low"}</span>
                          </span>
                        </td>

                        {/* Is Milestone */}
                        <td className="px-3 py-2.5 text-center whitespace-nowrap">
                          {t.isMilestone ? (
                            <span className="inline-flex items-center gap-1 font-bold text-good">
                              <Star size={13} className="fill-good text-good" />
                              <span className="text-[10px]">Yes</span>
                            </span>
                          ) : (
                            <span className="text-faint">—</span>
                          )}
                        </td>

                        {/* Is Group */}
                        <td className="px-3 py-2.5 text-center whitespace-nowrap text-muted">
                          {t.isGroup ? "Yes" : "—"}
                        </td>

                        {/* Target / Due */}
                        <td className="px-3 py-2.5 whitespace-nowrap text-muted font-mono">
                          {periodText}
                        </td>

                        {/* ID */}
                        <td className="px-3 py-2.5 whitespace-nowrap font-mono text-faint">
                          {t.serial || "—"}
                        </td>

                        {/* Actions */}
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">
                          <button
                            type="button"
                            className="btn btn-ghost h-6 w-6 p-0 text-muted hover:text-bad"
                            onClick={() => deleteTask(t.id, t.title)}
                            title="Delete"
                          >
                            <Trash2 size={12} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. DIARY JOURNAL TAB                                                     */}
      {/* ========================================================================= */}
      {activeTab === "diary" && (
        <div className="card border border-line bg-surface p-5 shadow-[var(--shadow)]">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <div>
              <h3 className="text-base font-bold text-ink">
                Daily Diary & Executive Journal · {formattedDayTitle}
              </h3>
              <p className="text-xs text-muted">
                Permanent business journal for {selectedDate}. Record trade outcomes, market movements, and client discussions.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary h-9 px-4 text-xs font-semibold"
              onClick={saveDiary}
              disabled={diarySaving}
            >
              <Save size={14} />
              <span>{diarySaving ? "Saving…" : "Save Diary Notes"}</span>
            </button>
          </div>

          <textarea
            className="field mt-4 min-h-[360px] w-full text-sm font-mono leading-relaxed"
            placeholder="Write your daily business journal...&#10;&#10;1. Key Decisions & Agreements Made:&#10;• Verbal agreement with client on QT-0012 for delivery in 3 weeks&#10;&#10;2. Market Conditions & Foreign Exchange:&#10;• USD rate fluctuated to 276.91 PKR. Adjusted import costing accordingly.&#10;&#10;3. Shipments & Customs:&#10;• Container clearance delayed at Karachi port by 2 days.&#10;&#10;4. Tomorrow's Top Priorities:&#10;• Follow up with Shanghai supplier on shipment tracking"
            value={diaryNote}
            onChange={(e) => setDiaryNote(e.target.value)}
          />
        </div>
      )}

      {/* Record Drawer for full editing */}
      {openDrawerId && (
        <RecordDrawer
          col="schedule"
          id={openDrawerId}
          onClose={() => setOpenDrawerId(null)}
          onOpen={(c, id) => {
            setOpenDrawerId(id);
            onOpenRecord?.(c, id);
          }}
        />
      )}
    </div>
  );
}

/**
 * Reusable task row item for Daily, Monthly, and Yearly lists
 */
function TaskRowItem({
  task,
  s,
  onToggle,
  onOpen,
  onPostpone,
  postponeLabel,
  onDelete,
  onOpenRecord,
}: {
  task: Rec;
  s: any;
  onToggle: () => void;
  onOpen: () => void;
  onPostpone?: () => void;
  postponeLabel?: string;
  onDelete: () => void;
  onOpenRecord?: (col: CollectionName, id: string) => void;
}) {
  const isDone = task.status === "Completed";
  const isUrgent = task.priority === "Urgent";
  const isHigh = task.priority === "High";

  const client = task.clientId ? s.byId.clients?.get(task.clientId) : undefined;
  const supplier = task.supplierId ? s.byId.suppliers?.get(task.supplierId) : undefined;
  const so = task.salesOrderId ? s.byId.salesOrders?.get(task.salesOrderId) : undefined;
  const po = task.purchaseOrderId ? s.byId.purchaseOrders?.get(task.purchaseOrderId) : undefined;

  return (
    <li
      className={`group flex items-start justify-between gap-3 p-3.5 transition-colors hover:bg-surface-2/40 ${
        isDone ? "bg-surface-2/20 opacity-70" : ""
      }`}
    >
      <div className="flex flex-1 items-start gap-3">
        <button
          type="button"
          onClick={onToggle}
          className="mt-0.5 text-muted hover:text-accent transition shrink-0"
          title={isDone ? "Mark as pending" : "Mark as completed"}
        >
          {isDone ? (
            <CheckCircle2 size={19} className="text-good fill-good/15" />
          ) : (
            <Circle size={19} className="hover:stroke-accent" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {/* Title with strikethrough if done */}
            <span
              onClick={onOpen}
              className={`cursor-pointer font-medium text-ink hover:text-accent hover:underline ${
                isDone ? "line-through text-muted" : "font-semibold"
              }`}
            >
              {task.title}
            </span>

            {/* Milestone Badge */}
            {task.isMilestone && (
              <span className="inline-flex items-center gap-1 rounded bg-good/15 px-2 py-0.2 text-[10px] font-bold text-good">
                <Star size={10} className="fill-good" /> Milestone
              </span>
            )}

            {/* Project Tag */}
            <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-muted">
              {task.project || "A&SONS WORK"}
            </span>

            {/* Priority Badge */}
            <span
              className={`rounded px-1.5 py-0.2 text-[10px] font-bold uppercase tracking-wider ${
                isUrgent
                  ? "bg-bad/15 text-bad"
                  : isHigh
                    ? "bg-warn/15 text-warn"
                    : task.priority === "Medium"
                      ? "bg-accent-soft text-accent"
                      : "bg-surface-2 text-faint"
              }`}
            >
              {task.priority || "Low"}
            </span>

            {/* Time badge */}
            {task.time && (
              <span className="inline-flex items-center gap-1 font-mono text-[11px] text-muted">
                <Clock size={11} />
                <span>{task.time}</span>
              </span>
            )}

            {/* Serial / ID */}
            {task.serial && (
              <span className="font-mono text-[10px] text-faint">
                {task.serial}
              </span>
            )}
          </div>

          {/* Linked Records Chips */}
          {(client || supplier || so || po || task.notes) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
              {client && (
                <button
                  type="button"
                  onClick={() => onOpenRecord?.("clients", client.id)}
                  className="inline-flex items-center gap-1 rounded bg-accent-soft px-1.5 py-0.5 text-[11px] font-medium text-accent hover:underline"
                >
                  <span>Client: {client.name}</span>
                  <ExternalLink size={10} />
                </button>
              )}

              {supplier && (
                <button
                  type="button"
                  onClick={() => onOpenRecord?.("suppliers", supplier.id)}
                  className="inline-flex items-center gap-1 rounded bg-brass/10 px-1.5 py-0.5 text-[11px] font-medium text-brass hover:underline"
                >
                  <span>Supplier: {supplier.name}</span>
                  <ExternalLink size={10} />
                </button>
              )}

              {so && (
                <button
                  type="button"
                  onClick={() => onOpenRecord?.("salesOrders", so.id)}
                  className="inline-flex items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5 text-[11px] font-mono text-ink/80 hover:underline"
                >
                  <span>SO: {so.serial}</span>
                  <ExternalLink size={10} />
                </button>
              )}

              {po && (
                <button
                  type="button"
                  onClick={() => onOpenRecord?.("purchaseOrders", po.id)}
                  className="inline-flex items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5 text-[11px] font-mono text-ink/80 hover:underline"
                >
                  <span>PO: {po.serial}</span>
                  <ExternalLink size={10} />
                </button>
              )}

              {task.assignedTo && (
                <span className="text-[11px] text-faint">
                  👤 {task.assignedTo}
                </span>
              )}

              {task.notes && (
                <p className="line-clamp-1 w-full text-[11px] text-muted">
                  {task.notes}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Row Actions */}
      <div className="flex shrink-0 items-center gap-1 opacity-80 group-hover:opacity-100">
        {onPostpone && postponeLabel && (
          <button
            type="button"
            className="btn btn-ghost h-7 px-2 text-xs"
            onClick={onPostpone}
            title={`Move task to ${postponeLabel}`}
          >
            <ArrowRight size={13} />
            <span className="hidden sm:inline">{postponeLabel}</span>
          </button>
        )}
        <button
          type="button"
          className="btn btn-ghost h-7 w-7 p-0 text-muted hover:text-bad"
          onClick={onDelete}
          title="Delete task"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </li>
  );
}
