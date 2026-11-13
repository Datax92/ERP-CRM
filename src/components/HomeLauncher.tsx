"use client";

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowUp, Check, Palette, Plus, Search, Settings2, Shuffle } from 'lucide-react';
import { APPS, NAV } from '@/lib/navigation';
import { SHORTCUTS, findWallpaper } from '@/lib/appearance';
import { useAppearance } from '@/context/AppearanceContext';
import { AppIcon } from './AppIcons';
import { Wallpaper } from './Wallpapers';

const KEY = 'trade-erp-home-layout-v1';

export function HomeLauncher() {
  const { look, surprise } = useAppearance();
  const [order, setOrder] = useState<(string | null)[]>(APPS.map((a) => a.href));
  const [view, setView] = useState<'icons' | 'cards' | 'big'>('icons');
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState('');
  const [drag, setDrag] = useState<{ from: string; over: number | null; after: boolean; x: number; y: number; width: number } | null>(null);
  const grid = useRef<HTMLElement>(null);
  const pending = useRef<{ from: string; x: number; y: number; id: number; width: number; moved: boolean } | null>(null);
  const justDragged = useRef(false);
  useEffect(() => {
    try {
      const savedView = localStorage.getItem('trade-erp-home-view');
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (savedView === 'cards' || savedView === 'big') setView(savedView);
      const saved: unknown = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (Array.isArray(saved)) {
        const seen = new Set<string>();
        const known = saved.map((p) => {
          if (typeof p !== 'string' || seen.has(p) || !APPS.some((a) => a.href === p)) return null;
          seen.add(p); return p;
        });
        // Hydrate browser-specific preferences only after the server markup has mounted.
        setOrder([...known, ...APPS.filter((a) => !known.includes(a.href)).map((a) => a.href)]);
      }
    } catch { /* Use the default layout when storage is unavailable. */ }
  }, []);
  const commit = (next: (string | null)[]) => {
    while (next.length && next[next.length - 1] === null) next.pop();
    setOrder(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* Optional preference. */ }
  };
  const move = (from: string, to: string) => {
    const next = [...order];
    const a = next.indexOf(from), b = next.indexOf(to);
    if (a < 0 || b < 0) return;
    [next[a], next[b]] = [next[b], next[a]];
    commit(next);
  };
  const filtered = order.map((href) => APPS.find((a) => a.href === href) ?? null);
  const apps = filtered.filter((a): a is (typeof APPS)[number] => !!a && a.label.toLowerCase().includes(query.toLowerCase()));
  const cells = query ? apps : [...filtered, ...Array.from({ length: 6 }, () => null)];
  let lastFilled = cells.length - 1;
  while (lastFilled >= 0 && !cells[lastFilled]) lastFilled--;
  const visibleCells = view === 'icons' ? (editing || drag ? cells : cells.slice(0, lastFilled + 1)) : apps;
  const carried = drag ? APPS.find((a) => a.href === drag.from) : null;

  useEffect(() => {
    const spotAt = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-launch-cell]');
      if (!el || !grid.current?.contains(el)) return null;
      const rect = el.getBoundingClientRect();
      return { index: Number(el.dataset.launchCell), after: x > rect.left + rect.width / 2 };
    };
    const onMove = (e: PointerEvent) => {
      const p = pending.current;
      if (!p || e.pointerId !== p.id) return;
      if (!p.moved && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 6) return;
      p.moved = true;
      e.preventDefault();
      const spot = spotAt(e.clientX, e.clientY);
      setDrag({ from: p.from, over: spot?.index ?? null, after: spot?.after ?? false, x: e.clientX, y: e.clientY, width: p.width });
    };
    const onUp = (e: PointerEvent) => {
      const p = pending.current;
      if (!p || e.pointerId !== p.id) return;
      pending.current = null;
      setDrag(null);
      if (!p.moved) return;
      justDragged.current = true;
      window.setTimeout(() => { justDragged.current = false; }, 0);
      if (e.type === 'pointercancel') return;
      const spot = spotAt(e.clientX, e.clientY);
      if (!spot) return;
      const target = visibleCells[spot.index];
      const next = [...order];
      const from = next.indexOf(p.from);
      if (from < 0 || target?.href === p.from) return;
      if (view === 'icons') {
        const to = query ? next.indexOf(target?.href ?? '') : spot.index;
        if (to < 0) return;
        while (next.length <= to) next.push(null);
        [next[from], next[to]] = [next[to], next[from]];
      } else {
        if (!target) return;
        let to = next.indexOf(target.href) + (spot.after ? 1 : 0);
        next.splice(from, 1);
        if (from < to) to--;
        next.splice(to, 0, p.from);
      }
      commit(next);
    };
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  });
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
    {editing && <p className="mt-3 text-sm text-muted">Drag icons into any grid space; drag cards to reorder them, or use the arrow buttons. Change your shortcuts in Appearance.</p>}
    <label className="launcher-search"><Search size={15} /><input placeholder="Find an application…" aria-label="Find an application" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
    <nav ref={grid} className={`${view === 'icons' ? 'launch' : `hsections hgrid ${view}`} ${editing ? 'editing' : ''} ${drag ? 'dragging' : ''}`} aria-label="All applications">
      {visibleCells.map((a, i) => {
        const over = drag && drag.over === i && drag.from !== a?.href;
        const lifted = drag && drag.from === a?.href;
        return <div data-launch-cell={i} className={`${view === 'icons' ? 'cell' : 'hcard-cell'} ${!a ? 'empty' : ''} ${over ? (view !== 'icons' && drag.after ? 'over-after' : 'over') : ''} ${lifted ? 'lifted' : ''}`} key={a?.href ?? `empty-${i}`}>
          {a && <>
            <Link className={view === 'icons' ? 'tile' : 'hcard'} href={a.href} draggable={false} style={{ '--i': i } as React.CSSProperties}
              onPointerDown={(e) => {
                if (e.button !== 0 || (!editing && e.pointerType !== 'mouse')) return;
                pending.current = { from: a.href, x: e.clientX, y: e.clientY, id: e.pointerId, width: e.currentTarget.getBoundingClientRect().width, moved: false };
              }}
              onClick={(e) => { if (editing || justDragged.current) e.preventDefault(); }}>
              <span className={view === 'icons' ? 'tile-ic' : 'hcard-ic'}><AppIcon name={a.icon} /></span>
              {view === 'icons' ? <span className="tile-l">{a.label}</span> : <span className="hcard-t"><b>{a.label}</b><small>{NAV.find((g) => g.items.some((item) => item.href === a.href))?.group}</small></span>}
            </Link>
            {editing && <div className="flex justify-center gap-2"><button className="iconbtn" aria-label={`Move ${a.label} earlier`} disabled={!apps[apps.indexOf(a) - 1]} onClick={() => move(a.href, apps[apps.indexOf(a) - 1]!.href)}><ArrowUp size={14} /></button><button className="iconbtn" aria-label={`Move ${a.label} later`} disabled={!apps[apps.indexOf(a) + 1]} onClick={() => move(a.href, apps[apps.indexOf(a) + 1]!.href)}><ArrowDown size={14} /></button></div>}
          </>}
        </div>;
      })}
    </nav>
    {drag && carried && createPortal(
      <div className={view === 'icons' ? 'tile-ghost' : `hcard-ghost ${view}`} data-tone={findWallpaper(look.wallpaper).tone} style={{ left: drag.x, top: drag.y, ...(view !== 'icons' ? { width: drag.width } : {}) }} aria-hidden="true">
        {view === 'icons' ? <><span className="tile-ic"><AppIcon name={carried.icon} /></span><span className="tile-l">{carried.label}</span></> : <div className="hcard"><span className="hcard-ic"><AppIcon name={carried.icon} /></span><span className="hcard-t"><b>{carried.label}</b><small>{NAV.find((g) => g.items.some((item) => item.href === carried.href))?.group}</small></span></div>}
      </div>, document.body)}
    {apps.length === 0 && <p className="py-8 text-center text-muted">No applications match “{query}”.</p>}
  </div>;
}
