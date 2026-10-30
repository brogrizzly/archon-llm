import {
  canonicalJson,
  digestJson,
  sha256,
  type AnchorCore,
  type AnchorState,
  type AuthorizationIntent,
  type CommitReceipt,
  type ProposalBatch,
  type SignedAuthorization,
} from "@workspace/anchor-core";
import {
  evaluateResourceAdmission,
  type CapturedResourceSnapshot,
  type EnergyAdmissionPolicy,
  type ResourceAdmissionDecision,
  type ResourceAdmissionResult,
} from "./resource-gate.js";
import {
  InvalidModelOutputError,
  parseArchonCandidate,
} from "./proposal.js";
import {
  LocalInferenceError,
  type InferenceBackend,
} from "./python-backend.js";

type PreparedProposal = Extract<
  Awaited<ReturnType<AnchorCore["prepare"]>>,
  { ok: true }
>["value"];

export interface InferenceAuditRecord {
  version: "archon-inference-audit-v1";
  requestDigest: string;
  modelDigest: string;
  rawOutput: string;
  rawOutputDigest: string;
  finishReason: "eos" | "max_new_tokens" | "context_limit";
  capturedAtMs: number;
  resourcePolicy: EnergyAdmissionPolicy;
  resourceSnapshot: CapturedResourceSnapshot;
  resourceDecision: ResourceAdmissionDecision;
}

export interface GuardedProposalRecord {
  formatVersion: 1;
  batch: ProposalBatch;
  audit: InferenceAuditRecord;
}

export interface GuardedArchonOptions {
  core: AnchorCore;
  backend: InferenceBackend;
  resourcePolicy: EnergyAdmissionPolicy;
  now?: () => number;
}

export type GuardedInferenceOutcome =
  | {
      status: "INVALID_REQUEST";
      message: string;
    }
  | {
      status: "DEFERRED_RESOURCE";
      decision: ResourceAdmissionDecision;
    }
  | {
      status: "CHECKPOINT_UNAVAILABLE";
      code: string;
      message: string;
    }
  | {
      status: "INFERENCE_FAILED";
      code: string;
      message: string;
    }
  | {
      status: "INVALID_MODEL_OUTPUT";
      message: string;
      rawOutput?: string;
      rawOutputDigest?: string;
    }
  | {
      status: "INVALID_RECORD";
      message: string;
    }
  | {
      status: "RESOURCE_CONTEXT_CHANGED";
      decision: ResourceAdmissionDecision;
    }
  | {
      status: "ANCHOR_REJECTED";
      error: { code: string; message: string };
      record?: GuardedProposalRecord;
    }
  | {
      status: "READY_FOR_HUMAN";
      record: GuardedProposalRecord;
      authorizationIntent: AuthorizationIntent;
      prepared: PreparedProposal;
    }
  | {
      status: "REPLAYED";
      authorizationIntent: AuthorizationIntent;
      prepared: PreparedProposal;
    }
  | {
      status: "COMMITTED";
      receipt: CommitReceipt;
      resourceDecision: ResourceAdmissionDecision;
    };

const AUDIT_KEYS = [
  "version",
  "requestDigest",
  "modelDigest",
  "rawOutput",
  "rawOutputDigest",
  "finishReason",
  "capturedAtMs",
  "resourcePolicy",
  "resourceSnapshot",
  "resourceDecision",
];
const RECORD_KEYS = ["formatVersion", "batch", "audit"];

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

function isDigest(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function isFinishReason(
  value: unknown,
): value is InferenceAuditRecord["finishReason"] {
  return (
    value === "eos" ||
    value === "max_new_tokens" ||
    value === "context_limit"
  );
}

function makeProposalId(
  audit: InferenceAuditRecord,
  baseStateDigest: string,
): string {
  return `archon-${digestJson({
    auditVersion: audit.version,
    requestDigest: audit.requestDigest,
    modelDigest: audit.modelDigest,
    rawOutputDigest: audit.rawOutputDigest,
    resourcePolicyDigest: digestJson(audit.resourcePolicy),
    resourceSnapshotDigest: audit.resourceDecision.snapshotDigest,
    baseStateDigest,
  })}`;
}

function compareIntent(
  actual: AuthorizationIntent,
  expected: AuthorizationIntent,
): boolean {
  return (
    actual.action === expected.action &&
    actual.instanceId === expected.instanceId &&
    actual.proposalDigest === expected.proposalDigest &&
    actual.contextDigest === expected.contextDigest
  );
}

function makePrompt(requestText: string, state: AnchorState): string {
  return [
    "Return only one JSON object with exactly these keys:",
    '{"requested_action":"text","proposed_state":{"participants":[{"participant_id":"text","coordinates":{"x":{"value":0,"unit":"text","encodingId":"text"},"y":{"value":0,"unit":"text","encodingId":"text"},"t":{"value":0,"unit":"text","encodingId":"text"},"d":{"value":0,"unit":"text","encodingId":"text"},"a":{"value":0,"unit":"text","encodingId":"text"},"e":{"value":0,"unit":"text","encodingId":"text"}},"resources":{}}]},"evidence_refs":[],"uncertainties":[]}',
    "Do not claim authorization, change policy, or invent measurements.",
    `Request: ${requestText}`,
    `Anchor state: ${canonicalJson(state)}`,
  ].join("\n");
}

function gateAt(
  snapshot: unknown,
  policy: EnergyAdmissionPolicy,
  nowMs: number,
): ResourceAdmissionResult {
  return evaluateResourceAdmission(snapshot, policy, nowMs);
}

export class GuardedArchonInference {
  private readonly core: AnchorCore;
  private readonly backend: InferenceBackend;
  private readonly resourcePolicy: EnergyAdmissionPolicy;
  private readonly now: () => number;

  constructor(options: GuardedArchonOptions) {
    this.core = options.core;
    this.backend = options.backend;
    this.resourcePolicy = options.resourcePolicy;
    this.now = options.now ?? Date.now;
  }

  async propose(input: {
    instanceId: string;
    requestText: string;
    resourceSnapshot: unknown;
  }): Promise<GuardedInferenceOutcome> {
    if (
      typeof input.instanceId !== "string" ||
      input.instanceId.trim().length === 0 ||
      input.instanceId.length > 256 ||
      typeof input.requestText !== "string" ||
      input.requestText.trim().length === 0 ||
      Buffer.byteLength(input.requestText, "utf8") > 4_096
    ) {
      return {
        status: "INVALID_REQUEST",
        message: "Instance ID and a bounded request are required.",
      };
    }

    const capturedAtMs = this.now();
    const resource = gateAt(
      input.resourceSnapshot,
      this.resourcePolicy,
      capturedAtMs,
    );
    if (resource.status !== "ADMITTED") {
      return { status: "DEFERRED_RESOURCE", decision: resource.decision };
    }

    const stateResult = await this.core.getState(input.instanceId);
    if (!stateResult.ok) {
      return {
        status: "ANCHOR_REJECTED",
        error: stateResult.error,
      };
    }

    let generated;
    try {
      generated = await this.backend.generate(
        makePrompt(input.requestText, stateResult.value),
      );
    } catch (error) {
      if (error instanceof LocalInferenceError) {
        return error.code === "CHECKPOINT_UNAVAILABLE"
          ? {
              status: "CHECKPOINT_UNAVAILABLE",
              code: error.code,
              message: error.message,
            }
          : {
              status: "INFERENCE_FAILED",
              code: error.code,
              message: error.message,
            };
      }
      return {
        status: "INFERENCE_FAILED",
        code: "INFERENCE_FAILED",
        message: "The local inference backend failed.",
      };
    }

    if (!isDigest(generated.modelDigest)) {
      return {
        status: "INFERENCE_FAILED",
        code: "INVALID_MODEL_DIGEST",
        message: "The inference backend did not identify its checkpoint.",
      };
    }
    if (generated.finishReason === "context_limit") {
      return {
        status: "INVALID_MODEL_OUTPUT",
        message: "The model reached its context limit; output was not repaired.",
        rawOutput: generated.text,
        rawOutputDigest: sha256(generated.text),
      };
    }

    let candidate;
    try {
      candidate = parseArchonCandidate(generated.text);
    } catch (error) {
      return {
        status: "INVALID_MODEL_OUTPUT",
        message:
          error instanceof InvalidModelOutputError
            ? error.message
            : "Model output did not match the required proposal schema.",
        rawOutput: generated.text,
        rawOutputDigest: sha256(generated.text),
      };
    }

    const audit: InferenceAuditRecord = {
      version: "archon-inference-audit-v1",
      requestDigest: sha256(input.requestText),
      modelDigest: generated.modelDigest,
      rawOutput: generated.text,
      rawOutputDigest: sha256(generated.text),
      finishReason: generated.finishReason,
      capturedAtMs,
      resourcePolicy: resource.policy,
      resourceSnapshot: resource.snapshot,
      resourceDecision: resource.decision,
    };
    const batch: ProposalBatch = {
      proposalId: makeProposalId(audit, stateResult.value.stateDigest),
      instanceId: stateResult.value.instanceId,
      baseRevision: stateResult.value.revision,
      baseStateDigest: stateResult.value.stateDigest,
      schemaVersion: stateResult.value.schemaVersion,
      policyVersion: stateResult.value.policyVersion,
      ledgerHead: stateResult.value.ledgerHead,
      participants: candidate.participants,
    };
    const record: GuardedProposalRecord = {
      formatVersion: 1,
      batch,
      audit,
    };

    const prepared = await this.core.prepare(batch);
    if (!prepared.ok) {
      return {
        status: "ANCHOR_REJECTED",
        error: prepared.error,
        record,
      };
    }
    return {
      status: "READY_FOR_HUMAN",
      record,
      authorizationIntent: prepared.value.authorizationIntent,
      prepared: prepared.value,
    };
  }

  async refreshResourceContext(
    recordInput: unknown,
    newSnapshot: unknown,
  ): Promise<GuardedInferenceOutcome> {
    const verified = this.verifyRecord(recordInput);
    if (!verified.ok) {
      return { status: "INVALID_RECORD", message: verified.message };
    }
    const capturedAtMs = this.now();
    const resource = gateAt(newSnapshot, this.resourcePolicy, capturedAtMs);
    if (resource.status !== "ADMITTED") {
      return { status: "DEFERRED_RESOURCE", decision: resource.decision };
    }

    const audit: InferenceAuditRecord = {
      ...verified.record.audit,
      capturedAtMs,
      resourcePolicy: resource.policy,
      resourceSnapshot: resource.snapshot,
      resourceDecision: resource.decision,
    };
    const batch: ProposalBatch = {
      ...verified.record.batch,
      proposalId: makeProposalId(audit, verified.record.batch.baseStateDigest),
    };
    const refreshed: GuardedProposalRecord = {
      formatVersion: 1,
      batch,
      audit,
    };
    const prepared = await this.core.prepare(batch);
    if (!prepared.ok) {
      return {
        status: "ANCHOR_REJECTED",
        error: prepared.error,
        record: refreshed,
      };
    }
    return {
      status: "READY_FOR_HUMAN",
      record: refreshed,
      authorizationIntent: prepared.value.authorizationIntent,
      prepared: prepared.value,
    };
  }

  async replay(recordInput: unknown): Promise<GuardedInferenceOutcome> {
    const verified = this.verifyRecord(recordInput);
    if (!verified.ok) {
      return { status: "INVALID_RECORD", message: verified.message };
    }
    const replayedResource = gateAt(
      verified.record.audit.resourceSnapshot,
      verified.record.audit.resourcePolicy,
      verified.record.audit.capturedAtMs,
    );
    if (
      replayedResource.status !== "ADMITTED" ||
      canonicalJson(replayedResource.decision) !==
        canonicalJson(verified.record.audit.resourceDecision)
    ) {
      return {
        status: "INVALID_RECORD",
        message: "Captured resource evidence does not reproduce its decision.",
      };
    }

    const prepared = await this.core.prepare(verified.record.batch);
    if (!prepared.ok) {
      return { status: "ANCHOR_REJECTED", error: prepared.error };
    }
    return {
      status: "REPLAYED",
      authorizationIntent: prepared.value.authorizationIntent,
      prepared: prepared.value,
    };
  }

  async commit(
    recordInput: unknown,
    authorization: SignedAuthorization,
    currentResourceSnapshot: unknown,
  ): Promise<GuardedInferenceOutcome> {
    const verified = this.verifyRecord(recordInput);
    if (!verified.ok) {
      return { status: "INVALID_RECORD", message: verified.message };
    }
    if (
      digestJson(verified.record.audit.resourcePolicy) !==
      digestJson(this.resourcePolicy)
    ) {
      return {
        status: "INVALID_RECORD",
        message: "The resource policy changed; refresh and reauthorize the proposal.",
      };
    }

    const resource = gateAt(
      currentResourceSnapshot,
      this.resourcePolicy,
      this.now(),
    );
    if (resource.status !== "ADMITTED") {
      return { status: "DEFERRED_RESOURCE", decision: resource.decision };
    }
    if (
      resource.decision.snapshotDigest !==
      verified.record.audit.resourceDecision.snapshotDigest
    ) {
      return {
        status: "RESOURCE_CONTEXT_CHANGED",
        decision: resource.decision,
      };
    }

    const prepared = await this.core.prepare(verified.record.batch);
    if (!prepared.ok) {
      return { status: "ANCHOR_REJECTED", error: prepared.error };
    }
    const receipt = await this.core.commit(
      verified.record.batch,
      authorization,
    );
    if (!receipt.ok) {
      return { status: "ANCHOR_REJECTED", error: receipt.error };
    }
    return {
      status: "COMMITTED",
      receipt: receipt.value,
      resourceDecision: resource.decision,
    };
  }

  private verifyRecord(
    value: unknown,
  ):
    | { ok: true; record: GuardedProposalRecord }
    | { ok: false; message: string } {
    if (
      !isRecord(value) ||
      !hasExactKeys(value, RECORD_KEYS) ||
      value.formatVersion !== 1 ||
      !isRecord(value.batch) ||
      !isRecord(value.audit) ||
      !hasExactKeys(value.audit, AUDIT_KEYS)
    ) {
      return { ok: false, message: "Inference audit record shape is invalid." };
    }
    const audit = value.audit;
    if (
      audit.version !== "archon-inference-audit-v1" ||
      typeof audit.rawOutput !== "string" ||
      !isDigest(audit.rawOutputDigest) ||
      sha256(audit.rawOutput) !== audit.rawOutputDigest ||
      !isDigest(audit.requestDigest) ||
      !isDigest(audit.modelDigest) ||
      !isFinishReason(audit.finishReason) ||
      audit.finishReason === "context_limit" ||
      !Number.isSafeInteger(audit.capturedAtMs) ||
      !isRecord(value.batch) ||
      typeof value.batch.baseStateDigest !== "string" ||
      typeof value.batch.proposalId !== "string"
    ) {
      return { ok: false, message: "Inference audit fields are invalid." };
    }

    let candidate;
    try {
      candidate = parseArchonCandidate(audit.rawOutput);
    } catch {
      return {
        ok: false,
        message: "Captured model output no longer matches its strict schema.",
      };
    }
    const resource = gateAt(
      audit.resourceSnapshot,
      audit.resourcePolicy as unknown as EnergyAdmissionPolicy,
      audit.capturedAtMs as number,
    );
    if (
      resource.status !== "ADMITTED" ||
      canonicalJson(resource.decision) !== canonicalJson(audit.resourceDecision)
    ) {
      return {
        ok: false,
        message: "Captured resource snapshot or admission decision is invalid.",
      };
    }

    const batch = value.batch as unknown as ProposalBatch;
    if (
      canonicalJson(candidate.participants) !==
      canonicalJson(batch.participants)
    ) {
      return {
        ok: false,
        message: "Captured proposal does not match the raw model output.",
      };
    }
    const typedAudit = audit as unknown as InferenceAuditRecord;
    if (
      batch.proposalId !== makeProposalId(typedAudit, batch.baseStateDigest)
    ) {
      return {
        ok: false,
        message: "Proposal ID is not bound to its inference and resource evidence.",
      };
    }

    return {
      ok: true,
      record: value as unknown as GuardedProposalRecord,
    };
  }
}
