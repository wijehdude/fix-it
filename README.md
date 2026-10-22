# C3 Defect Intelligence Dashboard

Turns a raw defect workbook (Excel/CSV) into an interactive dashboard:

**raw Excel → interpretation → classification → consolidation → prioritisation → change requests → manpower plan**

- Classifies every record into **Air Con, Lighting, Cleaning, Toilet, Physical Security, Others** (legacy “Others” are reclassified; leftovers get an AI sub-theme).
- Consolidates reports describing the same underlying issue into **recurring issue clusters** (embeddings + average-linkage clustering).
- Measures the **SLA: 2 h response, 4 h turnaround** (calendar time, from the reported time).
- Computes a transparent **priority score** (impact, frequency, location criticality, SLA) with live weight sliders and a breakdown on every score.
- Drafts **change requests** in the standard CR format for every P1/P2 recurring issue (editable, copy as text/Markdown).
- Plans **manpower**: day × hour workload heatmap and recommended headcount per trade per shift.

There is **no database, no login and no server-side persistence**. The file is parsed in the browser; data lives only in the browser tab’s memory. Refreshing or closing the tab discards everything (the app warns you first).

---

## Quick start (local)

```bash
npm install
cp .env.example .env.local        # then set OPENAI_API_KEY
npm run dev                        # http://localhost:3000
```

Click **Use sample data** on the upload screen to try it with the synthetic workbook in `public/sample/sample-defects.xlsx` (296 records, 6 sheets, deliberately messy). Regenerate it with `npm run sample`.

### Demo mode (no API key)

Set `MOCK_AI=1` to run the whole pipeline offline with deterministic keyword rules and bag-of-words embeddings instead of OpenAI. A banner makes this obvious in the UI. It is used by the end-to-end test and is handy for demos — **do not use it for real analysis**.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Secret check on `src` → `next build` → secret check on the browser bundle |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit tests (dates, column detection, SLA, scoring, manpower, clustering) |
| `npm run test:e2e` | Playwright smoke test against the production build (`npm run build` first; uses `MOCK_AI=1`) |
| `npm run sample` | Regenerates the sample workbook |

## Environment variables

Set these in **Vercel → Project → Settings → Environment Variables** (or `.env.local`).

| Name | Example | Required | Notes |
|---|---|---|---|
| `OPENAI_API_KEY` | `sk-...` | Yes | Server-side only. Never prefix with `NEXT_PUBLIC_`. |
| `OPENAI_MODEL` | `gpt-5.4-mini` | Yes | Any cost-efficient chat model that supports Structured Outputs. Default `gpt-5.4-mini`. |
| `OPENAI_EMBEDDING_MODEL` | `text-embedding-3-small` | Yes | Default `text-embedding-3-small` (512 dimensions requested). |
| `RATE_LIMIT_PER_MIN` | `120` | No | Requests per minute per IP, per serverless instance. Default 120. |
| `MAX_ROWS` | `10000` | No | Documented limit; the client enforces `src/config/limits.ts`. |
| `ACCESS_CODE` | *(empty)* | No | If set, the UI asks for it once per tab and every API route requires the `x-access-code` header. |
| `OPENAI_REASONING_EFFORT` | `low` | No | Sent to reasoning models (default `low`; `default` = don’t send). Dropped automatically if the model rejects it. |
| `MOCK_AI` | `1` | No | Demo mode (see above). Leave unset in production. |

## Deploying to Vercel

1. Import the GitHub repository in Vercel (framework: Next.js, default build settings). Production deploys from `main`; every PR gets a preview deployment.
2. Add the environment variables above (at least `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_EMBEDDING_MODEL`).
3. **Set a monthly spend limit in the OpenAI dashboard** (Settings → Limits). The app has no login, so anyone with the URL can use your API quota; the per-IP rate limit and payload caps reduce, but do not eliminate, that risk. Consider setting `ACCESS_CODE` too.
4. API routes declare `maxDuration = 60`; the browser batches work (25 records per classify call, 4 in parallel) so each call stays well inside that.

## Privacy and security

- The workbook is parsed **in the browser** (SheetJS) and is never uploaded.
- Only `description`, `location`, `asset`, `actionTaken` and the legacy category are sent for classification. `reportedBy` and unmapped columns are **never** sent. Emails, phone numbers and NRIC-like IDs are stripped before sending (in the browser and again on the server).
- Insights are generated from **aggregate statistics only**.
- API routes are stateless, validate input with Zod, reject oversized payloads (413), rate-limit per IP and **never log request bodies** (only route, error code and upstream status).
- Security headers: CSP, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `nosniff`. No analytics or trackers.
- The build fails if `OPENAI_API_KEY` is referenced outside server-only code or appears in the browser bundle.

## Configuration

Everything tunable lives in `src/config/`:

| File | Contents |
|---|---|
| `categories.ts` | Categories, definitions, Others sub-themes, impacts, severity rubric |
| `systemFunctions.ts` | System function taxonomy |
| `keywords.ts` | Keyword pre-classifier and legacy sheet aliases |
| `columnSynonyms.ts` | Column auto-detection dictionary |
| `scoring.ts` | Weights, component values, priority bands, clustering thresholds |
| `sla.ts` | SLA targets (2 h / 4 h), clock |
| `shifts.ts` | Shifts, utilisation, coverage rule, peak percentile |
| `trades.ts` | Category → trade mapping and default man-hours |
| `locations.ts` | Criticality guidance, location abbreviation expansions |
| `limits.ts` | File limits, batch sizes, concurrency, retries, token estimate |

## Project structure

```
src/app/            page + stateless API routes (classify, embed, summarise-clusters, location-criticality, draft-cr, insights, health)
src/components/     upload, mapping, progress, locations, dashboard/{overview,reclass,clusters,queue,sla,locations,functions,manpower,crs,explorer}
src/config/         all tunables
src/lib/parse/      workbook parsing, date parsing, column detection, normalisation
src/lib/analysis/   SLA, scoring, clustering, manpower, locations, derived metrics
src/lib/pipeline/   browser orchestrator, batching/retry, caches
src/lib/ai/         OpenAI client, prompts, JSON schemas, demo mode (server only)
src/workers/        clustering Web Worker
src/store/          Zustand store (in memory only)
tests/unit, tests/e2e
```

See `DECISIONS.md` for interpretation choices made where the PRD was ambiguous.
