# Code runthrough

This is a guided tour of the Radio Scheduler codebase — enough to find your way around, change
things safely, and understand *why* the pieces are shaped the way they are. Read the
[README](../README.md) first for what the app does from the user's side.

## The big picture

Electron's standard two-process model, with one deliberate twist: **all domain logic is pure
TypeScript with no Electron imports**, isolated under `src/main/core/`. That's what makes the
interesting parts of this app (parsers, the compose pipeline, the playout simulation) directly
unit-testable with vitest — no app boot, no mocking.

```
┌────────────────────────────── main process ─────────────────────────────┐
│  index.ts      window creation, app lifecycle                           │
│  ipc.ts        every ipcMain.handle() — ~44 channels, thin glue         │
│  session.ts    in-memory state per station (imports, toggles)           │
│  station.ts    active station + per-station data dirs                   │
│  formats.ts / promos.ts / sequentials.ts /                              │
│  azanFormat.ts / uiSettings.ts        JSON persistence stores           │
│                                                                         │
│  core/         PURE domain logic (no Electron) ◄── vitest tests run     │
│                                                    against this         │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │ contextBridge: src/preload/index.ts
                               │ (typed `window.api`, one method per channel)
┌──────────────────────────────┴──────────────────────────────────────────┐
│  renderer (React)                                                       │
│  App.tsx       sidebar, station switcher, view routing, themes          │
│  views/        one component per tab + Settings + StationPicker         │
│  components/   LogGrid (the Editor's spreadsheet-like grid)             │
│  lib/          renderer-side pure logic (log rows, playout simulation)  │
└─────────────────────────────────────────────────────────────────────────┘
```

Data flows one way: **spreadsheets → parsers → compose → serialize → Simian log text**. The
Editor works on the other end of that arrow: **log text (or .bsi) → rows → simulate → edit →
save**.

## `src/main/core/` — the domain

### Foundations

| File | What it holds |
|---|---|
| `types.ts` | The shared vocabulary: `Cue` (`'+' \| '@' \| '#'`), `ScheduleEvent` (one log row), `Section` (a group of events under a header), `ScheduleDay` (everything one day emits), `CalendarDate`. |
| `dates.ts` | `weekday()` (0 = Sunday … 6 = Saturday — used everywhere), `addDays`, `dateRange`. UTC-based to dodge timezone traps. |
| `xlsx.ts` | Excel helpers on top of `exceljs`: `extractText` (rich text/formula-safe cell text) and merge-map utilities for sheets with merged headers. |

### Parsers (`core/parsers/`)

- **`elementTemplate.ts`** — the sponsor/group Excel sheets. Layout: group + code header rows,
  day-of-month columns, then time rows whose cells hold track letters. `eventsForDate()` turns one
  calendar date into `ScheduleEvent`s: cell `A` → name `CODE-A`, cell `1` → the bare code.
- **`promosFile.ts`** — the promos workbook (one row per program): airdays `S M T W T F S`
  (Sun→Sat), airtime From/To, promo file name, per-weekday promo counts. Airtime cells are Excel
  *time serials*; they're read via `getUTCHours()` because exceljs maps serials onto fixed UTC
  instants — local-time getters would drift by the machine's timezone (a real bug we hit).
- **`bsiLog.ts`** — Simian's native `.bsi` program log, which is actually a **Microsoft Access
  (Jet) database** with a single `List` table (`Cue, Time, Name, Length, Category, Description,
  …, AbsPosition`). Read with `mdb-reader`, ordered by `AbsPosition`, converted to the app's pipe
  lines with per-row durations. Text is stored in the Arabic codepage (Windows-1256) but decodes
  as Windows-1252 mojibake — `fixArabicText()` maps characters back to bytes and re-decodes.

### The compose pipeline (`core/schedule/` + friends)

`schedule/compose.ts` is the heart of the Export tab. `ComposeOptions` carries the layers, and
`composeOneDay()` assembles a `ScheduleDay` per date:

1. **Element sections** — `sectionForDate()` per imported template.
2. **AZAN** — `prayer/azan.ts` computes the five Cairo prayer times (Egyptian General Authority
   of Survey, via the `adhan` library); `prayer/azanRows.ts` turns each into rows using the
   configurable `AzanFormat` (deckfade macro N seconds before, the azan audio, extra lines).
3. **Hourly markers** — `schedule/hourly.ts`, comment rows at the top of each hour.
4. **Format (clock) rows** — resolved per date by the caller (see next section) and injected as
   `formatLinesForDate`.
5. **Promos** — injected as `promoLinesForDate` (see Promos below).

`export/simian.ts` then serializes byte-exactly: date-header block, format rows, hourly markers,
azan, promos, then one section per template — pipe-delimited, CRLF, trailing CRLF. The exact byte
structure (dash counts, column positions of section headers) is pinned by constants and by the
golden test (below). **Do not hand-roll log lines elsewhere; go through `eventLine()`.**

### Formats: clocks, tokens, sequentials (`core/format/` + `core/sequential/`)

- `format/types.ts` — `HourFormat` (a clock), `WeekGrid` (7×24 assignment of clocks),
  `FormatSet` (everything the Formats tab owns), `DEFAULT_CATEGORIES`.
- `format/expand.ts` — expands the grid for a weekday: assigned clocks fire in their hours,
  the day's *default clock* fills the rest.
- `format/tokens.ts` — date tokens (`[yymmdd]`, `[Day]`, `[DayNum]`, …).
- `sequential/` — `{name}` tokens that rotate through `PREFIX-01…N` (or `-A…Z`) with a
  **persisted queue**: values pop one by one, the queue refills (shuffled if randomized) when
  empty, and never repeats the same value twice in a row — across exports, because the queues are
  saved after a successful export.
- `format/resolveDay.ts` — ties it together for one date: expand → substitute `{sequential}`
  tokens in time order → fill date tokens (so a sequential prefix may itself contain date
  tokens) → handle the next-day row. Returns the text *and* the advanced sequentials.
  **Statefulness rule:** previews resolve with a date-seeded RNG and never persist; exports use
  the live RNG and persist the advanced queues only after the file is actually written.

### Promos (`core/promos/schedule.ts`)

Places each program's promos for a date under the airing rules. Key properties:

- **Blackout**: program start → end + 2h on its airdays (past-midnight airtimes bleed into the
  next morning), plus any per-weekday hours the user excluded in the UI.
- **≤ 1/hour, N/day** (the per-weekday count from the sheet), spread evenly over allowed hours.
- **Variation**: the chosen hour-set must differ from yesterday, tomorrow, and the same weekday
  last week. Achieved by re-rolling a salt against the neighbours' base picks.
- **Deterministic**: everything is seeded from (file name, date) with `mulberry32`, so the same
  inputs always give the same times — preview equals export, with no persisted state.

### The Simian audio database (`core/simianDb.ts`)

Loads `audio.mdb` (Access again, via `mdb-reader`), finds the audio table heuristically (scores
tables for a filename-like + length-like column), and builds a name → duration map. Lookups are
case-insensitive, extension-stripping, and dash/underscore tolerant — the scheduling sheets write
`ADV_1710_A`, the audio library stores `ADV-1710-A.wav`.

## `src/main/` — the Electron shell

- **`station.ts`** — the fixed station list and the active-station pointer. Per-station files
  live under `userData/stations/<Station>/`; global settings sit at the `userData` root.
- **`session.ts`** — in-memory, per-station state: loaded templates, the promos file, the
  include-azan/include-promos toggles, hourly-marker options. `composeOptions()` is where all the
  layers meet before `exportRange()`.
- **`ipc.ts`** — every `ipcMain.handle`. Handlers are deliberately thin: dialogs + a session or
  store call. Channel naming is `module:action` (`templates:add`, `promos:week`,
  `schedule:export`, `log:open`, `simian:durations`, …).
- **Stores** (`formats.ts`, `promos.ts`, `sequentials.ts`, `azanFormat.ts`, `uiSettings.ts`) —
  one tiny class each: `load()` (normalize-or-default, migration lives here — e.g. the ADS→ADV
  category rename) and `save()`.
- **`../preload/index.ts`** — the whole renderer↔main surface as one typed object exposed as
  `window.api`. If you add a channel, add its method here; the types flow into the renderer.

## `src/renderer/` — the UI

- **`App.tsx`** — station picker gate, the collapsed icon sidebar (expands on hover), view
  routing, theme application. The **Editor stays mounted** when you switch tabs (hidden with
  `display:none`) so an unsaved log survives navigation; everything remounts on station switch.
- **`theme.ts`** + `styles.css` — five themes (Dark, Light, Minimal, Graphite, Studio) plus a
  high-contrast toggle, all via CSS custom properties keyed off `data-*` attributes on `<html>`.
- **Views** — one file per tab (`ImportView`, `FormatsView` + `ClockEditor`/`WeekGrid`/dialogs,
  `PromosView`, `ExportView`, `EditorView`, `SettingsView`, `StationPicker`).
- **`lib/logRows.ts`** — the Editor's document model. Each log line becomes a `LogRow` of five
  pipe-fields; extra pipes (section headers) fold into the description and the original field
  count is remembered, so an untouched file round-trips **byte-for-byte**.
- **`lib/runtime.ts`** — the playout simulation (see below).
- **`components/LogGrid.tsx`** — the Editor grid. Rows are `React.memo`-ized with stable handler
  identities so a keystroke or drag-hover re-renders one row, not thousands (this mattered: the
  naive version pegged a CPU core on real logs). Also owns drag-reorder, duplicate/insert/delete,
  category colors, and Excel-style column resizing (widths persist in `localStorage`).

### The playout simulation (`lib/runtime.ts`)

`simulateLog()` models the Simian deck to predict each row's real air time:

- `+` starts when the previous item finishes.
- `@` (timed-immediate) fires **at its scheduled time** — the row playing at that moment is cut
  (`interrupted`, red), everything queued between the playhead and the `@` never plays
  (`skipped`, yellow), and the clock lands exactly on the `@`.
- `#` (timed-next) fires at its scheduled time but lets the current item **finish** first, then
  jumps straight to itself, skipping the in-between rows.
- A timed row *reached* before its time plays immediately like a `+` — no dead air, ever. The
  scheduled time only pulls the playhead **forward**.
- Timed rows in real logs are usually **bare markers** (a time, no audio); they fire all the
  same. Only the next timed row below the playhead is armed at any moment.

In the Editor this recomputes **on demand** (the ↻ button; edits show an "expected outdated"
badge) because a timeline-shifting edit would otherwise repaint every following row per keystroke.

## Testing

`npm test` runs vitest over `test/` (~96 tests). The load-bearing ones:

- **The golden test** (`elementTemplate.test.ts` + `test/fixtures/Baheya.expected.txt`): a real
  month of a real sponsor's schedule must serialize **byte-for-byte**. `.gitattributes` protects
  the fixture's CRLF. If this breaks, the station's import breaks — treat it as sacred.
- `promos.test.ts` — blackout windows, ≤1/hour, counts, day-to-day/week-over-week variation,
  determinism, exclusions (against the real promos sheet in `fixtures/Promos.xlsx`).
- `runtime.test.ts` — the playout simulation rules, cue by cue.
- `logRows.test.ts` — Editor round-trip safety (section headers, bare rows, verbatim lines).
- `simianDb.adhoc.test.ts` — **self-skipping local integration tests** that run against the real
  `audio.mdb` / `.bsi` files on the author's machine and silently skip elsewhere (including CI).

Conventions worth keeping: core changes get pure-function tests; timezone-sensitive code gets run
under several `TZ=` values; new fixtures go in `test/fixtures/`.

## Building & releasing

- `npm run dev` — electron-vite dev server (renderer hot-reloads; **main-process changes need a
  full restart**).
- `npm run build:win` — local Windows installer + portable `.exe` into `dist/` (works from macOS;
  unsigned, so SmartScreen warns).
- **CI**: `.github/workflows/build-windows.yml` builds on a Windows runner for every `v*` tag and
  attaches both `.exe`s to a GitHub Release (electron-builder runs with `--publish never`; the
  workflow's release step does the attaching).

## Gotchas (learned the hard way)

- The preload builds as `index.mjs` — the main process loads that exact name; changing it black-
  screens the app.
- Everything Simian is **CRLF**. Don't normalize, don't let editors "fix" the fixtures.
- Excel *time* cells must be read via UTC getters (see `promosFile.ts`); Excel *date* headers via
  cell text. Mixing these up produces silent off-by-timezone bugs.
- `.bsi` and `audio.mdb` are Access databases — never write them in place. The Editor deliberately
  refuses to save over a `.bsi` (it saves a text log instead).
- Sequential queues only persist when an export is actually written — cancelling the save dialog
  must not advance rotations.
