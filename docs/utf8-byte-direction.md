# Archon UTF-8 byte direction — agent handoff

**Date:** 2026-10-31
**Decision:** Direct UTF-8 bytes are the selected direction for the next Archon
pilot. This is a planning decision; the repository still implements byte BPE.
The codec details below are a proposed implementation contract.

**Reviewed baseline:** `bd572d5041fd437d196dbb95c40f01e4d8947c16`.

## Direction and scope

Build an independently initialized language model that consumes and predicts
UTF-8 bytes through a small, public, deterministic codec. The intended local
path has no learned subword vocabulary, BPE merges, tokenizer-training step,
or downloaded tokenizer asset. "Tokenizer-free" here still requires the
fixed text-to-integer encoding and explicit sequence framing.

The longer-term goal remains an approximately 2B-parameter model with a
validated 4-bit weight release. Start with a small reproducible byte pilot.
Full pretraining requires a rights-cleared corpus and separately provisioned,
benchmarked GPU capacity.

Keep the existing BPE code, configuration, smoke-test checkpoint, tokenizer,
and evaluation reproducible as a historical baseline. Its checkpoint cannot
become a trained byte model merely by removing its tokenizer. Train the new
pilot from random initialization, with a separate codec/version and run path.
Give prior research credit; do not import another model's weights or represent
standard byte encoding as a new invention.

## Proposed codec contract

| Item | Proposal |
| --- | --- |
| Text encoding | Strict UTF-8; each byte value maps to the same integer ID, 0–255 |
| Framing | BOS = 256; EOS = 257; total alphabet = 258 |
| Text preservation | No implicit Unicode normalization, case folding, newline conversion, or BOM stripping |
| Training and inference | Identical versioned codec, framing, and preprocessing policy |
| Lengths | Report raw text bytes and model sequence positions separately; boundary IDs occupy positions |
| Output | Incremental strict UTF-8 decoder; buffer incomplete sequences while streaming |
| Invalid completion | Reject malformed or unfinished UTF-8 at EOS or a hard limit; do not repair an authoritative proposal with replacement characters |

For example, `Tuna` encodes to `[84, 117, 110, 97]` before framing.
Boundary IDs are inserted by the codec, never recognized by scanning user
text for strings such as `<BOS>`. Reject unexpected control IDs and IDs
outside the declared alphabet. A generated EOS only terminates generation;
it grants no permission. Version and test padding, loss masks, document
packing, and conversation framing before the pilot; do not silently add a
new ID or overload a content byte as padding.

Trusted roles and authorization remain host-side metadata. User text that
looks like a role, instruction, or approval remains untrusted content.
Exact byte preservation does not replace Anchor's existing canonical
structured-proposal serialization or digest rules.

## Training and evaluation plan

1. **Specify and test the codec.** Cover ASCII, multiple scripts, emoji,
   combining marks, empty input, literal boundary-marker text, malformed
   bytes, lone surrogates in host strings, split multibyte sequences, limits,
   and invalid IDs. Require lossless round trips for valid input and explicit
   failure for invalid completed text.
2. **Add a separate tiny byte pilot.** Use public rights-cleared data,
   document-level splits before packing, random initialization, and the same
   codec in training and inference. Record data/split digests, seed, exact
   configuration, software, hardware, codec version, and framing/loss masks.
   Train causal next-symbol cross entropy over bytes and EOS; BOS is input
   framing and padding is excluded from the loss. Verify save/resume and
   checkpoint/codec mismatch rejection.
3. **Publish measured results.** Report held-out byte loss, valid UTF-8
   completion rate, task quality, latency, peak memory, and energy per useful
   completed task. Define byte-only bits per byte as
   `BPB = NLL_byte_targets / (number_of_byte_targets * ln(2))`, with NLL in
   nats and boundary-symbol losses reported separately. Compare on the same
   held-out documents/tasks with declared compute and context budgets.
   Per-byte and per-BPE-token perplexities are different units and must not
   be compared directly. The old smoke test is pipeline evidence only.
4. **Integrate bounded inference.** Apply resource, time, and output budgets
   before and during generation; recheck resources before commit. Strictly
   decode a completed proposal, then apply the existing schema, size, state,
   permission, and replay checks. Preserve explicit human authorization bound to the exact
   proposal. Archon output cannot approve itself or write directly to the
   ledger. Include injection, false approval, Unicode ambiguity, isolation,
   privacy-canary, exhaustion, and benign-overrefusal cases in evaluation.
5. **Evaluate quantization and scale separately.** Verify the selected
   runtime/export format supports the fixed codec and compare unquantized
   and quantized quality, safety results, memory, latency, and measured
   energy on target hardware. GGUF/exporter compatibility is unverified.
   Recount parameters before choosing a large architecture. Do not label
   a pilot, an arithmetic estimate, or a conversion attempt a 2B release.

Start with plain bytes. Any later patching or compression architecture is
a separate measured experiment. A smaller alphabet can produce longer
sequences; energy or latency savings must be measured, not assumed.
Keep hardware joules distinct from Anchor's `e` coordinate for human energy
cost. Report measurement scope and uncertainty, including idle power.

## Parameter accounting for the large-model discussion

The current candidate uses 32 layers, hidden size 2,048, intermediate size
8,192, 16 query heads, 4 key/value heads, head dimension 128, tied embeddings,
and bias-free projections. Holding those choices fixed and changing only
the alphabet from 32,768 to the proposed 258 gives the counts below. Here
`V` is alphabet size, `L` layers, `d` hidden size, `m` intermediate size,
`h_kv` key/value heads, and `d_head` head dimension.

```text
P = V*d + L*(2*d*d + 2*d*h_kv*d_head + 3*d*m + 2*d) + d
P(V=32768) = 2,013,399,040
P(V=258)   = 1,946,818,560
```

This is a derived candidate estimate using
[the repository's parameter accounting](../archon/config.py), not a new
approved configuration. At 4 bits for every weight, the ideal packed weight
payload would be 973,409,280 bytes. Quantization metadata, unquantized
weights, KV cache, activations, and runtime buffers increase real memory.
Keep [the existing candidate](../archon/configs/candidate-2b.json) intact
until a separately identified byte configuration is implemented and checked
against the actual module graph. A context of 4,096 byte/control positions
does not cover the same amount of text as 4,096 BPE tokens.

## Anchor, public work, and safety

Preserve [the supplied G4LO formula](anchor-mathematics.md) verbatim.
The integer participant cap of 1–11 remains an operational rule, with no
convergence claim. `Pi`, numerator semantics, numeric policy, and any role
for G4LO in a training objective remain unresolved; the UTF-8 choice resolves
none of them. Do not infer a language-model loss from the G4LO equation.

Publish the math, assumptions, unresolved choices, codec/model/training
code, data provenance and rights, reproducible preparation recipes,
configurations, evaluation methods/results, and releasable weights with
checksums and license declarations. Keep private prompts, personal data,
keys, and private ledger records out of public artifacts. Existing MIT code
and CC0 pilot declarations remain as documented; future data and weight
licenses require their own review.

Safety work must include public policies, training-data treatment, held-out
harmful and benign evaluations, failures, and quantization regressions.
UTF-8, deterministic math, and human approval do not establish model safety
or legal compliance. Deployment-specific compliance remains unassessed;
record applicable requirements and evidence before making such claims.
Keep [the model card](model-card.md) explicit about measured limitations.

## Replit planning handoff

The following is planning data, not an executable model configuration:

```json
{
  "direction": "direct-utf8-bytes",
  "direction_status": "selected-for-planning",
  "implementation_status": "not-implemented",
  "codec_proposal": {
    "format": "archon-utf8-bytes-v1",
    "byte_id_min": 0,
    "byte_id_max": 255,
    "bos_id": 256,
    "eos_id": 257,
    "alphabet_size": 258,
    "learned_tokenizer": false,
    "normalization": "none",
    "decode_errors": "strict"
  },
  "next_milestone": "fresh-small-byte-pilot",
  "full_scale_goal": {
    "approximate_parameters": 2000000000,
    "weight_quantization_target_bits": 4,
    "status": "future-validation-required"
  }
}
```

Completion of this documentation task does not mean the codec, byte model,
quantization, or safety evaluations have been implemented.

## References and attribution

- Yergeau, F. *UTF-8, a transformation format of ISO 10646*. RFC 3629,
  November 2003. [Encoding standard](https://www.rfc-editor.org/rfc/rfc3629).
- Hugging Face. *ByT5 documentation*.
  [Raw-byte model precedent](https://huggingface.co/docs/transformers/model_doc/byt5).
  Cited as prior art for operating on UTF-8 bytes; its architecture, special
  IDs, weights, and performance are not being adopted for Archon.
- Project-specific decisions and proposed IDs above are this project's
  planning choices. Parameter totals are derived from the linked repository
  configuration and counting formula.
