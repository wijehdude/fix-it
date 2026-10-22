# Architecture — C3 Defect Intelligence Dashboard

This document describes how the webapp is built: its components, how data flows through it, and the key design decisions. For setup, see `README.md`. For the reasoning behind individual choices, see `DECISIONS.md`.

---

## 1. Purpose

The app turns a raw defect workbook into an interactive dashboard through one standardised pipeline:

```
Raw Excel → interpret → classify → consolidate → prioritise → change requests → manpower plan
```

It replaces a manual, judgement-driven process (reading, tagging, cross-referencing and writing CRs by hand) that was slow and inconsistent.

## 2. Architectural principles

| Principle | How it shows up |
|---|---|
| **No persistence** | No database, accounts or saved history. All data lives in the browser tab's memory. The server is stateless. |
| **Thick client, thin server** | Parsing, normalisation, clustering, scoring, SLA and manpower maths all run in the browser. The server only proxies AI calls. |
| **Keep the API key secret** | The OpenAI key is used only in server route handlers. A build-time check fails if it is referenced in client code or appears in the browser bundle. |
| **Send the AI as little as possible** | Only the fields needed for each task are sent. Reporter names and unmapped columns never leave the browser. Personal data is scrubbed. |
| **Deterministic where possible** | SLA, scoring, clustering and manpower are plain TypeScript functions with unit tests. The AI is used only for language tasks: classification, summaries, ratings, CR drafting and insights. |
| **Explainable** | Every AI field carries a rationale and confidence. Every score carries a breakdown. CR evidence cites source rows. |
| **Configurable** | Every threshold, weight, synonym, category, trade and shift lives in `src/config/*.ts`. |

## 3. System context

```
┌─────────────────────────── User's browser ───────────────────────────┐
│                                                                       │
│  Excel/CSV file ──► SheetJS parser ──► Column mapping ──► Records     │
│                                                          (in memory)  │
│                                                              │        │
│   Zustand store ◄── Pipeline orchestrator ───────────────────┘        │
│        │                 │  batches, 4 in parallel, retry/backoff     │
│        │                 │                                            │
│        │           Web Worker (clustering)                            │
│        ▼                                                              │
│   Derived analytics (SLA, scores, clusters, manpower) ──► Dashboard   │
└──────────────────────────────┬───────────────────────────────────────┘
                               │ HTTPS JSON (minimal fields, PII scrubbed)
┌──────────────────────────────▼───── Vercel (Next.js) ───────────────┐
│  Stateless route handlers: access code → rate limit → size limit →   │
│  Zod validation → OpenAI call (structured outputs) → typed response  │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
                        ┌──────▼──────┐
                        │  OpenAI API │  chat model + embeddings model
                        └─────────────┘
```

## 4. Technology stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router), TypeScript strict mode |
| UI | React 19, Tailwind CSS 4, shadcn/ui (Radix), lucide-react icons |
| Charts | Recharts (bar, area, Sankey), custom SVG sparklines and HTML heatmaps |
| Tables | TanStack Table v8 + TanStack Virtual |
| Excel parsing | SheetJS (`xlsx`), in the browser |
| State | Zustand, in memory only (no `persist`) |
| Validation | Zod (request bodies, AI responses) |
| AI | Official `openai` Node SDK, server-side only |
| Clustering | TypeScript average-linkage clustering in a Web Worker |
| Tests | Vitest (unit), Playwright (end-to-end smoke test) |
| Hosting | Vercel, deployed from GitHub `main`, preview deployments on PRs |

## 5. Code structure

```
src/
  app/
    page.tsx, layout.tsx          Single-page app shell
    api/                          Stateless route handlers (server only)
      classify/  embed/  summarise-clusters/  location-criticality/
      draft-cr/  insights/  health/
  components/
    AppShell.tsx                  Header, stage router, refresh warning
    upload/  mapping/  progress/  locations/
    dashboard/                    Sidebar, filter bar, settings drawer, 10 tabs
    common/                       Shared UI: badges, AI marker, charts, sparkline
    ui/                           shadcn/ui primitives
  config/                         All tunables (categories, keywords, synonyms,
                                  scoring, SLA, shifts, trades, limits, locations)
  lib/
    parse/                        Workbook, header/column detection, dates, normalisation
    analysis/                     SLA, scoring, clustering, manpower, locations, derive
    pipeline/                     Orchestrator, API client (retry/backoff), caches
    ai/                           OpenAI client, prompts, JSON schemas, demo mode (server only)
    server/                       Route wrapper, rate limiter (server only)
    api/contracts.ts              Shared request/response contracts (Zod)
    pii.ts, crFormat.ts, types.ts
  workers/cluster.worker.ts       Clustering off the main thread
  store/useAnalysisStore.ts       Single Zustand store
  hooks/useAnalysis.ts            Memoised derived analytics + filtering
scripts/                          Sample workbook generator, secret checker
tests/unit, tests/e2e
```

## 6. User flow and application stages

The app is a single page whose content is driven by `stage` in the store:

| Stage | Component | What happens |
|---|---|---|
| `upload` | `UploadStep` | Data notice + "I understand" consent; file picked or sample loaded; parsed in the browser |
| `sheets` | `SheetStep` | Choose which sheets to include (each sheet name becomes the legacy category) |
| `mapping` | `MappingStep` | Auto-detected columns confirmed; date previews; data-quality summary; token estimate |
| `running` | `ProgressPanel` | Pipeline runs with per-stage progress, cancel and retry |
| `locations` | `LocationReviewStep` | Optional override of AI location-criticality ratings |
| `dashboard` | `Dashboard` | Ten tabs, global filters, scoring settings |

An optional `AccessGate` wraps every stage when `ACCESS_CODE` is set. A `beforeunload` warning protects unsaved work once data exists.

## 7. Data ingestion (browser)

1. **Parse** (`lib/parse/workbook.ts`): SheetJS reads every sheet. Header rows are detected by skipping title rows (the first row with ≥ 60% of the best row's text cells). CSV text is kept raw so dates are read day-first.
2. **Detect columns** (`lib/parse/columns.ts`):
   - Headers are scored against a synonym dictionary (strong and weak synonyms), then checked against the column contents (dates, long text).
   - Columns are assigned greedily, one per field.
   - A separate time column is attached when it shares a synonym with a date column.
3. **Parse dates** (`lib/parse/dates.ts`): handles Excel serials, `dd/mm/yyyy` (day-first default), ISO, `dd-MMM-yy hh:mm` and 12-hour times. All times are stored as wall-clock values in UTC instants, so results don't depend on the browser's time zone.
4. **Normalise** (`lib/parse/normalise.ts`):
   - Drops blank, repeated-header and total rows, and rows without a description.
   - Normalises status and expands location abbreviations ("L3" → "level 3").
   - Flags exact duplicates (same text and location within 10 minutes).
   - Builds the data-quality summary.

Output: `DefectRecord[]` held in the store.

## 8. Analysis pipeline

Orchestrated in the browser by `lib/pipeline/orchestrator.ts`. Each AI stage is split into batches, run 4 at a time, and retried with exponential backoff (honouring `Retry-After` on 429s). Every result is cached in memory by a hash of its input, so resuming or retrying only re-sends what failed.

| # | Stage | Where | Detail |
|---|---|---|---|
| 1 | Keyword pre-pass | Browser | Locks the category when keywords are confident **and** agree with the legacy sheet |
| 2 | Classify | `POST /api/classify` (25 records/call) | Category, Others sub-theme, system function, fault type, summary, impact, severity, root cause, confidence, rationale |
| 3 | Embed | `POST /api/embed` (100 texts/call) | Vector for "summary + fault type" (512 dimensions) |
| 4 | Cluster | Web Worker | Average-linkage clustering per category on cosine similarity (threshold 0.82); clusters with ≥ 3 reports are recurring issues |
| 5 | Summarise | `POST /api/summarise-clusters` (10 clusters/call) | Title, problem statement, root cause, system function, recommended action |
| 6 | Location criticality | `POST /api/location-criticality` (200/call) | High / Medium / Low with a reason; user can override |
| 7 | Draft CRs | `POST /api/draft-cr` (1 cluster/call) | Auto-drafted for P1/P2 recurring issues when the dashboard opens |
| 8 | Insights | `POST /api/insights` | 3–5 bullets from aggregate statistics only |

If some batches fail, results are partial. Unclassified records fall back to the keyword or legacy category, and a "Retry failed batches" banner appears.

## 9. Derived analytics (deterministic, live)

`lib/analysis/derive.ts` combines the inputs into enriched records and cluster views:
- records, AI classifications and user overrides;
- clusters and location ratings;
- scoring weights and the reference date.

It is memoised in `hooks/useAnalysis.ts` and recomputes whenever an input changes. For about 1,500 records this takes well under the 300 ms target, which is why sliders and overrides update instantly.

| Metric | Module | Rule |
|---|---|---|
| SLA | `sla.ts` | Response ≤ 2 h, turnaround ≤ 4 h from the reported time; open items aged against the reference date; implausible durations excluded |
| Location repeats | `clustering.ts` | Same category and location, ≥ 2 reports within 30 days |
| Record score | `scoring.ts` | `100 × (0.35·Impact + 0.25·Frequency + 0.20·Location + 0.20·SLA)` |
| Cluster score | `scoring.ts` | P75 of member scores × (1 + 0.05 × distinct locations, max 10), capped at 100 |
| Priority band | `scoring.ts` | P1 ≥ 75, P2 ≥ 55, P3 ≥ 35, P4 below |
| Trade | `manpower.ts` | Category / sub-theme → trade (e.g. Toilet → Plumber or Cleaner) |
| Manpower | `manpower.ts` | Day × hour heatmap. Headcount = max(ceil(FTE − 0.1), coverage minimum), where FTE = demand per shift ÷ (shift hours × utilisation). Optional P85 "plan for peak" |

Global filters (date, category, location, priority, status, sheet, function, trade) are applied after derivation. Clicking a chart element adds a filter (cross-filtering).

## 10. API layer (server)

All routes live in `src/app/api/*/route.ts` and go through `lib/server/http.ts → handlePost`:

```
Request
  → access code check (if ACCESS_CODE set)      401
  → per-IP sliding-window rate limit            429 + Retry-After
  → body size limit (256 KB)                    413
  → JSON parse + Zod validation                 400
  → PII scrub → OpenAI call (structured output) 502 on upstream failure
  → Zod validation of AI response + post-processing
  → JSON response { … } or { error: { code, message } }
```

- **Stateless:** no caching and no storage on the server. `maxDuration = 60` s.
- **Request bodies are never logged.** Errors log only the route, error code and upstream status.
- **AI client** (`lib/ai/client.ts`):
  - Uses Chat Completions with strict JSON-schema Structured Outputs, `temperature: 0` and low reasoning effort.
  - Any parameter a model rejects is dropped automatically.
  - Prompts embed the category definitions, system-function taxonomy and severity rubric, and instruct the model to use only facts from the supplied records.
- **Demo mode** (`MOCK_AI=1`, `lib/ai/mock.ts`) replaces OpenAI with deterministic keyword rules, for tests and demos. The UI shows a banner while it is on.
- `GET /api/health` reports whether the AI is configured, whether demo mode is on and whether an access code is required. It returns no data.

## 11. State management

One Zustand store (`store/useAnalysisStore.ts`), held in memory only:

| Group | Contents |
|---|---|
| Session | consent, access code, server health |
| Input | workbook, selected sheets, column mapping, day-first flag |
| Data | records, data-quality summary |
| AI results | classifications, clusters + summaries, location ratings, CRs, insights |
| User edits | category overrides, location overrides, CR edits |
| Pipeline | per-stage progress, running/error state |
| View | settings (weights, threshold, reference date, manpower assumptions), filters, active tab |

Caches of AI results (`lib/pipeline/cache.ts`) sit outside the store as module-level maps. "New analysis" clears both.

## 12. Security and privacy

| Concern | Control |
|---|---|
| File confidentiality | Parsed in the browser; never uploaded or stored |
| Data sent to OpenAI | Only description, location, asset, action taken and legacy category; reporter names and unmapped columns never sent |
| Personal data | Emails, phone numbers and NRIC-like IDs replaced with placeholders, in the browser and again on the server |
| Insights | Built from aggregate statistics only (no record text) |
| API key | Server-only (`server-only` imports). Build fails if the key name is in client code or the key name/value is in the browser bundle |
| Open access abuse | Per-IP rate limit, payload and row caps, optional `ACCESS_CODE`, OpenAI monthly spend limit (set in the OpenAI dashboard) |
| Browser hardening | CSP (`'self'` only), `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `nosniff`, no analytics or trackers |
| Logging | No request bodies in logs |

## 13. Deployment

```
Developer ──git push──► GitHub (wijehdude/fix-it)
                              │  main → Production
                              │  PR   → Preview
                              ▼
                         Vercel build
          (secret check → next build → bundle secret check)
                              │
                              ▼
     Static SPA (CDN) + serverless route handlers (Node.js, 60 s)
```

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | Required, production only |
| `OPENAI_MODEL` | Chat model, default `gpt-5.4-mini` |
| `OPENAI_EMBEDDING_MODEL` | Default `text-embedding-3-small` |
| `RATE_LIMIT_PER_MIN` | Optional, default 120 |
| `ACCESS_CODE` | Optional password gate |
| `MOCK_AI` | Demo mode; set only on Preview |

## 14. Quality and testing

| Layer | Tooling | Coverage |
|---|---|---|
| Unit | Vitest (51 tests) | Date parsing, column auto-detection (incl. the sample file), normalisation, SLA, scoring formula, clustering, keyword pre-classifier, manpower |
| End-to-end | Playwright | Upload sample → map → analyse → review locations → all 10 tabs → CRs drafted. Runs in demo mode locally, or against any deployed URL |
| Build gates | `npm run build` | Typecheck, lint, secret checks |

## 15. Performance and limits

| Item | Value |
|---|---|
| File limit | 10 MB, 10,000 rows |
| Batch sizes | classify 25, embed 100, summarise 10, locations 200 |
| Concurrency | 4 parallel requests |
| Measured run | 296 sample records end to end in ~1.5 min (production, real AI) |
| Target | 1,500 records in ≤ 3–5 min; interactions ≤ 300 ms |
| Clustering | O(n²) nearest-neighbour chain, per category, in a Web Worker |

## 16. Known limitations and extension points

- **No persistence by design:** refreshing loses results. Saved history would need a database and authentication.
- **Rate limiting is per serverless instance**, not global. A shared store (e.g. Redis) would make it global.
- **The SLA clock is 24/7**; business hours would need a calendar in `config/sla.ts`.
- **Category overrides don't regroup clusters automatically.** "Apply and re-cluster" re-groups them using the cached embeddings.
- **Extending the scheme:** add a category or system function in `src/config/`; prompts, schemas and the UI pick it up automatically.
