import { describe, expect, it } from "vitest";

import { isApplePlatform, isTypingTarget, matchesShortcut, type ShortcutEvent } from "./keyboard";

function element(tagName: string, attrs: { role?: string; isContentEditable?: boolean } = {}): EventTarget {
  return {
    tagName: tagName.toUpperCase(),
    isContentEditable: attrs.isContentEditable ?? false,
    getAttribute: (name: string) => (name === "role" ? (attrs.role ?? null) : null),
  } as unknown as EventTarget;
}

const body = element("body");

function press(key: string, overrides: Partial<ShortcutEvent> = {}): ShortcutEvent {
  return {
    key,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    target: body,
    defaultPrevented: false,
    isComposing: false,
    ...overrides,
  };
}

describe("isTypingTarget", () => {
  it("is true for text fields, selects and contenteditable", () => {
    expect(isTypingTarget(element("input"))).toBe(true);
    expect(isTypingTarget(element("textarea"))).toBe(true);
    expect(isTypingTarget(element("select"))).toBe(true);
    expect(isTypingTarget(element("div", { isContentEditable: true }))).toBe(true);
  });

  it("is true for controls that consume letters or arrows", () => {
    for (const role of ["combobox", "listbox", "option", "menuitem", "textbox", "slider"]) {
      expect(isTypingTarget(element("button", { role }))).toBe(true);
    }
  });

  it("is false for plain elements, buttons and non-elements", () => {
    expect(isTypingTarget(body)).toBe(false);
    expect(isTypingTarget(element("button"))).toBe(false);
    expect(isTypingTarget(element("a", { role: "link" }))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget({} as EventTarget)).toBe(false);
  });
});

describe("matchesShortcut", () => {
  it("matches a letter in either case and a named key exactly", () => {
    expect(matchesShortcut(press("n"), "n")).toBe(true);
    expect(matchesShortcut(press("N", { shiftKey: true }), "n")).toBe(true);
    expect(matchesShortcut(press("ArrowLeft"), "ArrowLeft")).toBe(true);
    expect(matchesShortcut(press("arrowleft"), "ArrowLeft")).toBe(false);
    expect(matchesShortcut(press("m"), "n")).toBe(false);
  });

  it("leaves browser chords alone unless asked for", () => {
    expect(matchesShortcut(press("n", { metaKey: true }), "n")).toBe(false);
    expect(matchesShortcut(press("n", { ctrlKey: true }), "n")).toBe(false);
    expect(matchesShortcut(press("n", { altKey: true }), "n")).toBe(false);
  });

  it("takes ⌘ or Ctrl for a mod chord, and needs one of them", () => {
    expect(matchesShortcut(press("k", { metaKey: true }), "k", { mod: true })).toBe(true);
    expect(matchesShortcut(press("k", { ctrlKey: true }), "k", { mod: true })).toBe(true);
    expect(matchesShortcut(press("k"), "k", { mod: true })).toBe(false);
  });

  it("checks Shift only when the options say so", () => {
    expect(matchesShortcut(press("/", { shiftKey: true }), "/")).toBe(true);
    expect(matchesShortcut(press("n", { shiftKey: true }), "n", { shift: false })).toBe(false);
    expect(matchesShortcut(press("N", { shiftKey: true }), "n", { shift: true })).toBe(true);
  });

  it("never fires a single key while typing, but does fire a mod chord", () => {
    const input = element("input");
    expect(matchesShortcut(press("n", { target: input }), "n")).toBe(false);
    expect(matchesShortcut(press("k", { target: input, metaKey: true }), "k", { mod: true })).toBe(true);
  });

  it("skips a key another handler took, an IME is composing, or autofill sent", () => {
    expect(matchesShortcut(press("n", { defaultPrevented: true }), "n")).toBe(false);
    expect(matchesShortcut(press("n", { isComposing: true }), "n")).toBe(false);
    expect(matchesShortcut(press(undefined as unknown as string), "n")).toBe(false);
  });
});

describe("isApplePlatform", () => {
  it("tells Apple platforms from the rest", () => {
    expect(isApplePlatform("MacIntel")).toBe(true);
    expect(isApplePlatform("iPhone")).toBe(true);
    expect(isApplePlatform("Win32")).toBe(false);
    expect(isApplePlatform("Linux x86_64")).toBe(false);
  });
});
