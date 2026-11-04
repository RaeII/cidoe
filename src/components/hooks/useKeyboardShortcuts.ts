import { useEffect, useRef } from "react";

/**
 * Single keyboard shortcut definition. `key` matches `KeyboardEvent.key`
 * case-insensitively (e.g. "m", "Escape", "?"). Modifier flags must match
 * exactly — `{ key: "m", ctrl: true }` fires on Ctrl+M but not Ctrl+Shift+M.
 */
export type KeyboardShortcut = {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  /** Human-readable label used by the shortcuts help overlay. */
  description: string;
  handler: (event: KeyboardEvent) => void;
  /** Fire even while typing in an input/textarea/contentEditable. Default false. */
  allowInInput?: boolean;
  /** Call `event.preventDefault()` on match. Default true. */
  preventDefault?: boolean;
};

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
};

const matches = (event: KeyboardEvent, shortcut: KeyboardShortcut): boolean => {
  if (event.key.toLowerCase() !== shortcut.key.toLowerCase()) return false;
  if ((shortcut.ctrl ?? false) !== event.ctrlKey) return false;
  if ((shortcut.shift ?? false) !== event.shiftKey) return false;
  if ((shortcut.alt ?? false) !== event.altKey) return false;
  if ((shortcut.meta ?? false) !== event.metaKey) return false;
  return true;
};

/**
 * Binds a global `keydown` listener once and dispatches to the first matching
 * shortcut. Reads the latest `shortcuts` via a ref so callers can pass a fresh
 * inline array each render without re-binding the listener.
 */
export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]): void {
  const shortcutsRef = useRef(shortcuts);
  useEffect(() => {
    shortcutsRef.current = shortcuts;
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Já tratado (ex.: Esc fechando um Dialog Radix) — não fecha a cena por baixo junto.
      if (event.defaultPrevented) return;
      const editable = isEditableTarget(event.target);
      for (const shortcut of shortcutsRef.current) {
        if (!matches(event, shortcut)) continue;
        if (editable && !shortcut.allowInInput) continue;
        if (shortcut.preventDefault ?? true) event.preventDefault();
        shortcut.handler(event);
        break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}

/** Format a shortcut as a readable combo, e.g. "Ctrl + M" or "?". */
export function formatShortcut(shortcut: KeyboardShortcut): string {
  const parts: string[] = [];
  if (shortcut.ctrl) parts.push("Ctrl");
  if (shortcut.meta) parts.push("Cmd");
  if (shortcut.alt) parts.push("Alt");
  // A symbol key (e.g. "?") already implies Shift on most layouts.
  const symbolKey = shortcut.key.length === 1 && !/[a-z0-9]/i.test(shortcut.key);
  if (shortcut.shift && !symbolKey) parts.push("Shift");
  parts.push(formatKey(shortcut.key));
  return parts.join(" + ");
}

const formatKey = (key: string): string => {
  if (key === " ") return "Space";
  if (key.length === 1) return key.toUpperCase();
  return key.charAt(0).toUpperCase() + key.slice(1);
};
