import type { Cell, Worksheet } from 'exceljs'
import type { Decision, Requirement, Result } from './types'
import { describeInterview, formatWhen, MODE_LABEL, monthly, type Interview } from './hr'
import type { SavedRun } from './history'

export interface Report {
  title: string
  date: number
  received: number
  results: Result[]
  reqs: Requirement[]
  decisions: Record<string, Decision>
  notes: Record<string, string>
  interviews?: Record<string, Interview>
}

const RED = 'FFED1C24' // Indo Tech brand red, from the logo
const INK = 'FF1F2937'
const MUTED = 'FF6B7280'
const LINE = 'FFE5E7EB'
const ZEBRA = 'FFF9FAFB'
const DECISION_LABEL: Record<Decision, string> = { shortlist: 'Shortlisted', hold: 'On hold', reject: 'Rejected', none: 'Undecided' }
const TONE = (s: number) => (s >= 75 ? 'FF11906A' : s >= 55 ? 'FFB77A06' : 'FFCF3450')
const thin = { style: 'thin' as const, color: { argb: LINE } }
const border = { top: thin, left: thin, bottom: thin, right: thin }

const COLUMNS = [
  { header: 'Rank', width: 7 }, { header: 'Candidate', width: 24 }, { header: 'Match score', width: 12 }, { header: 'ATS score', width: 11 },
  { header: 'Decision', width: 13 }, { header: 'Experience (yrs)', width: 15 }, { header: 'Email', width: 30 }, { header: 'Phone', width: 18 },
  { header: 'LinkedIn', width: 30 }, { header: 'GitHub', width: 28 }, { header: 'Portfolio', width: 28 },
  { header: 'Matched skills', width: 40 }, { header: 'Missing essentials', width: 32 }, { header: 'Summary', width: 60 },
  { header: 'HR notes', width: 36 }, { header: 'Interview', width: 34 }, { header: 'File', width: 26 },
]

function link(cell: Cell, text: string, href: string) {
  if (!text) return
  cell.value = { text, hyperlink: href }
  cell.font = { color: { argb: 'FF2563EB' }, underline: true }
}

/** Logo across the top of a sheet, then a title and subtitle. Content starts at `startRow`. */
function brand(ws: Worksheet, logo: number | null, title: string, subtitle: string) {
  ws.views = [{ showGridLines: false }]
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 }
  ws.getRow(1).height = 46
  if (logo !== null) ws.addImage(logo, { tl: { col: 0.2, row: 0.25 }, ext: { width: 276, height: 46 }, editAs: 'absolute' })
  ws.getCell('A3').value = title
  ws.getCell('A3').font = { size: 16, bold: true, color: { argb: INK } }
  ws.getCell('A4').value = subtitle
  ws.getCell('A4').font = { size: 10, color: { argb: MUTED } }
}

function headerRow(ws: Worksheet, row: number, labels: string[]) {
  const r = ws.getRow(row)
  labels.forEach((l, i) => {
    const c = r.getCell(i + 1)
    c.value = l
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RED } }
    c.alignment = { vertical: 'middle', wrapText: true }
    c.border = border
  })
  r.height = 22
}

function candidateSheet(wb: import('exceljs').Workbook, logo: number | null, name: string, rows: Result[], rep: Report, rank: Map<string, number>) {
  const ws = wb.addWorksheet(name, { properties: { tabColor: { argb: RED } } })
  brand(ws, logo, `${name} (${rows.length})`, `${rep.title || 'Screening'} · ${new Date(rep.date).toLocaleString()}`)
  COLUMNS.forEach((c, i) => { ws.getColumn(i + 1).width = c.width })
  const H = 6
  headerRow(ws, H, COLUMNS.map((c) => c.header))
  ws.views = [{ state: 'frozen', ySplit: H, xSplit: 2, showGridLines: false }]
  if (!rows.length) {
    ws.getCell(`A${H + 1}`).value = 'No candidates in this group.'
    ws.getCell(`A${H + 1}`).font = { italic: true, color: { argb: MUTED } }
    return
  }
  rows.forEach((r, i) => {
    const c = r.contacts
    const dec = rep.decisions[r.id] ?? 'none'
    const row = ws.getRow(H + 1 + i)
    row.values = [
      rank.get(r.id)!, r.eval.name, r.score, r.ats.score, DECISION_LABEL[dec], r.eval.yearsExperience ?? '',
      '', c?.phone ?? '', '', '', '',
      r.matched.join(', '), r.missingEssential.join(', '), r.eval.summary, rep.notes[r.id] ?? '', rep.interviews?.[r.id]?.when ? describeInterview(rep.interviews[r.id]) : '', r.fileName,
    ]
    // Plain strings from the resume are stored as text, never as formulas; links are only ever mailto: or https://.
    if (c) {
      link(row.getCell(7), c.email, `mailto:${c.email}`)
      link(row.getCell(9), c.linkedin.replace(/^https:\/\//, ''), c.linkedin)
      link(row.getCell(10), c.github.replace(/^https:\/\//, ''), c.github)
      link(row.getCell(11), c.portfolio.replace(/^https:\/\//, ''), c.portfolio)
    }
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      if (col > COLUMNS.length) return
      cell.border = border
      cell.alignment = { vertical: 'top', wrapText: col >= 12, horizontal: col === 1 || col === 3 || col === 4 || col === 6 ? 'center' : 'left' }
      if (i % 2) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } }
    })
    row.getCell(2).font = { bold: true, color: { argb: INK } }
    row.getCell(3).font = { bold: true, color: { argb: TONE(r.score) } }
    row.getCell(4).font = { color: { argb: TONE(r.ats.score) } }
  })
  ws.autoFilter = { from: { row: H, column: 1 }, to: { row: H + rows.length, column: COLUMNS.length } }
}

export async function buildWorkbook(rep: Report, logoPng: ArrayBuffer | null) {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Indo Tech · Shortlist'
  wb.created = new Date(rep.date)
  const logo = logoPng ? wb.addImage({ buffer: logoPng, extension: 'png' }) : null

  const { results, decisions } = rep
  const rank = new Map(results.map((r, i) => [r.id, i + 1]))
  const by = (d: Decision) => results.filter((r) => (decisions[r.id] ?? 'none') === d)
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0)

  // ---------- Summary ----------
  const ws = wb.addWorksheet('Summary', { properties: { tabColor: { argb: RED } } })
  brand(ws, logo, 'Resume Screening Report', `${rep.title || 'Screening'} · ${new Date(rep.date).toLocaleString()} · ${results[0]?.engine === 'ai' ? 'AI assessment' : 'Offline assessment'}`)
  ws.getColumn(1).width = 34
  ws.getColumn(2).width = 14
  ws.getColumn(3).width = 14
  ws.getColumn(4).width = 3
  ws.getColumn(5).width = 50
  ws.getColumn(6).width = 14
  ws.getColumn(7).width = 20

  const table = (row: number, col: number, head: string[], rows: (string | number)[][]) => {
    head.forEach((h, i) => {
      const c = ws.getCell(row, col + i)
      c.value = h
      c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RED } }
      c.border = border
    })
    rows.forEach((r, ri) => r.forEach((v, i) => {
      const c = ws.getCell(row + 1 + ri, col + i)
      c.value = v
      c.border = border
      c.alignment = { horizontal: i ? 'center' : 'left' }
      if (ri % 2) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } }
    }))
    return row + rows.length + 2
  }

  const n = results.length
  const pct = (x: number) => (n ? `${Math.round((100 * x) / n)}%` : '0%')
  let next = table(6, 1, ['Pipeline', 'Count', 'Share'], [
    ['Resumes received', rep.received, ''],
    ['Screened and ranked', n, ''],
    ['Could not be read', Math.max(0, rep.received - n), ''],
    ['Shortlisted', by('shortlist').length, pct(by('shortlist').length)],
    ['On hold', by('hold').length, pct(by('hold').length)],
    ['Rejected', by('reject').length, pct(by('reject').length)],
    ['Awaiting decision', by('none').length, pct(by('none').length)],
    ['Interviews scheduled', by('shortlist').filter((r) => rep.interviews?.[r.id]?.when).length, ''],
  ])
  next = table(next, 1, ['Scores', 'Value', ''], [
    ['Average match score', avg(results.map((r) => r.score)), ''],
    ['Average ATS score', avg(results.map((r) => r.ats.score)), ''],
    ['Highest match score', n ? results[0].score : 0, ''],
    ['Strong matches (75+)', results.filter((r) => r.score >= 75).length, pct(results.filter((r) => r.score >= 75).length)],
    ['Worth a look (55-74)', results.filter((r) => r.score >= 55 && r.score < 75).length, pct(results.filter((r) => r.score >= 55 && r.score < 75).length)],
    ['Weak matches (below 55)', results.filter((r) => r.score < 55).length, pct(results.filter((r) => r.score < 55).length)],
  ])
  const top = results.slice(0, 5).map((r) => [`${rank.get(r.id)}. ${r.eval.name}`, r.score, DECISION_LABEL[decisions[r.id] ?? 'none']])
  table(next, 1, ['Top candidates', 'Match', 'Decision'], top)

  // Requirement coverage, beside the pipeline table.
  table(6, 5, ['Requirement', 'Importance', 'Candidates missing'], rep.reqs.map((q) => [
    q.skill, q.importance === 'essential' ? 'Essential' : 'Preferred',
    results.filter((r) => r.missingEssential.includes(q.skill) || r.missingPreferred.includes(q.skill)).length,
  ]))

  // ---------- One sheet per decision, then everyone ----------
  candidateSheet(wb, logo, 'Shortlisted', by('shortlist'), rep, rank)
  candidateSheet(wb, logo, 'On hold', by('hold'), rep, rank)
  candidateSheet(wb, logo, 'Rejected', by('reject'), rep, rank)
  candidateSheet(wb, logo, 'Undecided', by('none'), rep, rank)
  candidateSheet(wb, logo, 'All candidates', results, rep, rank)
  return wb
}

async function fetchLogo() {
  try { return await (await fetch(`${import.meta.env.BASE_URL}indotech-logo.png`)).arrayBuffer() } catch { return null /* report still works without the logo */ }
}

async function save(wb: import('exceljs').Workbook, name: string) {
  const buf = await wb.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  Object.assign(document.createElement('a'), { href: url, download: name }).click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function downloadExcel(rep: Report) {
  const wb = await buildWorkbook(rep, await fetchLogo())
  const safe = (rep.title || 'screening').replace(/[^\w -]+/g, '').trim().slice(0, 40).replace(/\s+/g, '-')
  await save(wb, `IndoTech-${safe}-${new Date(rep.date).toISOString().slice(0, 10)}.xlsx`)
}

/** A plain bordered table with the brand header, starting at `row`. Returns the next free row. */
function grid(ws: Worksheet, row: number, head: string[], rows: (string | number)[][], empty = 'Nothing to show.') {
  headerRow(ws, row, head)
  if (!rows.length) {
    ws.getCell(row + 1, 1).value = empty
    ws.getCell(row + 1, 1).font = { italic: true, color: { argb: MUTED } }
    return row + 3
  }
  rows.forEach((r, ri) => r.forEach((v, i) => {
    const c = ws.getCell(row + 1 + ri, i + 1)
    c.value = v
    c.border = border
    c.alignment = { vertical: 'top', wrapText: true, horizontal: typeof v === 'number' ? 'center' : 'left' }
    if (ri % 2) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } }
  }))
  return row + rows.length + 2
}

const monthName = (month: string) => new Date(`${month}-01T00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

export async function buildMonthlyWorkbook(history: SavedRun[], month: string, logoPng: ArrayBuffer | null) {
  const { default: ExcelJS } = await import('exceljs')
  const m = monthly(history, month)
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Indo Tech · Shortlist'
  const logo = logoPng ? wb.addImage({ buffer: logoPng, extension: 'png' }) : null
  const sheet = (name: string, title: string, widths: number[]) => {
    const ws = wb.addWorksheet(name, { properties: { tabColor: { argb: RED } } })
    brand(ws, logo, title, `${monthName(month)} · generated ${new Date().toLocaleString()}`)
    widths.forEach((w, i) => { ws.getColumn(i + 1).width = w })
    return ws
  }

  const t = m.totals
  const sum = sheet('Monthly summary', `Hiring report: ${monthName(month)}`, [36, 14, 14, 14, 12, 12, 12, 12, 12, 28])
  let next = grid(sum, 6, ['Pipeline', 'Count'], [
    ['Screenings run', t.screenings], ['Resumes received', t.received], ['Screened and ranked', t.screened],
    ['Shortlisted', t.shortlist], ['On hold', t.hold], ['Rejected', t.reject], ['Awaiting decision', t.none], ['Interviews this month', t.interviews],
  ])
  sum.getCell(next, 1).value = 'By role'
  sum.getCell(next, 1).font = { bold: true, size: 13, color: { argb: INK } }
  grid(sum, next + 1, ['Role', 'Screened on', 'Received', 'Screened', 'Shortlisted', 'On hold', 'Rejected', 'Undecided', 'Avg match', 'Top candidate'],
    m.roles.map((r) => [r.title, new Date(r.date).toLocaleDateString(), r.received, r.screened, r.shortlist, r.hold, r.reject, r.none, r.avg, r.top]),
    'No screenings saved for this month.')

  const iv = sheet('Interviews', `Interviews (${m.interviews.length})`, [26, 24, 30, 14, 34, 30, 18])
  grid(iv, 6, ['When', 'Candidate', 'Role', 'Format', 'Link or location', 'Email', 'Phone'],
    m.interviews.map(({ run, r, i }) => [formatWhen(i.when), r.eval.name, run.title, MODE_LABEL[i.mode], i.where, r.contacts?.email ?? '', r.contacts?.phone ?? '']),
    'No interviews scheduled this month.')

  const sl = sheet('Shortlisted', `Shortlisted candidates (${m.shortlisted.length})`, [24, 30, 12, 10, 30, 18, 34, 36])
  grid(sl, 6, ['Candidate', 'Role', 'Match', 'ATS', 'Email', 'Phone', 'Interview', 'HR notes'],
    m.shortlisted.map(({ run, r }) => [r.eval.name, run.title, r.score, r.ats.score, r.contacts?.email ?? '', r.contacts?.phone ?? '',
      run.interviews?.[r.id]?.when ? describeInterview(run.interviews[r.id]) : '', run.notes[r.id] ?? '']),
    'Nobody shortlisted this month.')
  return wb
}

export async function downloadMonthlyExcel(history: SavedRun[], month: string) {
  await save(await buildMonthlyWorkbook(history, month, await fetchLogo()), `IndoTech-hiring-report-${month}.xlsx`)
}
