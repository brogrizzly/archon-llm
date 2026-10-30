# Archon 2B Candidate Parameter Ledger

**Configuration:** `archon-dense-decoder-candidate-v1`  
**Status:** candidate-not-approved; count specification only  
**Claimed trainable parameters:** 2,013,399,040

This document derives the candidate's parameter count from its checked-in
configuration and the current `ArchonDecoder` module graph. It is a shape and
weight-accounting check, not evidence that the candidate has been initialized
at full size, trained, evaluated, or approved.

## 1. Candidate configuration

| Symbol | Configuration field | Value |
| --- | --- | ---: |
| \(L\) | `layers` | 32 |
| \(D\) | `hidden_size` (\(d_{\text{model}}\)) | 2,048 |
| \(F\) | `intermediate_size` (\(d_{\text{ff}}\)) | 8,192 |
| \(H_q\) | `attention_heads` (\(n_{\text{heads}}\)) | 16 |
| \(H_{kv}\) | `key_value_heads` | 4 |
| \(d_h\) | `head_dimension` | 128 |
| \(V\) | `vocabulary_size` | 32,768 |
| \(T\) | `tied_input_output_embeddings` (1 = tied) | 1 |

The configuration also specifies context length 4,096, RoPE, two pre-RMSNorm
scales per transformer block plus a final RMSNorm, SwiGLU, and bias-free linear
layers. The head geometry is consistent: \(D=H_qd_h=16\cdot128=2{,}048\).
Grouped-query key/value width is \(K=H_{kv}d_h=4\cdot128=512\).

## 2. Per-layer derivation

All projection matrices are bias-free. A linear map from width \(a\) to width
\(b\) therefore contributes \(ab\) trainable parameters.

### Grouped-query attention

Let \(Q=H_qd_h=2{,}048\) and \(K=H_{kv}d_h=512\).

| Projection | Matrix shape | Parameters |
| --- | --- | ---: |
| Query | \(Q\times D = 2{,}048\times2{,}048\) | 4,194,304 |
| Key | \(K\times D = 512\times2{,}048\) | 1,048,576 |
| Value | \(K\times D = 512\times2{,}048\) | 1,048,576 |
| Attention output | \(D\times Q = 2{,}048\times2{,}048\) | 4,194,304 |
| **Attention per block** | \(DQ+2DK+QD\) | **10,485,760** |

The runtime repeats grouped key/value activations across query-head groups; that
operation adds no trainable weights.

### SwiGLU feed-forward network

The gate and up projections each have shape \(F\times D\); the down projection
has shape \(D\times F\). Thus:

\[
P_{\mathrm{SwiGLU}}=DF+DF+DF=3DF
=3\cdot2{,}048\cdot8{,}192
=50{,}331{,}648.
\]

### Normalization scales

Each block has two RMSNorm scale vectors of width \(D\), with no additive bias:

\[
P_{\mathrm{norm,block}}=2D=4{,}096.
\]

Therefore, one transformer block contains:

\[
P_{\mathrm{block}}
=P_{\mathrm{attention}}+P_{\mathrm{SwiGLU}}+P_{\mathrm{norm,block}}
=10{,}485{,}760+50{,}331{,}648+4{,}096
=60{,}821{,}504.
\]

Across \(L=32\) blocks:

\[
P_{\mathrm{blocks}}=32\cdot60{,}821{,}504=1{,}946{,}288{,}128.
\]

## 3. Embeddings, output head, and final norm

The token embedding matrix has shape \(V\times D\):

\[
P_{\mathrm{token\ embedding}}
=VD=32{,}768\cdot2{,}048=67{,}108{,}864.
\]

`tied_input_output_embeddings` is `true`. The output projection references the
same parameter object as the token embedding, so it contributes **zero
additional** parameters. The final RMSNorm adds one scale vector:

\[
P_{\mathrm{final\ norm}}=D=2{,}048.
\]

The implementation assigns
`output_projection.weight = token_embedding.weight`. PyTorch's parameter
enumeration counts the shared parameter once, which is also checked against the
model graph by `archon.validate_candidate`.

## 4. General formula and exact total

For this bias-free architecture, define \(Q=H_qd_h\), \(K=H_{kv}d_h\), and let
\(T\in\{0,1\}\) indicate input/output embedding tying. The total is:

\[
P_{\mathrm{total}}
=L\left[D(2Q+2K)+3DF+2D\right]+D+(2-T)VD.
\]

For the candidate, \(T=1\), so:

\[
\begin{aligned}
P_{\mathrm{total}}
&=32\left[2{,}048(2\cdot2{,}048+2\cdot512)
  +3\cdot2{,}048\cdot8{,}192+2\cdot2{,}048\right]\\
&\quad+2{,}048+(2-1)\cdot32{,}768\cdot2{,}048\\
&=1{,}946{,}288{,}128+2{,}048+67{,}108{,}864\\
&=\boxed{2{,}013{,}399{,}040}.
\end{aligned}
\]

If input and output embeddings were **untied** (\(T=0\)), the output head would
add another \(VD=67{,}108{,}864\) parameters, producing
2,080,507,904. That is not the checked-in candidate configuration.

## 5. Included and excluded quantities

- Included: trainable attention and SwiGLU matrices, RMSNorm scale vectors, and
  the single shared token-embedding/output-head matrix.
- Excluded: optimizer state, gradients, activations, temporary attention
  tensors, tokenizer implementation, and runtime memory.
- RoPE contributes no trainable parameters. Its inverse-frequency values are a
  non-persistent buffer in the current implementation; there are no learned
  position-embedding matrices.
- Context length 4,096 affects runtime memory and compute, but not this
  parameter count.
- The candidate's bias-free, SwiGLU, RMSNorm, RoPE, and embedding-tying choices
  are assumptions of this ledger. Changing any of them requires a revised
  derivation and a passing implementation comparison.

## 6. Reproducibility

Run from the repository root:

```sh
python -m archon.validate_candidate
```

The validator compares the analytical formula, the PyTorch module graph on the
`meta` device, and the configuration's claimed count without allocating
full-size tensors. The candidate remains `candidate-not-approved` even when all
three counts match.

Sources of truth:

- `archon/configs/candidate-2b.json`
- `archon/config.py` — analytical count
- `archon/model.py` — parameterized module shapes and tied output weight
- `archon/validate_candidate.py` — formula-to-implementation comparison
