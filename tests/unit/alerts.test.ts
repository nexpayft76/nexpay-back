import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createAlertSchema, updateAlertSchema } from "../../src/modules/alerts/alerts.schemas";
import { matchesDirection } from "../../src/modules/alerts/alerts.service";

describe("Alerts module", () => {
  it("validates checkbox preference as a boolean in create and update payloads", () => {
    const input = {
      kind: "target_rate",
      currency: "EUR",
      base_currency: "USD",
      direction: "up",
      threshold: 1.2,
      email_enabled: true,
    };

    assert.equal(createAlertSchema.safeParse(input).success, true);
    assert.equal(updateAlertSchema.safeParse({ email_enabled: false }).success, true);
    assert.equal(createAlertSchema.safeParse({ ...input, email_enabled: "true" }).success, false);
    assert.equal(updateAlertSchema.safeParse({}).success, false);
  });

  it("matches upward and downward rate changes against signed thresholds", () => {
    assert.equal(matchesDirection("up", 2.1, 2), true);
    assert.equal(matchesDirection("up", 1.9, 2), false);
    assert.equal(matchesDirection("down", -2.1, -2), true);
    assert.equal(matchesDirection("down", -1.9, -2), false);
  });
});