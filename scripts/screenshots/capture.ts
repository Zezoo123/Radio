/**
 * Automated README screenshots. Launches the BUILT app (`npm run build` first —
 * the `screenshots` script does both) against an ISOLATED temporary userData
 * directory seeded with fictional demo data, walks the three tabs and the
 * Settings drawer, and writes PNGs into docs/screenshots/.
 *
 * The real %APPDATA%/radio-simian-scheduler (or the macOS equivalent) is never
 * touched: a tiny wrapper module calls `app.setPath('userData', …)` before the
 * app boots, and the temp directory is deleted afterwards.
 */
import { execFileSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect, type Page } from '@playwright/test'
import { _electron, type ElectronApplication } from 'playwright'
import { demoEditorLog, seedUserData, writeDemoTemplates } from './demo-data'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const OUT_DIR = join(ROOT, 'docs', 'screenshots')
const WRAPPER = join(ROOT, 'out', 'main', 'screenshot-entry.mjs')
const STATION = 'RadioHitsFM'

let app: ElectronApplication
let page: Page
let tmp: string

/** Queue the next native open-dialog result inside the main process. */
async function stubOpenDialog(paths: string[]): Promise<void> {
  await app.evaluate(({ dialog }, filePaths) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths })
  }, paths)
}

async function shoot(name: string): Promise<void> {
  await page.waitForTimeout(400) // let fonts/layout settle
  await page.screenshot({ path: join(OUT_DIR, name) })
}

/** The LOG grid's cells are <input>s — text locators can't see their values. */
function gridValue(substr: string, inViewport = false): Promise<boolean> {
  return page.evaluate(
    ({ s, vp }) => {
      for (const el of document.querySelectorAll<HTMLInputElement>('.log-grid input')) {
        if (!el.value.includes(s)) continue
        if (!vp) return true
        const r = el.getBoundingClientRect()
        if (r.top >= 0 && r.bottom <= window.innerHeight) return true
      }
      return false
    },
    { s: substr, vp: inViewport }
  )
}

test.beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'radio-shots-'))
  const userData = join(tmp, 'userData')
  await seedUserData(userData, STATION)
  const templatePaths = await writeDemoTemplates(join(tmp, 'sheets'))
  const logPath = join(tmp, 'sheets', 'H-demo.txt')
  await writeFile(logPath, demoEditorLog(), 'utf8')
  process.env.SHOT_TEMPLATES = JSON.stringify(templatePaths)
  process.env.SHOT_LOG = logPath

  // The built entry names the app "Electron" when launched directly, which
  // would point userData at the real ~/Library/…/Electron. The wrapper pins
  // userData to the sandbox before anything else runs.
  await writeFile(
    WRAPPER,
    `import { app } from 'electron'\n` +
      `app.setPath('userData', process.env.SHOT_USER_DATA)\n` +
      `await import('./index.js')\n`,
    'utf8'
  )

  app = await _electron.launch({
    args: [WRAPPER, '--force-device-scale-factor=2'],
    env: { ...process.env, SHOT_USER_DATA: userData }
  })

  // The unpackaged app auto-opens detached DevTools — wait for the real window.
  page = await app.firstWindow()
  while (page.url().startsWith('devtools://')) {
    await new Promise((r) => setTimeout(r, 200))
    const w = app.windows().find((w) => !w.url().startsWith('devtools://'))
    if (w) page = w
  }
  await app.evaluate(({ BrowserWindow }) => {
    for (const w of BrowserWindow.getAllWindows()) {
      if (w.webContents.getURL().startsWith('devtools://')) continue
      w.webContents.closeDevTools()
      w.setContentSize(1600, 1000)
      w.center()
    }
  })
  await page.setViewportSize({ width: 1600, height: 1000 })
})

test.afterAll(async () => {
  await app?.close()
  await rm(tmp, { recursive: true, force: true })
  await rm(WRAPPER, { force: true })

  // Downscale (device pixels → 1600px wide) and report sizes. sips ships with
  // macOS; elsewhere the PNGs are simply left at capture resolution.
  if (process.platform === 'darwin') {
    for (const f of SHOTS) {
      const p = join(OUT_DIR, f)
      try {
        execFileSync('sips', ['--resampleWidth', '1600', p], { stdio: 'ignore' })
        console.log(`${f}: ${(statSync(p).size / 1024).toFixed(0)} KB`)
      } catch {
        /* file missing (skipped shot) — nothing to resize */
      }
    }
  }
})

const SHOTS = [
  'hero-log.png',
  'booking.png',
  'grid-clocks.png',
  'grid-promos.png',
  'editor-simulation.png',
  'settings.png'
]

test('capture README screenshots', async () => {
  test.setTimeout(240_000)

  // ---- Station picker --------------------------------------------------------
  await page.getByRole('button', { name: STATION }).click()
  await expect(page.locator('.tab', { hasText: 'BOOKING' })).toBeVisible()

  // ---- BOOKING: import the demo templates + promos sheet ---------------------
  await stubOpenDialog(JSON.parse(process.env.SHOT_TEMPLATES!))
  await page.getByRole('button', { name: '+ Add file' }).click()
  await expect(page.locator('.book-row')).toHaveCount(4)

  // The sheet has no row in the Booking table (placement lives on the Grid
  // tab); the Grid promos layer below is where its content is asserted.
  await stubOpenDialog([join(ROOT, 'test', 'fixtures', 'Promos.xlsx')])
  await page.getByRole('button', { name: '+ Promos sheet' }).click()

  // Select the first element so the plan grid + inspector fill in.
  await page.locator('.book-row').first().click()
  await expect(page.locator('.tgrid')).toBeVisible()
  await shoot('booking.png')

  // ---- GRID: clocks layer, painted week, hour inspector ----------------------
  await page.locator('.tab', { hasText: 'GRID' }).click()
  await expect(page.locator('.grid-tbl')).toBeVisible()
  // Monday 07:00 — a painted Morning hour; the inspector shows its rows + azan.
  await page.locator('.grid-tbl tbody tr').nth(7).locator('td').nth(1).click()
  await expect(page.locator('.gridwork .work-insp .insp-title')).toContainText('07:00')
  await shoot('grid-clocks.png')

  // ---- GRID: promos layer (blocked hours black, placements visible) ----------
  await page.locator('.seg-btn', { hasText: 'Promos' }).click()
  await expect(page.locator('.cell-gblocked').first()).toBeVisible()
  // Pick the first program so blackout/excluded/placed cells all show.
  await page.locator('.lib-item').nth(1).locator('.lib-main').click()
  await expect(page.locator('.cell-blackout').first()).toBeVisible()
  await shoot('grid-promos.png')

  // ---- LOG: build the day from the Grid --------------------------------------
  // PROMOS stays off for this shot: the day serializes clocks → azan → promos
  // → element sections, and ~100 promo rows would push the section headers a
  // full screen away from the azan block.
  await page.locator('.tab', { hasText: 'LOG' }).click()
  await page.locator('.logwork .chip', { hasText: 'AZAN' }).click()
  await page.locator('.logwork .chip', { hasText: 'PROMOS' }).click()
  await page.getByRole('button', { name: 'Build from Grid' }).click()
  await expect(page.locator('.log-grid')).toBeVisible({ timeout: 30_000 })

  // The grid is virtualized — scroll until the first element-section header
  // (right after the azan block) enters the viewport, so azan rows and a
  // section header share the frame.
  let found = false
  for (let i = 0; i < 120 && !found; i++) {
    await page.locator('.log-scroll').evaluate((el) => el.scrollBy(0, 400))
    await page.waitForTimeout(60)
    found = await gridValue('ADV-2704  Nile Cola', true)
  }
  expect(found).toBe(true)
  // A few rows further so the header and the first section rows sit fully
  // inside the frame instead of clipping at the bottom edge.
  await page.locator('.log-scroll').evaluate((el) => el.scrollBy(0, 260))
  expect(await gridValue('AZAN', true)).toBe(true)
  await shoot('hero-log.png')

  // ---- LOG: playout simulation (cut = red, skipped = yellow) -----------------
  // The demo log carries durations in its Length column, so Expected simulates
  // the deck without an audio.mdb on hand.
  await page.evaluate(() => {
    window.confirm = () => true // "discard unsaved changes?" — headless yes
  })
  await stubOpenDialog([process.env.SHOT_LOG!])
  await page.getByRole('button', { name: 'Open…' }).click()
  await expect.poll(() => gridValue('SNG-1204')).toBe(true)
  await page.locator('.logwork .chip', { hasText: '↻ EXPECTED' }).click()
  // The engineered cut (red) and skip (yellow) must actually be on screen.
  await expect(page.locator('.st-interrupted').first()).toBeVisible()
  await expect(page.locator('.st-skipped').first()).toBeVisible()
  await shoot('editor-simulation.png')

  // ---- Settings drawer on a non-default theme --------------------------------
  await page.locator('.topbar .icon-btn[title="Settings"]').click()
  await expect(page.locator('.settings-drawer')).toBeVisible()
  await page.locator('.theme-card', { hasText: 'Studio' }).click()
  await shoot('settings.png')
})
