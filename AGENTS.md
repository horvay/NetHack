# NetHack Project Instructions

Keep this file short. Detailed project rules live in the linked documents below.

## Required references

- Testing and screenshot QA: [`TESTING.md`](./TESTING.md)
- Asset generation and transparency QA: [`ASSET_GENERATION.md`](./ASSET_GENERATION.md)

## Core expectations

- Follow the testing rules before claiming any player-facing Electron/gameplay UI change is complete.
- Always capture, open, and inspect screenshots from UI tests; never pass a test only because assertions passed.
- Follow the asset rules for tile/icon generation, resolver work, transparency, and asset QA.
- Preserve real NetHack behavior and classic/manual keyboard flows unless the user explicitly asks to change them.
