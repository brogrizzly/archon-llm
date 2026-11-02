# Archon first-device validation plan

**Status:** Target and acceptance plan recorded; device measurements and mobile
runtime validation have not been performed.

## First target

| Field | Current record |
| --- | --- |
| Device | iPhone 14 Plus |
| Storage capacity | 128 GB |
| OS version observed | iOS 27.0.1, from the owner-supplied About screenshot |
| Available storage | Not confirmed; record before installation |
| Available application memory | Not measured; measure during runtime tests |
| Battery health | Not recorded; record before sustained tests |

This is the first target because it is the owner's actual phone, not because
it represents a general minimum-device requirement. The device record is an
initial baseline, not evidence that any Archon checkpoint fits or runs on it.
Older iPads become secondary targets after the phone demonstration succeeds.

## Build priorities

1. Run a small, independently trained byte pilot locally. Use the fixed
   `archon-utf8-bytes-v1` codec and a separately identified checkpoint; do not
   convert or relabel a ByteBPE checkpoint as a byte-model checkpoint.
2. Keep inference on-device and usable offline after installation. Do not
   silently substitute cloud inference when local inference is unavailable.
3. Measure the small pilot first. Treat approximately 2B parameters with
   validated 4-bit weights as a scaling goal, not as the first device build
   or an assumed capability of this phone.
4. Keep inference optional, bounded, cancellable, and unable to authorize or
   commit Anchor changes on its own.

## Staged demonstration

### 1. Record the device baseline

Before installation, record available storage, OS version, battery health,
runtime version, and any available memory observations. Record unavailable
values as unavailable; do not infer them from total storage or battery
percentage.

### 2. Prove the local runtime

Install a build that can load the independently trained byte pilot and perform
real local inference on the iPhone. Verify airplane-mode inference after
installation. Record the exact app build, runtime/backend, checkpoint digest,
codec version, and whether the run was native or browser-based.

### 3. Measure bounded inference

Use declared, reproducible prompts and bounded context/output sizes. Measure:

- Cold load time, time to first visible text, and full response time.
- Peak application memory and behavior under memory pressure.
- Cancellation latency and interface responsiveness while generating.
- Sustained performance over repeated runs, with charging and ambient
  conditions recorded.
- Battery change over a declared interval; report energy only when measured
  with suitable instrumentation.
- Strict UTF-8 completion, output validity, and task results for the exact
  checkpoint and runtime.

Do not turn battery percentage into joules. Keep measured hardware energy
separate from Anchor's `e` coordinate.

### 4. Connect proposals to Anchor safely

Only after local inference works, connect strict UTF-8 JSON output to Anchor's
existing validation flow. Reject malformed, incomplete, oversized, or
schema-invalid output. Show model, validation, and approval status clearly.
Require an explicit trusted human approval for the exact validated proposal.
The model must have no automatic commit authority. No production policy or
authorizer is implied by this plan.

### 5. Verify one governed state change

In a test-only ledger, approve and commit exactly one test-note change, restart
the application, then verify that the committed state is recovered and its
record remains verifiable. Confirm that cancellation, invalid output,
resource-gate failure, or missing approval cannot create a commit.

## HUD and accessibility requirements

- Readable text with adjustable size.
- Low-glare presentation and reduced motion.
- Screen-reader labels for controls and status.
- A visible cancel control during generation.
- Clear model, validation, and human-approval states.

These are interface requirements, not medical or retinal-safety claims. The
application cannot control physical display brightness.

## Device evidence and success gate

Maintain a device matrix with device/chip, OS, available memory when measurable,
runtime/backend, app build, checkpoint digest, codec version, quantization,
context positions, input/output byte limits, test conditions, and measured
results. Keep native and browser results separate.

The first-device success condition is one complete, offline governed loop on
the iPhone: local inference, strict proposal validation, explicit human
approval, one test-note commit, and recovery after restart, with no cloud
inference, unauthorized change, or loss of committed state.

No such end-to-end run is currently claimed. If this phone exceeds a measured
resource budget, report the result and reduce model or context size. Do not
silently fall back to a remote service or claim that the 2B goal is supported.
