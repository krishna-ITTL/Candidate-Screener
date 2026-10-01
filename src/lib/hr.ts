import type { Decision, Result } from './types'
import type { SavedRun } from './history'

// ---------- Interviews ----------

export type InterviewMode = 'video' | 'phone' | 'in-person'
export interface Interview {
  when: string // <input type="datetime-local"> value, local time: 2026-10-02T14:30
  mode: InterviewMode
  where: string // meeting link or office address
}
export const MODE_LABEL: Record<InterviewMode, string> = { video: 'Video call', phone: 'Phone call', 'in-person': 'In person' }

export const formatWhen = (when: string) =>
  new Date(when).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })

export const describeInterview = (i: Interview) => `${formatWhen(i.when)}, ${MODE_LABEL[i.mode]}${i.where ? ` (${i.where})` : ''}`

// RFC 5545 text escaping, and 75-octet line folding (approximated by characters).
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
const fold = (line: string) => line.match(/.{1,73}/g)!.join('\r\n ')
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')

/** One calendar file with an event per interview. Times are "floating", i.e. the HR person's local time. */
export function buildIcs(events: { id: string; name: string; role: string; interview: Interview; email?: string; phone?: string }[], now = new Date()) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Indo Tech//Job Lens//EN', 'CALSCALE:GREGORIAN']
  for (const e of events) {
    const start = e.interview.when.replace(/[-:]/g, '').slice(0, 13) + '00'
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.id}@joblens.indotech`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART:${start}`,
      'DURATION:PT45M',
      `SUMMARY:${esc(`Interview: ${e.name}${e.role ? ` (${e.role})` : ''}`)}`,
      `LOCATION:${esc(e.interview.where || MODE_LABEL[e.interview.mode])}`,
      `DESCRIPTION:${esc([MODE_LABEL[e.interview.mode], e.email && `Email: ${e.email}`, e.phone && `Phone: ${e.phone}`].filter(Boolean).join('\n'))}`,
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}

export function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }))
  Object.assign(document.createElement('a'), { href: url, download: name }).click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ---------- Email templates ----------

export type TemplateId = 'shortlist' | 'hold' | 'reject'
export interface Template { subject: string; body: string }

export const TEMPLATE_LABEL: Record<TemplateId, string> = { shortlist: 'Interview invite (Shortlisted)', hold: 'Keep warm (On hold)', reject: 'Regret (Rejected)' }

export const DEFAULT_TEMPLATES: Record<TemplateId, Template> = {
  shortlist: {
    subject: 'Interview invitation: {role} at Indo Tech',
    body: 'Hi {name},\n\nThank you for applying for the {role} role at Indo Tech. We enjoyed reading your profile and would like to invite you to an interview.\n\nInterview: {interview}\n\nPlease reply to confirm, or suggest another time that suits you.\n\nRegards,\nTalent Acquisition\nIndo Tech',
  },
  hold: {
    subject: 'Your application for {role} at Indo Tech',
    body: 'Hi {name},\n\nThank you for applying for the {role} role at Indo Tech. Your profile is under review and we will get back to you as soon as we have an update.\n\nRegards,\nTalent Acquisition\nIndo Tech',
  },
  reject: {
    subject: 'Your application for {role} at Indo Tech',
    body: 'Hi {name},\n\nThank you for your interest in the {role} role at Indo Tech and for the time you took to apply. After careful review, we will not be moving forward with your application for this position.\n\nWe will keep your profile on file and reach out if a suitable role opens up. We wish you every success.\n\nRegards,\nTalent Acquisition\nIndo Tech',
  },
}

const TKEY = 'shortlist.templates'
export function loadTemplates(): Record<TemplateId, Template> {
  try { return { ...DEFAULT_TEMPLATES, ...JSON.parse(localStorage.getItem(TKEY) ?? '{}') } } catch { return DEFAULT_TEMPLATES }
}
export function saveTemplates(t: Record<TemplateId, Template>) {
  try { localStorage.setItem(TKEY, JSON.stringify(t)) } catch { /* storage blocked */ }
}

/** Fill {placeholders}. A line whose placeholder has no value is dropped, so a bulk invite without a time reads cleanly. */
export function fill(text: string, vars: Record<string, string>) {
  return text
    .split('\n')
    .filter((line) => ![...line.matchAll(/\{(\w+)\}/g)].some(([, k]) => k in vars && !vars[k]))
    .join('\n')
    .replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m))
}

export function mailto(to: string[], t: Template, vars: Record<string, string>, bcc = false) {
  const q = new URLSearchParams({ subject: fill(t.subject, vars), body: fill(t.body, vars) })
  if (bcc) q.set('bcc', to.join(','))
  // URLSearchParams encodes spaces as "+", which mail clients show literally.
  return `mailto:${bcc ? '' : to.map(encodeURIComponent).join(',')}?${q.toString().replace(/\+/g, '%20')}`
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] || 'there'

// ---------- Duplicates ----------

export interface Dup { sameRun: string[]; past: { title: string; date: number; decision: Decision }[] }

const keys = (r: Result) => {
  const k: string[] = []
  if (r.contacts?.email) k.push('e:' + r.contacts.email.toLowerCase())
  const digits = r.contacts?.phone.replace(/\D/g, '') ?? ''
  if (digits.length >= 10) k.push('p:' + digits.slice(-10))
  return k
}

/** Same person twice in this screening, or seen in an earlier screening, matched by email or phone. */
export function findDuplicates(results: Result[], history: SavedRun[], currentId: string) {
  const byKey = new Map<string, string[]>()
  for (const r of results) for (const k of keys(r)) byKey.set(k, [...(byKey.get(k) ?? []), r.id])
  const out = new Map<string, Dup>()
  for (const r of results) {
    const ks = keys(r)
    if (!ks.length) continue
    const sameRun = [...new Set(ks.flatMap((k) => byKey.get(k)!))].filter((id) => id !== r.id)
    const past = history
      .filter((h) => h.id !== currentId)
      .flatMap((h) => h.results.filter((x) => keys(x).some((k) => ks.includes(k))).map((x) => ({ title: h.title, date: h.date, decision: h.decisions[x.id] ?? 'none' })))
    if (sameRun.length || past.length) out.set(r.id, { sameRun, past })
  }
  return out
}

// ---------- Monthly report ----------

export interface RoleRow { title: string; date: number; received: number; screened: number; shortlist: number; hold: number; reject: number; none: number; avg: number; top: string }

export function monthly(history: SavedRun[], month: string /* YYYY-MM */) {
  const inMonth = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === month }
  const runs = history.filter((h) => inMonth(h.date)).sort((a, b) => a.date - b.date)
  const roles: RoleRow[] = runs.map((h) => {
    const c = (d: Decision) => h.results.filter((r) => (h.decisions[r.id] ?? 'none') === d).length
    return {
      title: h.title || 'Untitled role', date: h.date, received: h.received ?? h.results.length, screened: h.results.length,
      shortlist: c('shortlist'), hold: c('hold'), reject: c('reject'), none: c('none'),
      avg: h.results.length ? Math.round(h.results.reduce((s, r) => s + r.score, 0) / h.results.length) : 0,
      top: h.results[0]?.eval.name ?? '',
    }
  })
  const sum = (k: keyof RoleRow) => roles.reduce((s, r) => s + (r[k] as number), 0)
  // Interviews are counted by the month they take place in, whichever screening they came from.
  const interviews = history.flatMap((h) => h.results.flatMap((r) => {
    const i = h.interviews?.[r.id]
    return i?.when && i.when.startsWith(month) && h.decisions[r.id] === 'shortlist' ? [{ run: h, r, i }] : []
  })).sort((a, b) => a.i.when.localeCompare(b.i.when))
  const shortlisted = runs.flatMap((h) => h.results.filter((r) => h.decisions[r.id] === 'shortlist').map((r) => ({ run: h, r })))
  return {
    roles, interviews, shortlisted,
    totals: { screenings: roles.length, received: sum('received'), screened: sum('screened'), shortlist: sum('shortlist'), hold: sum('hold'), reject: sum('reject'), none: sum('none'), interviews: interviews.length },
  }
}

// ---------- Interview pipeline: Stage 1 HR → Stage 2 HOD → Stage 3 CEO/COO → offer ----------
// Stage 1 is the Shortlist / Hold / Reject decision (and its interview); the later stages open one after another.

export type StageStatus = 'pending' | 'selected' | 'hold' | 'rejected'
export const STAGE_LABEL: Record<StageStatus, string> = { pending: 'Pending', selected: 'Selected', hold: 'On hold', rejected: 'Rejected' }
export interface Stage { status: StageStatus; when: string; interviewers: string }
export interface Pipeline {
  hrInterviewers?: string
  hod?: Stage
  ceo?: Stage
  // HR's own entries; when blank, the tracker uses what the resume states
  noticePeriod?: string
  presentCtc?: string
  expectedCtc?: string
  recommendedCtc?: string
  designationOffered?: string
  dateOfJoining?: string // yyyy-mm-dd from <input type="date">
}

/** Stages that apply, given the HR decision: HOD only after HR selects, CEO/COO only after HOD selects, offer only after both. */
export function openStages(decision: Decision, p: Pipeline = {}) {
  const hod = decision === 'shortlist'
  const ceo = hod && p.hod?.status === 'selected'
  return { hod, ceo, offer: ceo && p.ceo?.status === 'selected' }
}

/** "Selected (Thu, 2 Oct 2026, 2:30 pm)" for the tracker's stage columns. */
export const describeStage = (s?: Stage) =>
  !s || (s.status === 'pending' && !s.when) ? '' : `${STAGE_LABEL[s.status]}${s.when ? ` (${formatWhen(s.when)})` : ''}`
