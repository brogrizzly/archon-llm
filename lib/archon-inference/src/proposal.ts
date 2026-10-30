import { COORDINATE_KEYS } from "@workspace/anchor-core";
import type {
  CoordinateKey,
  CoordinateValue,
  CoordinateVector,
  ParticipantProposal,
  ResourceMap,
} from "@workspace/anchor-core";

export interface ArchonCandidate {
  requestedAction: string;
  participants: ParticipantProposal[];
  evidenceRefs: string[];
  uncertainties: string[];
}

export class InvalidModelOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidModelOutputError";
  }
}

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

function boundedString(
  value: unknown,
  label: string,
  maxLength: number,
): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > maxLength
  ) {
    throw new InvalidModelOutputError(`${label} must be non-empty bounded text.`);
  }
  return value;
}

function parseCoordinate(value: unknown, key: CoordinateKey): CoordinateValue {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["value", "unit", "encodingId"]) ||
    typeof value.value !== "number" ||
    !Number.isFinite(value.value)
  ) {
    throw new InvalidModelOutputError(`Coordinate ${key} is invalid.`);
  }
  return {
    value: value.value,
    unit: boundedString(value.unit, `Coordinate ${key} unit`, 128),
    encodingId: boundedString(value.encodingId, `Coordinate ${key} encodingId`, 128),
  };
}

function parseCoordinates(value: unknown): CoordinateVector {
  if (!isRecord(value) || !hasExactKeys(value, [...COORDINATE_KEYS])) {
    throw new InvalidModelOutputError(
      "Each participant must provide exactly the six Anchor coordinates.",
    );
  }
  return Object.fromEntries(
    COORDINATE_KEYS.map((key) => [key, parseCoordinate(value[key], key)]),
  ) as CoordinateVector;
}

function parseResources(value: unknown): ResourceMap {
  if (!isRecord(value) || Object.keys(value).length > 64) {
    throw new InvalidModelOutputError("Participant resources must be a bounded object.");
  }
  const resources: ResourceMap = {};
  for (const [key, rawResource] of Object.entries(value)) {
    if (
      key.trim().length === 0 ||
      key.length > 128 ||
      !isRecord(rawResource) ||
      !hasExactKeys(rawResource, ["value", "unit"]) ||
      typeof rawResource.value !== "number" ||
      !Number.isFinite(rawResource.value) ||
      rawResource.value < 0
    ) {
      throw new InvalidModelOutputError(`Resource ${key} is invalid.`);
    }
    resources[key] = {
      value: rawResource.value,
      unit: boundedString(rawResource.unit, `Resource ${key} unit`, 128),
    };
  }
  return resources;
}

function parseStringList(
  value: unknown,
  label: string,
  maxItems: number,
  maxLength: number,
): string[] {
  if (
    !Array.isArray(value) ||
    value.length > maxItems ||
    value.some(
      (entry) =>
        typeof entry !== "string" ||
        entry.trim().length === 0 ||
        entry.length > maxLength,
    )
  ) {
    throw new InvalidModelOutputError(`${label} must be a bounded list of text.`);
  }
  return [...value] as string[];
}

export function parseArchonCandidate(rawOutput: string): ArchonCandidate {
  if (Buffer.byteLength(rawOutput, "utf8") > 16_384) {
    throw new InvalidModelOutputError("Model output exceeds the byte limit.");
  }

  let value: unknown;
  try {
    value = JSON.parse(rawOutput);
  } catch {
    throw new InvalidModelOutputError("Model output is not valid JSON.");
  }
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "requested_action",
      "proposed_state",
      "evidence_refs",
      "uncertainties",
    ]) ||
    !isRecord(value.proposed_state) ||
    !hasExactKeys(value.proposed_state, ["participants"]) ||
    !Array.isArray(value.proposed_state.participants) ||
    value.proposed_state.participants.length < 1 ||
    value.proposed_state.participants.length > 11
  ) {
    throw new InvalidModelOutputError(
      "Model output does not match the required proposal schema.",
    );
  }

  const seen = new Set<string>();
  const participants = value.proposed_state.participants.map((rawParticipant) => {
    if (
      !isRecord(rawParticipant) ||
      !hasExactKeys(rawParticipant, [
        "participant_id",
        "coordinates",
        "resources",
      ])
    ) {
      throw new InvalidModelOutputError("Participant proposal has an invalid shape.");
    }
    const participantId = boundedString(
      rawParticipant.participant_id,
      "participant_id",
      256,
    );
    if (seen.has(participantId)) {
      throw new InvalidModelOutputError("Participant identifiers must be unique.");
    }
    seen.add(participantId);
    return {
      participantId,
      coordinates: parseCoordinates(rawParticipant.coordinates),
      resources: parseResources(rawParticipant.resources),
    };
  });

  return {
    requestedAction: boundedString(
      value.requested_action,
      "requested_action",
      256,
    ),
    participants,
    evidenceRefs: parseStringList(value.evidence_refs, "evidence_refs", 16, 256),
    uncertainties: parseStringList(value.uncertainties, "uncertainties", 16, 512),
  };
}
