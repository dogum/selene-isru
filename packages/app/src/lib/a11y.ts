import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusables(node: HTMLElement): HTMLElement[] {
  return [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((element) => !element.hidden);
}

/**
 * Open surfaces, innermost last. Escape closes only the top one, so a KPI
 * explanation over an open panel closes first, then the panel.
 */
const escapeStack: symbol[] = [];

interface DialogOptions {
  open: boolean;
  onClose: () => void;
  /** Trap Tab inside (aria-modal dialogs). */
  modal?: boolean;
  /** Move focus inside on open. Off for surfaces that must not steal focus. */
  autoFocus?: boolean;
  /** Preferred element to receive focus, e.g. the selected tab. */
  initialFocus?: string;
}

/**
 * Keyboard contract shared by every dialog-like surface: Escape closes the
 * topmost one, focus moves in when it opens and returns to whatever opened it
 * when it closes, and modal dialogs keep Tab inside themselves.
 */
export function useDialog(ref: RefObject<HTMLElement | null>, options: DialogOptions): void {
  const { open, modal = false, autoFocus = true, initialFocus } = options;
  const onClose = useRef(options.onClose);
  onClose.current = options.onClose;

  useEffect(() => {
    if (!open) return undefined;
    const id = Symbol("dialog");
    escapeStack.push(id);
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const node = ref.current;
    if (autoFocus && node !== null && !node.contains(document.activeElement)) {
      const preferred = initialFocus === undefined ? null : node.querySelector<HTMLElement>(initialFocus);
      (preferred ?? focusables(node)[0] ?? node).focus({ preventScroll: true });
    }

    const onKey = (event: KeyboardEvent): void => {
      if (escapeStack[escapeStack.length - 1] !== id) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onClose.current();
        return;
      }
      if (modal && event.key === "Tab" && node !== null) {
        const items = focusables(node);
        if (items.length === 0) {
          event.preventDefault();
          node.focus();
          return;
        }
        const first = items[0]!;
        const last = items[items.length - 1]!;
        const active = document.activeElement;
        if (event.shiftKey && (active === first || !node.contains(active))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (active === last || !node.contains(active))) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      const index = escapeStack.indexOf(id);
      if (index >= 0) escapeStack.splice(index, 1);
      // Return focus only if it would otherwise be lost with the dialog.
      const active = document.activeElement;
      const lost = active === null || active === document.body || (node !== null && (node.contains(active) || !node.isConnected));
      if (autoFocus && lost && opener !== null && opener.isConnected) {
        opener.focus({ preventScroll: true });
      }
    };
  }, [open, modal, autoFocus, initialFocus, ref]);
}

/**
 * Dropdown menu behaviour: outside pointer or Escape closes it (returning
 * focus to the trigger), arrow keys / Home / End move between items, and the
 * first item takes focus when it opens.
 */
export function useMenu(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  setOpen: (open: boolean) => void
): void {
  const close = useRef(setOpen);
  close.current = setOpen;

  useEffect(() => {
    if (!open) return undefined;
    const node = ref.current;
    const items = (): HTMLElement[] =>
      node === null ? [] : [...node.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]')];
    const trigger = (): HTMLElement | null => node?.querySelector<HTMLElement>("[aria-expanded]") ?? null;
    const id = Symbol("menu");
    escapeStack.push(id);
    items()[0]?.focus({ preventScroll: true });

    const onPointer = (event: PointerEvent): void => {
      if (node !== null && !node.contains(event.target as Node)) close.current(false);
    };
    const onKey = (event: KeyboardEvent): void => {
      if (node === null) return;
      if (event.key === "Escape") {
        if (escapeStack[escapeStack.length - 1] !== id) return;
        event.preventDefault();
        close.current(false);
        trigger()?.focus({ preventScroll: true });
        return;
      }
      if (!node.contains(document.activeElement)) return;
      const list = items();
      if (list.length === 0) return;
      const index = list.indexOf(document.activeElement as HTMLElement);
      const move = (next: number): void => {
        event.preventDefault();
        list[(next + list.length) % list.length]!.focus();
      };
      if (event.key === "ArrowDown") move(index + 1);
      else if (event.key === "ArrowUp") move(index - 1);
      else if (event.key === "Home") move(0);
      else if (event.key === "End") move(list.length - 1);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
      const index = escapeStack.indexOf(id);
      if (index >= 0) escapeStack.splice(index, 1);
    };
  }, [open, ref]);
}
