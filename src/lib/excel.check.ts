// Builds the Excel report from the sample resumes and reads it back. Run: npm run check:excel
import { readFileSync, writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { assemble } from './scoring'
import { lexicalEmbed, offlineEvaluate, offlineRequirements } from './offline'
import { buildMonthlyWorkbook, buildWorkbook } from './excel'

const jd = readFileSync('src/lib/fixtures/jd.txt', 'utf8')
const reqs = offlineRequirements(jd)
const results = await Promise.all(['priya', 'john', 'arjun'].map(async (n, i) => {
  const cv = readFileSync(`src/lib/fixtures/${n}.txt`, 'utf8')
  return assemble(String(i), `${n}.pdf`, reqs, await offlineEvaluate(reqs, cv, `${n}.pdf`, lexicalEmbed), cv, false, 'offline')
}))
results.sort((a, b) => b.score - a.score)
const logo = readFileSync('public/indotech-logo.png')
const wb = await buildWorkbook({
  title: 'Senior Frontend Engineer', date: Date.UTC(2026, 8, 29), received: 4, results, reqs,
  decisions: { 0: 'shortlist', 1: 'reject' }, notes: { 0: 'Phone screen Thursday' },
  interviews: { 0: { when: '2026-10-01T10:30', mode: 'video', where: 'meet.google.com/abc-defg' } },
}, logo.buffer.slice(logo.byteOffset, logo.byteOffset + logo.byteLength))
const out = process.argv[2] ?? 'shortlist-report.check.xlsx'
writeFileSync(out, Buffer.from(await wb.xlsx.writeBuffer()))

const back = new ExcelJS.Workbook()
await back.xlsx.readFile(out)
assert.deepEqual(back.worksheets.map((w) => w.name), ['Summary', 'Shortlisted', 'On hold', 'Rejected', 'Undecided', 'All candidates'])
const sum = back.getWorksheet('Summary')!
const val = (label: string) => { let v: unknown; sum.eachRow((r) => { if (r.getCell(1).value === label) v = r.getCell(2).value }); return v }
assert.equal(val('Resumes received'), 4)
assert.equal(val('Screened and ranked'), 3)
assert.equal(val('Could not be read'), 1)
assert.equal(val('Shortlisted'), 1)
assert.equal(val('Rejected'), 1)
assert.equal(val('Awaiting decision'), 1)
assert.equal(back.getWorksheet('All candidates')!.getRow(6).getCell(7).value, 'Email')
const priya = back.getWorksheet('Shortlisted')!.getRow(7)
assert.equal(priya.getCell(15).value, 'Phone screen Thursday')
assert.deepEqual(priya.getCell(7).value, { text: 'priya.raman@mail.com', hyperlink: 'mailto:priya.raman@mail.com' })
assert.ok(back.worksheets.every((w) => w.getImages().length === 1), 'logo on every sheet')
assert.match(String(priya.getCell(16).value), /Video call \(meet\.google\.com\/abc-defg\)/)

// Monthly report across two saved screenings.
const run = { id: 'r1', date: new Date(2026, 8, 12).getTime(), title: 'Senior Frontend Engineer', jd, reqs, results, received: 4,
  decisions: { 0: 'shortlist' as const, 1: 'reject' as const }, notes: { 0: 'Strong system design' },
  interviews: { 0: { when: '2026-09-30T10:30', mode: 'video' as const, where: 'meet.google.com/abc-defg' } } }
const mwb = await buildMonthlyWorkbook([run, { ...run, id: 'r2', date: new Date(2026, 7, 2).getTime(), title: 'Older role' }], '2026-09',
  logo.buffer.slice(logo.byteOffset, logo.byteOffset + logo.byteLength))
const mout = out.replace(/\.xlsx$/, '-monthly.xlsx')
writeFileSync(mout, Buffer.from(await mwb.xlsx.writeBuffer()))
const mb = new ExcelJS.Workbook()
await mb.xlsx.readFile(mout)
assert.deepEqual(mb.worksheets.map((w) => w.name), ['Monthly summary', 'Interviews', 'Shortlisted'])
assert.equal(mb.getWorksheet('Monthly summary')!.getCell('B7').value, 1, 'one screening in September')
assert.equal(mb.getWorksheet('Interviews')!.getCell('B7').value, 'Priya Raman')
console.log('ok', out, results.map((r) => `${r.eval.name} ${r.score}`))
