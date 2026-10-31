# Agent handoff

Read [CONTRIBUTING.md](CONTRIBUTING.md) and
[the UTF-8 byte direction note](docs/utf8-byte-direction.md) before work on
Archon's representation, training, inference, or large-model configuration.

- Direct UTF-8 bytes are the selected direction for the next pilot.
  The note distinguishes that decision from proposed codec details.
- The current implementation and published smoke-test artifacts use BPE.
  Preserve their reproducibility while adding a separately versioned byte
  pilot; do not relabel an existing checkpoint as a byte-trained model.
- Keep the supplied G4LO formula unchanged. Unresolved Anchor semantics
  remain unresolved; the encoding decision does not define them.
- Publish reproducible methods and measured limitations. Keep private data
  and secrets out of the repository.
- Complete the small pilot and its evaluation before claims about a full
  2B, quantized, energy-efficient, or safety-validated model.

[replit.md](replit.md) contains workspace commands;
[ROADMAP.md](ROADMAP.md) tracks the stages. This handoff is planning
documentation and does not report implementation completion.
