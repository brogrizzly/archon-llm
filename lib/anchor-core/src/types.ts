export const COORDINATE_KEYS = ["x", "y", "t", "d", "a", "e"] as const;

export type CoordinateKey = (typeof COORDINATE_KEYS)[number];
export type JsonPrimitive = null | boolean | number | string;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type Digest = string;

export interface CoordinateValue {
  value: number;
  unit: string;
  encodingId: string;
}

export type CoordinateVector = Record<CoordinateKey, CoordinateValue>;

export interface ResourceValue {
  value: number;
  unit: string;
}

export type ResourceMap = Record<string, ResourceValue>;

export interface ParticipantState {
  coordinates: CoordinateVector;
  resources: ResourceMap;
}

export interface AnchorStatePayload {
  instanceId: string;
  schemaVersion: string;
  policyVersion: string;
  participants: Record<string, ParticipantState>;
}

export interface AnchorState extends AnchorStatePayload {
  revision: number;
  stateDigest: Digest;
  ledgerHead: Digest;
}

export interface ParticipantProposal {
  participantId: string;
  coordinates: CoordinateVector;
  resources: ResourceMap;
}

export interface ProposalBatch {
  proposalId: string;
  instanceId: string;
  baseRevision: number;
  baseStateDigest: Digest;
  schemaVersion: string;
  policyVersion: string;
  ledgerHead: Digest;
  participants: ParticipantProposal[];
}

export interface CoordinateRule {
  unit: string;
  encodingId: string;
  scale: number;
  mutable: boolean;
  minimum?: number;
  maximum?: number;
  maximumAbsoluteDelta?: number;
}

export interface ResourceBudgetRule {
  unit: string;
  maximum: number;
}

export interface SmallDisplacementRule {
  threshold: number;
  comparison: "lt" | "lte";
}

export interface PinnedMathSemantics {
  piOperatorId: string;
  piOperatorVersion: string;
  numeratorSemanticsId: string;
}

export interface PinnedTransitionSemantics {
  id: string;
  version: string;
}

export interface AnchorPolicy {
  schemaVersion: string;
  version: string;
  coordinates: Record<CoordinateKey, CoordinateRule>;
  budgets: Record<string, ResourceBudgetRule>;
  smallDisplacement?: SmallDisplacementRule;
  mathSemantics?: PinnedMathSemantics;
  transitionSemantics?: PinnedTransitionSemantics;
  authorizers: Record<string, string>;
  maxAuthorizationLifetimeMs: number;
  maxClockSkewMs: number;
}

export interface NormalizedDelta {
  participantId: string;
  values: Record<CoordinateKey, number>;
  magnitude: number;
}

export interface G4LOEvaluationInput {
  instanceId: string;
  proposalId: string;
  baseRevision: number;
  baseStateDigest: Digest;
  participants: Array<{
    participantId: string;
    previous: CoordinateVector;
    proposed: CoordinateVector;
    normalizedDelta: Record<CoordinateKey, number>;
    denominator: number;
  }>;
}

export interface G4LOOperator {
  id: string;
  version: string;
  numeratorSemanticsId: string;
  evaluate(input: G4LOEvaluationInput): JsonValue;
}

export interface TransitionEvaluationInput {
  currentState: AnchorState;
  proposal: ProposalBatch;
  mathResult: JsonValue;
}

export interface TransitionEvaluation {
  accepted: boolean;
  reason?: string;
}

export interface TransitionPolicy {
  id: string;
  version: string;
  evaluate(input: TransitionEvaluationInput): TransitionEvaluation;
}

export type AuthorizationAction = "GENESIS" | "COMMIT";

export interface AuthorizationClaims {
  version: 1;
  action: AuthorizationAction;
  humanId: string;
  instanceId: string;
  proposalDigest: Digest;
  contextDigest: Digest;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
}

export interface SignedAuthorization extends AuthorizationClaims {
  signature: string;
}

export interface AuthorizationIntent {
  action: AuthorizationAction;
  instanceId: string;
  proposalDigest: Digest;
  contextDigest: Digest;
}

export type AnchorErrorCode =
  | "INVALID_INPUT"
  | "INVALID_PARTICIPANT_COUNT"
  | "INVALID_COORDINATES"
  | "INVALID_RESOURCE_BUDGET"
  | "INVALID_POLICY"
  | "INSTANCE_NOT_FOUND"
  | "INSTANCE_ALREADY_EXISTS"
  | "STALE_OR_MISMATCHED_CONTEXT"
  | "NO_OP"
  | "UNDEFINED_DENOMINATOR"
  | "THRESHOLD_UNCONFIGURED"
  | "SMALL_DISPLACEMENT"
  | "NUMERATOR_SEMANTICS_UNCONFIGURED"
  | "UNRESOLVED_PI"
  | "TRANSITION_POLICY_UNCONFIGURED"
  | "TRANSITION_REJECTED"
  | "UNAUTHORIZED"
  | "AUTHORIZATION_EXPIRED"
  | "REPLAYED_PROPOSAL"
  | "REPLAYED_AUTHORIZATION"
  | "REVISION_CONFLICT"
  | "LEDGER_CORRUPT"
  | "VAULT_ERROR";

export interface AnchorError {
  code: AnchorErrorCode;
  message: string;
}

export type AnchorResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: AnchorError };

export interface GenesisAuthorizationRequest {
  state: AnchorStatePayload;
  authorizationIntent: AuthorizationIntent;
}

export interface PreparedProposal {
  authorizationIntent: AuthorizationIntent;
  participantCount: number;
  normalizedDeltas: NormalizedDelta[];
}

export interface CommitReceipt {
  state: AnchorState;
  eventId: string;
  proposalDigest: Digest;
  mathResultDigest: Digest;
}

export interface LedgerEventPayload {
  kind: "GENESIS" | "COMMIT";
  instanceId: string;
  revision: number;
  schemaVersion: string;
  policyVersion: string;
  previousStateDigest: Digest | null;
  proposalDigest: Digest;
  contextDigest: Digest;
  authorization: SignedAuthorization;
  initialState?: AnchorStatePayload;
  proposal?: ProposalBatch;
  mathResult?: JsonValue;
}

export interface StoredLedgerRecord {
  formatVersion: 1;
  revision: number;
  previousStateDigest: Digest | null;
  stateDigest: Digest;
  previousLedgerHead: Digest | null;
  ledgerHead: Digest;
  eventDigest: Digest;
  proposalDigest: Digest;
  authorizationNonceDigest: Digest;
  iv: string;
  authTag: string;
  ciphertext: string;
}

export interface LedgerReadResult {
  state: AnchorState;
  records: StoredLedgerRecord[];
  events: LedgerEventPayload[];
}

export interface LedgerAppendRequest {
  expectedRevision: number;
  expectedStateDigest: Digest;
  expectedLedgerHead: Digest;
  event: LedgerEventPayload;
}
