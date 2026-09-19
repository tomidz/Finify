import { describe, expect, it } from "vitest";

import { CreateTransactionRuleSchema, UpdateTransactionRuleSchema } from "./transaction-rules.schema";

const UUID = "550e8400-e29b-41d4-a716-446655440000";
const rule = { name: "Súper", match_field: "description", match_type: "contains", match_value: "coto" };

describe("transaction rule schemas", () => {
  it("creates an active rule with priority 0 by default", () => {
    const result = CreateTransactionRuleSchema.safeParse({ ...rule, action_category_id: UUID });
    expect(result.success && result.data).toMatchObject({ priority: 0, is_active: true });
  });

  it("leaves out what an update does not send", () => {
    const result = UpdateTransactionRuleSchema.safeParse({ id: UUID, name: "Otro" });
    expect(result.success && result.data).toEqual({ id: UUID, name: "Otro" });
  });
});
