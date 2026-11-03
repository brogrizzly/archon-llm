# Archon Agent Governance and Build Record

**Status:** Working draft; reviewed 30 October 2026  
**Scope:** Archon model project, Anchor integration library, and Archon HUD prototype

This document is an operating guide and evidence index for contributors and
coding agents. It is not legal advice, not a completed risk assessment, not a
conformity assessment, and not a claim that Archon complies with any law or standard. The
project is a prototype: no approved Archon v0.0 base model, production
inference service, or deployment context exists.

## Instructions for contributors and agents

- Read this file before changing model weights, training data, Anchor semantics,
  inference, audit records, prompts, tool access, persistence, or user-facing
  claims.
- Keep the Archon model implementation separate from Anchor's mathematical
  definition. Do not fill unresolved `Pi`, numerator, threshold, or policy
  semantics by assumption.
- Treat 4LO as a separate, existing project and reference. Do not recreate or
  modify its product unless the user explicitly asks.
- Treat Morgan logo files as owner-provided brand artwork. Do not describe the
  organization as an LLC or imply legal formation unless the owner confirms it.
- Report confirmed evidence separately from proposals, open questions, and
  assumptions. Do not describe a pilot checkpoint as a useful or
  general-purpose model.
- Do not add logging of prompts, raw model output, credentials, or hidden
  chain-of-thought. Prefer minimal, structured decision metadata and digests.
- Before adding external tools, persistent prompt/output storage, or
  state-changing automation, update the threat model, privacy controls, and
  human-approval design first.
- Run `pnpm run test` and `pnpm run build` after material changes. The root
  build runs tests and typechecks before package builds.

## Scope and classification

Archon is an independent language-model project; Anchor is its mathematical
foundation. The checked-in inference checkpoint is a 94,528-parameter pipeline
pilot. The proposed 2,013,399,040-parameter architecture is not approved or
trained. The HUD is a visual prototype with no connected model runtime.

Current documented intent is limited to local development, reproducibility, and
testing. No user-facing or production deployment context, geographic scope, or
intended downstream use has been approved. Candidate legal review topics
include EU AI Act Articles 5, 6, 9–15, 50, 53, 72–73 and Annexes III, IV, and XI;
GDPR Articles 17 and 25; NIST AI RMF; and ISO/IEC 42001. Applicability,
classification, and Article 5 screening have not been assessed. Do not label
the project minimal-risk, high-risk, or GPAI without a documented use-case
review by qualified counsel.

## Status key

- **Implemented:** supported by current code or checked-in evidence.
- **Partial:** some controls exist, but the control is incomplete or limited to
  the prototype.
- **Open:** no approved control, owner, or evidence is in place.
- **Not applicable now:** the triggering production capability does not exist;
  reassess before adding it.

## Governance crosswalk

### 1. Governance and scope classification — Partial

- The model card, pretraining-readiness plan, and this document define the
  current prototype boundary and known exclusions.
- Intended deployment contexts and jurisdictional scope are not approved.
- The requested EU AI Act classifications and prohibited-practice screening
  remain open; this document makes no legal classification.

### 2. Continuous risk management — Partial

- Existing controls include strict proposal-schema validation, fail-closed
  handling of unresolved Anchor semantics, resource-admission checks, and
  human authorization before a state transition.
- There is no approved FMEA scoring scale, owner-assigned risk register, or
  general pre-action risk score. Resource admission is not a safety score.
- See `threat_model.md` for the current prototype hazards and trust boundaries.
  Reassess risks when the intended use or deployment changes.

### 3. Data governance and privacy — Partial

- The pilot corpus consists of 63 project-authored passages; its declared
  release and provenance are documented in `archon/data/README.md` and
  `docs/model-card.md`. No broader training corpus is approved.
- No retrieval/vector store or external inference service is configured in the
  Archon inference path.
- GDPR Articles 17 and 25 are candidate review topics, not completed rights,
  erasure, or privacy-by-design assessments.
- The inference library returns audit records that can contain model output;
  it does not persist them. Do not log prompts or raw model output. Do not
  collect hidden reasoning traces.
- Before adding data collection or persistence, define purpose, lawful basis,
  minimization, access, retention, deletion/erasure, and incident controls.
  GDPR applicability and obligations require a use-case-specific review.

### 4. Technical documentation and architecture — Partial

- `docs/model-card.md`, `docs/archon-inference.md`,
  `docs/archon-v0-pretraining-plan.md`, and checkpoint manifests document the
  current architecture, training process, dependencies, hardware, and limits.
- `docs/archon-2b-parameter-ledger.md` derives the candidate's exact count from
  its configuration and module graph; update it with any shape or weight-tying
  change.
- `docs/utf8-byte-direction.md` records the planned direct-byte pilot and
  device priority. Byte BPE remains the implementation until a separate codec
  and pilot are built and validated.
- `docs/archon-first-device-validation.md` records the owner's iPhone 14 Plus
  target and the staged evidence required before claiming an on-device build.
- The small pilot is not a base-model release. The 2B candidate remains
  unapproved; no full-scale run or production checkpoint exists.
- Refresh the relevant evidence when architecture, weights, tokenizer,
  training data, runtime, or compute assumptions change.

### 5. Audit logging and traceability — Partial

- The inference library returns structured records with request/model digests,
  model output, resource context, and admission results for replay. The record
  is not written to a durable audit store by this library.
- Anchor's state ledger and inference audit records serve different purposes;
  neither is a claim of a tamper-proof operational logging service.
- Never log hidden chain-of-thought. Do not log prompts or raw model output.
  Any future audit store needs documented access, integrity, retention, export,
  and deletion controls before it is enabled.

### 6. Transparency and machine identification — Partial

- The HUD labels itself as a prototype and states that no model runtime is
  connected. The model card describes the pilot's intended use and limits.
- There is no public inference interface. Any future user-facing output must be
  clearly identified as AI-generated and accompanied by relevant limitations.
- Watermarking or C2PA provenance is not implemented; evaluate applicability
  before making a product claim.

### 7. Human oversight and interruption — Partial

- Anchor requires a trusted human authorization for a state transition and
  rechecks state and authorization at commit. No production authorizer or
  commit endpoint is configured.
- The model adapter does not create approvals or call external tools. The HUD
  has no connected runtime.
- There is no autonomous loop or supervisor kill switch today. Before adding
  unattended or recursive tool use, implement blocking approval for
  state-changing actions and a tested interrupt/rollback path.

### 8. Accuracy, robustness, and adversarial defense — Partial

- The test suite covers deterministic core behavior, proposal validation,
  resource gates, training reproducibility, and a pinned inference golden.
- The golden is a reproducibility check for a tiny pilot, not a language-quality
  benchmark. No safety, truthfulness, instruction-following, or domain-quality
  evaluation has been completed.
- A dedicated prompt-injection, data-poisoning, and adversarial benchmark
  harness is open. Do not claim red-team coverage from the current unit tests.

### 9. Post-market monitoring and incident response — Not applicable now

- There is no production deployment, public inference service, or operational
  telemetry for Archon, so post-market monitoring and incident reporting
  procedures are not in place.
- Reassess before any release. The source brief's suggested 24–72-hour response
  window is not adopted as a legal deadline; establish any internal target only
  after legal and operational review.
- The AI Act crosswalk distinguishes Article 72 post-market monitoring from
  Article 73 serious-incident reporting. Applicability, timelines, and
  reporting duties must be verified for the eventual system and role.

### 10. Conformity assessment and versioned attestation — Open

- No conformity assessment, certification, CE marking, or signed compliance
  attestation has been performed.
- NIST AI RMF and ISO/IEC 42001 are reference frameworks here, not evidence of
  certification or regulatory compliance.
- Material changes require a reviewed update to this document and its linked
  evidence. The template below is intentionally unsigned.

## Current hazard register

| Hazard | Current control/evidence | Remaining work |
| --- | --- | --- |
| Pilot output is mistaken for reliable advice | Model card limits intended use; pilot is not a general-purpose release | Add evaluated capability boundaries before any user-facing release |
| Malformed or adversarial model output crosses into Anchor | Strict schema parsing; invalid output is rejected | Add a dedicated adversarial benchmark |
| Unresolved math semantics produce an unauthorized state change | Anchor fails closed; trusted human authorization is required; no production authorizer is configured | Resolve semantics and review policies before enabling commits |
| Stale or invalid resource readings admit optional work | Resource gate checks units, freshness, uncertainty, and required gates | Connect only a reviewed telemetry source; test deployment-specific thresholds |
| Prompt or model output leaks through logs or audit storage | Library does not persist audit records; documentation prohibits prompt/raw-output logging | Add privacy-reviewed retention/access controls before persistence |
| New training data has unclear rights or provenance | Current corpus is project-authored and documented | Block ingestion until source-level rights, provenance, filtering, and manifest are approved |

This is a qualitative register. Likelihood/severity scores are intentionally not
invented before a deployment context and scoring method are approved.

## Material-change review

Revisit this document, `threat_model.md`, the model card, and relevant tests when
any of the following changes:

- model weights, architecture, tokenizer, objective, or training corpus;
- system prompts, tool schemas, external services, or inference routing;
- Anchor policies, math semantics, resource thresholds, authorization, or
  persistence;
- collection, storage, logging, retention, export, or deletion of user data;
- intended use, user population, deployment geography, or release status.

## Unsigned release-attestation template

Do not present this template as an attestation until a release review has been
completed and maintainers have signed it.

```text
Status: NOT SIGNED
Release identifier:
Model/checkpoint digest:
Tokenizer and configuration digest:
Training-data manifest and rights review:
Prompt and tool-schema versions:
Intended purpose and deployment regions:
Risk review and open issues:
Tests and evaluations run:
Documentation reviewed:
Maintainer approvers:
Signature method and timestamp:
```

## References

See `docs/works-cited.md` for the MLA 9 bibliography. Regulatory mappings are
candidate references for future review; exact applicability and current
obligations must be confirmed by qualified counsel.
