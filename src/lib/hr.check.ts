// Self-check for templates, calendar files, duplicate matching and the monthly report. Run: npm run check:hr
import assert from 'node:assert/strict'
import { buildIcs, DEFAULT_TEMPLATES, fill, findDuplicates, mailto, monthly } from './hr'
import type { SavedRun } from './history'
import type { Result } from './types'

// Templates: placeholders fill, and a line with an empty placeholder is dropped.
assert.equal(fill('Hi {name},\nInterview: {interview}\nBye', { name: 'Asha', interview: '' }), 'Hi Asha,\nBye')
assert.equal(fill('Keep {unknown}', {}), 'Keep {unknown}')
const m = mailto(['a@x.com', 'b@y.com'], DEFAULT_TEMPLATES.reject, { name: 'there', role: 'QA Lead' }, true)
assert.ok(m.startsWith('mailto:?') && m.includes('bcc=a%40x.com%2Cb%40y.com') && m.includes('QA%20Lead') && !m.includes('+'))

// Calendar: escaped text, local start time, CRLF lines.
const ics = buildIcs([{ id: '1', name: 'Asha, K', role: 'QA', interview: { when: '2026-10-02T14:30', mode: 'video', where: 'meet.google.com/abc' }, email: 'a@x.com' }], new Date(Date.UTC(2026, 8, 29)))
assert.ok(ics.includes('DTSTART:20261002T143000\r\n'))
assert.ok(ics.includes('SUMMARY:Interview: Asha\\, K (QA)'))
assert.ok(ics.includes('DTSTAMP:20260929T000000Z'))
assert.ok(ics.split('\r\n').every((l) => l.length <= 75))

// Duplicates: same email in this run, same phone in an earlier run.
const res = (id: string, name: string, email: string, phone: string): Result => ({
  id, fileName: `${id}.pdf`, score: 50, ats: { score: 50, checks: [] }, matched: [], missingEssential: [], missingPreferred: [], engine: 'offline',
  eval: { name, headline: '', yearsExperience: null, summary: '', strengths: [], concerns: [], assessments: [], interviewQuestions: [] },
  contacts: { email, phone, linkedin: '', github: '', portfolio: '' },
})
const now = [res('a', 'Asha', 'Asha@x.com', ''), res('b', 'Asha K', 'asha@x.com', ''), res('c', 'Ravi', '', '+91 98765 43210')]
const past: SavedRun = { id: 'old', date: Date.UTC(2026, 7, 3), title: 'Tester', jd: '', reqs: [], results: [res('z', 'Ravi', '', '098765 43210')], decisions: { z: 'reject' }, notes: {} }
const dups = findDuplicates(now, [past], 'cur')
assert.deepEqual(dups.get('a')?.sameRun, ['b'])
assert.deepEqual(dups.get('c')?.past, [{ title: 'Tester', date: past.date, decision: 'reject' }])
assert.equal(dups.has('z'), false)

// Monthly: counts decisions per run, interviews by the month they happen.
const sep: SavedRun = { id: 'cur', date: new Date(2026, 8, 10).getTime(), title: 'QA Lead', jd: '', reqs: [], results: now, received: 4,
  decisions: { a: 'shortlist', b: 'reject' }, notes: {}, interviews: { a: { when: '2026-10-01T10:00', mode: 'phone', where: '' } } }
const rep = monthly([sep, past], '2026-09')
assert.deepEqual(rep.totals, { screenings: 1, received: 4, screened: 3, shortlist: 1, hold: 0, reject: 1, none: 1, interviews: 0 })
assert.equal(monthly([sep, past], '2026-10').totals.interviews, 1)
assert.equal(rep.shortlisted[0].r.id, 'a')
console.log('ok hr')
