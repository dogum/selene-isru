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

## Pull requests

Keep changes focused, explain the engineering or product motivation, and
include screenshots for visible UI changes. The full `pnpm run ci` command must
pass before review.
