# Workout text import

## Supported notation

- Section headings: warm-up, pre-set, main set, kick, pull, drill, sprint, and cool-down.
- Repeated sets: `4 x 100 yd free @ 1:30`, `8x50 yards kick`, and Unicode `×`.
- Single swims: `200 yards easy`.
- Repeated groups: `3 rounds of 4 x 100 yd free, with 200 yd easy between rounds`.
- Explicit yard and meter unit tokens, common send-off notation, and common equipment names.
- Word `.docx` extraction through Mammoth. Paragraph boundaries are preserved as blank lines.

## Known limitations

- PDF extraction is not implemented.
- Distances without an explicit unit or a document-level `SCY`, `yards`, `SCM`, `LCM`, or `meters` marker remain unresolved.
- Meter distances are retained but are not converted to yards.
- Complex tables are read in Mammoth's raw-text order.
- Multi-line bracketed rounds and prose-only instructions require manual review.
- The parser is deterministic and rule-based. It does not infer missing distances, units, intervals, or equipment.

## Setup and verification

```sh
pnpm install
pnpm test
pnpm build
```

Parser tests cover simple sets, notation variations, repeated rounds, ambiguous units, unrecognized lines, and yardage calculations.
