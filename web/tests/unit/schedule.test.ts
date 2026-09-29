import { describe, it, expect } from "vitest";
import { labelOf, MODULES } from "@/lib/modules";
import { stageKind, STAGES } from "@/lib/stages";
import type { Rec } from "@/lib/types";

describe("Daily Schedule & Diary module", () => {
  it("defines schedule module with TSK prefix and correct configuration", () => {
    const m = MODULES.schedule;
    expect(m).toBeDefined();
    expect(m.col).toBe("schedule");
    expect(m.prefix).toBe("TSK");
    expect(m.href).toBe("/schedule");

    const defs = m.defaults({} as any);
    expect(defs.status).toBe("Pending");
    expect(defs.priority).toBe("Medium");
    expect(defs.category).toBe("Client Follow-up");
  });

  it("includes all required schedule and diary fields", () => {
    const fieldNames = MODULES.schedule.fields.map((f) => f.name);
    expect(fieldNames).toContain("date");
    expect(fieldNames).toContain("time");
    expect(fieldNames).toContain("title");
    expect(fieldNames).toContain("category");
    expect(fieldNames).toContain("priority");
    expect(fieldNames).toContain("status");
    expect(fieldNames).toContain("assignedTo");
    expect(fieldNames).toContain("clientId");
    expect(fieldNames).toContain("supplierId");
    expect(fieldNames).toContain("notes");
    expect(fieldNames).toContain("diaryNotes");
  });

  it("configures schedule stages properly in STAGES", () => {
    const stages = STAGES.schedule;
    expect(stages).toBeDefined();
    expect(stages!.options).toContain("Pending");
    expect(stages!.options).toContain("In progress");
    expect(stages!.options).toContain("Completed");
    expect(stages!.options).toContain("Postponed");
    expect(stages!.options).toContain("Cancelled");

    expect(stageKind("schedule", "Pending")).toBe("open");
    expect(stageKind("schedule", "In progress")).toBe("open");
    expect(stageKind("schedule", "Completed")).toBe("won");
    expect(stageKind("schedule", "Cancelled")).toBe("lost");
  });

  it("formats task labels cleanly with date and title in labelOf", () => {
    const task: Rec = {
      id: "tsk-1",
      serial: "TSK-2026-0001",
      date: "2026-09-28",
      time: "10:30",
      title: "Call Pak Paper Mills regarding Kraft paper",
    };
    const label = labelOf("schedule", task, {} as any);
    expect(label).toBe("2026-09-28 · Call Pak Paper Mills regarding Kraft paper");
  });

  it("maps priority levels to appropriate visual tones in columns", () => {
    const priorityCol = MODULES.schedule.columns.find((c) => c.key === "priority");
    expect(priorityCol).toBeDefined();

    const urgentCell = priorityCol!.cell({ priority: "Urgent" } as any, {} as any);
    expect(urgentCell.tone).toBe("bad");

    const highCell = priorityCol!.cell({ priority: "High" } as any, {} as any);
    expect(highCell.tone).toBe("warn");

    const medCell = priorityCol!.cell({ priority: "Medium" } as any, {} as any);
    expect(medCell.tone).toBe("info");

    const lowCell = priorityCol!.cell({ priority: "Low" } as any, {} as any);
    expect(lowCell.tone).toBe("muted");
  });

  it("supports Daily, Monthly, and Yearly / Long-term task horizons with projects and milestones", () => {
    const fieldNames = MODULES.schedule.fields.map((f) => f.name);
    expect(fieldNames).toContain("horizon");
    expect(fieldNames).toContain("project");
    expect(fieldNames).toContain("isMilestone");
    expect(fieldNames).toContain("targetMonth");
    expect(fieldNames).toContain("targetYear");

    const defs = MODULES.schedule.defaults({} as any);
    expect(defs.horizon).toBe("Daily");
    expect(defs.project).toBe("A&SONS WORK");
    expect(defs.isMilestone).toBe(false);

    // Verify horizon column visual tones
    const horizonCol = MODULES.schedule.columns.find((c) => c.key === "horizon");
    expect(horizonCol).toBeDefined();

    const yearlyCell = horizonCol!.cell({ horizon: "Yearly / Long-term" } as any, {} as any);
    expect(yearlyCell.text).toBe("Yearly / Long-term");
    expect(yearlyCell.tone).toBe("info");

    const monthlyCell = horizonCol!.cell({ horizon: "Monthly" } as any, {} as any);
    expect(monthlyCell.text).toBe("Monthly");
    expect(monthlyCell.tone).toBe("warn");

    const dailyCell = horizonCol!.cell({ horizon: "Daily" } as any, {} as any);
    expect(dailyCell.text).toBe("Daily");
    expect(dailyCell.tone).toBe("muted");

    // Verify milestone column
    const milestoneCol = MODULES.schedule.columns.find((c) => c.key === "isMilestone");
    expect(milestoneCol).toBeDefined();
    expect(milestoneCol!.cell({ isMilestone: true } as any, {} as any).tone).toBe("good");
  });
});
