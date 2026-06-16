---
name: code-intel
description: >-
  Use when you need to understand this repo: architecture, data flow, symbol
  impact, platform-specific behavior, or where a feature lives. Prefer precise
  symbol/code search for structure and semantic search for fuzzy concepts.
---

# Code Intelligence

This repo is small, but it still has clear layers:

- `src/code.ts`: plugin sandbox entry and message routing.
- `src/ui.ts`: iframe UI, preview, and canvas slicing.
- `src/nine-slice.ts`: platform-independent region math and validation.
- `src/platform/*`: Figma/MasterGo API adapters.

## Routing

- Structural questions: use exact symbol/file search first.
- Fuzzy concept questions: use semantic search.
- Platform behavior questions: inspect `src/platform/types.ts`, then compare `figma.ts` and `mastergo.ts`.
- Shared behavior questions: inspect `src/nine-slice.ts` and its tests first.

If local codegraph or graphify indexes exist, prefer them for impact and concept exploration. If not, use the built-in search/read tools directly.
