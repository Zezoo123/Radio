# Radio Scheduler — Handover

A desktop app (Electron + React + TypeScript) that automates a radio station's daily
playout scheduling and exports logs that import directly into **BSI Simian Pro**. This
doc is the context dump for picking the project up fresh.

- **Repo:** https://github.com/Zezoo123/Radio (private). Local: `/Users/zezo/git/Radio`, branch `main`.
- **Current version:** `0.3.0`. **Tests:** 56 passing (`npm test`). Typecheck + build clean.
- ⚠️ **This is its own git repo.** `/Users/zezo` (home) is a *separate, unrelated* git repo — don't confuse them. Always `cd /Users/zezo/git/Radio`.
- ⚠️ **Uncommitted WIP:** `src/renderer/src/views/ClockEditor.tsx` has an in-progress change (a `NO_NAME_CATEGORIES = ['MACRO','COMMENT']` rule that disables the Name/cart cell for those categories). Verify/finish or discard before relying on it.

---

## What the app does (two halves)

**A. Daily Simian scheduler** (the original goal). Inputs → composed day → Simian log:
- **Station grid** (Excel): which program airs each time-segment per weekday (merged cells = multi-day/-hour spans).
- **Element templates** (Excel, per sponsor/group): ads / features / liners at fixed times per day.
- **AZAN files** (monthly `.txt`): the 5 daily prayer (athan) times — authoritative, see below.
- Output: a `|`-delimited Simian program-log `.txt` for one day or a date range.
- UI views: **Import**, **Programs** (program title → Simian file-name map), **Export**.

**B. Formats module** (Natural Grid–style "clocks"). UI view: **Formats**. Build reusable hour
clocks, paint them onto a 7×24 week grid, and export a Simian skeleton — and (recently) feed those
clock rows into the daily export. Includes default clocks, sequentials, date tokens, the NEXT DAY LOG
row, and save/load of the whole setup to a portable file.

The sidebar nav (`src/renderer/src/App.tsx`) has: **Import · Programs · Formats · Export**.

---

## Run / build / test

```bash
npm install
npm run dev        # launch the app (electron-vite)
npm test           # vitest (56 tests)
npm run typecheck  # tsc --noEmit
npm run build      # electron-vite production build
npm run build:win  # build Windows installer + portable .exe (see Packaging)
```

Stack: **Electron 33**, **React 18**, **TypeScript 5.7**, **Vite/electron-vite**, **vitest**.
Deps: `exceljs` (xlsx parsing), `adhan` (prayer times). Dev: `electron-builder`.

---

## Architecture

Electron two-process. Domain logic lives in `src/main/core/` (pure TS, no Electron) so it's unit-tested
directly by vitest and importable by the renderer for previews.

```
src/main/index.ts        Electron main entry (window, IPC registration)
src/main/ipc.ts          ALL ipcMain handlers (file dialogs, parse, compose, export, formats, sequentials)
src/main/session.ts      In-memory session: loaded grid/templates/azan + program map; compose options
src/main/formats.ts      formats.json persistence (FormatStore) + re-exports normalizeFormatSet
src/main/sequentials.ts  sequentials.json persistence (defs + rotation queues)
src/preload/index.ts     contextBridge `window.api` (typed). Built to out/preload/index.mjs

src/main/core/
  types.ts               ScheduleEvent, Section, ScheduleDay, CalendarDate, Cue ('+'|'@'|'#')
  dates.ts               dateRange, weekday (0=Sun..6=Sat), addDays
  xlsx.ts                robust cell text extraction + merge-map (rich text, merged cells)
  export/simian.ts       THE output serializer: eventLine, sectionHeaderLine, dateHeaderLine,
                         dayLines, serialize, withRowCategory. Byte-exact, CRLF.
  parsers/stationGrid.ts Parse station grid (2-D merge aware), programsForDate, programTitles
  parsers/elementTemplate.ts  Parse ad/element templates; eventsForDate; ElementTemplate.category;
                         "1" cell = play bare code once; else `<CODE>_<TRACK>`
  parsers/azanFile.ts    Parse monthly AZAN .txt → per-day verbatim athan rows
  prayer/athan.ts        Compute prayer times (adhan, Cairo/Egyptian) — APPROXIMATE fallback only
  prayer/athanRows.ts    Build the 2-row athan format from times (compute mode)
  schedule/compose.ts    composeDay/composeRange/exportRange — merge programs + elements + athan +
                         hourly + formatLines into ordered ScheduleDay(s). athanCategory override.
  schedule/hourly.ts     Top-of-hour comment marker rows
  format/types.ts        HourFormat, FormatRow, WeekGrid, FormatSet, DEFAULT_CATEGORIES, helpers
  format/expand.ts       expandFormatAtHour (filters by row.hour), dayRows (layers default clock),
                         serializeDay/Week
  format/resolveDay.ts   resolveForDate: expand a day, fill date tokens, resolve {sequential} tokens
                         in time order (pops queues), handle row-level next-day. Returns text + advanced seqs.
  format/tokens.ts       Date tokens [yymmdd], [Day] (full weekday name), [DayNum], etc. (TOKEN_PRESETS)
  format/normalize.ts    Validate/migrate a parsed FormatSet (7×24 grid, seeded defaults)
  sequential/            Sequential type, values (PREFIX-## / PREFIX-A), rng (seeded), resolve (queue
                         rotation, no-repeat-twice-in-a-row, persisted queue+last)

src/renderer/src/views/
  ImportView.tsx     grid + templates + AZAN load; athan mode; per-template category etc.
  ProgramsView.tsx   program title → file-name map editor
  FormatsView.tsx    owns the FormatSet; tabs: Clocks / Default clocks / Week grid; save/load format file
  ClockEditor.tsx    edit a clock's rows; Insert dialog; NEXT DAY LOG category; hover-trash delete-confirm
  WeekGrid.tsx       7×24 paint grid + per-day default-clock selector row
  InsertDialog.tsx   categorized insert popup: Date tokens, Sequentials (+ SequentialEditor)
  SequentialEditor.tsx  create/edit a sequential
  ExportView.tsx     daily scheduler export (date range, preview)
```

---

## Output format (BSI Simian) — the critical spec

Pipe-delimited, **CRLF** line endings, trailing CRLF. Columns: `Time|Cue|Name|Category|Description`
(Name-only rows drop the last two). Mapped in Simian's *Tools → Program Options → Log Import* filter.

- **Event:** `HH:MM:SS|<cue>|<NAME>` (+ `|Category|Description` when set)
- **Comment:** `|||COMMENT|<text>`
- **Date header (3 lines):** rule / `…=§§   01   -   06   -   2026   §§=…` / rule
- **Section header:** `||||| ----…<spaces><CODE> <Name>` (text starts at column 63)
- **Cues:** `+` sequential (most), `@` time-immediate (athan), `#` time-next. Only these three.
- **Day order in `dayLines`:** date header → format (clock) rows → hourly markers → athan → element sections.

**Golden test:** `Baheya.xlsx` → `test/fixtures/Baheya.expected.txt` byte-for-byte (underscore names
`ADS_1710_A`, CRLF). `.gitattributes` keeps fixture CRLF intact. Do not break this.

---

## Key conventions & features

- **Element/ad file names:** cell value = track; name `<CODE>_<TRACK>` (underscores). Cell `1` = bare code once.
- **Athan: import the user's AZAN files (exact), don't compute.** adhan drifts ~1 min and no rounding
  matches the official Egyptian timetable. Each prayer = 2 rows (a `@` DECKFADE macro + a `+` audio row
  `AZ22-0XRB|FEA|AZAN <prayer>`). Compute mode exists as an approximate fallback. `athanCategory` can
  relabel the Category column.
- **Date tokens** (Formats): `[yymmdd]`, `[yyyymmdd]`, `[mmddyy]`, `[ddmm]`, `[mmdd]`, `[Day]` (full
  weekday, e.g. `Thursday`), `[DayNum]` (Mon=1..Sun=7). Resolved at export with the chosen date.
- **NEXT DAY LOG:** a pseudo-category in the clock row's Category dropdown. Auto-fills 23:59:59 / `+` /
  empty name (editable) / Category `LOG` / Description `[Day] [YYMMDD] Log`, sets row `nextDay:true`,
  locks the row. `nextDay` makes the row's date tokens resolve to tomorrow (for loading the next day's
  Simian log). Legacy `[NEXT]` text in a field still works.
- **Default clocks:** a separate clock list (Default clocks tab); each applies to EVERY hour of a day.
  Rows can pin an `hour` (0-23) to fire once that hour. Per-day assignment via the Week grid "Default" row.
- **Sequentials:** `{name}` tokens. A named prefix → `PREFIX-##` (numerical) or `PREFIX-A` (alpha) over a
  range. Persisted **rotation queue** so repeated uses in a day are distinct, refills (shuffled if
  `randomize`) when empty, never repeats twice in a row, and continues across exports. Prefixes can
  contain date tokens (resolved after the sequential).
- **Resolution order in resolveForDate:** sequential `{}` first, then date `[]` tokens (so a sequential
  prefix can include date tokens).
- **Format files:** Formats view → "Save format… / Load format…" writes/reads the whole FormatSet
  (clocks, default clocks, grid, dayDefaults, categories) as portable JSON. Sequentials are NOT bundled
  (they live in the global `sequentials.json`).

---

## Persistence

Auto-saved JSON in Electron `app.getPath('userData')` (Windows: `%APPDATA%\radio-simian-scheduler\`):
- `formats.json` — the FormatSet (auto-saved on every change in FormatsView)
- `sequentials.json` — sequential defs + rotation queues
- `program-map.json` — program title → file-name map

Portable export/import only for the format set (see Format files above).

---

## Packaging (Windows .exe)

`npm run build:win` → `dist/` produces a **portable** `Radio Scheduler-<ver>-portable.exe` and an NSIS
**installer** `Radio Scheduler-Setup-<ver>.exe` (x64). Config: `electron-builder.yml`.

- Built **from macOS**. `signAndEditExecutable: false` skips the Wine-dependent rcedit/sign step (the
  bundled Wine 4.0.1 can't run on current macOS). The app is 100% functional; it just lacks embedded
  version metadata + custom icon. First build downloads ~115 MB Electron + tools (cached afterward).
- **Unsigned** → Windows SmartScreen warns on first run (More info → Run anyway). Signing needs a paid cert.
- Pure-JS deps only (exceljs/adhan) → no native rebuild, fully standalone bundle.
- CI: `.github/workflows/build-windows.yml` builds on a real Windows runner (Actions → Run workflow, or
  push a `v*` tag → attaches .exe to a Release). That path stamps version metadata properly.

To cut a new build: bump `version` in `package.json`, commit, `npm run build:win`, send
`dist/...-portable.exe`.

---

## Gotchas (read before editing)

- **Preload path:** main loads `../preload/index.mjs` (it builds as `.mjs`, not `.js`). Changing it to
  `.js` causes a black screen (preload fails → `window.api` undefined → renderer crashes). `main.tsx`
  guards with a "Preload not loaded" message.
- **Main-process changes need a full dev restart.** Anything in `src/main/**` (incl. `core`) — quit and
  re-run `npm run dev`. Renderer-only changes hot-reload. (A "it doesn't work" report is usually a stale
  main process.)
- **CRLF everywhere** in Simian output. Keep it. Don't normalize fixtures.
- **Don't break the Baheya golden test** (byte-exact).
- **resolveForDate is stateful** for sequentials (pops/persists queues). Preview uses a date-seeded rng
  (no persist); export uses Math.random and persists the advanced queues only if the file is saved.

---

## Open items / ideas (not done)

- **Optimization pass** (noted, not implemented): debounce FormatsView auto-save + preview (they fire on
  every keystroke/paint); memoize WeekGrid cells. No memory leaks found. (See git history / ask.)
- Bundle **sequentials into format files** so a moved grid is fully self-contained.
- **App icon** (currently the default Electron icon) and **code signing**.
- Finish the **uncommitted ClockEditor** MACRO/COMMENT name-disable WIP.
- Wire-up review of the **Formats → daily export integration** (`formatLinesForDate`) end-to-end in the UI.
- Page-12 **time tokens** (`[hh]`, `[dhhmm]`, `[#]` counters) as another Insert category (optional).

## Sample/reference data

`test/fixtures/`: `Baheya.xlsx` + `Baheya.expected.txt` (golden), `2026-Template.xlsx`,
`HitsGrid.xlsx`, `MegaGrid.xlsx` (station grids), `AZAN-2026-06.txt` (athan), `HitsFm.sample.txt`.
Original user inputs live under `~/Library/CloudStorage/Dropbox/Zeyad/2026/`.
Approved design plan: `~/.claude/plans/i-want-to-build-glowing-cat.md`.
