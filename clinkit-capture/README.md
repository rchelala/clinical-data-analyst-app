# clinkit-capture

Exports Power BI Report Server (PBIRS) dashboard pages as PNGs via the REST API.
Runs locally on Windows inside the hospital network. No browser automation.

## Prerequisites

- Node 20+
- Windows machine with access to `http://tpdcpbi02`
- Logged in with your AD account

## Install

```bash
npm install
npm run build
```

## Usage

```bash
node dist/index.js --plan examples/maw-walkthrough.json --out ./out
```

Use `--force` to overwrite an existing output directory.

## Output

```
out/
├── frames/
│   ├── 01-overview.png
│   └── 02-pipeline.png
└── manifest.json
```

## Troubleshooting

**"Report not found at path"** — Paths are case-sensitive. Check the exact path in PBIRS.

**Export job timed out** — First export after a cold start can take 60s+. Try again; cached exports are faster.

**Wrong page exported** — `pageName` must match the tab display name exactly, including spaces.
