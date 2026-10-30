import {
  mkdir,
  open,
  readFile,
  rename,
  rm,
} from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  canonicalJson,
  digestJson,
  parseJsonValue,
  sha256,
} from "./canonical.js";
import type {
  AnchorState,
  AnchorStatePayload,
  Digest,
  LedgerAppendRequest,
  LedgerEventPayload,
  LedgerReadResult,
  ParticipantProposal,
  StoredLedgerRecord,
} from "./types.js";
import { Aes256GcmVault, type EncryptedPayload } from "./vault.js";

export class LedgerError extends Error {
  constructor(
    readonly code:
      | "INSTANCE_ALREADY_EXISTS"
      | "INSTANCE_NOT_FOUND"
      | "REVISION_CONFLICT"
      | "REPLAYED_PROPOSAL"
      | "REPLAYED_AUTHORIZATION"
      | "LEDGER_CORRUPT",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "LedgerError";
  }
}

export interface AnchorLedger {
  read(instanceId: string): Promise<LedgerReadResult | null>;
  initialize(event: LedgerEventPayload): Promise<{
    state: AnchorState;
    eventId: string;
  }>;
  append(request: LedgerAppendRequest): Promise<{
    state: AnchorState;
    eventId: string;
  }>;
}

interface LedgerFile {
  formatVersion: 1;
  records: StoredLedgerRecord[];
}

interface RecordMetadata
  extends Omit<StoredLedgerRecord, "iv" | "authTag" | "ciphertext"> {}

const ZERO_HEAD = "0".repeat(64);
const locks = new Map<string, Promise<void>>();

function withPathLock<T>(filePath: string, operation: () => Promise<T>): Promise<T> {
  const previous = locks.get(filePath) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  locks.set(filePath, current);

  return previous.then(async () => {
    try {
      return await operation();
    } finally {
      release();
      if (locks.get(filePath) === current) locks.delete(filePath);
    }
  });
}

function metadataOf(record: StoredLedgerRecord): RecordMetadata {
  return {
    formatVersion: record.formatVersion,
    revision: record.revision,
    previousStateDigest: record.previousStateDigest,
    stateDigest: record.stateDigest,
    previousLedgerHead: record.previousLedgerHead,
    ledgerHead: record.ledgerHead,
    eventDigest: record.eventDigest,
    proposalDigest: record.proposalDigest,
    authorizationNonceDigest: record.authorizationNonceDigest,
  };
}

function makeStatePayload(event: LedgerEventPayload): AnchorStatePayload {
  if (event.kind !== "GENESIS" || !event.initialState) {
    throw new LedgerError("LEDGER_CORRUPT", "Invalid genesis event payload.");
  }
  return event.initialState;
}

function applyProposal(
  current: AnchorStatePayload,
  proposal: ProposalBatchFromEvent,
): AnchorStatePayload {
  const participants = { ...current.participants };
  for (const participant of proposal.participants) {
    participants[participant.participantId] = {
      coordinates: participant.coordinates,
      resources: participant.resources,
    };
  }
  return {
    instanceId: current.instanceId,
    schemaVersion: current.schemaVersion,
    policyVersion: current.policyVersion,
    participants,
  };
}

type ProposalBatchFromEvent = NonNullable<LedgerEventPayload["proposal"]>;

function statePayloadForEvent(
  event: LedgerEventPayload,
  current: AnchorStatePayload | null,
): AnchorStatePayload {
  if (event.kind === "GENESIS") {
    const genesis = makeStatePayload(event);
    if (
      event.revision !== 0 ||
      event.instanceId !== genesis.instanceId ||
      event.schemaVersion !== genesis.schemaVersion ||
      event.policyVersion !== genesis.policyVersion
    ) {
      throw new LedgerError("LEDGER_CORRUPT", "Genesis metadata mismatch.");
    }
    return genesis;
  }
  if (!current || !event.proposal) {
    throw new LedgerError("LEDGER_CORRUPT", "Commit event has no prior state.");
  }
  if (event.instanceId !== current.instanceId) {
    throw new LedgerError("LEDGER_CORRUPT", "Event instance does not match.");
  }
  if (
    event.schemaVersion !== current.schemaVersion ||
    event.policyVersion !== current.policyVersion ||
    event.proposal?.schemaVersion !== current.schemaVersion ||
    event.proposal?.policyVersion !== current.policyVersion
  ) {
    throw new LedgerError("LEDGER_CORRUPT", "Commit policy metadata mismatch.");
  }
  return applyProposal(current, event.proposal);
}

function makeLedgerHead(
  instanceId: string,
  revision: number,
  previousLedgerHead: Digest | null,
  eventDigest: Digest,
  stateDigest: Digest,
): Digest {
  return digestJson({
    instanceId,
    revision,
    previousLedgerHead,
    eventDigest,
    stateDigest,
  });
}

function asStoredRecord(value: unknown): StoredLedgerRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new LedgerError("LEDGER_CORRUPT", "Ledger record is not an object.");
  }
  const item = value as Record<string, unknown>;
  const stringFields = [
    "stateDigest",
    "ledgerHead",
    "eventDigest",
    "proposalDigest",
    "authorizationNonceDigest",
    "iv",
    "authTag",
    "ciphertext",
  ] as const;
  const digestFields = [
    "stateDigest",
    "ledgerHead",
    "eventDigest",
    "proposalDigest",
    "authorizationNonceDigest",
  ] as const;
  for (const field of stringFields) {
    if (typeof item[field] !== "string") {
      throw new LedgerError("LEDGER_CORRUPT", `Invalid ${field} in ledger.`);
    }
  }
  for (const field of digestFields) {
    if (!/^[a-f0-9]{64}$/.test(item[field] as string)) {
      throw new LedgerError("LEDGER_CORRUPT", `Invalid ${field} digest.`);
    }
  }
  if (
    item.formatVersion !== 1 ||
    !Number.isSafeInteger(item.revision) ||
    (item.previousStateDigest !== null &&
      typeof item.previousStateDigest !== "string") ||
    (item.previousLedgerHead !== null &&
      typeof item.previousLedgerHead !== "string")
  ) {
    throw new LedgerError("LEDGER_CORRUPT", "Invalid ledger metadata.");
  }
  return item as unknown as StoredLedgerRecord;
}

function asEvent(value: unknown): LedgerEventPayload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new LedgerError("LEDGER_CORRUPT", "Decrypted event is not an object.");
  }
  const event = value as Partial<LedgerEventPayload>;
  if (
    (event.kind !== "GENESIS" && event.kind !== "COMMIT") ||
    typeof event.instanceId !== "string" ||
    !Number.isSafeInteger(event.revision) ||
    typeof event.schemaVersion !== "string" ||
    typeof event.policyVersion !== "string" ||
    typeof event.proposalDigest !== "string" ||
    !/^[a-f0-9]{64}$/.test(event.contextDigest ?? "") ||
    typeof event.authorization !== "object" ||
    event.authorization === null ||
    event.authorization.version !== 1 ||
    (event.authorization.action !== "GENESIS" &&
      event.authorization.action !== "COMMIT") ||
    typeof event.authorization.humanId !== "string" ||
    typeof event.authorization.instanceId !== "string" ||
    typeof event.authorization.proposalDigest !== "string" ||
    typeof event.authorization.contextDigest !== "string" ||
    typeof event.authorization.nonce !== "string" ||
    typeof event.authorization.signature !== "string" ||
    !Number.isSafeInteger(event.authorization.issuedAt) ||
    !Number.isSafeInteger(event.authorization.expiresAt)
  ) {
    throw new LedgerError("LEDGER_CORRUPT", "Invalid decrypted event.");
  }
  return event as LedgerEventPayload;
}

function checkEventMatchesRecord(
  event: LedgerEventPayload,
  record: StoredLedgerRecord,
): void {
  if (
    event.revision !== record.revision ||
    event.proposalDigest !== record.proposalDigest ||
    sha256(event.authorization.nonce) !== record.authorizationNonceDigest ||
    event.authorization.instanceId !== event.instanceId ||
    event.authorization.proposalDigest !== event.proposalDigest ||
    event.authorization.contextDigest !== event.contextDigest ||
    event.authorization.action !== event.kind
  ) {
    throw new LedgerError(
      "LEDGER_CORRUPT",
      "Encrypted event does not match ledger metadata.",
    );
  }
}

export class FileAnchorLedger implements AnchorLedger {
  private readonly directory: string;
  private readonly vault: Aes256GcmVault;

  constructor(options: { directory: string; key: Uint8Array }) {
    if (options.directory.length === 0) {
      throw new TypeError("A ledger directory is required.");
    }
    this.directory = path.resolve(options.directory);
    this.vault = new Aes256GcmVault(options.key);
  }

  async read(instanceId: string): Promise<LedgerReadResult | null> {
    this.validateInstanceId(instanceId);
    const filePath = this.filePath(instanceId);
    return withPathLock(filePath, () => this.readUnlocked(instanceId, filePath));
  }

  async initialize(event: LedgerEventPayload): Promise<{
    state: AnchorState;
    eventId: string;
  }> {
    if (event.kind !== "GENESIS" || event.revision !== 0) {
      throw new LedgerError(
        "LEDGER_CORRUPT",
        "The first ledger event must be a revision-zero genesis event.",
      );
    }
    this.validateInstanceId(event.instanceId);
    const filePath = this.filePath(event.instanceId);
    return withPathLock(filePath, async () => {
      if (await this.fileExists(filePath)) {
        throw new LedgerError(
          "INSTANCE_ALREADY_EXISTS",
          "An Anchor instance with this identity already exists.",
        );
      }
      const payload = makeStatePayload(event);
      if (payload.instanceId !== event.instanceId) {
        throw new LedgerError("LEDGER_CORRUPT", "Genesis instance mismatch.");
      }
      const eventRecord = this.createRecord(event, payload, null);
      await this.writeRecords(filePath, [eventRecord.record]);
      const state: AnchorState = {
        ...payload,
        revision: 0,
        stateDigest: eventRecord.record.stateDigest,
        ledgerHead: eventRecord.record.ledgerHead,
      };
      return { state, eventId: eventRecord.record.ledgerHead };
    });
  }

  async append(request: LedgerAppendRequest): Promise<{
    state: AnchorState;
    eventId: string;
  }> {
    const event = request.event;
    if (event.kind !== "COMMIT") {
      throw new LedgerError("LEDGER_CORRUPT", "Only commit events may append.");
    }
    this.validateInstanceId(event.instanceId);
    const filePath = this.filePath(event.instanceId);
    return withPathLock(filePath, async () => {
      const current = await this.readUnlocked(event.instanceId, filePath);
      if (!current) {
        throw new LedgerError("INSTANCE_NOT_FOUND", "Anchor instance not found.");
      }
      if (
        current.state.revision !== request.expectedRevision ||
        current.state.stateDigest !== request.expectedStateDigest ||
        current.state.ledgerHead !== request.expectedLedgerHead
      ) {
        throw new LedgerError(
          "REVISION_CONFLICT",
          "The Anchor state changed before this proposal could be committed.",
        );
      }
      if (
        event.revision !== current.state.revision + 1 ||
        event.previousStateDigest !== current.state.stateDigest ||
        event.schemaVersion !== current.state.schemaVersion ||
        event.policyVersion !== current.state.policyVersion
      ) {
        throw new LedgerError(
          "REVISION_CONFLICT",
          "Commit event does not match the current state.",
        );
      }
      if (
        current.records.some(
          (record) => record.proposalDigest === event.proposalDigest,
        )
      ) {
        throw new LedgerError(
          "REPLAYED_PROPOSAL",
          "This proposal has already been committed.",
        );
      }
      const nonceDigest = sha256(event.authorization.nonce);
      if (
        current.records.some(
          (record) => record.authorizationNonceDigest === nonceDigest,
        )
      ) {
        throw new LedgerError(
          "REPLAYED_AUTHORIZATION",
          "This authorization nonce has already been used.",
        );
      }
      const currentPayload = this.statePayload(current.state);
      const nextPayload = statePayloadForEvent(event, currentPayload);
      const made = this.createRecord(event, nextPayload, current.state);
      await this.writeRecords(filePath, [...current.records, made.record]);
      const state: AnchorState = {
        ...nextPayload,
        revision: made.record.revision,
        stateDigest: made.record.stateDigest,
        ledgerHead: made.record.ledgerHead,
      };
      return { state, eventId: made.record.ledgerHead };
    });
  }

  destroy(): void {
    this.vault.destroy();
  }

  private createRecord(
    event: LedgerEventPayload,
    state: AnchorStatePayload,
    previous: AnchorState | null,
  ): { record: StoredLedgerRecord } {
    const stateDigest = digestJson(state);
    const eventDigest = digestJson(event);
    const previousLedgerHead = previous?.ledgerHead ?? null;
    const previousStateDigest = previous?.stateDigest ?? null;
    const ledgerHead = makeLedgerHead(
      event.instanceId,
      event.revision,
      previousLedgerHead,
      eventDigest,
      stateDigest,
    );
    const authorizationNonceDigest = sha256(event.authorization.nonce);
    const metadata: RecordMetadata = {
      formatVersion: 1,
      revision: event.revision,
      previousStateDigest,
      stateDigest,
      previousLedgerHead,
      ledgerHead,
      eventDigest,
      proposalDigest: event.proposalDigest,
      authorizationNonceDigest,
    };
    const additionalData = canonicalJson(metadata);
    const encrypted: EncryptedPayload = this.vault.encrypt(
      canonicalJson(event),
      additionalData,
    );
    return { record: { ...metadata, ...encrypted } };
  }

  private async readUnlocked(
    instanceId: string,
    filePath: string,
  ): Promise<LedgerReadResult | null> {
    let file: LedgerFile;
    try {
      const raw = await readFile(filePath, "utf8");
      const parsed = parseJsonValue(raw);
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed) ||
        parsed.formatVersion !== 1 ||
        !Array.isArray(parsed.records)
      ) {
        throw new LedgerError("LEDGER_CORRUPT", "Invalid ledger file format.");
      }
      file = {
        formatVersion: 1,
        records: parsed.records.map(asStoredRecord),
      };
    } catch (error) {
      if (hasCode(error, "ENOENT")) return null;
      if (error instanceof LedgerError) throw error;
      throw new LedgerError("LEDGER_CORRUPT", "Unable to read ledger.", {
        cause: error,
      });
    }

    if (file.records.length === 0) {
      throw new LedgerError("LEDGER_CORRUPT", "Ledger has no genesis event.");
    }

    const events: LedgerEventPayload[] = [];
    let previousStatePayload: AnchorStatePayload | null = null;
    let previousState: AnchorState | null = null;
    let previousLedgerHead: Digest | null = null;
    const seenNonces = new Set<string>();
    const seenProposals = new Set<string>();

    for (let index = 0; index < file.records.length; index += 1) {
      const record = file.records[index];
      if (!record) {
        throw new LedgerError("LEDGER_CORRUPT", "Missing ledger record.");
      }
      if (
        record.revision !== index ||
        record.previousLedgerHead !== previousLedgerHead ||
        record.previousStateDigest !== (previousState?.stateDigest ?? null)
      ) {
        throw new LedgerError("LEDGER_CORRUPT", "Ledger chain is broken.");
      }
      let event: LedgerEventPayload;
      try {
        const plaintext = this.vault.decrypt(
          {
            iv: record.iv,
            authTag: record.authTag,
            ciphertext: record.ciphertext,
          },
          canonicalJson(metadataOf(record)),
        );
        event = asEvent(parseJsonValue(plaintext));
      } catch (error) {
        throw new LedgerError(
          "LEDGER_CORRUPT",
          "Ledger event could not be authenticated.",
          { cause: error },
        );
      }
      if (event.instanceId !== instanceId) {
        throw new LedgerError(
          "LEDGER_CORRUPT",
          "Ledger file contains an event for another instance.",
        );
      }
      checkEventMatchesRecord(event, record);
      if (digestJson(event) !== record.eventDigest) {
        throw new LedgerError("LEDGER_CORRUPT", "Event digest mismatch.");
      }
      if (
        event.kind === "COMMIT" &&
        (!event.proposal ||
          digestJson(event.proposal) !== event.proposalDigest ||
          event.proposal.instanceId !== event.instanceId ||
          event.proposal.baseRevision !== previousState?.revision ||
          event.proposal.baseStateDigest !== previousState?.stateDigest ||
          event.proposal.ledgerHead !== previousState?.ledgerHead)
      ) {
        throw new LedgerError(
          "LEDGER_CORRUPT",
          "Commit proposal does not match its captured base context.",
        );
      }
      const statePayload = statePayloadForEvent(event, previousStatePayload);
      const expectedStateDigest = digestJson(statePayload);
      if (expectedStateDigest !== record.stateDigest) {
        throw new LedgerError("LEDGER_CORRUPT", "State digest mismatch.");
      }
      const expectedHead = makeLedgerHead(
        event.instanceId,
        event.revision,
        record.previousLedgerHead,
        record.eventDigest,
        record.stateDigest,
      );
      if (expectedHead !== record.ledgerHead) {
        throw new LedgerError("LEDGER_CORRUPT", "Ledger head mismatch.");
      }
      if (
        event.kind === "GENESIS" &&
        (index !== 0 || event.revision !== 0 || previousStatePayload !== null)
      ) {
        throw new LedgerError("LEDGER_CORRUPT", "Invalid genesis placement.");
      }
      if (event.kind === "COMMIT" && !previousStatePayload) {
        throw new LedgerError("LEDGER_CORRUPT", "Commit precedes genesis.");
      }
      if (
        seenNonces.has(record.authorizationNonceDigest) ||
        (event.kind === "COMMIT" && seenProposals.has(record.proposalDigest))
      ) {
        throw new LedgerError("LEDGER_CORRUPT", "Replay found in ledger.");
      }
      seenNonces.add(record.authorizationNonceDigest);
      if (event.kind === "COMMIT") seenProposals.add(record.proposalDigest);

      previousStatePayload = statePayload;
      previousState = {
        ...statePayload,
        revision: record.revision,
        stateDigest: record.stateDigest,
        ledgerHead: record.ledgerHead,
      };
      previousLedgerHead = record.ledgerHead;
      events.push(event);
    }

    if (!previousState) {
      throw new LedgerError("LEDGER_CORRUPT", "Ledger has no recoverable state.");
    }
    return {
      state: previousState,
      records: file.records,
      events,
    };
  }

  private statePayload(state: AnchorState): AnchorStatePayload {
    return {
      instanceId: state.instanceId,
      schemaVersion: state.schemaVersion,
      policyVersion: state.policyVersion,
      participants: state.participants,
    };
  }

  private async writeRecords(
    filePath: string,
    records: StoredLedgerRecord[],
  ): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
    const handle = await open(temporaryPath, "wx", 0o600);
    try {
      await handle.writeFile(
        `${JSON.stringify({ formatVersion: 1, records } satisfies LedgerFile)}\n`,
        "utf8",
      );
      await handle.sync();
    } catch (error) {
      await handle.close();
      await rm(temporaryPath, { force: true });
      throw error;
    }
    await handle.close();

    try {
      await rename(temporaryPath, filePath);
      const directoryHandle = await open(this.directory, "r");
      try {
        await directoryHandle.sync();
      } finally {
        await directoryHandle.close();
      }
    } catch (error) {
      await rm(temporaryPath, { force: true });
      throw error;
    }
  }

  private filePath(instanceId: string): string {
    return path.join(this.directory, `${sha256(instanceId)}.anchor.json`);
  }

  private validateInstanceId(instanceId: string): void {
    if (instanceId.trim().length === 0 || instanceId.length > 256) {
      throw new TypeError("Instance identity must be 1 to 256 characters.");
    }
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await readFile(filePath);
      return true;
    } catch (error) {
      if (hasCode(error, "ENOENT")) return false;
      throw error;
    }
  }
}

function hasCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}
