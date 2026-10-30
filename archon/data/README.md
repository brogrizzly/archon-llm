# Pilot corpus

`pilot_corpus.txt` contains original short passages written for this repository
to exercise the training code. It contains no imported web text, third-party
model output, or external datasets. The passages are dedicated to the public
domain under CC0 1.0 Universal. On 30 Oct. 2026, the project owner confirmed
that the corpus and derived pilot checkpoints may be released publicly under
CC0 1.0.

This tiny, authored corpus is a pipeline fixture, not a broad pretraining
corpus. It cannot support useful language-capability conclusions. The splitter
deterministically assigns complete lines to training, validation, and test
sets. The tokenizer is trained only on training lines.
