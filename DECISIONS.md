# Decisions log

Choices made where the PRD was ambiguous or the platform required it. Each favours the simplest option that meets the stated goal.

## Platform

1. **Next.js 16.4 with `cacheComponents` and `partialPrefetching` turned off.** The app is a client-side SPA with stateless POST routes, so Cache Components adds nothing.
2. **TanStack Table v8**, not v9, for a stable, well-known API.
3. **Recharts' built-in `Sankey`** instead of `@nivo/sankey`, to avoid a second charting library.
4. **CSP allows `'unsafe-inline'` scripts.** Next.js injects inline bootstrap scripts, and nonce-based CSP would force dynamic rendering. Everything else is `'self'`, frames are denied, and there are no third-party origins.
5. **The default chat model is `gpt-5.4-mini`.** `temperature: 0` and `reasoning_effort: low` are sent by default. If a model rejects either parameter with a 400 error, it is dropped and remembered per model, because some reasoning models reject `temperature`.
6. **Structured Outputs use hand-written strict JSON schemas** (all properties required, nullable instead of optional). Responses are then validated again with Zod.
7. **Embeddings are requested at 512 dimensions** and rounded to 5 decimal places, to keep responses small. Cosine clustering quality is unaffected in practice.
8. **`GET /api/health` was added** (not in the PRD's route list). The UI needs to know whether the AI is configured and whether an access code is required or correct. It returns no data.
9. **`MOCK_AI=1` demo mode** was added so the Playwright smoke test and demos run without an API key. A banner is shown whenever it is on.

## Data handling

10. **Times are wall-clock values.** Every date is stored as a UTC instant holding the local wall-clock time (e.g. `05/03/2025 08:15` → `2025-03-05T08:15Z`) and read with `getUTC*`. Results never depend on the browser's time zone. Time-zone designators in ISO strings are ignored.
11. **There is one column mapping across the selected sheets**, built from the union of their headers. Sheets that lack a mapped column just have that field empty. Per-sheet mappings were judged unnecessary because legacy sheets normally share a layout.
12. **Header row detection:** within the first 15 rows, the header is the first row with at least 60% as many text cells as the best row. This skips title rows.
13. **Summary/total rows** are dropped when any of these hold:
    - The description is short (< 40 chars) and contains "total".
    - A cell is just "Total".
    - Fewer than 30% of the mapped fields are filled and there is no description.
14. **Rows without a description are dropped**, and counted in the data-quality summary.
15. **Exact duplicates** need a reported time: same normalised description + normalised location, reported within 10 minutes of the first report in the group. They are kept and flagged, and excluded from counts, frequency and SLA aggregates.
16. **Status normalisation** uses keyword rules. If the status is blank but there is a completion time, the record is Closed. If both are blank, it is Open.
17. **CSV files are read as raw text**, so the day-first date parser handles them. SheetJS would otherwise assume US dates.

## Classification

18. **Keyword lock:** the category is locked only when the keyword score is ≥ 3, beats the runner-up by ≥ 2, and matches the legacy sheet's category. The record still goes to the LLM for every other field.
19. **Records the AI could not classify** (failed batches) fall back to: keyword lock → confident keyword match → legacy sheet → Others (sub-theme "Unclassified"). They are flagged in the UI, and "Retry failed batches" re-sends only those records.
20. **Category overrides** update every count, score, trade and chart immediately. Cluster membership stays as computed, so summaries stay consistent; a cluster's category is its members' majority category. "Apply and re-cluster" in Scoring settings re-clusters using the overrides and cached embeddings.

## Clustering and scoring

21. **Clustering is exact average linkage** via the nearest-neighbour-chain algorithm (O(n²)), with the dendrogram cut at the similarity threshold. It runs in a Web Worker, separately within each category.
22. **Cluster IDs are a hash of the sorted member IDs**, so summaries are cached across re-clustering when membership is unchanged.
23. **Frequency component:** `clusterSize` is a record's non-duplicate cluster size (1 if unclustered). The **P95 is taken over clusters with ≥ 2 members**; with singletons included it collapses towards 1. If there are no multi-member clusters it falls back to all clusters, minimum 1.
24. **Impact component** uses 0.5 when severity is unknown (record not AI-classified).
25. **SLA component** order of checks:
    - TAT breached, or open and older than 4 h → 1.0
    - otherwise response breached → 0.6
    - otherwise TAT met, or open and still within 4 h → 0
    - otherwise → 0.3 (unknown)
26. **Open record:** no completion time and status not Closed. "Open past 4 h" uses the reference date: by default the latest timestamp in the data, switchable to "now".
27. **Location criticality** is keyed by the normalised location. Records without a location use "Unknown" (0.5).
28. **Location repeats** use the effective (possibly overridden) category and the normalised location. Every record inside a 30-day window holding ≥ 2 such records is marked as a repeat.

## Change requests

29. **CR drafting starts once the user opens the dashboard**, after the optional location-criticality review, because priority depends on location criticality. CRs are auto-drafted once for P1/P2 recurring clusters. If later changes promote more clusters, the CR tab offers "Draft N missing P1/P2 CRs" rather than spending tokens automatically.
30. **Deterministic CR fields are built client-side from the data, never by the AI:** CR ID, category, system function, evidence (counts, dates, locations, quotes with source rows, SLA breach rate) and priority breakdown. The AI writes only the narrative fields.
31. **CR ID** is `CR-<today's date>-<NNN>`, where NNN is a session counter. Re-drafting a CR keeps its ID.

## Manpower

32. **Toilet trade split:** a record goes to a Cleaner if its system function is "Sanitary – Consumables" or its text mentions cleanliness or consumables; otherwise it goes to a Plumber. Others sub-themes map to trades where configured, otherwise General Handyman.
33. **Observed man-hours** = median (completed − responded) per trade, clamped to 0.25–8 h. It is used only with ≥ 5 observations, and the user can turn it off or override it per trade.
34. **Demand per shift** = mean weekly man-hours for that trade and shift ÷ 7 (one daily shift instance). With "Plan for peak", the P85 week is used instead.
35. **Headcount** = `max(ceil(FTE − 0.1), coverageMin)`, where `FTE = demand / (shift hours × utilisation)`.
    - The 0.1 tolerance is needed because a literal `ceil` of any positive demand gives at least 1, which would make the PRD's "on-call" outcome impossible.
    - `coverageMin` = 1 if the trade has demand in that shift in ≥ 25% of weeks.
36. **SLA-risk note:** flagged when the busiest 2-hour window in a shift (average man-hours per occurrence) exceeds headcount × 2 h × utilisation. With zero headcount, it is flagged when that window exceeds 0.5 h.
37. **Each job is assigned to the shift containing its reported hour.** Shift names should be unique.

## UI

38. **Category colours** use a validated colour-blind-safe categorical palette, in fixed order, with separate light and dark steps. Priority bands use status colours, always paired with the band text.
39. **Rate limit default is 120/min per IP**, not the PRD's example of 60. A 1,500-record run makes ~100+ requests in a few minutes, and the client honours `Retry-After`.
40. **Token estimate** is shown before running. A dollar figure is not shown, because model prices change; set a spend limit in the OpenAI dashboard instead.
