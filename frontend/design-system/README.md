# Design source

`tokens.css` and `tokens.json` are byte-for-byte copies of Kimi's canonical Working Paper tokens from Nestlet commit [`2154dd95e70027b8319586ba71359542cb7cec93`](https://github.com/ledondev520/nestlet/tree/2154dd95e70027b8319586ba71359542cb7cec93/docs/design-system).

The frontend includes this copy so its Docker build remains self-contained. Change design primitives in the canonical design system first, then sync the copy. `../styles.css` adapts these tokens to shadcn semantics and component states. In particular, canonical `--accent` remains cinnabar; shadcn's `bg-accent` utility maps to `--accent-tint` rather than redefining the primitive.
