# UTF-8 byte vs. byte-BPE pilot comparison

**Run date:** 2026-11-03  
**Status:** small pilot comparison only; not a general benchmark or a language
quality result

## Reproduce

From the repository root, run:

```sh
python -m archon.compare_codecs \
  --config archon/configs/pilot.json \
  --run-dir archon/runs/codec-comparison
```

The command starts fresh runs for both codecs and writes a machine-readable
`comparison.json` alongside their checkpoints. Choose a new `--run-dir` for each
comparison. The report records the config and corpus hashes, split hashes,
token counts, codec/model details, training time, estimated throughput, and
validation/test metrics.

## Conditions

Both runs used seed `7331`, the same 63-record project-authored corpus
(`843dec3e3e1b2dbb2a80437c34e4c19afa4ef1f73e5868eb8ec02e70a25632d8`), and
the same deterministic 50/6/7 train/validation/test record split. The BPE
tokenizer was fitted only on training text. Each model trained from random
initialization for 80 steps on CPU with one thread, batch size 8, context length
64, AdamW learning rate `0.001`, and weight decay `0.01`.

The architecture is otherwise shared, but vocabulary size is codec-specific:
258 for UTF-8 bytes and 320 for byte-BPE. This changes parameter counts
(90,560 and 94,528 respectively), so these are matched pilot settings rather
than identical model parameterizations.

## Observed results

### Encoded split sizes

| Split | UTF-8 byte tokens | Byte-BPE tokens |
| --- | ---: | ---: |
| Train | 4,738 | 2,896 |
| Validation | 507 | 330 |
| Test | 654 | 406 |

Byte-BPE used 38.9% fewer tokens in the training partition in this run.

### Training cost

| Codec | Elapsed training-loop time | Estimated model positions / second |
| --- | ---: | ---: |
| UTF-8 bytes | 0.822 s | 49,855 |
| Byte-BPE | 0.812 s | 50,425 |

Elapsed time covers optimizer steps and checkpoint writes. The throughput
estimate is `steps × batch size × context length ÷ elapsed time`; it is model
positions per second, not unique corpus tokens per second. Tokenizer fitting,
model initialization, and evaluation are excluded. These are single-run CPU
observations and should not be interpreted as stable speed differences.
The observed runtime was Python 3.13.11 and PyTorch 2.15.0+cpu on x86_64.

### Held-out metrics

| Codec | Split | Target tokens | Cross entropy (nats/token) | Perplexity |
| --- | --- | ---: | ---: | ---: |
| UTF-8 bytes | Validation | 506 | 3.0224 | 20.54 |
| UTF-8 bytes | Test | 653 | 2.8416 | 17.14 |
| Byte-BPE | Validation | 329 | 4.9924 | 147.28 |
| Byte-BPE | Test | 405 | 4.9526 | 141.55 |

Per-token cross entropy and perplexity are not directly comparable across
different tokenizations: a byte token and a BPE token represent different
amounts of text. The tiny synthetic corpus and very small held-out sets also
make these scores unstable diagnostics, not evidence of generalization or
language quality. No codec is selected by this comparison.
