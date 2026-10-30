import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluateResourceAdmission,
  type CapturedResourceSnapshot,
  type EnergyAdmissionPolicy,
} from "../src/resource-gate.js";

const NOW = 1_800_000_000_000;
const policy: EnergyAdmissionPolicy = {
  version: "test-energy-policy-v1",
  maxSnapshotAgeMs: 30_000,
  maxFutureSkewMs: 1_000,
  allowedQualities: ["MEASURED", "ESTIMATED"],
};

function snapshot(
  overrides: Partial<CapturedResourceSnapshot> = {},
): CapturedResourceSnapshot {
  return {
    schemaVersion: "anchor-resource-snapshot-v1",
    snapshotId: "fixture-only-snapshot",
    source: "test-fixture-only",
    deviceId: "test-device",
    domain: "test-domain",
    capturedAtMs: NOW,
    quality: "ESTIMATED",
    energyUnit: "J",
    uncertaintyJ: 1,
    availableEnergyLowerBoundJ: 100,
    protectedReserveJ: 10,
    coreUpperBoundJ: 10,
    inFlightUpperBoundJ: 5,
    optionalJobUpperBoundJ: 75,
    memoryOk: true,
    thermalOk: true,
    attentionOk: true,
    otherRequiredGatesOk: true,
    ...overrides,
  };
}

describe("resource admission", () => {
  it("admits only when the measured lower bound covers the bounded job", () => {
    const result = evaluateResourceAdmission(snapshot(), policy, NOW);
    assert.equal(result.status, "ADMITTED");
    if (result.status !== "ADMITTED") return;
    assert.equal(result.decision.optionalBudgetJ, 75);
    assert.equal(result.decision.snapshotDigest?.length, 64);
  });

  it("defers when required resource values or gates are unknown", () => {
    const result = evaluateResourceAdmission(
      snapshot({
        uncertaintyJ: null,
        availableEnergyLowerBoundJ: null,
        attentionOk: null,
      }),
      policy,
      NOW,
    );
    assert.equal(result.status, "DEFERRED_RESOURCE");
    if (result.status !== "DEFERRED_RESOURCE") return;
    assert.ok(result.decision.reasons.includes("UNKNOWN_RESOURCE_DATA"));
    assert.ok(result.decision.reasons.includes("REQUIRED_GATE_UNKNOWN"));
  });

  it("defers stale snapshots, failed gates, and jobs over the computed budget", () => {
    const stale = evaluateResourceAdmission(
      snapshot({ capturedAtMs: NOW - 30_001 }),
      policy,
      NOW,
    );
    assert.equal(stale.status, "DEFERRED_RESOURCE");
    if (stale.status === "DEFERRED_RESOURCE") {
      assert.ok(stale.decision.reasons.includes("STALE_SNAPSHOT"));
    }

    const blocked = evaluateResourceAdmission(
      snapshot({ thermalOk: false, optionalJobUpperBoundJ: 76 }),
      policy,
      NOW,
    );
    assert.equal(blocked.status, "DEFERRED_RESOURCE");
    if (blocked.status === "DEFERRED_RESOURCE") {
      assert.ok(blocked.decision.reasons.includes("REQUIRED_GATE_FAILED"));
      assert.ok(blocked.decision.reasons.includes("INSUFFICIENT_ENERGY"));
    }
  });

  it("rejects battery-percent-only evidence and undeclared fields", () => {
    const batteryOnly = {
      batteryPercent: 83,
      snapshotId: "not-energy",
    };
    const result = evaluateResourceAdmission(batteryOnly, policy, NOW);
    assert.equal(result.status, "DEFERRED_RESOURCE");
    if (result.status === "DEFERRED_RESOURCE") {
      assert.ok(result.decision.reasons.includes("INVALID_SNAPSHOT"));
    }
  });
});
