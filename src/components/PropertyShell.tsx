"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { signOut } from 'firebase/auth';
import { Bell, Coins, LogOut, Palette, Plus, Search, Settings } from 'lucide-react';
import { fb } from '@/lib/firebase';
import { APPS, NAV } from '@/lib/navigation';
import { MODULES, labelOf } from '@/lib/modules';
import { today } from '@/lib/calc';
import { SHORTCUTS } from '@/lib/appearance';
import { useStore } from './DataProvider';
import { CurrencyModal } from './CurrencyModal';
import { BrandMark } from './Brand';
import { AppIcon } from './AppIcons';
import type { CollectionName } from '@/lib/types';

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname().replace(/\/$/, '') || '/';
  const s = useStore();
  const [menu, setMenu] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [converterOpen, setConverterOpen] = useState(false);
  const [error, setError] = useState('');
  const navRef = useRef<HTMLElement>(null);
  const isHome = pathname === '/';
  const group = NAV.find((g) => g.items.some((i) => i.href === pathname));
  const q = query.trim().toLowerCase();
  const apps = APPS.filter((a) => a.label.toLowerCase().includes(q));
  const records = q ? (Object.keys(MODULES) as CollectionName[]).flatMap((col) => {
    const m = MODULES[col];
    return s[col].filter((r) => [labelOf(col, r, s), ...m.searchKeys.map((key) => r[key])].join(' ').toLowerCase().includes(q))
      .slice(0, 5).map((r) => ({ href: `${m.href}?id=${r.id}`, label: labelOf(col, r, s), kind: m.singular }));
  }).slice(0, 18) : [];
  const due = s.schedule.filter((task) => !['Completed', 'Cancelled'].includes(task.status) && task.date && task.date <= today());
  const alerts = (['quotations', 'salesOrders', 'purchaseOrders', 'marketing'] as const).flatMap((col) => s[col].filter((r) => r.nextFollowUpDate && r.nextFollowUpDate <= today() && !['Cancelled', 'Closed', 'Won', 'Lost', 'Delivered', 'Received'].includes(r.status)).map((r) => ({ href: `${MODULES[col].href}?id=${r.id}`, label: labelOf(col, r, s) })));
  const alertCount = due.length + alerts.length;
  useEffect(() => {
    const dismiss = (e: PointerEvent) => { if (!navRef.current?.contains(e.target as Node)) setMenu(null); };
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMenu(null); setQuery(''); } };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape); };
  }, []);
  const close = () => { setMenu(null); setQuery(''); };
  const toggle = (name: string) => setMenu(menu === name ? null : name);
  return <div className="shell">
    <a href="#main" className="skip-link">Skip to content</a>
    <header className="o-nav no-print" ref={navRef}>
      <Link href="/" className="o-nav-apps" aria-label="Home menu" title="Home menu" onClick={close}>
        <svg viewBox="0 0 16 16" width={16} height={16} fill="currentColor" aria-hidden="true">{[2, 7, 12].map((y) => [2, 7, 12].map((x) => <rect key={`${x}-${y}`} x={x} y={y} width="2.4" height="2.4" rx=".5" />))}</svg>
      </Link>
      <Link href="/" className="o-nav-logo" aria-label="Home" onClick={close}><BrandMark size={24} /></Link>
      <button className="o-nav-brand" aria-expanded={menu === 'apps'} onClick={() => toggle('apps')} title="Switch application"><span className="o-nav-brand-t">{isHome ? s.settings.companyName : group?.group || 'Trade ERP'}</span></button>
      {!isHome && <nav className="o-nav-menu" aria-label="Section menu">{group?.items.map((a) => <Link key={a.href} href={a.href} className={`o-nav-item ${pathname === a.href ? 'on' : ''}`} aria-current={pathname === a.href ? 'page' : undefined} onClick={close}>{a.label}</Link>)}</nav>}
      <span className="spacer" />
      <input className="navsearch" placeholder="Search…" aria-label="Search everything" value={query} onFocus={() => setMenu('search')} onChange={(e) => { setQuery(e.target.value); setMenu('search'); }} />
      <button className="o-nav-ic mobile-search" aria-label="Open search" onClick={() => toggle('search')}><Search size={16} /></button>
      <button className="o-nav-ic" title="New record" aria-label="New record" aria-expanded={menu === 'new'} onClick={() => toggle('new')}><Plus size={16} /></button>
      <button className="o-nav-ic" title="Currency converter" aria-label="Currency converter" onClick={() => { close(); setConverterOpen(true); }}><Coins size={16} /></button>
      <button className="o-nav-ic" title="Alerts" aria-label="Alerts" aria-expanded={menu === 'alerts'} onClick={() => toggle('alerts')}><Bell size={16} />{alertCount > 0 && <span className="dot">{alertCount > 9 ? '9+' : alertCount}</span>}</button>
      <button className="o-nav-user" aria-label="Account menu" aria-expanded={menu === 'account'} onClick={() => toggle('account')}><span className="ini">{(s.user.displayName || s.user.email || 'Owner').slice(0, 2).toUpperCase()}</span><span className="nm">{s.user.displayName || s.user.email?.split('@')[0] || 'Owner'}</span></button>
      {menu && <div className={`menu erp-nav-dropdown ${menu === 'apps' ? 'erp-app-menu' : ''}`}>
        {menu === 'apps' && NAV.map((g) => <div key={g.group}><h5>{g.group}</h5>{g.items.map((a) => <Link href={a.href} key={a.href} onClick={close}><AppIcon name={a.icon} size={22} />{a.label}</Link>)}</div>)}
        {menu === 'new' && <><h5>New record</h5>{SHORTCUTS.map((a) => <Link key={a.id} href={a.go!} onClick={close}><AppIcon name={a.icon} size={22} />{a.label}</Link>)}</>}
        {menu === 'search' && <><div className="mobile-search-field"><input className="field" aria-label="Search apps and records" placeholder="Search apps and records…" value={query} onChange={(e) => setQuery(e.target.value)} /></div><h5>Applications</h5>{apps.map((a) => <Link href={a.href} key={a.href} onClick={close}><AppIcon name={a.icon} size={22} />{a.label}</Link>)}{records.length > 0 && <h5>Records</h5>}{records.map((r) => <Link href={r.href} key={r.href} onClick={close}><span className="row2">{r.label}<small>{r.kind}</small></span></Link>)}{!apps.length && !records.length && <p className="px-4 py-3 text-muted">No results for “{query}”.</p>}</>}
        {menu === 'alerts' && <><h5>Needs attention</h5>{due.length > 0 && <Link href="/schedule" onClick={close}>{due.length} tasks due</Link>}{alerts.map((a) => <Link key={a.href} href={a.href} onClick={close}><span className="row2">{a.label}<small>Follow-up due</small></span></Link>)}{alertCount === 0 && <p className="px-4 py-3 text-muted">You’re all caught up.</p>}</>}
        {menu === 'account' && <><h5>{s.user.email}</h5><Link href="/settings" onClick={close}><Settings size={16} />Settings</Link><Link href="/appearance" onClick={close}><Palette size={16} />Appearance</Link><div className="sep" /><button onClick={async () => { try { await signOut(fb().auth); } catch { setError('Could not sign out. Please try again.'); } }}><LogOut size={16} />Sign out</button></>}
      </div>}
    </header>
    {error && <p role="alert" className="bg-bad-soft px-4 py-2 text-bad">{error}</p>}
    <main id="main" tabIndex={-1} className={isHome ? 'home' : 'erp-main'}>{s.loading ? <div role="status" className="grid min-h-[60vh] place-items-center text-muted">Loading records…</div> : children}</main>
    <CurrencyModal open={converterOpen} onClose={() => setConverterOpen(false)} />
  </div>;
}
