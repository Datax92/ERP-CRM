"use client";

import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject, type MouseEvent as ReactMouseEvent } from "react";
import { flushSync } from "react-dom";

type Slot = { key: string; left: number; width: number; cells: HTMLElement[] };
type Gesture = { pointer: number; startX: number; x: number; scroll: number; key: string; header: HTMLElement; slots: Slot[]; preview: string[]; active: boolean; frame: number };

/** Preview the whole column without rearranging table layout until the drop is committed. */
export function useColumnDrag(table: RefObject<HTMLTableElement | null>, viewport: RefObject<HTMLDivElement | null>, move: (from: string, to: string) => void) {
  const pending = useRef<Gesture | null>(null);
  const moveRef = useRef(move);
  const suppressClick = useRef(false);
  useEffect(() => { moveRef.current = move; }, [move]);

  useEffect(() => {
    const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    function clear(g: Gesture) {
      cancelAnimationFrame(g.frame);
      table.current?.removeAttribute("data-column-dragging");
      for (const slot of g.slots) for (const cell of slot.cells) {
        cell.style.removeProperty("transform"); cell.style.removeProperty("transition");
        cell.classList.remove("erp-column-moving", "erp-column-lifted");
      }
      if (g.header.hasPointerCapture(g.pointer)) g.header.releasePointerCapture(g.pointer);
    }
    function paint() {
      const g = pending.current, wrap = viewport.current;
      if (!g?.active || !wrap) return;
      const box = wrap.getBoundingClientRect();
      const edge = 40;
      const speed = g.x < box.left + edge ? -Math.min(18, (box.left + edge - g.x) / 3) : g.x > box.right - edge ? Math.min(18, (g.x - box.right + edge) / 3) : 0;
      if (speed) wrap.scrollLeft += speed;
      const delta = g.x - g.startX + wrap.scrollLeft - g.scroll;
      const dragged = g.slots.find(s => s.key === g.key)!;
      const center = dragged.left + dragged.width / 2 + delta;
      const others = g.slots.filter(s => s.key !== g.key);
      const index = others.filter(s => s.left + s.width / 2 < center).length;
      g.preview = others.map(s => s.key); g.preview.splice(index, 0, g.key);
      let left = g.slots[0].left;
      for (const key of g.preview) {
        const slot = g.slots.find(s => s.key === key)!;
        const shift = key === g.key ? delta : left - slot.left;
        for (const cell of slot.cells) cell.style.transform = `translate3d(${shift}px, 0, 0)`;
        left += slot.width;
      }
      g.frame = requestAnimationFrame(paint);
    }
    function onMove(e: PointerEvent) {
      const g = pending.current;
      if (!g || e.pointerId !== g.pointer) return;
      g.x = e.clientX;
      if (!g.active && Math.abs(e.clientX - g.startX) >= 6) {
        g.active = true; suppressClick.current = true;
        g.header.setPointerCapture(g.pointer);
        table.current?.setAttribute("data-column-dragging", "true");
        for (const slot of g.slots) for (const cell of slot.cells) {
          cell.classList.add("erp-column-moving");
          if (slot.key === g.key) cell.classList.add("erp-column-lifted");
          cell.style.transition = slot.key === g.key || reduced() ? "none" : "transform 180ms cubic-bezier(.2,.8,.2,1)";
        }
        g.frame = requestAnimationFrame(paint);
      }
      if (g.active) e.preventDefault();
    }
    function finish(e: PointerEvent | KeyboardEvent) {
      const g = pending.current;
      if (!g) {
        if (e.type === "pointerup" || e.type === "pointercancel") window.setTimeout(() => { suppressClick.current = false; }, 0);
        return;
      }
      if (e instanceof PointerEvent && e.pointerId !== g.pointer) return;
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      const cancel = e.type === "pointercancel" || e instanceof KeyboardEvent;
      if (g.active && !cancel) { g.x = (e as PointerEvent).clientX; cancelAnimationFrame(g.frame); paint(); }
      const before = g.slots.map(s => ({ key: s.key, left: s.cells[0].getBoundingClientRect().left }));
      pending.current = null; clear(g);
      if (!g.active) return;
      const index = g.preview.indexOf(g.key);
      if (!cancel) flushSync(() => moveRef.current(g.key, g.slots[index].key));
      // FLIP the lifted column into its final slot, or return all columns on cancellation.
      if (!reduced()) {
        const finalPositions = new Map(Array.from(table.current?.querySelectorAll<HTMLElement>("thead [data-column-key]") ?? []).map(header => [header.dataset.columnKey, header.getBoundingClientRect().left]));
        const startTime = document.timeline.currentTime;
        for (const cell of table.current?.querySelectorAll<HTMLElement>("[data-column-key]") ?? []) {
          const prior = before.find(s => s.key === cell.dataset.columnKey);
          const left = finalPositions.get(cell.dataset.columnKey);
          if (!prior || left == null) continue;
          const dx = prior.left - left;
          if (Math.abs(dx) > .5) {
            const animation = cell.animate([{ transform: `translateX(${dx}px)` }, { transform: "translateX(0)" }], { duration: 200, easing: "cubic-bezier(.2,.8,.2,1)" });
            if (typeof startTime === "number") animation.startTime = startTime;
          }
        }
      }
      // The click generated by releasing a drag must not sort the header or open a record.
      if (!(e instanceof KeyboardEvent)) window.setTimeout(() => { suppressClick.current = false; }, 0);
    }
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", finish); window.addEventListener("pointercancel", finish); window.addEventListener("keydown", finish);
    return () => {
      if (pending.current) clear(pending.current);
      pending.current = null;
      window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish); window.removeEventListener("keydown", finish);
    };
  }, [table, viewport]);

  function start(key: string, e: ReactPointerEvent<HTMLElement>) {
    if (e.button !== 0 || pending.current || (e.target as HTMLElement).closest('[role="separator"]')) return;
    const element = table.current, wrap = viewport.current;
    if (!element || !wrap) return;
    for (const cell of element.querySelectorAll<HTMLElement>("[data-column-key]")) cell.getAnimations().forEach(a => a.cancel());
    const headers = Array.from(element.querySelectorAll<HTMLElement>("thead [data-column-key]"));
    const origin = element.getBoundingClientRect().left;
    const cells = Array.from(element.querySelectorAll<HTMLElement>("[data-column-key]"));
    const slots = headers.map(header => { const box = header.getBoundingClientRect(); return { key: header.dataset.columnKey!, left: box.left - origin, width: box.width, cells: cells.filter(c => c.dataset.columnKey === header.dataset.columnKey) }; });
    pending.current = { pointer: e.pointerId, startX: e.clientX, x: e.clientX, scroll: wrap.scrollLeft, key, header: e.currentTarget, slots, preview: slots.map(s => s.key), active: false, frame: 0 };
  }
  return { start, captureClick: (e: ReactMouseEvent) => { if (suppressClick.current) { e.preventDefault(); e.stopPropagation(); } } };
}
