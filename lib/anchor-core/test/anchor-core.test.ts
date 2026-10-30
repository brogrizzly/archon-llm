import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  generateKeyPairSync,
  randomBytes,
} from "node:crypto";
import { afterEach, describe, it } from "node:test";
import {
  AnchorCore,
  Aes256GcmVault,
  FileAnchorLedger,
  canonicalJson,
  digestJson,
  makeGenesisAuthorizationIntent,
  signAuthorization,
  type AnchorPolicy,
  type AnchorStatePayload,
  type AuthorizationClaims,
  type CoordinateKey,
  type CoordinateVector,
  type G4LOOperator,
  type ProposalBatch,
  type TransitionPolicy,
} from "../src/index.js";

const keys = generateKeyPairSync("ed25519");
const privateKey = keys.privateKey.export({
  type: "pkcs8",
  format: "pem",
}).toString();
const publicKey = keys.publicKey.export({
  type: "spki",
  format: "pem",
}).toString();
const HUMAN_ID = "human-test";
const FIXED_NOW = 1_800_000_000_000;
const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

function coordinates(
  values: Partial<Record<CoordinateKey, number>> = {},
): CoordinateVector {
  return {
    x: { value: values.x ?? 0, unit: "m", encodingId: "test-x-v1" },
    y: { value: values.y ?? 0, unit: "m", encodingId: "test-y-v1" },
    t: { value: values.t ?? 0, unit: "tick", encodingId: "test-t-v1" },
    d: { value: values.d ?? 0, unit: "state-unit", encodingId: "test-d-v1" },
    a: {
      value: values.a ?? 0,
      unit: "attention-unit",
      encodingId: "test-a-v1",
    },
    e: { value: values.e ?? 0, unit: "energy-unit", encodingId: "test-e-v1" },
  };
}

function budgets(attention = 0) {
  return {
    battery: { value: 100, unit: "percent" },
    memory: { value: 32, unit: "MiB" },
    attention: { value: attention, unit: "attention-unit" },
  };
}

function policy(overrides: Partial<AnchorPolicy> = {}): AnchorPolicy {
  return {
    schemaVersion: "schema-test-v1",
    version: "policy-test-v1",
    coordinates: {
      x: { unit: "m", encodingId: "test-x-v1", scale: 1, mutable: true },
      y: { unit: "m", encodingId: "test-y-v1", scale: 1, mutable: true },
      t: { unit: "tick", encodingId: "test-t-v1", scale: 1, mutable: true },
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
    ...overrides,
  };
}

function initialState(
  instanceId = "instance-test",
  participantIds = [HUMAN_ID],
): AnchorStatePayload {
  return {
    instanceId,
    schemaVersion: "schema-test-v1",
    policyVersion: "policy-test-v1",
    participants: Object.fromEntries(
      participantIds.map((participantId) => [
        participantId,
        { coordinates: coordinates(), resources: budgets() },
      ]),
    ),
  };
}

const testMathOperator: G4LOOperator = {
  id: "test-fixture-only",
  version: "0.0.0-test",
  numeratorSemanticsId: "test-vector-fixture-only",
  evaluate(input) {
    return {
      fixture: "not-g4lo",
      participants: input.participants.map((item) => ({
        participantId: item.participantId,
        denominator: item.denominator,
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

async function newEnvironment(options: {
  policy?: AnchorPolicy;
  mathOperator?: G4LOOperator;
  transitionPolicy?: TransitionPolicy;
  participantIds?: string[];
  instanceId?: string;
} = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), "anchor-core-test-"));
  directories.push(directory);
  const key = randomBytes(32);
  const currentPolicy = options.policy ?? policy();
  const ledger = new FileAnchorLedger({ directory, key });
  const core = new AnchorCore({
    ledger,
    policy: currentPolicy,
    mathOperator: options.mathOperator ?? testMathOperator,
    transitionPolicy: options.transitionPolicy ?? testTransitionPolicy,
    now: () => FIXED_NOW,
  });
  const state = initialState(
    options.instanceId,
    options.participantIds ?? [HUMAN_ID],
  );
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
  return { core, ledger, currentPolicy, directory, key, state };
}

function signed(
  intent: Pick<
    AuthorizationClaims,
    "action" | "instanceId" | "proposalDigest" | "contextDigest"
  >,
  nonce = randomBytes(24).toString("base64url"),
) {
  const claims: AuthorizationClaims = {
    version: 1,
    ...intent,
    humanId: HUMAN_ID,
    nonce,
    issuedAt: FIXED_NOW - 100,
    expiresAt: FIXED_NOW + 30_000,
  };
  return signAuthorization(claims, privateKey);
}

async function batchFromCurrentState(
  core: AnchorCore,
  options: {
    proposalId?: string;
    participantIds?: string[];
    deltaX?: number;
    resources?: ReturnType<typeof budgets>;
  } = {},
): Promise<ProposalBatch> {
  const stateResult = await core.getState("instance-test");
  assert.equal(stateResult.ok, true);
  if (!stateResult.ok) throw new Error(stateResult.error.message);
  const state = stateResult.value;
  const participantIds = options.participantIds ?? [HUMAN_ID];
  return {
    proposalId: options.proposalId ?? "proposal-test",
    instanceId: state.instanceId,
    baseRevision: state.revision,
    baseStateDigest: state.stateDigest,
    schemaVersion: state.schemaVersion,
    policyVersion: state.policyVersion,
    ledgerHead: state.ledgerHead,
    participants: participantIds.map((participantId) => {
      const previous = state.participants[participantId];
      assert.ok(previous);
      const currentValues = Object.fromEntries(
        Object.entries(previous.coordinates).map(([key, coordinate]) => [
          key,
          coordinate.value,
        ]),
      ) as Partial<Record<CoordinateKey, number>>;
      if (participantId === participantIds[0]) {
        currentValues.x = (currentValues.x ?? 0) + (options.deltaX ?? 1);
      }
      return {
        participantId,
        coordinates: coordinates(currentValues),
        resources: options.resources ?? previous.resources,
      };
    }),
  };
}

function signPrepared(
  intent: {
    action: "COMMIT";
    instanceId: string;
    proposalDigest: string;
    contextDigest: string;
  },
  nonce?: string,
) {
  return signed(intent, nonce);
}

describe("canonical serialization", () => {
  it("sorts object keys and produces stable SHA-256 digests", () => {
    assert.equal(canonicalJson({ b: 2, a: 1 }), '{"a":1,"b":2}');
    assert.equal(digestJson({ b: 2, a: 1 }), digestJson({ a: 1, b: 2 }));
  });

  it("rejects non-finite, circular, and non-plain values", () => {
    assert.throws(() => canonicalJson({ n: Number.NaN }));
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    assert.throws(() => canonicalJson(cycle));
    assert.throws(() => canonicalJson(new Date()));
  });
});

describe("AES-256-GCM vault", () => {
  it("authenticates ciphertext and additional data", () => {
    const vault = new Aes256GcmVault(randomBytes(32));
    const encrypted = vault.encrypt("private payload", "bound context");
    assert.equal(
      vault.decrypt(encrypted, "bound context"),
      "private payload",
    );
    assert.throws(() => vault.decrypt(encrypted, "different context"));
    assert.throws(
      () => new Aes256GcmVault(randomBytes(16)),
      /32-byte key/,
    );
    vault.destroy();
    assert.throws(() => vault.encrypt("x", "y"));
  });
});

describe("deterministic Anchor core", () => {
  it("requires signed human authorization for genesis and a commit", async () => {
    const environment = await newEnvironment();
    const batch = await batchFromCurrentState(environment.core);
    const prepared = await environment.core.prepare(batch);
    assert.equal(prepared.ok, true);
    if (!prepared.ok) return;

    const result = await environment.core.commit(
      batch,
      signPrepared(prepared.value.authorizationIntent),
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.state.revision, 1);
    assert.equal(result.value.state.participants[HUMAN_ID]?.coordinates.x.value, 1);
  });

  it("rejects a proposal changed after its authorization was signed", async () => {
    const { core } = await newEnvironment();
    const batch = await batchFromCurrentState(core);
    const prepared = await core.prepare(batch);
    assert.equal(prepared.ok, true);
    if (!prepared.ok) return;
    const authorization = signPrepared(prepared.value.authorizationIntent);
    batch.participants[0]!.coordinates.x.value = 2;
    const result = await core.commit(batch, authorization);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "UNAUTHORIZED");
  });

  it("fails closed when Pi is not configured", async () => {
    const { core, ledger, directory, key } = await newEnvironment({
      mathOperator: undefined,
    });
    const withoutOperator = new AnchorCore({
      ledger,
      policy: policy(),
      transitionPolicy: testTransitionPolicy,
      now: () => FIXED_NOW,
    });
    const result = await withoutOperator.prepare(
      await batchFromCurrentState(core),
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "UNRESOLVED_PI");
    assert.ok(directory.length > 0 && key.length === 32);
  });

  it("fails closed when numerator or threshold semantics are missing", async () => {
    const env = await newEnvironment({
      policy: policy({ mathSemantics: undefined }),
    });
    const noNumerator = await env.core.prepare(
      await batchFromCurrentState(env.core),
    );
    assert.equal(noNumerator.ok, false);
    if (!noNumerator.ok) {
      assert.equal(noNumerator.error.code, "NUMERATOR_SEMANTICS_UNCONFIGURED");
    }

    const thresholdEnv = await newEnvironment({
      policy: policy({ smallDisplacement: undefined }),
    });
    const noThreshold = await thresholdEnv.core.prepare(
      await batchFromCurrentState(thresholdEnv.core),
    );
    assert.equal(noThreshold.ok, false);
    if (!noThreshold.ok) {
      assert.equal(noThreshold.error.code, "THRESHOLD_UNCONFIGURED");
    }
  });

  it("rejects participant-count, stale-context, coordinate-unit, and budget errors", async () => {
    const { core } = await newEnvironment({
      participantIds: Array.from({ length: 11 }, (_, index) => `p-${index}`),
    });
    const valid = await batchFromCurrentState(core, {
      participantIds: ["p-0"],
    });
    const tooMany = {
      ...valid,
      participants: Array.from({ length: 12 }, (_, index) => ({
        ...valid.participants[0]!,
        participantId: `unknown-${index}`,
      })),
    };
    const countResult = await core.prepare(tooMany);
    assert.equal(countResult.ok, false);
    if (!countResult.ok) {
      assert.equal(countResult.error.code, "INVALID_PARTICIPANT_COUNT");
    }

    const staleResult = await core.prepare({
      ...valid,
      baseRevision: valid.baseRevision + 1,
    });
    assert.equal(staleResult.ok, false);
    if (!staleResult.ok) {
      assert.equal(staleResult.error.code, "STALE_OR_MISMATCHED_CONTEXT");
    }

    const wrongUnit = structuredClone(valid);
    wrongUnit.participants[0]!.coordinates.x.unit = "feet";
    const unitResult = await core.prepare(wrongUnit);
    assert.equal(unitResult.ok, false);
    if (!unitResult.ok) {
      assert.equal(unitResult.error.code, "INVALID_COORDINATES");
    }

    const overBudget = structuredClone(valid);
    overBudget.participants[0]!.resources.attention.value = 11;
    const budgetResult = await core.prepare(overBudget);
    assert.equal(budgetResult.ok, false);
    if (!budgetResult.ok) {
      assert.equal(budgetResult.error.code, "INVALID_RESOURCE_BUDGET");
    }
  });

  it("separates all-no-op requests from zero-denominator participant terms", async () => {
    const environment = await newEnvironment({
      participantIds: [HUMAN_ID, "human-2"],
    });
    const noOp = await batchFromCurrentState(environment.core, { deltaX: 0 });
    const noOpResult = await environment.core.prepare(noOp);
    assert.equal(noOpResult.ok, false);
    if (!noOpResult.ok) assert.equal(noOpResult.error.code, "NO_OP");

    const mixed = await batchFromCurrentState(environment.core, {
      participantIds: [HUMAN_ID, "human-2"],
      deltaX: 1,
    });
    mixed.participants[1]!.coordinates = coordinates();
    const zeroTerm = await environment.core.prepare(mixed);
    assert.equal(zeroTerm.ok, false);
    if (!zeroTerm.ok) {
      assert.equal(zeroTerm.error.code, "UNDEFINED_DENOMINATOR");
    }
  });

  it("recovers encrypted state after a new ledger instance reads the journal", async () => {
    const environment = await newEnvironment();
    const batch = await batchFromCurrentState(environment.core);
    const prepared = await environment.core.prepare(batch);
    assert.equal(prepared.ok, true);
    if (!prepared.ok) return;
    const committed = await environment.core.commit(
      batch,
      signPrepared(prepared.value.authorizationIntent),
    );
    assert.equal(committed.ok, true);
    if (!committed.ok) return;

    const restartedLedger = new FileAnchorLedger({
      directory: environment.directory,
      key: environment.key,
    });
    const recovered = await restartedLedger.read("instance-test");
    assert.ok(recovered);
    assert.equal(recovered.state.stateDigest, committed.value.state.stateDigest);
    assert.equal(recovered.state.ledgerHead, committed.value.state.ledgerHead);
    assert.equal(recovered.events.length, 2);
    const file = await readFile(
      path.join(
        environment.directory,
        `${digestJson("instance-test")}.anchor.json`,
      ),
      "utf8",
    ).catch(() => "");
    assert.equal(file, "");
    const entries = await import("node:fs/promises").then((fs) =>
      fs.readdir(environment.directory),
    );
    assert.equal(entries.length, 1);
    const stored = await readFile(
      path.join(environment.directory, entries[0]!),
      "utf8",
    );
    assert.ok(!stored.includes(HUMAN_ID));
    assert.ok(!stored.includes("attention-unit"));
  });

  it("rejects stale concurrent commits and replayed authorization nonces", async () => {
    const environment = await newEnvironment();
    const firstBatch = await batchFromCurrentState(environment.core, {
      proposalId: "proposal-first",
      deltaX: 1,
    });
    const secondBatch = await batchFromCurrentState(environment.core, {
      proposalId: "proposal-second",
      deltaX: 2,
    });
    const [firstPrepared, secondPrepared] = await Promise.all([
      environment.core.prepare(firstBatch),
      environment.core.prepare(secondBatch),
    ]);
    assert.equal(firstPrepared.ok, true);
    assert.equal(secondPrepared.ok, true);
    if (!firstPrepared.ok || !secondPrepared.ok) return;
    const firstAuth = signPrepared(firstPrepared.value.authorizationIntent);
    const secondAuth = signPrepared(secondPrepared.value.authorizationIntent);
    const [first, second] = await Promise.all([
      environment.core.commit(firstBatch, firstAuth),
      environment.core.commit(secondBatch, secondAuth),
    ]);
    assert.equal([first, second].filter((result) => result.ok).length, 1);
    const conflict = [first, second].find((result) => !result.ok);
    assert.ok(conflict && !conflict.ok);
    if (conflict && !conflict.ok) {
      assert.equal(conflict.error.code, "REVISION_CONFLICT");
    }

    const nextBatch = await batchFromCurrentState(environment.core, {
      proposalId: "proposal-third",
      deltaX: 1,
    });
    const nextPrepared = await environment.core.prepare(nextBatch);
    assert.equal(nextPrepared.ok, true);
    if (!nextPrepared.ok) return;
    const replayedNonce = firstAuth.nonce;
    const replayedAuthorization = signPrepared(
      nextPrepared.value.authorizationIntent,
      replayedNonce,
    );
    const replayResult = await environment.core.commit(
      nextBatch,
      replayedAuthorization,
    );
    assert.equal(replayResult.ok, false);
    if (!replayResult.ok) {
      assert.equal(replayResult.error.code, "REPLAYED_AUTHORIZATION");
    }
  });

  it("rejects altered encrypted records and wrong vault keys", async () => {
    const environment = await newEnvironment();
    const files = await import("node:fs/promises").then((fs) =>
      fs.readdir(environment.directory),
    );
    const filePath = path.join(environment.directory, files[0]!);
    const original = JSON.parse(await readFile(filePath, "utf8")) as {
      records: Array<{ ciphertext: string }>;
    };
    original.records[0]!.ciphertext = `${original.records[0]!.ciphertext.slice(0, -2)}AA`;
    const { writeFile } = await import("node:fs/promises");
    await writeFile(filePath, JSON.stringify(original));

    const tampered = new FileAnchorLedger({
      directory: environment.directory,
      key: environment.key,
    });
    await assert.rejects(
      tampered.read("instance-test"),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "LEDGER_CORRUPT",
    );

    const wrongKey = new FileAnchorLedger({
      directory: environment.directory,
      key: randomBytes(32),
    });
    await assert.rejects(wrongKey.read("instance-test"));
  });

  it("pins participant ordering so equivalent batches have stable digests", async () => {
    const environment = await newEnvironment({
      participantIds: ["human-a", "human-b"],
    });
    const batch = await batchFromCurrentState(environment.core, {
      participantIds: ["human-b", "human-a"],
    });
    for (const participant of batch.participants) {
      participant.coordinates.x.value = 1;
    }
    const reversed = {
      ...batch,
      participants: [...batch.participants].reverse(),
    };
    const [first, second] = await Promise.all([
      environment.core.prepare(batch),
      environment.core.prepare(reversed),
    ]);
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    if (first.ok && second.ok) {
      assert.equal(
        first.value.authorizationIntent.proposalDigest,
        second.value.authorizationIntent.proposalDigest,
      );
    }
  });

  it("requires a trusted Ed25519 authorizer", async () => {
    const { core } = await newEnvironment();
    const batch = await batchFromCurrentState(core);
    const prepared = await core.prepare(batch);
    assert.equal(prepared.ok, true);
    if (!prepared.ok) return;
    const invalid = signPrepared(prepared.value.authorizationIntent);
    invalid.signature = Buffer.alloc(64).toString("base64url");
    const result = await core.commit(batch, invalid);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "UNAUTHORIZED");
  });
});
