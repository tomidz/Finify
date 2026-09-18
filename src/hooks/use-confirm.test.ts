import { describe, expect, it } from "vitest";

import { createConfirmSlot } from "./use-confirm";

function request(slot: ReturnType<typeof createConfirmSlot>): Promise<boolean> {
  return new Promise((resolve) => slot.open(resolve));
}

describe("createConfirmSlot", () => {
  it("answers the waiting caller", async () => {
    const slot = createConfirmSlot();
    const answer = request(slot);
    slot.settle(true);
    await expect(answer).resolves.toBe(true);
  });

  it("answers a replaced request as cancelled and the newer one as the user chose", async () => {
    const slot = createConfirmSlot();
    const first = request(slot);
    const second = request(slot);
    await expect(first).resolves.toBe(false);
    slot.settle(true);
    await expect(second).resolves.toBe(true);
  });

  it("answers once: the dialog closing after a confirm does not reach the next request", async () => {
    const slot = createConfirmSlot();
    const first = request(slot);
    slot.settle(true);
    slot.settle(false);
    await expect(first).resolves.toBe(true);

    const next = request(slot);
    slot.settle(true);
    await expect(next).resolves.toBe(true);
  });
});
