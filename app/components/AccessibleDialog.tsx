"use client";

import { type ReactNode, useEffect, useRef } from "react";

/** Native modality supplies focus containment, Escape, and return-to-trigger focus. */
export function AccessibleDialog({ children, label, onClose, busy = false }: { children: ReactNode; label: string; onClose: () => void; busy?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = "hidden";
    return () => { element?.close(); document.body.style.overflow = previousOverflow; trigger?.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={dialog} className="accessible-dialog" aria-label={label} aria-busy={busy}
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
    onKeyDown={(event) => {
      if (event.key !== "Tab") return;
      const controls = [...event.currentTarget.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea, [tabindex]")]
        .filter((element) => element.tabIndex >= 0 && !element.matches(":disabled") && element.getClientRects().length);
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>{children}</dialog>;
}
