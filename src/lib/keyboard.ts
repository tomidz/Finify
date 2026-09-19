import { useEffect, useEffectEvent, useSyncExternalStore } from "react";

// Roles whose element consumes letters or arrows: a Radix Select trigger
// (typeahead), cmdk's list, menus.
const TYPING_ROLES = new Set([
  "textbox",
  "searchbox",
  "combobox",
  "listbox",
  "option",
  "menu",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "slider",
  "spinbutton",
]);

/**
 * Whether a key event's target is taking the keys itself: a text field, a
 * select, contenteditable, cmdk's input and list, an open menu. A single-key
 * shortcut must not fire there.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  // Duck-typed rather than `instanceof HTMLElement`: the window and the
  // document are targets too, and tests run without a DOM.
  const element = target as Partial<HTMLElement> | null;
  if (typeof element?.tagName !== "string") return false;
  const tag = element.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (element.isContentEditable) return true;
  const role = element.getAttribute?.("role");
  return role != null && TYPING_ROLES.has(role);
}

export type ShortcutOptions = {
  /** Require ⌘ (Mac) or Ctrl. Without it, a press holding ⌘/Ctrl never matches. */
  mod?: boolean;
  /** Require Alt. Without it, a press holding Alt never matches. */
  alt?: boolean;
  /** Require Shift pressed (true) or released (false). Unset: either. */
  shift?: boolean;
};

export type ShortcutEvent = Pick<
  KeyboardEvent,
  "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey" | "target" | "defaultPrevented" | "isComposing"
>;

/**
 * Whether a keydown is the shortcut `key` ("n", "/", "ArrowLeft").
 *
 * A single key never fires while typing; a ⌘/Ctrl chord does, since typing
 * never holds ⌘/Ctrl. Shift is ignored by default because some layouts need
 * it for "/" or "?".
 */
export function matchesShortcut(event: ShortcutEvent, key: string, options: ShortcutOptions = {}): boolean {
  // Chrome's autofill sends keydowns with no key.
  if (typeof event.key !== "string" || event.defaultPrevented || event.isComposing) return false;
  const sameKey =
    event.key.length === 1 ? event.key.toLowerCase() === key.toLowerCase() : event.key === key;
  if (!sameKey) return false;
  if ((event.metaKey || event.ctrlKey) !== Boolean(options.mod)) return false;
  if (event.altKey !== Boolean(options.alt)) return false;
  if (options.shift !== undefined && event.shiftKey !== options.shift) return false;
  return options.mod === true || !isTypingTarget(event.target);
}

// Radix marks an open dialog, sheet, alert dialog or popover content this way.
function isDialogOpen(): boolean {
  return (
    document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]') !==
    null
  );
}

/**
 * Runs `handler` on the keydown `key` (see `matchesShortcut`), and prevents
 * the key's default. Ignored while a dialog is open unless `inDialogs`.
 */
export function useShortcut(
  key: string,
  handler: (event: KeyboardEvent) => void,
  { mod, alt, shift, inDialogs = false, enabled = true }: ShortcutOptions & { inDialogs?: boolean; enabled?: boolean } = {},
): void {
  const onShortcut = useEffectEvent(handler);

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!matchesShortcut(event, key, { mod, alt, shift })) return;
      if (!inDialogs && isDialogOpen()) return;
      event.preventDefault();
      onShortcut(event);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [key, mod, alt, shift, inDialogs, enabled]);
}

/** Whether a `navigator.platform` (or user agent) string is a Mac, iPhone or iPad. */
export function isApplePlatform(platform: string): boolean {
  return /mac|iphone|ipad|ipod/i.test(platform);
}

const subscribeNever = () => () => {};

/**
 * "⌘" on Apple devices, "Ctrl" elsewhere. The server does not know the
 * platform, so it and the first client render say "⌘".
 */
export function useModKeyLabel(): "⌘" | "Ctrl" {
  return useSyncExternalStore(
    subscribeNever,
    () => (isApplePlatform(navigator.platform || navigator.userAgent) ? "⌘" : "Ctrl"),
    () => "⌘",
  );
}
