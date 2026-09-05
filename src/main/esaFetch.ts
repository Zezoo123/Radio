import { parseEsaMonthHtml, type EsaDay } from './core/prayer/esaTimes'

/**
 * Fetches the official Cairo azan tables from esa.gov.eg (the Egyptian Survey
 * Authority) — an ASP.NET WebForms page, so each month is a postback: GET the
 * page for the hidden state fields, then POST the city + month selection.
 *
 * Only ever called from the Settings "fetch" action — builds and exports never
 * touch the network; they read the persisted store.
 */

const ESA_URL = 'https://www.esa.gov.eg/monthlymwaket.aspx'
const TIMEOUT_MS = 25_000

export interface EsaFetchResult {
  days: EsaDay[]
  monthsOk: number[]
  monthsFailed: number[]
}

async function fetchText(url: string, init?: RequestInit): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { ...init, signal: controller.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

const hiddenField = (html: string, name: string): string =>
  html.match(new RegExp(`name="${name}"[^>]*value="([^"]*)"`))?.[1] ?? ''

async function fetchMonth(month: number): Promise<EsaDay[]> {
  // Fresh GET per month: viewstate + eventvalidation must match the served page.
  const page = await fetchText(ESA_URL)
  // Option 1 of the city dropdown is Cairo (القـاهـرة) — taken verbatim so the
  // exact tatweel characters in the value always match what the server expects.
  const city = [...page.matchAll(/<option[^>]*value="([^"]*)"/g)].map((m) => m[1])[1]
  if (!city) throw new Error('city dropdown not found')

  const body = new URLSearchParams({
    __EVENTTARGET: 'ctl00$placeholder1$DropDownList2',
    __EVENTARGUMENT: '',
    __VIEWSTATE: hiddenField(page, '__VIEWSTATE'),
    __VIEWSTATEGENERATOR: hiddenField(page, '__VIEWSTATEGENERATOR'),
    __EVENTVALIDATION: hiddenField(page, '__EVENTVALIDATION'),
    'ctl00$placeholder1$DropDownList1': city,
    'ctl00$placeholder1$DropDownList2': String(month)
  })
  const result = await fetchText(ESA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  })
  return parseEsaMonthHtml(result)
}

/**
 * Fetch every month the site offers (the current year — it has no year
 * selector). A month that fails or parses empty is reported, not fatal, so a
 * mid-year hiccup still stores everything else.
 */
export async function fetchEsaYear(
  onProgress?: (month: number, days: number) => void
): Promise<EsaFetchResult> {
  const days: EsaDay[] = []
  const monthsOk: number[] = []
  const monthsFailed: number[] = []
  for (let month = 1; month <= 12; month++) {
    try {
      const parsed = await fetchMonth(month)
      if (parsed.length === 0) throw new Error('no table in response')
      days.push(...parsed)
      monthsOk.push(month)
      onProgress?.(month, parsed.length)
    } catch {
      monthsFailed.push(month)
      onProgress?.(month, 0)
    }
  }
  return { days, monthsOk, monthsFailed }
}
