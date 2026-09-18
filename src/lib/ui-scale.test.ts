import { describe, expect, it } from "vitest";

import { uiScale } from "./ui-scale";

// The first height or square size each control declares, in Tailwind units.
function height(classes: string): string | undefined {
  return classes.match(/(?:^|\s)(?:h|size)-(\d+(?:\.\d+)?)(?:\s|$)/)?.[1];
}

describe("uiScale", () => {
  it("gives every control the same height", () => {
    const heights = [uiScale.button, uiScale.iconButton, uiScale.trigger, uiScale.field].map(height);
    expect(heights.every((h) => h !== undefined)).toBe(true);
    expect(new Set(heights).size).toBe(1);
  });
});
