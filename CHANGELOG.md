# Changelog

All notable changes to the Radio Scheduler, newest first. Windows builds for
every version are on the [Releases page](https://github.com/Zezoo123/Radio/releases).

## 1.0.0 — 2026-07-30

**The Modernist redesign.** The whole app is reorganized around the operator's
workflow into three sections — everything about a task on one screen, with the
data front and center.

### The new shell

- **Three top tabs replace the sidebar**: **BOOKING** (audio elements),
  **GRID** (clocks · promos · azan) and **LOG** (build · edit · export).
  Station switcher, date and Settings (now a right-side drawer) live in the
  tab bar's chrome.
- **New default theme, "Modernist"**: ink on paper with a signal-red accent,
  square corners, strong section rules, and the Archivo typeface bundled into
  the app. The five previous themes and the high-contrast switch remain in
  Settings.

### BOOKING (was Import)

- One table of every booked element — code, group, category, times, covers,
  source file — with direct **Add file / Add folder / Promos sheet** buttons.
- Selecting an element keeps its **whole plan in view**: the dates × hours
  grid with totals, or the Simian-text preview for any date.
- The inspector edits the element code and category, shows the plan's track
  letters, and links to where the element lands (Grid → Log).

### GRID (was Formats + Promos, plus Azan from Settings)

- **One 24×7 week grid with three layers**: CLOCKS (paint clocks onto hours,
  with a per-day default row), PROMOS (per-program placements, blackouts and
  drag-to-exclude hours — or aggregate counts across programs), and BLOCKED
  HOURS (drag to paint; the old dialog is gone).
- **Clock library on the left**: select to paint, edit rows full-width,
  duplicate/delete, day-default clocks, format-set save/load and the skeleton
  export.
- **Per-hour inspector on the right**: the covering clock's rows, promos
  placed that hour, and the day's real azan times with the include toggle.
- **Clock rows are now a flat spreadsheet** — no box around every value; the
  grid lines are the structure and only the focused cell lights up.

### LOG (was Export + Editor)

- **Build from Grid** composes a date range (clocks + booked elements +
  promos + azan) and loads it straight into the editable log grid — no more
  preview/hand-off two-step. **Export range…** still writes multi-day batches
  directly to files.
- **Includes chips** toggle every source individually: CLOCKS, AUDIO
  ELEMENTS, PROMOS, AZAN and HOURLY MARKERS. Excluding clocks also stops
  sequential rotations from advancing for rows that never export.
- **⛶ Full screen**: nothing but the log grid and a slim control bar
  (Esc exits).
- The day inspector holds composition warnings (**NEEDS ATTENTION**), the
  audio-database tools, the Expected legend, and Save/Save as.
- An unsaved log still survives switching tabs.

## 0.7.1 — 2026-07-28

### Promos

- **Blocked hours are now picked per day per hour** on the same 7×24 week table
  as the promo placement grids (blocked cells show black everywhere). An hour
  header toggles that hour across the week, a day name toggles the whole day,
  and previously saved blocked hours migrate automatically to every day.
- **Drag to paint.** Hold left click and sweep across any promo grid — the
  blocked-hours table and every per-program placement table. The first cell
  decides the direction (block/exclude vs clear), so a drag never flickers.
  Edits apply instantly and save once on release.

### Formats

- **Sort by time** button on every clock (regular and default): reorders the
  rows by Min:Sec. Equal times keep their order; NEXT DAY LOG stays last.
- **Date tokens accept a day offset**: `[yymmdd-1]` fills in the day before
  the export date (yesterday's episode), `[Day+2]` two days after — correct
  across month and year ends. The Insert dialog gained a **Day offset** field
  that bakes the offset into every preset and its live example.

### Editor

- **The duration column round-trips.** Opening a text log that carries a
  Length column — between Name and Category (Simian's own order) or trailing —
  reads it into the **Dur** column; logs without one open with durations at
  zero, as before. Saving writes each row's duration back as the Length column
  (`Time|Cue|Name|Length|Category|Description`); rows with no duration keep
  the plain 5-column form.
- **Pickable Expected start time**: a strict `HH:MM:SS` field next to
  “Open log” (default 00:00:00) sets the clock the playout simulation starts
  from, for logs that begin mid-day. Digits overwrite in place — the field
  can never hold anything but a valid time.

### Settings

- **App-wide opacity controls** for the category colors: one Highlight
  opacity (default 35%) and one Text opacity (default 100%) applied to every
  category — colors stay stored as plain `#rrggbb`.

## 0.7.0 — 2026-07-26

- **Import**: templates preview as an hour-condensed plan grid (`3A B 2C`
  cells, month band, sticky Time/Count columns); the element code is editable
  in place; whole-folder import under the same Add menu.
- **Promos**: station rules — blackout hours and break minutes (`:20`/`:40`);
  never the same hour set two days running; multi-value cells (`A B`) fixed.
- **Formats**: default-clock rows can target a set of hours picked in a
  multi-select dialog; format files are portable and carry sequentials with
  their counters; one-click row duplication (⧉).
- **Editor / Export**: logs export as ANSI (Windows-1256) so Arabic survives
  Simian's import; Update Dur & Desc from the audio database with Arabic
  re-decoded; search & replace with per-column scope; stronger category row
  colors.
- Every export/preview date defaults to tomorrow and the Export range keeps
  itself valid; page intros became ? help tooltips; large-grid performance
  work (debounced saves and previews).

## 0.6.0 — 2026-07-19

- Switchable UI themes (Dark, Light, Minimal, Graphite, Studio) with a
  high-contrast option, picked in Settings.
- Per-category text colors alongside the row highlights; Settings became a
  regular page.
- Sticky table headers; RTL (Arabic) text pinned readable in Editor cells;
  track suffixes join with a dash (`CODE-A`); ADS→ADV rename; FEA azan
  category; Promos day preview grouped by promo.

## 0.5.0 — 2026-07-15

- First packaged release: Import, Formats, Promos, Export, Editor and
  Settings for the four stations (MegaFM, NaghamFM, RadioHitsFM, Sha3byFM),
  with BSI Simian log composition, AZAN rows, sequentials and the playout
  (Expected) simulation.
