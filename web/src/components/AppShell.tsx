"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { signOut } from "firebase/auth";
import {
  BarChart3,
  Building2,
  ClipboardList,
  FileSpreadsheet,
  FileText,
  HandCoins,
  Landmark,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  Receipt,
  Settings,
  ShoppingCart,
  Truck,
  Users,
  Factory,
  Wallet,
  PiggyBank,
  Coins,
} from "lucide-react";
import { fb } from "@/lib/firebase";
import { useStore } from "./DataProvider";
import { CurrencyModal } from "./CurrencyModal";

export const NAV: { group: string; items: { href: string; label: string; icon: typeof Users }[] }[] = [
  { group: "", items: [{ href: "/", label: "Dashboard", icon: LayoutDashboard }] },
  {
    group: "Contacts",
    items: [
      { href: "/clients", label: "Clients", icon: Users },
      { href: "/suppliers", label: "Suppliers", icon: Factory },
      { href: "/marketing", label: "Marketing", icon: Megaphone },
    ],
  },
  {
    group: "Sales",
    items: [
      { href: "/rfqs", label: "RFQs", icon: ClipboardList },
      { href: "/quotations", label: "Quotations", icon: FileText },
      { href: "/sales-orders", label: "Sales Orders", icon: ShoppingCart },
    ],
  },
  {
    group: "Purchasing & delivery",
    items: [
      { href: "/purchase-orders", label: "Purchase Orders", icon: FileSpreadsheet },
      { href: "/proforma-invoices", label: "Proforma Invoices", icon: Receipt },
      { href: "/deliveries", label: "Deliveries", icon: Truck },
    ],
  },
  {
    group: "Finance",
    items: [
      { href: "/payments", label: "Payments", icon: HandCoins },
      { href: "/finance", label: "Account / Finance", icon: Wallet },
      { href: "/expenses", label: "Expenses / Charity / Zakat", icon: PiggyBank },
      { href: "/investors", label: "Investors", icon: Landmark },
      { href: "/profit-loss", label: "Profit / Loss", icon: BarChart3 },
    ],
  },
  {
    group: "Company",
    items: [
      { href: "/company", label: "Company", icon: Building2 },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

/** The navigation group a page belongs to, shown as the eyebrow above its title. */
export function navGroupFor(pathname: string) {
  return NAV.find((g) => g.items.some((i) => (i.href === "/" ? pathname === "/" : pathname.startsWith(i.href))))?.group || "Overview";
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "T";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, settings, loading } = useStore();
  const [open, setOpen] = useState(false);
  const [converterOpen, setConverterOpen] = useState(false);

  const nav = (
    <nav className="flex h-full flex-col text-sidebar-ink">
      <div className="flex items-center gap-3 px-5 pt-6 pb-5">
        <div className="display grid size-10 shrink-0 place-items-center rounded-lg border border-brass/50 bg-sidebar-2 text-lg text-brass">{initials(settings.companyName)}</div>
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold tracking-tight">{settings.companyName}</div>
          <div className="eyebrow !text-sidebar-muted">Trade ledger</div>
        </div>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto px-3 pb-4">
        {NAV.map((g) => (
          <div key={g.group || "home"}>
            {g.group && <div className="eyebrow mb-1.5 px-3 !text-sidebar-muted/80">{g.group}</div>}
            {g.items.map(({ href, label, icon: Icon }) => {
              const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={`group relative flex items-center gap-2.5 rounded-lg px-3 py-[6px] text-[13.5px] transition ${
                    active ? "bg-white/[0.07] font-medium text-white" : "text-sidebar-muted hover:bg-white/[0.04] hover:text-sidebar-ink"
                  }`}
                >
                  {active && <span className="absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-full bg-brass" />}
                  <Icon size={16} strokeWidth={active ? 2 : 1.75} className={active ? "text-brass" : "opacity-80 group-hover:opacity-100"} />
                  {label}
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setConverterOpen(true)}
        className="mx-3 mb-2 flex items-center justify-between rounded-lg border border-sidebar-line bg-sidebar-2/80 px-3 py-2 text-xs text-sidebar-ink transition hover:bg-sidebar-2"
      >
        <span className="flex items-center gap-2">
          <Coins size={14} className="text-brass" />
          <span className="font-medium">Currency Converter</span>
        </span>
        <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-brass">Live FX</span>
      </button>

      <div className="m-3 mt-0 flex items-center gap-2.5 rounded-lg border border-sidebar-line bg-sidebar-2 p-2.5">
        <div className="grid size-8 shrink-0 place-items-center rounded-full bg-white/10 text-xs font-semibold">{(user.email ?? "?")[0]!.toUpperCase()}</div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs text-sidebar-ink">{user.email}</div>
          <button
            className="inline-flex items-center gap-1 text-[11px] text-sidebar-muted hover:text-white"
            onClick={async () => {
              await signOut(fb().auth);
              window.location.reload();
            }}
          >
            <LogOut size={11} /> Sign out
          </button>
        </div>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 bg-sidebar lg:block">{nav}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="anim-fade absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <aside className="anim-drawer relative h-full w-72 bg-sidebar shadow-2xl">{nav}</aside>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <header className="no-print sticky top-0 z-30 flex items-center gap-3 bg-sidebar px-4 py-3 text-sidebar-ink lg:hidden">
          <button className="grid size-9 place-items-center rounded-lg border border-sidebar-line text-sidebar-ink" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu size={17} />
          </button>
          <div className="display grid size-8 place-items-center rounded-md border border-brass/50 text-sm text-brass">{initials(settings.companyName)}</div>
          <span className="truncate text-sm font-semibold">{settings.companyName}</span>
          <button
            type="button"
            onClick={() => setConverterOpen(true)}
            className="ml-auto grid size-9 place-items-center rounded-lg border border-sidebar-line text-sidebar-ink"
            aria-label="Currency converter"
            title="Currency converter"
          >
            <Coins size={17} className="text-brass" />
          </button>
        </header>
        <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
          {loading ? (
            <div className="grid min-h-[60vh] place-items-center">
              <div className="flex flex-col items-center gap-3">
                <div className="h-px w-40 overflow-hidden bg-line">
                  <div className="h-px w-1/3 animate-[fade-in_1s_ease-in-out_infinite_alternate] bg-brass" />
                </div>
                <span className="eyebrow">Loading ledger</span>
              </div>
            </div>
          ) : (
            <div key={pathname} className="anim-rise">
              {children}
            </div>
          )}
        </main>
      </div>
      <CurrencyModal open={converterOpen} onClose={() => setConverterOpen(false)} />
    </div>
  );
}
