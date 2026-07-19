# Radio Scheduler

A desktop app (Electron + React + TypeScript) that runs the day-to-day playout scheduling of a
group of Egyptian radio stations and speaks the native formats of **BSI Simian Pro** — the playout
automation system the stations broadcast with. It turns the spreadsheets the planning team already
maintains into ready-to-air program logs, distributes program promos automatically under the
station's airing rules, and includes a full log editor that can open Simian's own `.bsi` files and
predict the real air time of every row.

Four stations are built in — **MegaFM, NaghamFM, RadioHitsFM, Sha3byFM** — each with fully
separate data. Pick a station on launch and switch any time from the sidebar.

## What it does, tab by tab

### Import
Load the planning spreadsheets:
- **Element templates** (Excel) — per sponsor/group tables that say exactly when each audio
  element (ads, features, commercial liners…) plays on each calendar day. A cell holds a track
  letter (`A` → file `ADV-1710-A`) or `1` (play the bare code once).
- Everything imported is previewable per template, per day, before it goes near an export.

### Formats
A Natural Grid–style **clock builder**:
- Build reusable hour *clocks* (a list of rows with times, cues, names, categories).
- Paint them onto a **7×24 week grid**; per-day *default clocks* fill every unpainted hour.
- Rows can carry **date tokens** (`[yymmdd]`, `[Day]`, …), **`{sequential}` tokens** (rotating
  jingle/ID numbers with persisted no-repeat queues), and a **NEXT DAY LOG** row that makes
  Simian load tomorrow's log at 23:59:59.
- The whole format set can be saved to / loaded from a portable JSON file.

### Promos
Automatic distribution of program promos from the promos spreadsheet. For every program it reads
the airdays, airtime, promo file name and a per-weekday promo count, then places the promos under
the station's rules:
- never during the program or for 2 hours after it ends (the *blackout*),
- at most one per hour,
- a different spread every day, and different from the same weekday last week,
- deterministic per date — the preview always matches the export.

The weekly grid shows every program's placements; click hours to exclude them per weekday, and a
day preview shows the exact rows that will be exported.

### Export
Compose any date range into a Simian program log: date headers, the Formats clock rows, hourly
comment markers, the computed **AZAN** rows (5 daily prayers, Cairo timetable, format configurable
in Settings), promos, and one section per element template. Preview it, export it to a `.txt` the
station imports via *Simian → Tools → Program Options → Log Import* — or send it straight to the
Editor.

### Editor
A Simian-style log editor:
- Opens exported `.txt` logs **and Simian's native `.bsi` logs** (they are Access databases —
  parsed directly, Arabic text re-decoded, durations read from the file).
- Every cell is editable; rows drag to reorder, duplicate, insert, delete (two-click confirm);
  columns resize like a spreadsheet and remember their widths.
- Load the station's **`audio.mdb`** (Simian's audio database) and every row gets its real
  duration; the **Expected** column then simulates the whole day the way the Simian deck actually
  plays it:
  - `+` starts when the previous item finishes,
  - `@` fires **exactly** at its scheduled time — cutting whatever is playing (marked **red**) and
    skipping the queue up to it (marked **yellow**),
  - `#` waits for the current item to finish, then jumps straight to itself,
  - a timed row reached early just plays through — a radio station never sits silent.
- Rows are tinted by their Simian category using the colors picked in Settings.

### Settings
App-wide preferences: **theme** (Dark, Light, Minimal, Graphite, Studio + high-contrast),
**per-category row colors** (highlight and text), and the **AZAN format** (the deckfade macro and
extra lines emitted around each prayer).

## The Simian log format

Pipe-delimited text, CRLF line endings:

```
HH:MM:SS|<cue>|<NAME>[|Category|Description]   event row
|||COMMENT|<text>                              comment row (date headers, hour markers)
||||| ----…  <CODE>  <Group>                   section header per element group
```

Cues: `+` sequential (play after the previous item), `@` timed-immediate (fire at this exact
time), `#` timed-next (fire after the current item finishes). Timed rows are often bare markers —
a scheduled time with no audio — that steer the playhead.

## Getting started

```bash
npm install
npm run dev        # launch the app in development
npm test           # vitest — unit + golden-file tests
npm run typecheck  # tsc --noEmit
npm run build      # production build
npm run build:win  # Windows installer + portable .exe (dist/)
```

Windows releases are also built by CI: pushing a `v*` tag builds on a real Windows runner and
attaches both `.exe`s to a GitHub Release.

## Where data lives

Everything persists as JSON under Electron's `userData` directory
(Windows: `%APPDATA%/radio-simian-scheduler/`):

| File | Scope | Contents |
|---|---|---|
| `stations/<Station>/formats.json` | per station | clocks, default clocks, week grid |
| `stations/<Station>/promos.json` | per station | imported promo set, hour exclusions, time overrides |
| `stations/<Station>/sequentials.json` | per station | sequential definitions + rotation queues |
| `azan-format.json` | global | the AZAN row format |
| `ui-settings.json` | global | category colors |

## Reading the code

Start with **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — a guided runthrough of the whole
codebase: the process model, every module, how a day gets composed into a log, the playout
simulation rules, and the file formats (including Simian's `.bsi` and `audio.mdb`).

The short version:

```
src/main/core/     pure TypeScript domain logic — no Electron, fully unit-tested
src/main/          Electron main process: session state, IPC, persistence stores
src/preload/       the typed contextBridge (window.api)
src/renderer/      the React UI (one view per tab)
test/              vitest suites + golden fixtures (byte-exact output tests)
```
