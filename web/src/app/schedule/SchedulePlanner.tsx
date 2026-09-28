"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  Calendar,
  CalendarCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock,
  ExternalLink,
  Filter,
  Flame,
  LayoutList,
  MoreVertical,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { useStore } from "@/components/DataProvider";
import { RecordDrawer } from "@/components/RecordDrawer";
import { daysFromToday, fmtDate, num, today } from "@/lib/calc";
import { deleteRecord, newId, patchRecord, saveRecord } from "@/lib/db";
import { labelOf, MODULES } from "@/lib/modules";
import type { CollectionName, Rec } from "@/lib/types";

export type SchedulePlannerProps = {
  onOpenRecord?: (col: CollectionName, id: string) => void;
};

export function SchedulePlanner({ onOpenRecord }: SchedulePlannerProps) {
  const s = useStore();
  const [selectedDate, setSelectedDate] = useState<string>(today());
  const [activeTab, setActiveTab] = useState<"agenda" | "calendar" | "diary">("agenda");

  // Quick Add State
  const [quickTitle, setQuickTitle] = useState("");
  const [quickTime, setQuickTime] = useState("10:00");
  const [quickCategory, setQuickCategory] = useState("Client Follow-up");
  const [quickPriority, setQuickPriority] = useState("Medium");
  const [quickClientId, setQuickClientId] = useState("");
  const [quickBusy, setQuickBusy] = useState(false);

  // Daily Diary state
  const [diaryNote, setDiaryNote] = useState("");
  const [diarySaving, setDiarySaving] = useState(false);
  const [diarySavedStatus, setDiarySavedStatus] = useState(false);

  // Edit record drawer state
  const [openDrawerId, setOpenDrawerId] = useState<string | null>(null);

  // All tasks in the schedule collection
  const allTasks: Rec[] = s.schedule ?? [];

  // Filter tasks for selected day
  const dayTasks = useMemo(() => {
    return allTasks
      .filter((t) => t.date === selectedDate)
      .sort((a, b) => {
        // Priority weight: Urgent (1), High (2), Medium (3), Low (4)
        const pWeight: Record<string, number> = { Urgent: 1, High: 2, Medium: 3, Low: 4 };
        const pa = pWeight[a.priority] ?? 3;
        const pb = pWeight[b.priority] ?? 3;
        if (pa !== pb) return pa - pb;
        return (a.time || "").localeCompare(b.time || "");
      });
  }, [allTasks, selectedDate]);

  // Daily progress metrics
  const completedCount = dayTasks.filter((t) => t.status === "Completed").length;
  const pendingCount = dayTasks.filter((t) => t.status !== "Completed" && t.status !== "Cancelled").length;
  const urgentCount = dayTasks.filter((t) => (t.priority === "Urgent" || t.priority === "High") && t.status !== "Completed").length;
  const progressPct = dayTasks.length > 0 ? Math.round((completedCount / dayTasks.length) * 100) : 0;

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

  // 7-Day Week Strip calculation
  const weekStrip = useMemo(() => {
    const curr = Date.parse(selectedDate) || Date.now();
    const currDate = new Date(curr);
    const dayOfWeek = currDate.getDay(); // 0 is Sunday
    // Start from Monday (or Sunday)
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(currDate.getTime() + mondayOffset * 86400000);

    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday.getTime() + i * 86400000);
      const iso = d.toLocaleDateString("en-CA");
      const dayName = d.toLocaleDateString("en-US", { weekday: "short" });
      const dayNum = d.getDate();
      const count = allTasks.filter((t) => t.date === iso && !t.isDailyLog).length;
      const completed = allTasks.filter((t) => t.date === iso && t.status === "Completed" && !t.isDailyLog).length;
      return { iso, dayName, dayNum, count, completed, isToday: iso === today() };
    });
  }, [selectedDate, allTasks]);

  // Quick Add Task
  async function handleQuickAdd(e: React.FormEvent) {
    e.preventDefault();
    const title = quickTitle.trim();
    if (!title) return;

    setQuickBusy(true);
    try {
      await saveRecord(
        "schedule",
        {
          id: newId("schedule"),
          title,
          date: selectedDate,
          time: quickTime || "09:00",
          category: quickCategory,
          priority: quickPriority,
          status: "Pending",
          clientId: quickClientId || undefined,
          notes: "",
        },
        { serialPrefix: "TSK" }
      );
      setQuickTitle("");
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

  const dateObj = new Date(selectedDate + "T00:00:00");
  const formattedDayTitle = dateObj.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="space-y-5">
      {/* Date Navigation & Control Bar */}
      <div className="card border border-line bg-surface p-4 shadow-[var(--shadow)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Day & Date Picker */}
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
                  selectedDate === today()
                    ? "bg-accent text-accent-ink"
                    : "btn-ghost"
                }`}
                onClick={() => setSelectedDate(today())}
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

            <div className="relative">
              <input
                type="date"
                className="field h-9 text-xs font-medium"
                value={selectedDate}
                onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
              />
            </div>

            <h2 className="text-base font-bold text-ink sm:text-lg">
              {formattedDayTitle}
            </h2>
          </div>

          {/* Tab Selector */}
          <div className="inline-flex rounded-lg border border-line bg-surface-2/60 p-1 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab("agenda")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition ${
                activeTab === "agenda"
                  ? "bg-accent text-accent-ink shadow-xs"
                  : "text-muted hover:text-ink"
              }`}
            >
              <CalendarCheck size={14} />
              <span>Daily Agenda ({dayTasks.filter((x) => !x.isDailyLog).length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("calendar")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition ${
                activeTab === "calendar"
                  ? "bg-accent text-accent-ink shadow-xs"
                  : "text-muted hover:text-ink"
              }`}
            >
              <Calendar size={14} />
              <span>Weekly Strip</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("diary")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition ${
                activeTab === "diary"
                  ? "bg-accent text-accent-ink shadow-xs"
                  : "text-muted hover:text-ink"
              }`}
            >
              <BookOpen size={14} />
              <span>Daily Diary Journal</span>
            </button>
          </div>
        </div>

        {/* 7-Day Weekly Strip Bar */}
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

      {/* Main Tab Content */}
      {activeTab === "agenda" && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          {/* Left Column: Daily Progress & Tasks Checklist */}
          <div className="space-y-4 lg:col-span-8">
            {/* Progress Card */}
            <div className="card border border-line bg-surface p-4 shadow-[var(--shadow)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-ink">
                    Day Progress & Priority Tracker
                  </h3>
                  <p className="text-xs text-muted">
                    {completedCount} of {dayTasks.length} tasks completed today
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {urgentCount > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-bad/10 px-2.5 py-0.5 text-xs font-semibold text-bad">
                      <Flame size={12} />
                      {urgentCount} Urgent / High
                    </span>
                  )}
                  <span className="font-mono text-sm font-bold text-accent">
                    {progressPct}%
                  </span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full bg-accent transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            {/* Quick Add Bar */}
            <form
              onSubmit={handleQuickAdd}
              className="card border border-line bg-surface p-3 shadow-xs"
            >
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  placeholder="Add a task for today (e.g. Call client ABC about quotation, inspect container)…"
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

                <select
                  className="field h-9 max-w-36 text-xs"
                  value={quickCategory}
                  onChange={(e) => setQuickCategory(e.target.value)}
                >
                  {(s.settings.taskCategories ?? [
                    "Client Follow-up",
                    "Supplier Negotiation",
                    "Payment & Banking",
                    "Shipment & Customs",
                    "Meeting / Call",
                    "General Note",
                  ]).map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>

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
                  <Plus size={14} /> Add Task
                </button>
              </div>
            </form>

            {/* Tasks List */}
            <div className="card overflow-hidden border border-line bg-surface shadow-[var(--shadow)]">
              <div className="border-b border-line bg-surface-2/60 px-4 py-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted">
                    Scheduled Items ({dayTasks.length})
                  </h3>
                  <button
                    type="button"
                    className="btn btn-ghost h-6 px-2 text-[11px]"
                    onClick={() => setOpenDrawerId("new")}
                  >
                    <Plus size={12} /> Detailed Entry
                  </button>
                </div>
              </div>

              {dayTasks.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted">
                  <CalendarCheck size={32} className="mx-auto text-faint mb-2 opacity-50" />
                  <p className="font-medium text-ink">No tasks scheduled for {formattedDayTitle}</p>
                  <p className="text-xs text-faint mt-1">
                    Use the quick-add bar above to plan your meetings, calls, and follow-ups.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-line">
                  {dayTasks.map((task) => {
                    const isDone = task.status === "Completed";
                    const isUrgent = task.priority === "Urgent";
                    const isHigh = task.priority === "High";

                    const client = task.clientId ? s.byId.clients.get(task.clientId) : undefined;
                    const supplier = task.supplierId ? s.byId.suppliers.get(task.supplierId) : undefined;
                    const so = task.salesOrderId ? s.byId.salesOrders.get(task.salesOrderId) : undefined;
                    const po = task.purchaseOrderId ? s.byId.purchaseOrders.get(task.purchaseOrderId) : undefined;

                    return (
                      <li
                        key={task.id}
                        className={`group flex items-start justify-between gap-3 p-3.5 transition-colors hover:bg-surface-2/40 ${
                          isDone ? "bg-surface-2/20 opacity-70" : ""
                        }`}
                      >
                        {/* Checkbox & Details */}
                        <div className="flex flex-1 items-start gap-3">
                          <button
                            type="button"
                            onClick={() => toggleComplete(task)}
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
                                onClick={() => setOpenDrawerId(task.id)}
                                className={`cursor-pointer font-medium text-ink hover:text-accent hover:underline ${
                                  isDone ? "line-through text-muted" : ""
                                }`}
                              >
                                {task.title}
                              </span>

                              {/* Priority badge */}
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
                                {task.priority || "Medium"}
                              </span>

                              {/* Time badge */}
                              {task.time && (
                                <span className="inline-flex items-center gap-1 font-mono text-[11px] text-muted">
                                  <Clock size={11} />
                                  <span>{task.time}</span>
                                </span>
                              )}

                              {/* Category */}
                              <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted">
                                {task.category}
                              </span>
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
                          <button
                            type="button"
                            className="btn btn-ghost h-7 px-2 text-xs"
                            onClick={() => postponeToTomorrow(task)}
                            title="Move task to tomorrow"
                          >
                            <ArrowRight size={13} />
                            <span className="hidden sm:inline">Tomorrow</span>
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost h-7 w-7 p-0 text-muted hover:text-bad"
                            onClick={() => deleteTask(task.id, task.title)}
                            title="Delete task"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* Right Column: Daily Diary / Journal for the Day */}
          <div className="space-y-4 lg:col-span-4">
            <div className="card border border-line bg-surface p-4 shadow-[var(--shadow)]">
              <div className="flex items-center justify-between border-b border-line pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="grid size-7 place-items-center rounded-md bg-brass/10 text-brass">
                    <BookOpen size={15} />
                  </div>
                  <h3 className="text-sm font-semibold text-ink">
                    Daily Diary Log
                  </h3>
                </div>
                {diarySavedStatus && (
                  <span className="text-xs font-semibold text-good">
                    ✓ Saved
                  </span>
                )}
              </div>

              <p className="mt-2 text-xs text-muted">
                Executive notes, key decisions, market observations, and verbal agreements for {selectedDate}.
              </p>

              <textarea
                className="field mt-3 min-h-[220px] w-full text-xs font-mono leading-relaxed"
                placeholder="Write your daily notes...&#10;• Key calls & decisions&#10;• Market currency / raw material rates&#10;• Verbal commitments & next steps&#10;• Tomorrow's top 3 priorities"
                value={diaryNote}
                onChange={(e) => setDiaryNote(e.target.value)}
              />

              <div className="mt-3 flex items-center justify-between">
                <span className="text-[11px] text-faint">
                  Permanent journal record
                </span>
                <button
                  type="button"
                  className="btn btn-primary h-8 px-3 text-xs font-semibold"
                  onClick={saveDiary}
                  disabled={diarySaving}
                >
                  <Save size={13} />
                  <span>{diarySaving ? "Saving…" : "Save Diary Notes"}</span>
                </button>
              </div>
            </div>

            {/* Quick Tips */}
            <div className="rounded-lg border border-line bg-surface-2/40 p-3 text-xs text-muted">
              <div className="font-semibold text-ink flex items-center gap-1.5 mb-1">
                <Sparkles size={13} className="text-accent" />
                <span>Trade Diary Best Practices</span>
              </div>
              <ul className="space-y-1 text-[11px] list-disc list-inside">
                <li>Log verbal payment promises made by clients.</li>
                <li>Record daily USD/PKR fluctuations affecting pricing.</li>
                <li>Tag tasks with Clients or Suppliers to keep deals connected.</li>
                <li>Check off tasks as completed in real time.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Calendar Strip View */}
      {activeTab === "calendar" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7">
          {weekStrip.map((item) => {
            const tasksOnDay = allTasks.filter((t) => t.date === item.iso && !t.isDailyLog);
            const isSelected = item.iso === selectedDate;
            return (
              <div
                key={item.iso}
                onClick={() => {
                  setSelectedDate(item.iso);
                  setActiveTab("agenda");
                }}
                className={`card cursor-pointer border p-3 transition hover:shadow-md ${
                  isSelected
                    ? "border-accent ring-2 ring-accent bg-surface"
                    : "border-line bg-surface hover:border-line-2"
                }`}
              >
                <div className="flex items-center justify-between border-b border-line pb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted">
                    {item.dayName}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                      item.isToday
                        ? "bg-accent text-accent-ink"
                        : "bg-surface-2 text-ink"
                    }`}
                  >
                    {item.dayNum}
                  </span>
                </div>

                <div className="mt-2 space-y-1.5">
                  {tasksOnDay.length === 0 ? (
                    <p className="text-[11px] text-faint italic py-3 text-center">
                      No tasks
                    </p>
                  ) : (
                    tasksOnDay.slice(0, 5).map((t) => (
                      <div
                        key={t.id}
                        className={`truncate rounded px-1.5 py-1 text-[11px] font-medium ${
                          t.status === "Completed"
                            ? "bg-surface-2 text-muted line-through"
                            : t.priority === "Urgent"
                              ? "bg-bad/15 text-bad"
                              : t.priority === "High"
                                ? "bg-warn/15 text-warn"
                                : "bg-accent-soft text-accent"
                        }`}
                      >
                        {t.time ? `${t.time} ` : ""}{t.title}
                      </div>
                    ))
                  )}
                  {tasksOnDay.length > 5 && (
                    <p className="text-[10px] text-muted text-center font-medium">
                      +{tasksOnDay.length - 5} more
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Diary Only Full View */}
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
            placeholder="Write your daily notes...&#10;&#10;1. Key Decisions & Agreements Made:&#10;• Verbal agreement with client on QT-0012 for delivery in 3 weeks&#10;&#10;2. Market Conditions & Foreign Exchange:&#10;• USD rate fluctuated to 276.91 PKR. Adjusted import costing accordingly.&#10;&#10;3. Shipments & Customs:&#10;• Container clearance delayed at Karachi port by 2 days.&#10;&#10;4. Tomorrow's Top Priorities:&#10;• Follow up with Shanghai supplier on shipment tracking"
            value={diaryNote}
            onChange={(e) => setDiaryNote(e.target.value)}
          />
        </div>
      )}

      {/* Record Drawer for editing individual tasks or creating new detailed records */}
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
