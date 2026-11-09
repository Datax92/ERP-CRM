"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Palette, Plus, Search, Settings2, Shuffle } from 'lucide-react';
import { APPS, NAV } from '@/lib/navigation';
import { SHORTCUTS, findWallpaper } from '@/lib/appearance';
import { useAppearance } from '@/context/AppearanceContext';
import { AppIcon } from './AppIcons';
import { Wallpaper } from './Wallpapers';

const KEY = 'trade-erp-home-layout-v1';

export function HomeLauncher() {
  const { look, surprise } = useAppearance();
  const [order, setOrder] = useState(APPS.map((a) => a.href));
  const [view, setView] = useState<'icons' | 'cards' | 'big'>('icons');
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState('');
  const [drag, setDrag] = useState<string | null>(null);
  useEffect(() => {
    try {
      const savedView = localStorage.getItem('trade-erp-home-view');
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (savedView === 'cards' || savedView === 'big') setView(savedView);
      const saved: unknown = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (Array.isArray(saved)) {
        const known = [...new Set(saved.filter((p): p is string => typeof p === 'string' && APPS.some((a) => a.href === p)))];
        // Hydrate browser-specific preferences only after the server markup has mounted.
        setOrder([...known, ...APPS.filter((a) => !known.includes(a.href)).map((a) => a.href)]);
      }
    } catch { /* Use the default layout when storage is unavailable. */ }
  }, []);
  const move = (from: string, to: string) => {
    const next = [...order];
    const a = next.indexOf(from), b = next.indexOf(to);
    if (a < 0 || b < 0) return;
    [next[a], next[b]] = [next[b], next[a]];
    setOrder(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* Layout remains usable without storage. */ }
  };
  const apps = order.map((href) => APPS.find((a) => a.href === href)!).filter((a) => a && a.label.toLowerCase().includes(query.toLowerCase()));
  const shortcuts = look.shortcuts.map((id) => SHORTCUTS.find((a) => a.id === id)).filter((a) => !!a);
  return <div className="page o-home" data-tone={findWallpaper(look.wallpaper).tone}>
    <Wallpaper id={look.wallpaper} seed={look.seed} themeKey={look.theme + (look.uniqueName || '')} />
    <h1 className="sr-only">Home</h1>
    <div className="shortcuts">
      {shortcuts.map((a, i) => <Link key={a.id} href={a.go!} className={`shortcut sc-v${i % 3}`}><span className="sc-ic"><AppIcon name={a.icon} size={30} /></span><span className="sc-t"><b>{a.label}</b><small>{a.sub}</small></span><span className="sc-plus"><Plus size={15} /></span></Link>)}
    </div>
    <div className="launch-bar">
      <span className="kicker">Your apps</span><span className="spacer" />
      <div className="seg" role="group" aria-label="Application view">{(['icons', 'cards', 'big'] as const).map((mode) => <button key={mode} aria-pressed={view === mode} onClick={() => { setView(mode); try { localStorage.setItem('trade-erp-home-view', mode); } catch { /* Optional preference. */ } }}>{mode === 'icons' ? 'Icons' : mode === 'cards' ? 'Cards' : 'Big cards'}</button>)}</div>
      <button className="btn btn-primary" onClick={surprise}><Shuffle size={14} />Surprise me</button>
      <Link className="btn" href="/appearance"><Palette size={14} />Appearance</Link>
      <button className={`btn ${editing ? 'btn-primary' : ''}`} onClick={() => setEditing(!editing)}>{editing ? <Check size={14} /> : <Settings2 size={14} />}{editing ? 'Done' : 'Customize'}</button>
    </div>
    {editing && <p className="mt-3 text-sm text-muted">Drag applications to reorder them, or use the arrow buttons. Change your shortcuts in Appearance.</p>}
    <label className="launcher-search"><Search size={15} /><input placeholder="Find an application…" aria-label="Find an application" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
    <nav className={view === 'icons' ? 'launch' : `hsections hgrid ${view}`} aria-label="All applications">
      {apps.map((a, i) => <div className={view === 'icons' ? 'cell' : 'hcard-cell'} key={a.href} draggable={editing} onDragStart={() => setDrag(a.href)} onDragEnd={() => setDrag(null)} onDragOver={(e) => { if (editing) e.preventDefault(); }} onDrop={(e) => { e.preventDefault(); if (drag) move(drag, a.href); setDrag(null); }}>
        <Link className={view === 'icons' ? 'tile' : 'hcard'} href={a.href} style={{ '--i': i } as React.CSSProperties} onClick={(e) => { if (editing) e.preventDefault(); }}><span className={view === 'icons' ? 'tile-ic' : 'hcard-ic'}><AppIcon name={a.icon} /></span>{view === 'icons' ? <span className="tile-l">{a.label}</span> : <span className="hcard-t"><b>{a.label}</b><small>{NAV.find((g) => g.items.some((item) => item.href === a.href))?.group}</small></span>}</Link>
        {editing && <div className="flex justify-center gap-2"><button className="iconbtn" aria-label={`Move ${a.label} earlier`} disabled={i === 0} onClick={() => move(a.href, apps[i - 1].href)}><ArrowUp size={14} /></button><button className="iconbtn" aria-label={`Move ${a.label} later`} disabled={i === apps.length - 1} onClick={() => move(a.href, apps[i + 1].href)}><ArrowDown size={14} /></button></div>}
      </div>)}
    </nav>
    {apps.length === 0 && <p className="py-8 text-center text-muted">No applications match “{query}”.</p>}
  </div>;
}
