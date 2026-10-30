import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  AnchorCore,
  FileAnchorLedger,
  signAuthorization,
  type AnchorPolicy,
  type AnchorStatePayload,
  type AuthorizationClaims,
  type CoordinateVector,
  type G4LOOperator,
  type TransitionPolicy,
} from "@workspace/anchor-core";
import {
  GuardedArchonInference,
  LocalInferenceError,
  type CapturedResourceSnapshot,
  type EnergyAdmissionPolicy,
  type InferenceBackend,
  type LocalInferenceOutput,
} from "../src/index.js";

const HUMAN_ID = "human-test";
const INSTANCE_ID = "instance-test";
const FIXED_NOW = 1_800_000_000_000;
const keyPair = generateKeyPairSync("ed25519");
const privateKey = keyPair.privateKey.export({
  type: "pkcs8",
  format: "pem",
}).toString();
const publicKey = keyPair.publicKey.export({
  type: "spki",
  format: "pem",
}).toString();
const directories: string[] = [];

const resourcePolicy: EnergyAdmissionPolicy = {
  version: "test-energy-policy-v1",
  maxSnapshotAgeMs: 30_000,
  maxFutureSkewMs: 1_000,
  allowedQualities: ["ESTIMATED"],
};

function coordinates(x = 0): CoordinateVector {
  return {
    x: { value: x, unit: "m", encodingId: "test-x-v1" },
    y: { value: 0, unit: "m", encodingId: "test-y-v1" },
    t: { value: 0, unit: "tick", encodingId: "test-t-v1" },
    d: { value: 0, unit: "state-unit", encodingId: "test-d-v1" },
    a: { value: 0, unit: "attention-unit", encodingId: "test-a-v1" },
    e: { value: 0, unit: "energy-unit", encodingId: "test-e-v1" },
  };
}

function budgets() {
  return {
    battery: { value: 100, unit: "percent" },
    memory: { value: 32, unit: "MiB" },
    attention: { value: 0, unit: "attention-unit" },
  };
}

function testPolicy(): AnchorPolicy {
  return {
    schemaVersion: "schema-test-v1",
    version: "policy-test-v1",
    coordinates: {
      x: { unit: "m", encodingId: "test-x-v1", scale: 1, mutable: true },
      y: { unit: "m", encodingId: "test-y-v1", scale: 1, mutable: true },
      t: {
        unit: "tick",
        encodingId: "test-t-v1",
        scale: 1,
        mutable: true,
      },
      d: {
        unit: "state-unit",
        encodingId: "test-d-v1",
        scale: 1,
        mutable: true,
      },
      a: {
        unit: "attention-unit",
        encodingId: "test-a-v1",
        scale: 1,
        mutable: true,
      },
      e: {
        unit: "energy-unit",
        encodingId: "test-e-v1",
        scale: 1,
        mutable: true,
      },
    },
    budgets: {
      battery: { unit: "percent", maximum: 100 },
      memory: { unit: "MiB", maximum: 256 },
      attention: { unit: "attention-unit", maximum: 10 },
    },
    smallDisplacement: { threshold: 0.1, comparison: "lt" },
    mathSemantics: {
      piOperatorId: "test-fixture-only",
      piOperatorVersion: "0.0.0-test",
      numeratorSemanticsId: "test-vector-fixture-only",
    },
    transitionSemantics: { id: "test-transition-only", version: "0.0.0-test" },
    authorizers: { [HUMAN_ID]: publicKey },
    maxAuthorizationLifetimeMs: 60_000,
    maxClockSkewMs: 1_000,
  };
}

const testMathOperator: G4LOOperator = {
  id: "test-fixture-only",
  version: "0.0.0-test",
  numeratorSemanticsId: "test-vector-fixture-only",
  evaluate(input) {
    return {
      fixture: "test-only-not-g4lo",
      participants: input.participants.map((participant) => ({
        participantId: participant.participantId,
        denominator: participant.denominator,
      })),
    };
  },
};

const testTransitionPolicy: TransitionPolicy = {
  id: "test-transition-only",
  version: "0.0.0-test",
  evaluate() {
    return { accepted: true };
  },
};

function initialState(): AnchorStatePayload {
  return {
    instanceId: INSTANCE_ID,
    schemaVersion: "schema-test-v1",
    policyVersion: "policy-test-v1",
    participants: {
      [HUMAN_ID]: { coordinates: coordinates(), resources: budgets() },
    },
  };
}

function signed(
  intent: Pick<
    AuthorizationClaims,
    "action" | "instanceId" | "proposalDigest" | "contextDigest"
  >,
) {
  const claims: AuthorizationClaims = {
    version: 1,
    ...intent,
    humanId: HUMAN_ID,
    nonce: randomBytes(24).toString("base64url"),
    issuedAt: FIXED_NOW - 100,
    expiresAt: FIXED_NOW + 30_000,
  };
  return signAuthorization(claims, privateKey);
}

async function newEnvironment(withMath = true) {
  const directory = await mkdtemp(path.join(tmpdir(), "archon-inference-test-"));
  directories.push(directory);
  const key = randomBytes(32);
  const policy = testPolicy();
  const ledger = new FileAnchorLedger({ directory, key });
  const core = new AnchorCore({
    ledger,
    policy,
    ...(withMath ? { mathOperator: testMathOperator } : {}),
    transitionPolicy: testTransitionPolicy,
    now: () => FIXED_NOW,
  });
  const state = initialState();
  const intent = core.prepareGenesis(state);
  assert.equal(intent.ok, true);
  if (!intent.ok) throw new Error(intent.error.message);
  const authorization = signed({
    action: "GENESIS",
    instanceId: state.instanceId,
    proposalDigest: intent.value.proposalDigest,
    contextDigest: intent.value.contextDigest,
  });
  const initialized = await core.initialize(state, authorization);
  assert.equal(initialized.ok, true);
  if (!initialized.ok) throw new Error(initialized.error.message);
  return { core, ledger, directory, key, policy };
}

function fixtureSnapshot(
  overrides: Partial<CapturedResourceSnapshot> = {},
): CapturedResourceSnapshot {
  return {
    schemaVersion: "anchor-resource-snapshot-v1",
    snapshotId: "fixture-only-resource-snapshot",
    source: "test-fixture-only",
    deviceId: "test-device",
    domain: "test-domain",
    capturedAtMs: FIXED_NOW,
    quality: "ESTIMATED",
    energyUnit: "J",
    uncertaintyJ: 1,
    availableEnergyLowerBoundJ: 100,
    protectedReserveJ: 10,
    coreUpperBoundJ: 10,
    inFlightUpperBoundJ: 5,
    optionalJobUpperBoundJ: 20,
    memoryOk: true,
    thermalOk: true,
    attentionOk: true,
    otherRequiredGatesOk: true,
    ...overrides,
  };
}

function modelOutput(): string {
  return modelOutputForX(1);
}

function modelOutputForX(x: number): string {
  return JSON.stringify({
    requested_action: "Move the test participant",
    proposed_state: {
      participants: [
        {
          participant_id: HUMAN_ID,
          coordinates: coordinates(x),
          resources: budgets(),
        },
      ],
    },
    evidence_refs: ["test-fixture-only"],
    uncertainties: ["Test output only."],
  });
}

class TestInferenceBackend implements InferenceBackend {
  calls = 0;

  constructor(
    private readonly text = modelOutput(),
    private readonly failWith?: LocalInferenceError,
  ) {}

  async generate(_prompt: string): Promise<LocalInferenceOutput> {
    this.calls += 1;
    if (this.failWith) throw this.failWith;
    return {
      text: this.text,
      modelDigest: "a".repeat(64),
      finishReason: "eos",
    };
  }
}

function guarded(
  core: AnchorCore,
  backend: InferenceBackend,
  now: () => number = () => FIXED_NOW,
) {
  return new GuardedArchonInference({
    core,
    backend,
    resourcePolicy,
    now,
  });
}

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("guarded Archon inference", () => {
  it("defers without calling the model when resource evidence is missing", async () => {
    const environment = await newEnvironment();
    const backend = new TestInferenceBackend();
    const result = await guarded(environment.core, backend).propose({
      instanceId: INSTANCE_ID,
      requestText: "Move the participant.",
      resourceSnapshot: null,
    });
    assert.equal(result.status, "DEFERRED_RESOURCE");
    assert.equal(backend.calls, 0);
  });

  it("reports a missing local checkpoint instead of substituting output", async () => {
    const environment = await newEnvironment();
    const backend = new TestInferenceBackend(
      undefined,
      new LocalInferenceError(
        "CHECKPOINT_UNAVAILABLE",
        "No inference-ready checkpoint is available.",
      ),
    );
    const result = await guarded(environment.core, backend).propose({
      instanceId: INSTANCE_ID,
      requestText: "Move the participant.",
      resourceSnapshot: fixtureSnapshot(),
    });
    assert.equal(result.status, "CHECKPOINT_UNAVAILABLE");
    assert.equal(backend.calls, 1);
  });

  it("replays the captured proposal, refreshes evidence, then requires exact human approval", async () => {
    const environment = await newEnvironment();
    const backend = new TestInferenceBackend();
    const service = guarded(environment.core, backend);
    const proposed = await service.propose({
      instanceId: INSTANCE_ID,
      requestText: "Move the participant.",
      resourceSnapshot: fixtureSnapshot(),
    });
    assert.equal(proposed.status, "READY_FOR_HUMAN");
    if (proposed.status !== "READY_FOR_HUMAN") return;

    const replay = await service.replay(proposed.record);
    assert.equal(replay.status, "REPLAYED");
    assert.equal(backend.calls, 1);

    const refreshed = await service.refreshResourceContext(
      proposed.record,
      fixtureSnapshot({ snapshotId: "fixture-only-refreshed-snapshot" }),
    );
    assert.equal(refreshed.status, "READY_FOR_HUMAN");
    if (refreshed.status !== "READY_FOR_HUMAN") return;
    assert.notEqual(
      refreshed.authorizationIntent.proposalDigest,
      proposed.authorizationIntent.proposalDigest,
    );
    assert.equal(backend.calls, 1);

    const authorization = signed(refreshed.authorizationIntent);
    const committed = await service.commit(
      refreshed.record,
      authorization,
      fixtureSnapshot({ snapshotId: "fixture-only-refreshed-snapshot" }),
    );
    assert.equal(committed.status, "COMMITTED");
    if (committed.status !== "COMMITTED") return;
    assert.equal(committed.receipt.state.revision, 1);
    assert.equal(committed.receipt.state.participants[HUMAN_ID]?.coordinates.x.value, 1);

    const ledgerRead = await environment.ledger.read(INSTANCE_ID);
    assert.ok(ledgerRead);
    assert.equal(
      ledgerRead?.events[1]?.proposal?.proposalId,
      refreshed.record.batch.proposalId,
    );

    const restartedCore = new AnchorCore({
      ledger: new FileAnchorLedger({
        directory: environment.directory,
        key: environment.key,
      }),
      policy: environment.policy,
      mathOperator: testMathOperator,
      transitionPolicy: testTransitionPolicy,
      now: () => FIXED_NOW,
    });
    const restartedState = await restartedCore.getState(INSTANCE_ID);
    assert.equal(restartedState.ok, true);
    if (restartedState.ok) {
      assert.equal(restartedState.value.stateDigest, committed.receipt.state.stateDigest);
      assert.equal(restartedState.value.revision, 1);
    }
  });

  it("keeps G4LO unresolved semantics fail-closed", async () => {
    const environment = await newEnvironment(false);
    const backend = new TestInferenceBackend();
    const result = await guarded(environment.core, backend).propose({
      instanceId: INSTANCE_ID,
      requestText: "Move the participant.",
      resourceSnapshot: fixtureSnapshot(),
    });
    assert.equal(result.status, "ANCHOR_REJECTED");
    if (result.status === "ANCHOR_REJECTED") {
      assert.equal(result.error.code, "UNRESOLVED_PI");
      assert.ok(result.record);
    }
  });

  it("detects tampering with the replay record", async () => {
    const environment = await newEnvironment();
    const service = guarded(environment.core, new TestInferenceBackend());
    const proposed = await service.propose({
      instanceId: INSTANCE_ID,
      requestText: "Move the participant.",
      resourceSnapshot: fixtureSnapshot(),
    });
    assert.equal(proposed.status, "READY_FOR_HUMAN");
    if (proposed.status !== "READY_FOR_HUMAN") return;

    const tampered = structuredClone(proposed.record);
    tampered.audit.resourceSnapshot.availableEnergyLowerBoundJ = 1;
    const replay = await service.replay(tampered);
    assert.equal(replay.status, "INVALID_RECORD");
  });

  it("rejects one of two concurrently approved proposals from the same base state", async () => {
    const environment = await newEnvironment();
    const firstService = guarded(
      environment.core,
      new TestInferenceBackend(modelOutputForX(1)),
    );
    const secondService = guarded(
      environment.core,
      new TestInferenceBackend(modelOutputForX(2)),
    );
    const [first, second] = await Promise.all([
      firstService.propose({
        instanceId: INSTANCE_ID,
        requestText: "Move the participant by one unit.",
        resourceSnapshot: fixtureSnapshot(),
      }),
      secondService.propose({
        instanceId: INSTANCE_ID,
        requestText: "Move the participant by two units.",
        resourceSnapshot: fixtureSnapshot(),
      }),
    ]);
    assert.equal(first.status, "READY_FOR_HUMAN");
    assert.equal(second.status, "READY_FOR_HUMAN");
    if (first.status !== "READY_FOR_HUMAN" || second.status !== "READY_FOR_HUMAN") {
      return;
    }

    const attempts = await Promise.all([
      firstService.commit(
        first.record,
        signed(first.authorizationIntent),
        fixtureSnapshot(),
      ),
      secondService.commit(
        second.record,
        signed(second.authorizationIntent),
        fixtureSnapshot(),
      ),
    ]);
    assert.equal(
      attempts.filter((attempt) => attempt.status === "COMMITTED").length,
      1,
    );
    assert.equal(
      attempts.filter(
        (attempt) =>
          attempt.status === "ANCHOR_REJECTED" &&
          ["REVISION_CONFLICT", "STALE_OR_MISMATCHED_CONTEXT"].includes(
            attempt.error.code,
          ),
      ).length,
      1,
    );
  });
});
