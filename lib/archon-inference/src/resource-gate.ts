import { digestJson } from "@workspace/anchor-core";

export type ResourceQuality = "MEASURED" | "ESTIMATED";

export interface EnergyAdmissionPolicy {
  version: string;
  maxSnapshotAgeMs: number;
  maxFutureSkewMs: number;
  allowedQualities: ResourceQuality[];
}

export interface CapturedResourceSnapshot {
  schemaVersion: "anchor-resource-snapshot-v1";
  snapshotId: string;
  source: string;
  deviceId: string;
  domain: string;
  capturedAtMs: number;
  quality: ResourceQuality;
  energyUnit: "J";
  uncertaintyJ: number | null;
  availableEnergyLowerBoundJ: number | null;
  protectedReserveJ: number | null;
  coreUpperBoundJ: number | null;
  inFlightUpperBoundJ: number | null;
  optionalJobUpperBoundJ: number | null;
  memoryOk: boolean | null;
  thermalOk: boolean | null;
  attentionOk: boolean | null;
  otherRequiredGatesOk: boolean | null;
}

export type ResourceGateReason =
  | "MISSING_SNAPSHOT"
  | "INVALID_POLICY"
  | "INVALID_SNAPSHOT"
  | "STALE_SNAPSHOT"
  | "FUTURE_SNAPSHOT"
  | "UNACCEPTED_QUALITY"
  | "UNKNOWN_RESOURCE_DATA"
  | "UNIT_REQUIRED"
  | "REQUIRED_GATE_UNKNOWN"
  | "REQUIRED_GATE_FAILED"
  | "INSUFFICIENT_ENERGY";

export interface ResourceAdmissionDecision {
  version: "anchor-energy-admission-v1";
  status: "ADMITTED" | "DEFERRED_RESOURCE";
  policyVersion: string | null;
  policyDigest: string | null;
  snapshotDigest: string | null;
  ageMs: number | null;
  optionalBudgetJ: number | null;
  reasons: ResourceGateReason[];
}

export type ResourceAdmissionResult =
  | {
      status: "ADMITTED";
      decision: ResourceAdmissionDecision;
      snapshot: CapturedResourceSnapshot;
      policy: EnergyAdmissionPolicy;
    }
  | {
      status: "DEFERRED_RESOURCE";
      decision: ResourceAdmissionDecision;
    };

const POLICY_KEYS = [
  "version",
  "maxSnapshotAgeMs",
  "maxFutureSkewMs",
  "allowedQualities",
];
const SNAPSHOT_KEYS = [
  "schemaVersion",
  "snapshotId",
  "source",
  "deviceId",
  "domain",
  "capturedAtMs",
  "quality",
  "energyUnit",
  "uncertaintyJ",
  "availableEnergyLowerBoundJ",
  "protectedReserveJ",
  "coreUpperBoundJ",
  "inFlightUpperBoundJ",
  "optionalJobUpperBoundJ",
  "memoryOk",
  "thermalOk",
  "attentionOk",
  "otherRequiredGatesOk",
];
const QUALITIES = new Set<ResourceQuality>(["MEASURED", "ESTIMATED"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function isNonEmptyString(value: unknown, maxLength = 256): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maxLength
  );
}

function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isNullableNonNegativeFinite(
  value: unknown,
): value is number | null {
  return value === null || isNonNegativeFinite(value);
}

function isNullableBoolean(value: unknown): value is boolean | null {
  return value === null || typeof value === "boolean";
}

function parsePolicy(value: unknown): EnergyAdmissionPolicy | null {
  if (!isRecord(value) || !hasExactKeys(value, POLICY_KEYS)) return null;
  if (
    !isNonEmptyString(value.version, 128) ||
    !Number.isSafeInteger(value.maxSnapshotAgeMs) ||
    (value.maxSnapshotAgeMs as number) <= 0 ||
    !Number.isSafeInteger(value.maxFutureSkewMs) ||
    (value.maxFutureSkewMs as number) < 0 ||
    !Array.isArray(value.allowedQualities) ||
    value.allowedQualities.length === 0 ||
    value.allowedQualities.some(
      (quality) => typeof quality !== "string" || !QUALITIES.has(quality as ResourceQuality),
    ) ||
    new Set(value.allowedQualities).size !== value.allowedQualities.length
  ) {
    return null;
  }
  return value as unknown as EnergyAdmissionPolicy;
}

function parseSnapshot(value: unknown): CapturedResourceSnapshot | null {
  if (!isRecord(value) || !hasExactKeys(value, SNAPSHOT_KEYS)) return null;
  if (
    value.schemaVersion !== "anchor-resource-snapshot-v1" ||
    !isNonEmptyString(value.snapshotId) ||
    !isNonEmptyString(value.source) ||
    !isNonEmptyString(value.deviceId) ||
    !isNonEmptyString(value.domain) ||
    !Number.isSafeInteger(value.capturedAtMs) ||
    typeof value.quality !== "string" ||
    !QUALITIES.has(value.quality as ResourceQuality) ||
    value.energyUnit !== "J" ||
    !isNullableNonNegativeFinite(value.uncertaintyJ) ||
    !isNullableNonNegativeFinite(value.availableEnergyLowerBoundJ) ||
    !isNullableNonNegativeFinite(value.protectedReserveJ) ||
    !isNullableNonNegativeFinite(value.coreUpperBoundJ) ||
    !isNullableNonNegativeFinite(value.inFlightUpperBoundJ) ||
    !isNullableNonNegativeFinite(value.optionalJobUpperBoundJ) ||
    !isNullableBoolean(value.memoryOk) ||
    !isNullableBoolean(value.thermalOk) ||
    !isNullableBoolean(value.attentionOk) ||
    !isNullableBoolean(value.otherRequiredGatesOk)
  ) {
    return null;
  }
  return value as unknown as CapturedResourceSnapshot;
}

export function evaluateResourceAdmission(
  snapshotInput: unknown,
  policyInput: unknown,
  nowMs: number,
): ResourceAdmissionResult {
  const policy = parsePolicy(policyInput);
  const snapshot = parseSnapshot(snapshotInput);
  const reasons = new Set<ResourceGateReason>();
  if (!Number.isSafeInteger(nowMs)) reasons.add("INVALID_SNAPSHOT");
  if (!policy) reasons.add("INVALID_POLICY");
  if (snapshotInput === null || snapshotInput === undefined) {
    reasons.add("MISSING_SNAPSHOT");
  } else if (!snapshot) {
    reasons.add("INVALID_SNAPSHOT");
  }

  const policyDigest = policy ? digestJson(policy) : null;
  const snapshotDigest = snapshot ? digestJson(snapshot) : null;
  let ageMs: number | null = null;
  let optionalBudgetJ: number | null = null;

  if (policy && snapshot) {
    ageMs = nowMs - snapshot.capturedAtMs;
    if (ageMs > policy.maxSnapshotAgeMs) reasons.add("STALE_SNAPSHOT");
    if (ageMs < -policy.maxFutureSkewMs) reasons.add("FUTURE_SNAPSHOT");
    if (!policy.allowedQualities.includes(snapshot.quality)) {
      reasons.add("UNACCEPTED_QUALITY");
    }
    if (snapshot.energyUnit !== "J") reasons.add("UNIT_REQUIRED");

    const energyValues = [
      snapshot.uncertaintyJ,
      snapshot.availableEnergyLowerBoundJ,
      snapshot.protectedReserveJ,
      snapshot.coreUpperBoundJ,
      snapshot.inFlightUpperBoundJ,
      snapshot.optionalJobUpperBoundJ,
    ];
    if (energyValues.some((value) => value === null)) {
      reasons.add("UNKNOWN_RESOURCE_DATA");
    } else {
      const [
        _uncertaintyJ,
        availableEnergyLowerBoundJ,
        protectedReserveJ,
        coreUpperBoundJ,
        inFlightUpperBoundJ,
        optionalJobUpperBoundJ,
      ] = energyValues as number[];
      optionalBudgetJ = Math.max(
        0,
        availableEnergyLowerBoundJ -
          protectedReserveJ -
          coreUpperBoundJ -
          inFlightUpperBoundJ,
      );
      if (optionalJobUpperBoundJ > optionalBudgetJ) {
        reasons.add("INSUFFICIENT_ENERGY");
      }
    }

    const requiredGates = [
      snapshot.memoryOk,
      snapshot.thermalOk,
      snapshot.attentionOk,
      snapshot.otherRequiredGatesOk,
    ];
    if (requiredGates.some((gate) => gate === null)) {
      reasons.add("REQUIRED_GATE_UNKNOWN");
    }
    if (requiredGates.some((gate) => gate === false)) {
      reasons.add("REQUIRED_GATE_FAILED");
    }
  }

  const reasonList = [...reasons].sort();
  const status = reasonList.length === 0 ? "ADMITTED" : "DEFERRED_RESOURCE";
  const decision: ResourceAdmissionDecision = {
    version: "anchor-energy-admission-v1",
    status,
    policyVersion: policy?.version ?? null,
    policyDigest,
    snapshotDigest,
    ageMs,
    optionalBudgetJ,
    reasons: reasonList,
  };

  if (status === "ADMITTED" && policy && snapshot) {
    return { status, decision, policy, snapshot };
  }
  return { status: "DEFERRED_RESOURCE", decision };
}
