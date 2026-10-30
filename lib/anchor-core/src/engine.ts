import {
  verifyAuthorizationSignature,
} from "./authorization.js";
import { canonicalJson, digestJson, sha256 } from "./canonical.js";
import {
  FileAnchorLedger,
  LedgerError,
  type AnchorLedger,
} from "./ledger.js";
import type {
  AnchorError,
  AnchorErrorCode,
  AnchorPolicy,
  AnchorResult,
  AnchorState,
  AnchorStatePayload,
  AuthorizationAction,
  AuthorizationClaims,
  AuthorizationIntent,
  CommitReceipt,
  CoordinateKey,
  CoordinateVector,
  G4LOEvaluationInput,
  G4LOOperator,
  LedgerEventPayload,
  NormalizedDelta,
  ParticipantProposal,
  PreparedProposal,
  ProposalBatch,
  ResourceMap,
  SignedAuthorization,
  TransitionPolicy,
} from "./types.js";
import { COORDINATE_KEYS } from "./types.js";

class AnchorFault extends Error {
  constructor(
    readonly code: AnchorErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AnchorFault";
  }
}

function ok<T>(value: T): AnchorResult<T> {
  return { ok: true, value };
}

function fail<T>(code: AnchorErrorCode, message: string): AnchorResult<T> {
  return { ok: false, error: { code, message } };
}

function requireValue(
  condition: unknown,
  code: AnchorErrorCode,
  message: string,
): asserts condition {
  if (!condition) throw new AnchorFault(code, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value).sort();
  return (
    keys.length === expected.length &&
    keys.every((key, index) => key === [...expected].sort()[index])
  );
}

function isDigest(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function clone<T>(value: T): T {
  return JSON.parse(canonicalJson(value)) as T;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}

function sortedBatch(batch: ProposalBatch): ProposalBatch {
  return {
    ...batch,
    participants: [...batch.participants].sort((a, b) =>
      a.participantId.localeCompare(b.participantId),
    ),
  };
}

function statePayload(state: AnchorState): AnchorStatePayload {
  return {
    instanceId: state.instanceId,
    schemaVersion: state.schemaVersion,
    policyVersion: state.policyVersion,
    participants: state.participants,
  };
}

function policyDescriptor(policy: AnchorPolicy): unknown {
  return {
    schemaVersion: policy.schemaVersion,
    version: policy.version,
    coordinates: policy.coordinates,
    budgets: policy.budgets,
    smallDisplacement: policy.smallDisplacement ?? null,
    mathSemantics: policy.mathSemantics ?? null,
    transitionSemantics: policy.transitionSemantics ?? null,
    authorizers: policy.authorizers,
    maxAuthorizationLifetimeMs: policy.maxAuthorizationLifetimeMs,
    maxClockSkewMs: policy.maxClockSkewMs,
  };
}

function validatePolicy(policy: AnchorPolicy): void {
  requireValue(
    typeof policy.schemaVersion === "string" &&
      policy.schemaVersion.length > 0 &&
      typeof policy.version === "string" &&
      policy.version.length > 0,
    "INVALID_POLICY",
    "Policy and schema versions are required.",
  );
  requireValue(
    isRecord(policy.coordinates) &&
      hasExactKeys(policy.coordinates, COORDINATE_KEYS),
    "INVALID_POLICY",
    "Policy must define exactly the six G4LO coordinate rules.",
  );
  for (const key of COORDINATE_KEYS) {
    const rule = policy.coordinates[key];
    requireValue(
      isRecord(rule) &&
        typeof rule.unit === "string" &&
        rule.unit.length > 0 &&
        typeof rule.encodingId === "string" &&
        rule.encodingId.length > 0 &&
        Number.isFinite(rule.scale) &&
        rule.scale > 0 &&
        typeof rule.mutable === "boolean",
      "INVALID_POLICY",
      `Coordinate rule "${key}" is incomplete or invalid.`,
    );
    requireValue(
      rule.minimum === undefined || Number.isFinite(rule.minimum),
      "INVALID_POLICY",
      `Coordinate minimum "${key}" must be finite.`,
    );
    requireValue(
      rule.maximum === undefined || Number.isFinite(rule.maximum),
      "INVALID_POLICY",
      `Coordinate maximum "${key}" must be finite.`,
    );
    requireValue(
      rule.minimum === undefined ||
        rule.maximum === undefined ||
        rule.minimum <= rule.maximum,
      "INVALID_POLICY",
      `Coordinate minimum exceeds maximum for "${key}".`,
    );
    requireValue(
      rule.maximumAbsoluteDelta === undefined ||
        (Number.isFinite(rule.maximumAbsoluteDelta) &&
          rule.maximumAbsoluteDelta >= 0),
      "INVALID_POLICY",
      `Maximum delta "${key}" must be finite and nonnegative.`,
    );
  }
  requireValue(
    isRecord(policy.budgets),
    "INVALID_POLICY",
    "Budget rules must be an object.",
  );
  for (const [name, rule] of Object.entries(policy.budgets)) {
    requireValue(
      name.length > 0 &&
        isRecord(rule) &&
        typeof rule.unit === "string" &&
        rule.unit.length > 0 &&
        Number.isFinite(rule.maximum) &&
        rule.maximum >= 0,
      "INVALID_POLICY",
      `Budget rule "${name}" is invalid.`,
    );
  }
  if (policy.smallDisplacement) {
    requireValue(
      Number.isFinite(policy.smallDisplacement.threshold) &&
        policy.smallDisplacement.threshold >= 0 &&
        (policy.smallDisplacement.comparison === "lt" ||
          policy.smallDisplacement.comparison === "lte"),
      "INVALID_POLICY",
      "Small-displacement rule is invalid.",
    );
  }
  requireValue(
    Number.isSafeInteger(policy.maxAuthorizationLifetimeMs) &&
      policy.maxAuthorizationLifetimeMs > 0 &&
      Number.isSafeInteger(policy.maxClockSkewMs) &&
      policy.maxClockSkewMs >= 0,
    "INVALID_POLICY",
    "Authorization lifetime and clock-skew limits are invalid.",
  );
  requireValue(
    isRecord(policy.authorizers) &&
      Object.keys(policy.authorizers).length > 0 &&
      Object.entries(policy.authorizers).every(
        ([humanId, publicKey]) =>
          humanId.trim().length > 0 &&
          typeof publicKey === "string" &&
          publicKey.includes("PUBLIC KEY"),
      ),
    "INVALID_POLICY",
    "At least one trusted human public key is required.",
  );
  canonicalJson(policyDescriptor(policy));
}

function validateCoordinates(
  coordinates: CoordinateVector,
  rules: AnchorPolicy["coordinates"],
): void {
  requireValue(
    isRecord(coordinates) && hasExactKeys(coordinates, COORDINATE_KEYS),
    "INVALID_COORDINATES",
    "Exactly the six G4LO coordinates are required.",
  );
  for (const key of COORDINATE_KEYS) {
    const value = coordinates[key];
    const rule = rules[key];
    requireValue(
      isRecord(value) &&
        hasExactKeys(value, ["value", "unit", "encodingId"]) &&
        typeof value.value === "number" &&
        Number.isFinite(value.value),
      "INVALID_COORDINATES",
      `Coordinate "${key}" must be a finite number.`,
    );
    requireValue(
      value.unit === rule.unit && value.encodingId === rule.encodingId,
      "INVALID_COORDINATES",
      `Coordinate "${key}" does not match its pinned unit and encoding.`,
    );
    requireValue(
      (rule.minimum === undefined || value.value >= rule.minimum) &&
        (rule.maximum === undefined || value.value <= rule.maximum),
      "INVALID_COORDINATES",
      `Coordinate "${key}" is outside its configured bounds.`,
    );
  }
  canonicalJson(coordinates);
}

function validateResources(resources: ResourceMap, policy: AnchorPolicy): void {
  requireValue(
    isRecord(resources) &&
      hasExactKeys(resources, Object.keys(policy.budgets)),
    "INVALID_RESOURCE_BUDGET",
    "Resource usage must provide exactly the configured budget names.",
  );
  for (const [name, rule] of Object.entries(policy.budgets)) {
    const value = resources[name];
    requireValue(
      isRecord(value) &&
        hasExactKeys(value, ["value", "unit"]) &&
        typeof value.value === "number" &&
        Number.isFinite(value.value) &&
        value.value >= 0 &&
        value.unit === rule.unit,
      "INVALID_RESOURCE_BUDGET",
      `Resource "${name}" has an invalid value or unit.`,
    );
    requireValue(
      value.value <= rule.maximum,
      "INVALID_RESOURCE_BUDGET",
      `Resource "${name}" exceeds its configured budget.`,
    );
  }
  canonicalJson(resources);
}

function coordinateValuesEqual(
  left: CoordinateVector,
  right: CoordinateVector,
): boolean {
  return COORDINATE_KEYS.every(
    (key) =>
      left[key].value === right[key].value &&
      left[key].unit === right[key].unit &&
      left[key].encodingId === right[key].encodingId,
  );
}

function resourcesEqual(left: ResourceMap, right: ResourceMap): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function makeAuthorizationIntent(
  action: AuthorizationAction,
  instanceId: string,
  proposalDigest: string,
  context: unknown,
): AuthorizationIntent {
  return {
    action,
    instanceId,
    proposalDigest,
    contextDigest: digestJson(context),
  };
}

function authorizationMatchesIntent(
  authorization: SignedAuthorization,
  intent: AuthorizationIntent,
): boolean {
  return (
    authorization.version === 1 &&
    authorization.action === intent.action &&
    authorization.instanceId === intent.instanceId &&
    authorization.proposalDigest === intent.proposalDigest &&
    authorization.contextDigest === intent.contextDigest &&
    typeof authorization.humanId === "string" &&
    typeof authorization.nonce === "string" &&
    typeof authorization.signature === "string"
  );
}

function catchResult<T>(error: unknown): AnchorResult<T> {
  if (error instanceof AnchorFault) {
    return fail(error.code, error.message);
  }
  if (error instanceof LedgerError) {
    return fail(error.code, error.message);
  }
  return fail("INVALID_INPUT", "Anchor could not process the request.");
}

export function makeGenesisAuthorizationIntent(
  state: AnchorStatePayload,
  policy: AnchorPolicy,
): AuthorizationIntent {
  const proposalDigest = digestJson({ action: "GENESIS", state });
  return makeAuthorizationIntent("GENESIS", state.instanceId, proposalDigest, {
    action: "GENESIS",
    state,
    policyDigest: digestJson(policyDescriptor(policy)),
  });
}

export class AnchorCore {
  private readonly ledger: AnchorLedger;
  private readonly policy: AnchorPolicy;
  private readonly mathOperator?: G4LOOperator;
  private readonly transitionPolicy?: TransitionPolicy;
  private readonly now: () => number;

  constructor(options: {
    ledger: AnchorLedger;
    policy: AnchorPolicy;
    mathOperator?: G4LOOperator;
    transitionPolicy?: TransitionPolicy;
    now?: () => number;
  }) {
    this.ledger = options.ledger;
    validatePolicy(options.policy);
    this.policy = deepFreeze(structuredClone(options.policy));
    if (options.mathOperator) {
      const operator = options.mathOperator;
      const evaluateOperator = operator.evaluate.bind(operator);
      this.mathOperator = Object.freeze({
        id: operator.id,
        version: operator.version,
        numeratorSemanticsId: operator.numeratorSemanticsId,
        evaluate: evaluateOperator,
      });
    }
    if (options.transitionPolicy) {
      const transitionPolicy = options.transitionPolicy;
      const evaluateTransition =
        transitionPolicy.evaluate.bind(transitionPolicy);
      this.transitionPolicy = Object.freeze({
        id: transitionPolicy.id,
        version: transitionPolicy.version,
        evaluate: evaluateTransition,
      });
    }
    this.now = options.now ?? Date.now;
  }

  async getState(instanceId: string): Promise<AnchorResult<AnchorState>> {
    try {
      const record = await this.ledger.read(instanceId);
      if (!record) {
        return fail("INSTANCE_NOT_FOUND", "Anchor instance not found.");
      }
      return ok(record.state);
    } catch (error) {
      return catchResult(error);
    }
  }

  prepareGenesis(
    initialState: AnchorStatePayload,
  ): AnchorResult<AuthorizationIntent> {
    try {
      validatePolicy(this.policy);
      this.validateGenesis(initialState);
      return ok(makeGenesisAuthorizationIntent(initialState, this.policy));
    } catch (error) {
      return catchResult(error);
    }
  }

  async initialize(
    initialState: AnchorStatePayload,
    authorization: SignedAuthorization,
  ): Promise<AnchorResult<AnchorState>> {
    try {
      validatePolicy(this.policy);
      const safeState = clone(initialState);
      const safeAuthorization = clone(authorization);
      this.validateGenesis(safeState);
      const intent = makeGenesisAuthorizationIntent(
        safeState,
        this.policy,
      );
      this.verifyAuthorization(safeAuthorization, intent);
      const event: LedgerEventPayload = {
        kind: "GENESIS",
        instanceId: safeState.instanceId,
        revision: 0,
        schemaVersion: safeState.schemaVersion,
        policyVersion: safeState.policyVersion,
        previousStateDigest: null,
        proposalDigest: intent.proposalDigest,
        contextDigest: intent.contextDigest,
        authorization: safeAuthorization,
        initialState: safeState,
      };
      const result = await this.ledger.initialize(event);
      return ok(result.state);
    } catch (error) {
      return catchResult(error);
    }
  }

  async prepare(
    rawBatch: ProposalBatch,
  ): Promise<AnchorResult<PreparedProposal>> {
    try {
      validatePolicy(this.policy);
      const evaluation = await this.evaluate(rawBatch);
      return ok({
        authorizationIntent: evaluation.intent,
        participantCount: evaluation.batch.participants.length,
        normalizedDeltas: evaluation.normalizedDeltas,
      });
    } catch (error) {
      return catchResult(error);
    }
  }

  async commit(
    rawBatch: ProposalBatch,
    authorization: SignedAuthorization,
  ): Promise<AnchorResult<CommitReceipt>> {
    try {
      validatePolicy(this.policy);
      const evaluation = await this.evaluate(rawBatch);
      const safeAuthorization = clone(authorization);
      this.verifyAuthorization(safeAuthorization, evaluation.intent);

      const event: LedgerEventPayload = {
        kind: "COMMIT",
        instanceId: evaluation.batch.instanceId,
        revision: evaluation.state.revision + 1,
        schemaVersion: evaluation.state.schemaVersion,
        policyVersion: evaluation.state.policyVersion,
        previousStateDigest: evaluation.state.stateDigest,
        proposalDigest: evaluation.intent.proposalDigest,
        contextDigest: evaluation.intent.contextDigest,
        authorization: safeAuthorization,
        proposal: evaluation.batch,
        mathResult: evaluation.mathResult,
      };
      const persisted = await this.ledger.append({
        expectedRevision: evaluation.state.revision,
        expectedStateDigest: evaluation.state.stateDigest,
        expectedLedgerHead: evaluation.state.ledgerHead,
        event,
      });

      return ok({
        state: persisted.state,
        eventId: persisted.eventId,
        proposalDigest: evaluation.intent.proposalDigest,
        mathResultDigest: digestJson(evaluation.mathResult),
      });
    } catch (error) {
      return catchResult(error);
    }
  }

  private validateGenesis(state: AnchorStatePayload): void {
    requireValue(
      isRecord(state) &&
        hasExactKeys(state, [
          "instanceId",
          "schemaVersion",
          "policyVersion",
          "participants",
        ]) &&
        typeof state.instanceId === "string" &&
        state.instanceId.trim().length > 0 &&
        state.instanceId.length <= 256 &&
        state.schemaVersion === this.policy.schemaVersion &&
        state.policyVersion === this.policy.version,
      "INVALID_INPUT",
      "Genesis state identity or policy versions are invalid.",
    );
    requireValue(
      isRecord(state.participants) &&
        Object.keys(state.participants).length >= 1 &&
        Object.keys(state.participants).length <= 11,
      "INVALID_PARTICIPANT_COUNT",
      "Genesis must contain between 1 and 11 participants.",
    );
    for (const [participantId, participant] of Object.entries(
      state.participants,
    )) {
      requireValue(
        participantId.trim().length > 0 &&
          participantId.length <= 256 &&
          isRecord(participant) &&
          hasExactKeys(participant, ["coordinates", "resources"]),
        "INVALID_INPUT",
        "Participant identity or state is invalid.",
      );
      validateCoordinates(participant.coordinates, this.policy.coordinates);
      validateResources(participant.resources, this.policy);
    }
    canonicalJson(state);
  }

  private async evaluate(batchInput: ProposalBatch): Promise<{
    state: AnchorState;
    batch: ProposalBatch;
    intent: AuthorizationIntent;
    normalizedDeltas: NormalizedDelta[];
    mathResult: import("./types.js").JsonValue;
  }> {
    const safeBatchInput = clone(batchInput);
    requireValue(
      isRecord(safeBatchInput) &&
        hasExactKeys(safeBatchInput, [
          "proposalId",
          "instanceId",
          "baseRevision",
          "baseStateDigest",
          "schemaVersion",
          "policyVersion",
          "ledgerHead",
          "participants",
        ]) &&
        typeof safeBatchInput.proposalId === "string" &&
        safeBatchInput.proposalId.trim().length > 0 &&
        safeBatchInput.proposalId.length <= 256 &&
        typeof safeBatchInput.instanceId === "string" &&
        safeBatchInput.instanceId.trim().length > 0 &&
        safeBatchInput.instanceId.length <= 256 &&
        Number.isSafeInteger(safeBatchInput.baseRevision) &&
        isDigest(safeBatchInput.baseStateDigest) &&
        isDigest(safeBatchInput.ledgerHead) &&
        typeof safeBatchInput.schemaVersion === "string" &&
        typeof safeBatchInput.policyVersion === "string",
      "INVALID_INPUT",
      "Proposal and instance identities are required.",
    );
    const current = await this.ledger.read(safeBatchInput.instanceId);
    requireValue(
      current,
      "INSTANCE_NOT_FOUND",
      "Anchor instance not found.",
    );
    const state = current.state;
    requireValue(
      safeBatchInput.baseRevision === state.revision &&
        safeBatchInput.baseStateDigest === state.stateDigest &&
        safeBatchInput.ledgerHead === state.ledgerHead &&
        safeBatchInput.schemaVersion === state.schemaVersion &&
        safeBatchInput.policyVersion === state.policyVersion &&
        safeBatchInput.schemaVersion === this.policy.schemaVersion &&
        safeBatchInput.policyVersion === this.policy.version,
      "STALE_OR_MISMATCHED_CONTEXT",
      "Proposal is not bound to the current state and pinned policy.",
    );
    requireValue(
      Array.isArray(safeBatchInput.participants) &&
        safeBatchInput.participants.length >= 1 &&
        safeBatchInput.participants.length <= 11,
      "INVALID_PARTICIPANT_COUNT",
      "A proposal must include between 1 and 11 participants.",
    );

    const batch = sortedBatch(safeBatchInput);
    const seenParticipants = new Set<string>();
    const normalizedDeltas: NormalizedDelta[] = [];
    const operatorInput: G4LOEvaluationInput["participants"] = [];
    let anyChange = false;

    for (const proposal of batch.participants) {
      requireValue(
        isRecord(proposal) &&
          hasExactKeys(proposal, [
            "participantId",
            "coordinates",
            "resources",
          ]) &&
          typeof proposal.participantId === "string" &&
          proposal.participantId.trim().length > 0 &&
          proposal.participantId.length <= 256 &&
          !seenParticipants.has(proposal.participantId),
        "INVALID_INPUT",
        "Participant identities must be nonempty and unique.",
      );
      seenParticipants.add(proposal.participantId);
      const previous = state.participants[proposal.participantId];
      requireValue(
        previous,
        "INVALID_INPUT",
        `Participant "${proposal.participantId}" is not in the pinned state.`,
      );
      validateCoordinates(proposal.coordinates, this.policy.coordinates);
      validateResources(proposal.resources, this.policy);

      const normalized = {} as Record<CoordinateKey, number>;
      const deltas = {} as Record<CoordinateKey, number>;
      for (const key of COORDINATE_KEYS) {
        const rule = this.policy.coordinates[key];
        const proposed = proposal.coordinates[key].value;
        const prior = previous.coordinates[key].value;
        const delta = proposed - prior;
        requireValue(
          Number.isFinite(delta),
          "INVALID_COORDINATES",
          `Coordinate delta "${key}" is non-finite.`,
        );
        requireValue(
          rule.mutable || delta === 0,
          "INVALID_COORDINATES",
          `Coordinate "${key}" is immutable under this policy.`,
        );
        requireValue(
          rule.maximumAbsoluteDelta === undefined ||
            Math.abs(delta) <= rule.maximumAbsoluteDelta,
          "INVALID_COORDINATES",
          `Coordinate delta "${key}" exceeds its configured limit.`,
        );
        deltas[key] = delta;
        normalized[key] = delta / rule.scale;
        requireValue(
          Number.isFinite(normalized[key]),
          "INVALID_COORDINATES",
          `Normalized coordinate delta "${key}" is non-finite.`,
        );
      }
      const magnitude = Math.hypot(
        ...COORDINATE_KEYS.map((key) => normalized[key]),
      );
      requireValue(
        Number.isFinite(magnitude),
        "INVALID_COORDINATES",
        "Normalized displacement magnitude is non-finite.",
      );
      const coordinatesUnchanged = coordinateValuesEqual(
        proposal.coordinates,
        previous.coordinates,
      );
      const resourcesUnchanged = resourcesEqual(
        proposal.resources,
        previous.resources,
      );
      if (!coordinatesUnchanged || !resourcesUnchanged) anyChange = true;
      normalizedDeltas.push({
        participantId: proposal.participantId,
        values: normalized,
        magnitude,
      });
      operatorInput.push({
        participantId: proposal.participantId,
        previous: previous.coordinates,
        proposed: proposal.coordinates,
        normalizedDelta: normalized,
        denominator: magnitude,
      });
    }

    requireValue(
      anyChange,
      "NO_OP",
      "Proposal does not change any participant state.",
    );
    requireValue(
      this.policy.smallDisplacement,
      "THRESHOLD_UNCONFIGURED",
      "A small-displacement threshold and comparator must be configured.",
    );
    for (const delta of normalizedDeltas) {
      requireValue(
        delta.magnitude > 0,
        "UNDEFINED_DENOMINATOR",
        `Participant "${delta.participantId}" has a zero displacement denominator.`,
      );
      const small =
        this.policy.smallDisplacement.comparison === "lt"
          ? delta.magnitude < this.policy.smallDisplacement.threshold
          : delta.magnitude <= this.policy.smallDisplacement.threshold;
      requireValue(
        !small,
        "SMALL_DISPLACEMENT",
        `Participant "${delta.participantId}" is below the configured displacement threshold.`,
      );
    }
    requireValue(
      this.policy.mathSemantics?.numeratorSemanticsId,
      "NUMERATOR_SEMANTICS_UNCONFIGURED",
      "Numerator semantics are not configured and versioned.",
    );
    requireValue(
      this.policy.mathSemantics?.piOperatorId &&
        this.policy.mathSemantics.piOperatorVersion &&
        this.mathOperator &&
        this.mathOperator.id === this.policy.mathSemantics.piOperatorId &&
        this.mathOperator.version ===
          this.policy.mathSemantics.piOperatorVersion,
      "UNRESOLVED_PI",
      "No matching, versioned Pi operator is configured.",
    );
    requireValue(
      this.mathOperator.numeratorSemanticsId ===
        this.policy.mathSemantics.numeratorSemanticsId,
      "NUMERATOR_SEMANTICS_UNCONFIGURED",
      "Pi operator numerator semantics do not match the pinned policy.",
    );
    requireValue(
      this.policy.transitionSemantics &&
        this.transitionPolicy &&
        this.transitionPolicy.id === this.policy.transitionSemantics.id &&
        this.transitionPolicy.version ===
          this.policy.transitionSemantics.version,
      "TRANSITION_POLICY_UNCONFIGURED",
      "No matching, versioned transition policy is configured.",
    );

    const proposalDigest = digestJson(batch);
    const mathInput: G4LOEvaluationInput = {
      instanceId: batch.instanceId,
      proposalId: batch.proposalId,
      baseRevision: state.revision,
      baseStateDigest: state.stateDigest,
      participants: operatorInput,
    };
    let mathResult: import("./types.js").JsonValue;
    try {
      const output = this.mathOperator.evaluate(
        deepFreeze(clone(mathInput)),
      );
      mathResult = JSON.parse(canonicalJson(output)) as import("./types.js").JsonValue;
    } catch {
      throw new AnchorFault(
        "UNRESOLVED_PI",
        "The configured Pi operator failed to produce a finite JSON result.",
      );
    }
    let transition;
    try {
      transition = this.transitionPolicy.evaluate({
        currentState: deepFreeze(clone(state)),
        proposal: deepFreeze(clone(batch)),
        mathResult: deepFreeze(clone(mathResult)),
      });
    } catch {
      throw new AnchorFault(
        "TRANSITION_REJECTED",
        "The configured transition policy failed.",
      );
    }
    requireValue(
      isRecord(transition) &&
        typeof transition.accepted === "boolean" &&
        (transition.reason === undefined ||
          typeof transition.reason === "string"),
      "TRANSITION_REJECTED",
      "Transition policy returned an invalid decision.",
    );
    requireValue(
      transition.accepted,
      "TRANSITION_REJECTED",
      transition.reason ?? "Transition policy rejected the proposal.",
    );

    const intent = makeAuthorizationIntent(
      "COMMIT",
      batch.instanceId,
      proposalDigest,
      {
        action: "COMMIT",
        proposalDigest,
        baseRevision: state.revision,
        baseStateDigest: state.stateDigest,
        ledgerHead: state.ledgerHead,
        schemaVersion: state.schemaVersion,
        policyVersion: state.policyVersion,
        policyDigest: digestJson(policyDescriptor(this.policy)),
        mathResultDigest: digestJson(mathResult),
        transitionPolicy: this.policy.transitionSemantics,
        transitionDecision: transition,
      },
    );

    return {
      state,
      batch,
      intent,
      normalizedDeltas,
      mathResult,
    };
  }

  private verifyAuthorization(
    authorization: SignedAuthorization,
    intent: AuthorizationIntent,
  ): void {
    requireValue(
      isRecord(authorization) &&
        authorizationMatchesIntent(authorization, intent),
      "UNAUTHORIZED",
      "Authorization is not bound to this exact proposal and context.",
    );
    requireValue(
      /^[A-Za-z0-9_-]{16,128}$/.test(authorization.nonce) &&
        Number.isSafeInteger(authorization.issuedAt) &&
        Number.isSafeInteger(authorization.expiresAt),
      "UNAUTHORIZED",
      "Authorization claims are invalid.",
    );
    const now = this.now();
    requireValue(
      authorization.issuedAt <= now + this.policy.maxClockSkewMs &&
        authorization.expiresAt > now &&
        authorization.expiresAt > authorization.issuedAt &&
        authorization.expiresAt - authorization.issuedAt <=
          this.policy.maxAuthorizationLifetimeMs,
      "AUTHORIZATION_EXPIRED",
      "Authorization is expired or outside the permitted lifetime.",
    );
    const publicKey = this.policy.authorizers[authorization.humanId];
    requireValue(
      publicKey &&
        verifyAuthorizationSignature(authorization, publicKey),
      "UNAUTHORIZED",
      "Authorization signature is invalid or the signer is not trusted.",
    );
    canonicalJson(authorization);
  }
}

export function normalizeCoordinateVector(
  coordinates: CoordinateVector,
): CoordinateVector {
  const copy = clone(coordinates);
  return Object.fromEntries(
    COORDINATE_KEYS.map((key) => [
      key,
      {
        value: copy[key].value,
        unit: copy[key].unit,
        encodingId: copy[key].encodingId,
      },
    ]),
  ) as CoordinateVector;
}

export function isValidCoordinateKey(value: string): value is CoordinateKey {
  return (COORDINATE_KEYS as readonly string[]).includes(value);
}
