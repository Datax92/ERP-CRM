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
} from "lucide-react";
import { fb } from "@/lib/firebase";
import { useStore } from "./DataProvider";

const NAV: { group: string; items: { href: string; label: string; icon: typeof Users }[] }[] = [
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

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, settings } = useStore();
  const [open, setOpen] = useState(false);

  const nav = (
    <nav className="flex h-full flex-col">
      <div className="px-4 py-4">
        <div className="text-sm font-semibold">{settings.companyName}</div>
        <div className="text-xs text-muted">Trade ERP</div>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto px-2 pb-4">
        {NAV.map((g) => (
          <div key={g.group}>
            {g.group && <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-faint">{g.group}</div>}
            {g.items.map(({ href, label, icon: Icon }) => {
              const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${active ? "bg-accent-soft font-medium text-accent" : "text-muted hover:bg-surface-2 hover:text-ink"}`}
                >
                  <Icon size={16} />
                  {label}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
      <div className="border-t border-line p-3 text-xs text-muted">
        <div className="truncate">{user.email}</div>
        <button
          className="mt-1 inline-flex items-center gap-1 hover:text-ink"
          onClick={async () => {
            await signOut(fb().auth);
            window.location.reload();
          }}
        >
          <LogOut size={12} /> Sign out
        </button>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-line bg-surface lg:block">{nav}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <aside className="relative h-full w-64 bg-surface shadow-xl">{nav}</aside>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <header className="no-print sticky top-0 z-30 flex items-center gap-2 border-b border-line bg-surface px-4 py-2 lg:hidden">
          <button className="btn px-2" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu size={16} />
          </button>
          <span className="text-sm font-semibold">{settings.companyName}</span>
        </header>
        <main className="mx-auto max-w-[1400px] p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
