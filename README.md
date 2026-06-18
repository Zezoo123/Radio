# Radio Scheduler

A cross-platform desktop app (Electron + React + TypeScript) that automates a radio station's
day-to-day playout scheduling and exports a log that imports directly into **BSI Simian Pro v1.8.6**.

## What it does

Given two kinds of Excel inputs:

- **Station grid** — which program airs in each time segment, per weekday.
- **Element templates** — per sponsor/category tables that say exactly when each audio element
  (ads, features, commercial liners, …) plays on each day.

it composes a daily playout that also includes:

- **Athan** — the 5 daily prayer calls, computed for Cairo (Egyptian General Authority of Survey).
- **Hourly comment markers** and a **per-day date header**.

…and exports a `|`-delimited text log for a single day or any date range, ready for Simian's
*Tools → Program Options → Log Import*.

## Output format (Simian program log)

```
HH:MM:SS|<cue>|<NAME>          event row (cue: + sequential, @ time-immediate, # time-next)
|||COMMENT|<text>              comment row
||||| ----…  <CODE> <Name>     section header per group
```

Element file names use underscores: `ADS_1710_A` (`<CODE>_<TRACK>`, single track defaults to `_A`).

## Develop

```bash
npm install
npm run dev        # launch the app
npm test           # run unit + golden-file tests
npm run typecheck  # type-check
```

## Layout

```
src/main/        Electron main process + domain core (parsers, prayer, schedule, export)
src/preload/     contextBridge API
src/renderer/    React UI
test/            unit + golden-file tests; test/fixtures holds sample inputs
```
