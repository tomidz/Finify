import { describe, it, expect } from "vitest";
import {
  CreateSavingsGoalSchema,
  UpdateSavingsGoalSchema,
} from "./savings-goals.schema";

const UUID = "550e8400-e29b-41d4-a716-446655440000";

describe("CreateSavingsGoalSchema", () => {
  it("accepts a minimal valid goal and applies defaults", () => {
    const result = CreateSavingsGoalSchema.safeParse({
      name: "Vacaciones",
      target_amount: 1000,
      currency: "EUR",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.current_amount).toBe(0);
      expect(result.data.color).toBe("#60a5fa");
      expect(result.data.deadline).toBeNull();
      expect(result.data.account_id).toBeNull();
    }
  });

  it("trims the name", () => {
    const result = CreateSavingsGoalSchema.safeParse({
      name: "  Fondo  ",
      target_amount: 500,
      currency: "USD",
    });
    expect(result.success && result.data.name).toBe("Fondo");
  });

  it("rejects an empty name", () => {
    expect(
      CreateSavingsGoalSchema.safeParse({
        name: "",
        target_amount: 500,
        currency: "USD",
      }).success
    ).toBe(false);
  });

  it("rejects a non-positive target amount", () => {
    expect(
      CreateSavingsGoalSchema.safeParse({
        name: "x",
        target_amount: 0,
        currency: "USD",
      }).success
    ).toBe(false);
    expect(
      CreateSavingsGoalSchema.safeParse({
        name: "x",
        target_amount: -1,
        currency: "USD",
      }).success
    ).toBe(false);
  });

  it("rejects a negative current amount", () => {
    expect(
      CreateSavingsGoalSchema.safeParse({
        name: "x",
        target_amount: 100,
        current_amount: -5,
        currency: "USD",
      }).success
    ).toBe(false);
  });

  it("accepts a valid account_id and rejects a malformed one", () => {
    expect(
      CreateSavingsGoalSchema.safeParse({
        name: "x",
        target_amount: 100,
        currency: "USD",
        account_id: UUID,
      }).success
    ).toBe(true);
    expect(
      CreateSavingsGoalSchema.safeParse({
        name: "x",
        target_amount: 100,
        currency: "USD",
        account_id: "not-a-uuid",
      }).success
    ).toBe(false);
  });
});

describe("UpdateSavingsGoalSchema", () => {
  it("requires a valid id", () => {
    expect(
      UpdateSavingsGoalSchema.safeParse({ name: "x" }).success
    ).toBe(false);
    expect(
      UpdateSavingsGoalSchema.safeParse({ id: UUID, name: "x" }).success
    ).toBe(true);
  });

  it("allows partial updates with current_amount and is_completed", () => {
    const result = UpdateSavingsGoalSchema.safeParse({
      id: UUID,
      current_amount: 250,
      is_completed: true,
    });
    expect(result.success).toBe(true);
  });
});
