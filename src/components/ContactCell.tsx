"use client";

import { Globe2, MapPin } from "lucide-react";
import type { Cell } from "@/lib/modules";
import { CellView } from "./ui";

const normalize = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]/g, "");
let countries: Map<string, string> | undefined;
function countryFlag(name: string): string | undefined {
  if (!countries) {
    countries = new Map(Object.entries({ uae: "AE", ksa: "SA", uk: "GB", usa: "US", unitedstatesofamerica: "US", turkey: "TR", southkorea: "KR", northkorea: "KP", czechrepublic: "CZ" }));
    const names = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" });
    for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b), label = names.of(code);
      if (label && code !== "ZZ") {
        // Locale aliases such as UK resolve to GB before building the emoji.
        const canonical = new Intl.Locale(`und-${code}`).region || code;
        countries.set(normalize(label), canonical); countries.set(code.toLowerCase(), canonical);
      }
    }
  }
  const code = countries.get(normalize(name));
  return code ? [...code].map(c => String.fromCodePoint(127397 + c.charCodeAt(0))).join("") : undefined;
}

/** Contact styling keeps the underlying plain text unchanged for search, sorting and CSV. */
export function ContactCell({ column, cell }: { column: string; cell: Cell }) {
  const text = cell.text;
  if (cell.tone) return <CellView cell={cell} />;
  if (text === "—") return <span className="contact-empty">{text}</span>;
  if (column === "country") {
    const flag = countryFlag(text);
    return <span className="contact-country">{flag ? <span className="contact-flag" aria-hidden="true">{flag}</span> : <Globe2 size={14} aria-hidden="true" />}<span className="truncate">{text}</span></span>;
  }
  if (column === "region") return <span className="contact-region"><MapPin size={11} aria-hidden="true" /><span className="truncate">{text}</span></span>;
  if (column === "sector") return <span className="contact-sector">{text}</span>;
  if (column === "name") {
    const initials = text.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join("").toUpperCase();
    return <span className="contact-company"><span className="contact-initials" aria-hidden="true">{initials}</span><span className="truncate">{text}</span></span>;
  }
  const href = column === "email" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(text) ? `mailto:${encodeURIComponent(text)}`
    : ["phone", "mobile", "whatsapp"].includes(column) && /^\+?[\d\s().-]+$/.test(text) ? `tel:${text.replace(/[^+\d]/g, "")}` : undefined;
  if (href) return <a className="contact-link" href={href} onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>{text}</a>;
  if (column === "remarks") return <span className="contact-note">{text}</span>;
  return <CellView cell={cell} />;
}
