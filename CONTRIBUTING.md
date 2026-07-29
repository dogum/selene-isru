# Contributing

Thanks for helping improve selene-isru. The project keeps its browser engine
and independent Python mirror numerically aligned, so changes to the physical
model require extra care.

## Development setup

Install Node.js 22, pnpm 10.33, and [uv](https://docs.astral.sh/uv/), then run:

```bash
pnpm install --frozen-lockfile
uv sync --project python --locked --group dev
pnpm run ci
```

Run the app locally with `pnpm dev`.

## Model changes

- Treat `constants/constants.json` as the source of truth for shared values.
- Update the TypeScript and Python implementations together.
- Regenerate golden vectors with `pnpm generate:golden`.
- Document changed assumptions and deliberately update regression anchors.

The Custom Site document compiler and its capacity/spatial screening terms live
under `packages/engine/src/site-design`. When changing them:

- preserve versioned parsing and canonical serialization, or add an explicit
  migration;
- keep catalog kind and port IDs stable because exported designs use them;
- state each new rating or distance effect's equation, units, evidence,
  maturity, and exclusions in the evaluator and release documentation;
- add or update importable fixtures in `docs/examples`; and
- run `pnpm smoke:custom` against a production preview. Set `CHROME_PATH` when
  Chrome is not installed in a standard location.

## Pull requests

Keep changes focused, explain the engineering or product motivation, and
include screenshots for visible UI changes. The full `pnpm run ci` command must
pass before review. Visible Custom Site changes should also regenerate
`docs/performance/custom-site-release.json`, the reference screenshots, and the
short demo with `pnpm evidence:custom`.
