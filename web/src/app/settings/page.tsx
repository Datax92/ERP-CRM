"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { useStore } from "@/components/DataProvider";
import { PageHeader, Section } from "@/components/ui";
import { saveSettings } from "@/lib/db";
import { LIST_LABELS } from "@/lib/settings";
import { STAGES } from "@/lib/stages";
import { MODULES } from "@/lib/modules";
import type { ListKey, Settings } from "@/lib/types";

export default function SettingsPage() {
  const s = useStore();
  if (s.loading) return <div className="text-sm text-muted">Loading…</div>;
  return <SettingsForm />;
}

function SettingsForm() {
  const s = useStore();
  const [draft, setDraft] = useState<Settings>(s.settings);
  const [saved, setSaved] = useState("");
  const dirty = JSON.stringify(draft) !== JSON.stringify(s.settings);

  async function save() {
    await saveSettings(draft);
    setSaved("Saved.");
    setTimeout(() => setSaved(""), 2000);
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Dropdown lists used across the system. Values can also be added directly from any form."
        actions={
          <>
            {saved && <span className="self-center text-sm text-good">{saved}</span>}
            <button className="btn" disabled={!dirty} onClick={() => setDraft(s.settings)}>
              Reset
            </button>
            <button className="btn btn-primary" disabled={!dirty} onClick={save}>
              Save settings
            </button>
          </>
        }
      />
      <Section title="General">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-muted">Company name</span>
            <input className="field" value={draft.companyName} onChange={(e) => setDraft({ ...draft, companyName: e.target.value })} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted">A client is inactive after (days without activity)</span>
            <input className="field" type="number" min={1} value={draft.inactiveDays} onChange={(e) => setDraft({ ...draft, inactiveDays: Number(e.target.value) || 90 })} />
          </label>
        </div>
      </Section>
      <div className="grid grid-cols-1 gap-x-4 lg:grid-cols-2">
        {(Object.keys(LIST_LABELS) as ListKey[]).map((k) => (
          <ListEditor key={k} label={LIST_LABELS[k]} values={draft[k]} onChange={(v) => setDraft({ ...draft, [k]: v })} />
        ))}
      </div>
      <Section title="Workflow statuses (fixed)">
        <p className="mb-3 text-sm text-muted">These drive open/closed and success/unsuccessful reporting, so they are fixed. Ask for changes if your process needs different steps.</p>
        <dl className="space-y-2 text-sm">
          {Object.entries(STAGES).map(([col, def]) => (
            <div key={col} className="flex flex-wrap gap-2">
              <dt className="w-40 text-muted">{MODULES[col as keyof typeof MODULES].title}</dt>
              <dd>{def!.options.join(" → ")}</dd>
            </div>
          ))}
        </dl>
      </Section>
    </div>
  );
}

function ListEditor({ label, values, onChange }: { label: string; values: string[]; onChange: (v: string[]) => void }) {
  const [v, setV] = useState("");
  const add = () => {
    const x = v.trim();
    if (x && !values.includes(x)) onChange([...values, x]);
    setV("");
  };
  return (
    <Section title={label}>
      <div className="mb-2 flex flex-wrap gap-1">
        {values.length === 0 && <span className="text-sm text-faint">Empty — values are added as you use them.</span>}
        {values.map((x) => (
          <span key={x} className="inline-flex items-center gap-1 rounded bg-surface-2 px-2 py-0.5 text-sm">
            {x}
            <button onClick={() => onChange(values.filter((y) => y !== x))} aria-label={`Remove ${x}`} className="text-faint hover:text-bad">
              <X size={12} />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-1">
        <input className="field" value={v} placeholder="Add value" onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button className="btn px-2" onClick={add} aria-label="Add">
          <Plus size={14} />
        </button>
      </div>
    </Section>
  );
}
