# Golden fixtures

`pilot-smoke-inference.json` pins one deterministic response from the checked-in
smoke-test checkpoint. It guards tokenizer/checkpoint loading and greedy
inference against unintended changes; it is not a language-quality benchmark.

Update a golden only when changing the referenced checkpoint or intentionally
changing inference behavior. Review the checkpoint provenance and output, then
record the new digest and expected response together.
