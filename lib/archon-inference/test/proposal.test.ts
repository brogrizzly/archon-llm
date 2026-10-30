import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseArchonCandidate } from "../src/proposal.js";

function validCandidate(): string {
  return JSON.stringify({
    requested_action: "Move the test participant",
    proposed_state: {
      participants: [
        {
          participant_id: "human-test",
          coordinates: {
            x: { value: 1, unit: "m", encodingId: "test-x-v1" },
            y: { value: 0, unit: "m", encodingId: "test-y-v1" },
            t: { value: 0, unit: "tick", encodingId: "test-t-v1" },
            d: { value: 0, unit: "state-unit", encodingId: "test-d-v1" },
            a: {
              value: 0,
              unit: "attention-unit",
              encodingId: "test-a-v1",
            },
            e: { value: 0, unit: "energy-unit", encodingId: "test-e-v1" },
          },
          resources: {
            attention: { value: 0, unit: "attention-unit" },
            battery: { value: 100, unit: "percent" },
            memory: { value: 32, unit: "MiB" },
          },
        },
      ],
    },
    evidence_refs: ["test-fixture-only"],
    uncertainties: ["This is a test fixture, not a model claim."],
  });
}

describe("strict Archon proposal parsing", () => {
  it("parses a bounded proposal without adding or repairing fields", () => {
    const candidate = parseArchonCandidate(validCandidate());
    assert.equal(candidate.participants.length, 1);
    assert.equal(candidate.participants[0]?.coordinates.x.value, 1);
    assert.deepEqual(candidate.evidenceRefs, ["test-fixture-only"]);
  });

  it("rejects malformed, extra-key, and non-finite JSON rather than repairing it", () => {
    assert.throws(() => parseArchonCandidate("{"), /valid JSON/);
    assert.throws(
      () =>
        parseArchonCandidate(
          validCandidate().replace('"evidence_refs"', '"unrequested":true,"evidence_refs"'),
        ),
      /required proposal schema/,
    );
    assert.throws(
      () => parseArchonCandidate(validCandidate().replace('"value":1', '"value":1e400')),
      /Coordinate x is invalid/,
    );
  });

  it("supports one through eleven participants and rejects a twelfth", () => {
    const candidate = JSON.parse(validCandidate()) as {
      requested_action: string;
      proposed_state: {
        participants: Array<{
          participant_id: string;
          coordinates: unknown;
          resources: unknown;
        }>;
      };
      evidence_refs: string[];
      uncertainties: string[];
    };
    const template = candidate.proposed_state.participants[0];
    assert.ok(template);
    candidate.proposed_state.participants = Array.from(
      { length: 11 },
      (_, index) => ({
        ...template,
        participant_id: `human-${index + 1}`,
      }),
    );
    assert.equal(
      parseArchonCandidate(JSON.stringify(candidate)).participants.length,
      11,
    );
    candidate.proposed_state.participants.push({
      ...template,
      participant_id: "human-12",
    });
    assert.throws(
      () => parseArchonCandidate(JSON.stringify(candidate)),
      /required proposal schema/,
    );
  });
});
