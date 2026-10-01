import { findSkills, hasTerm, skillWords } from './skills'
import type { Assessment, AtsReport, Contacts, Evaluation, Profile, Requirement, Result } from './types'

const WEIGHT = { essential: 2, preferred: 1 } as const
const CREDIT = { met: 1, partial: 0.5, missing: 0 } as const

/** Match score 0–100. Pure arithmetic over the rubric, so identical assessments always give identical scores. */
export function matchScore(reqs: Requirement[], assessments: Assessment[]) {
  if (!reqs.length) return 0
  const level = new Map(assessments.map((a) => [a.skill.toLowerCase(), a.level]))
  let got = 0
  let max = 0
  for (const r of reqs) {
    const w = WEIGHT[r.importance]
    max += w
    got += w * CREDIT[level.get(r.skill.toLowerCase()) ?? 'missing']
  }
  return Math.round((100 * got) / max)
}

/** ATS readiness: can an applicant tracking system parse this resume and find the JD's keywords? */
export function atsReport(resume: string, reqs: Requirement[], ocr: boolean): AtsReport {
  const covered = reqs.filter((r) => skillWords(r.skill).some((w) => hasTerm(resume, w))).length
  const coverage = reqs.length ? covered / reqs.length : 0
  const words = resume.split(/\s+/).filter(Boolean).length
  const checks = [
    { label: 'Email address present', ok: /[\w.+-]+@[\w-]+\.[\w.]+/.test(resume) },
    { label: 'Phone number present', ok: /(\+?\d[\d\s().-]{8,}\d)/.test(resume) },
    { label: 'Experience section', ok: /\b(experience|employment|work history)\b/i.test(resume) },
    { label: 'Education section', ok: /\b(education|qualifications?|academic)\b/i.test(resume) },
    { label: 'Skills section', ok: /\b(skills|technical skills|competencies)\b/i.test(resume) },
    { label: 'Summary or profile', ok: /\b(summary|profile|objective|about me)\b/i.test(resume) },
    { label: 'Machine-readable text (no OCR needed)', ok: !ocr },
    { label: 'Reasonable length (150–1,500 words)', ok: words >= 150 && words <= 1500 },
  ]
  const structure = checks.filter((c) => c.ok).length / checks.length
  checks.unshift({ label: `Keyword coverage ${Math.round(coverage * 100)}% of JD requirements`, ok: coverage >= 0.6 })
  return { score: Math.round(100 * (0.55 * coverage + 0.45 * structure)), checks }
}

export function assemble(
  id: string,
  fileName: string,
  reqs: Requirement[],
  ev: Evaluation,
  resume: string,
  ocr: boolean,
  engine: Result['engine'],
): Result {
  const name = ev.name.trim()
  const evaluation = /^(?:|unknown|n\/?a|none|not (?:mentioned|provided|available)|candidate)$/i.test(name) ? { ...ev, name: guessName(resume, fileName) } : ev
  const level = new Map(evaluation.assessments.map((a) => [a.skill.toLowerCase(), a.level]))
  const lv = (r: Requirement) => level.get(r.skill.toLowerCase()) ?? 'missing'
  return {
    id,
    fileName,
    engine,
    eval: evaluation,
    score: matchScore(reqs, evaluation.assessments),
    ats: atsReport(resume, reqs, ocr),
    matched: reqs.filter((r) => lv(r) !== 'missing').map((r) => r.skill),
    missingEssential: reqs.filter((r) => r.importance === 'essential' && lv(r) === 'missing').map((r) => r.skill),
    missingPreferred: reqs.filter((r) => r.importance === 'preferred' && lv(r) === 'missing').map((r) => r.skill),
    contacts: extractContacts(resume),
    profile: extractProfile(resume),
  }
}

// ---------- Resume helpers ----------

const NAME_BAD = new Set('curriculum vitae resume profile summary objective background personal information career aspiration experience address street road nagar division estate page contact email mobile phone skills manager executive hr human resources engineer automobile industry india manufacturing responsibilities languages education canteen declaration hobbies hobby interests references reference key result areas achievements strengths details project projects generalist engineering date birth marital status competencies competency relations synopsis administration management leadership core design computer aided sales marketing mechanical electrical coordinator fabrication total work'.split(' '))
const NAME_PENALTY = /\b(?:ltd|limited|pvt|inc|corp|corporation|company|industries|solutions|technologies|systems|services|group|exports|street|road|nagar|district|city|chennai|b\.e|b\.tech|mba|msw|curriculum|vitae|resume|profile|summary|objective|personal|information|experience|address|skills|manager|executive|developer|designer|analyst|consultant|officer|specialist|supervisor|director|head|human resources|career|achievement|organisational|professional|snapshot|expertise|competence)\b/i
const HONORIFIC = /^(?:mr|mrs|ms|miss|dr|shri|smt|sri)\.?\s+/i
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/

function titleName(value: string) {
  const spaced = value.replace(/^(\p{L}+)\.((?:\p{L}\.)*\p{L})$/u, '$1 $2')
    .replace(/^(\p{L}+)\.(\p{L})$/u, '$1 $2')
    .replace(/((?:\p{L}\.){1,})(?=\p{Lu}{2,})/gu, '$1 ')
  const allCaps = value === value.toUpperCase() // mixed case is how the person writes it ("Varaprasad GVB")
  return spaced.split(/\s+/).map((part) => {
    if (/^(?:\p{L}\.)+(?:\p{L})?$/u.test(part)) return part.toUpperCase()
    return allCaps ? part.toLocaleLowerCase().replace(/(^|['’-])\p{L}/gu, (c) => c.toLocaleUpperCase()) : part
  }).join(' ')
}

function fileCandidate(fileName: string) {
  return fileName.replace(/\.[^.]+$/, '').replace(/^naukri[_\s-]*/i, '')
    .replace(/\[[^\]]*\]|\(\d+\)/g, ' ')
    // "AruSukumar" → "Aru Sukumar", "RSivaraj" → "R Sivaraj", "UPENDRADy" → "UPENDRA Dy"
    .replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2').replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, '$1 $2').replace(/[\d_.()-]+/g, ' ')
    // Job words HR put in file names ("Meera -Asst Mgr Mechanical Design", "Rahul_Sharma_Dy.Mgr_S_M_")
    .replace(/\b(?:resume|cv|updated|new|copy|final|date|dates|candidate|profile|hr|manager|mgr|executive|engineer|asst|assistant|dy|deputy|sr|senior|jr|junior|sales|marketing|design|mechanical|electrical|north|south|east|west)\b/gi, ' ')
    .replace(/\bS\s+M\s*$/i, ' ').replace(/\s+/g, ' ').trim()
}

// Names are capitalised words or initials ("K.", "R.K", "N.V.VIJAYAPRASAD"); a trailing dot only on initials.
const nameWord = (w: string) => /^[\p{L}.'’-]+$/u.test(w) && /^\p{Lu}/u.test(w) && (!w.endsWith('.') || /^(?:\p{L}{1,2}\.)+$/u.test(w))

function validName(value: string) {
  const words = value.split(/\s+/).filter(Boolean)
  return value.length >= 2 && value.length <= 40 && words.length >= 1 && words.length <= 6 &&
    words.every(nameWord) && !words.some((w) => NAME_BAD.has(w.toLocaleLowerCase().replace(/[^\p{L}]/gu, '')))
}

/** Candidate name: the best-scoring name-like line near the top of the resume, cross-checked with the file name and email. */
export function guessName(text: string, fileName: string) {
  const all = text.split('\n').slice(0, 50).map((l) => l.slice(0, 300))
  const refs = all.findIndex((l) => /^\s*(?:references?|referees?)\s*:?\s*$/i.test(l))
  const lines = refs >= 0 ? all.slice(0, refs) : all
  const head = lines.slice(0, 15) // contact details of the candidate, not referees further down
  const file = fileCandidate(fileName)
  const email = head.join('\n').match(EMAIL)?.[0]?.split('@')[0] ?? ''
  const fileWords = new Set(file.toLocaleLowerCase().match(/\p{L}{4,}/gu) ?? [])
  const emailWords = new Set(email.toLocaleLowerCase().match(/\p{L}{4,}/gu) ?? [])
  const naukri = /^naukri[_\s-]/i.test(fileName)
  const contactAt = head.map((line, i) => (EMAIL.test(line) || /\+?\d[\d\s().-]{8,}\d/.test(line) ? i : -1)).filter((i) => i >= 0)
  const candidates: { value: string; score: number; line: number }[] = []
  const add = (raw: string, line: number, source: 'resume' | 'file') => {
    const value = raw.replace(/^\s*(?:name|(?:resume|cv|curriculum vitae)(?:\s+of)?)\s*[:\-–]?\s+/i, '').replace(HONORIFIC, '').replace(/[:;,|]+$/, '').trim()
    if (!validName(value)) return
    const words = value.toLocaleLowerCase().match(/\p{L}{4,}/gu) ?? []
    const n = value.split(/[\s.]+/).filter(Boolean).length
    const known = words.some((w) => [...fileWords, ...emailWords].some((k) => k.includes(w) || w.includes(k)))
    let score = source === 'resume' ? 30 + Math.max(0, 10 - line) : 18 + (naukri ? 45 : 0) + ([...fileWords].some((w) => [...emailWords].some((e) => e.includes(w) || w.includes(e))) ? 30 : 0)
    if (source === 'resume' && known) score += 35
    if (source === 'resume' && fileWords.size && !known) score -= naukri ? 10 : 5
    if (source === 'resume' && contactAt.some((at) => Math.abs(at - line) <= 3)) score += 12
    if (/^\s*name\s*:/i.test(raw)) score += 8
    if (raw === raw.toUpperCase()) score += 3
    score += n === 1 ? -10 : n <= 4 ? 8 : 0
    if (/^\p{L}\s/u.test(value)) score -= 20
    if (NAME_PENALTY.test(value) || findSkills(value).length) score -= 35
    candidates.push({ value: titleName(value), score, line })
  }
  lines.forEach((raw, line) => raw.split(/\s{2,}|\t+|\||•/).forEach((part) => add(part, line, 'resume')))
  add(file, 99, 'file')
  candidates.sort((a, b) => b.score - a.score || a.line - b.line)
  return candidates[0]?.value ?? (titleName(file) || fileName)
}

const YEARS = /(?<![\d.])(\d{1,2})(?:\.\d+)?(?:\s*(?:-|–|—|to)\s*\d{1,2})?\s*\+?\s*(?:years?|yrs?)\b/gi

/** Total years of experience. A Naukri file tag ("[18y_0m]") is computed by Naukri, so it wins; ages and birth dates are ignored. */
export function yearsOf(text: string, fileName?: string) {
  const tag = fileName?.match(/\[(\d{1,2})y(?:_\d+m)?\]/i)
  if (tag && +tag[1] <= 45) return +tag[1]
  const context: number[] = []
  const total: number[] = []
  for (const raw of text.split('\n')) {
    const line = raw.slice(0, 500).replace(/\b(?:age|dob|d\.o\.b|date of birth|born)\b\D{0,20}[\d./-]*/gi, '')
    const ys = [...line.matchAll(YEARS)].map((m) => +m[1]).filter((y) => y <= 45)
    if (/\btotal\b/i.test(line)) total.push(...ys)
    if (/\b(?:experience|experienced|employment|career|total)\b/i.test(line)) context.push(...ys)
  }
  const pick = total.length ? total : context // a stated total beats the longest single job
  return pick.length ? Math.max(...pick) : yearsFromDates(text)
}

const MONTHS = 'jan feb mar apr may jun jul aug sep oct nov dec'.split(' ')
const DATE = String.raw`(?:\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s’'.,-]*)?(?<!\d)((?:19|20)\d{2})(?!\d)` // not inside phone numbers or PIN codes
const RANGE = new RegExp(`${DATE}\\s*(?:-|–|—|to|till)+\\s*(?:${DATE}|(till date|to date|present|current|now|date))`, 'gi')
// Degree words only; "Scrum Master" or a college as employer are still jobs.
const EDUCATION = /\b(?:education|university|degree|bachelor|mba|msw|b\.e\b|b\.?tech|b\.?com|b\.?sc|diploma|hsc|sslc)\b/i

/** Total years from employment date ranges ("Sep'2018 to Sep'2021", "2021 to till date"), overlaps merged.
 *  "Till date" means the latest date written in the resume, not today, so the same resume always scores the same.
 *  If a current job has no later date to measure to, the total is unknown (null) rather than undercounted. */
function yearsFromDates(text: string) {
  const lines = text.split('\n').map((l) => l.slice(0, 500))
  const month = (m: string | undefined, y: string, end: boolean) => +y * 12 + (m ? MONTHS.indexOf(m.toLowerCase().slice(0, 3)) : end ? 11 : 0)
  let latest = 0
  for (const m of text.matchAll(new RegExp(DATE, 'gi'))) latest = Math.max(latest, month(m[1], m[2], true))
  const spans: [number, number][] = []
  let unknown = false
  lines.forEach((line, i) => {
    // A bare date line right under a degree ("MBA, Anna University" then "2008-2010") is education too.
    if (EDUCATION.test(line) || (line.trim().length < 25 && EDUCATION.test(lines[i - 1] ?? ''))) return
    for (const m of line.matchAll(RANGE)) {
      const start = month(m[1], m[2], false)
      const end = m[5] ? latest : month(m[3], m[4], true)
      // Nothing written after the current job's start year: we cannot tell how long it has run.
      if (m[5] && Math.floor(latest / 12) <= +m[2]) unknown = true
      else if (end > start && end - start < 45 * 12) spans.push([start, end])
    }
  })
  if (unknown || !spans.length) return null
  spans.sort((a, b) => a[0] - b[0])
  let months = 0
  let [s, e] = spans[0]
  for (const [a, b] of spans.slice(1)) {
    if (a <= e) e = Math.max(e, b)
    else { months += e - s; [s, e] = [a, b] }
  }
  months += e - s
  return Math.floor(months / 12)
}

const link = (u: string) => 'https://' + u.replace(/^https?:\/\//i, '').replace(/[.,;:)]+$/, '')

/** Contact details from the resume text. Links are normalised to https:// so they are safe to open. */
export function extractContacts(text: string): Contacts {
  const email = text.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/)?.[0] ?? ''
  // Phone: 10-15 digits, so date ranges like "2019 - 2021" are not mistaken for one.
  const phone = [...text.matchAll(/[+(]?\d[\d\s().-]{8,}\d/g)].map((m) => m[0].trim()).find((p) => { const n = p.replace(/\D/g, '').length; return n >= 10 && n <= 15 }) ?? ''
  const linkedin = text.match(/(?:https?:\/\/)?(?:[\w-]+\.)?linkedin\.com\/in\/[\w%-]+/i)?.[0]
  const github = text.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/[\w-]+/i)?.[0]
  const portfolio = [...text.matchAll(/(?:https?:\/\/|www\.)[^\s|,<>"')]+/gi)].map((m) => m[0]).find((u) => !/linkedin\.com|github\.com/i.test(u))
  return { email, phone, linkedin: linkedin ? link(linkedin) : '', github: github ? link(github) : '', portfolio: portfolio ? link(portfolio) : '' }
}

// ---------- Candidate tracker profile ----------
// Only what the resume states; blank otherwise, for HR to fill in. DOB, age and native place are kept for HR's
// tracker but never used in scoring.

const DEGREES: [RegExp, number][] = [
  [/\bph\.?\s?d\b/i, 9], [/\b(?:mba|pgdm|pgdbm|pgdom)\b/i, 8], [/\bmsw\b/i, 8], [/\b(?:m\.?\s?tech|mca|m\.?\s?com|m\.?\s?sc)\b/i, 7],
  [/\bM\.\s?E\b|\bM\.\s?A\b/, 7], // dots required: "ME" is also Windows ME
  [/\b(?:b\.?\s?tech|bba|bca|b\.?\s?com|b\.?\s?sc|bachelor)/i, 5], [/\bB\.\s?E\b|\bB\.\s?A\b|\bBE\b|\bBA\b/, 5], // never the word "be"
  [/\bdiploma\b|\bdeee\b/i, 3], [/\biti\b/i, 2],
]
// A company is a run of capitalised words ending in a legal suffix: "SIDDGARTH GREASE & LUBES PVT. LTD.", "C&S Electric Ltd.".
const LEGAL = String.raw`[Pp][Vv][Tt]\.?\s*[Ll][Tt][Dd]|\(PVT\)\s*LTD|[Pp]rivate\s+(?:[Ll]td|[Ll]imited)|PRIVATE\s+(?:LTD|LIMITED)|[Ll][Tt][Dd]|[Ll]imited|LIMITED|[Ii]nc|INC|LLP|[Cc]orporation|CORPORATION|[Cc]orp|CORP`
const CO = new RegExp(String.raw`((?:M\/s\.?\s*)?(?!(?:${LEGAL})\b)[A-Z][\w&.'’-]*(?:\s+(?:[A-Z&][\w&.'’-]*|of|and|&)){0,7}?\s+(?:${LEGAL})(?![\w])\.?)`, 'u')
const PLACE_AFTER = /^\s*(?:\([^)]{0,30}\)\s*)?(?:[,–—-]+|\bat\b|\bin\b)\s*([A-Z][A-Za-z]+(?:,?\s+[A-Z][A-Za-z]+){0,2})/
const pick = (text: string, re: RegExp) => text.match(re)?.[1]?.replace(/\s+/g, ' ').replace(/[\s.,;:-]+$/, '').trim().slice(0, 60) ?? ''
/** A labelled value, cut where the next label starts ("15lpa, Expected CTC: …" → "15lpa"). */
const field = (text: string, re: RegExp) => pick(text, re).split(/[,;]?\s*\b(?:expected|notice|current|present|ctc|age|dob)\b/i)[0].replace(/[\s.,;:-]+$/, '').trim()

/** Highest qualification written in the resume, e.g. "MBA (Human Resource Management)". */
function education(lines: string[]) {
  const start = lines.findIndex((l) => /^\s*(?:education|academic|qualification)/i.test(l))
  let best = { rank: 0, text: '' }
  for (const line of start >= 0 ? [...lines.slice(start), ...lines.slice(0, start)] : lines) {
    for (const [re, rank] of DEGREES) {
      const m = line.match(re)
      if (!m || rank <= best.rank) continue
      const text = line.slice(m.index).split(/\s*[,|;]\s*|\s{2,}|\s[–—-]\s|\.\s/)[0].trim().slice(0, 60)
      best = { rank, text }
    }
  }
  return best.text
}

/** Most recent employer and its location: a labelled field, else the first company named in the experience section. */
function currentJob(lines: string[]) {
  const all = lines.join('\n')
  let company = pick(all, /\b(?:current|present)\s*(?:company|employer|organi[sz]ation)\s*[:\-–]\s*([^\n|]{2,60})/i)
    || pick(all, /^[^\p{L}\n]*(?:company|employer|organi[sz]ation)\s*[:\-–]\s*([^\n|]{2,60})/imu)
  let place = ''
  if (!company) {
    const exp = Math.max(0, lines.findIndex((l) => /^\s*(?:work\s*|professional\s*)?(?:experience|employment|career)/i.test(l)))
    for (const line of lines.slice(exp || 3)) {
      if (/universit|college|school|institute/i.test(line)) continue
      const m = line.match(CO)
      if (!m) continue
      company = m[1]
      place = pick(line.slice(m.index! + m[0].length), PLACE_AFTER)
      break
    }
  }
  const location = pick(all, /\b(?:current\s*)?(?:job\s*)?location\s*[:\-–]\s*([A-Za-z][^\n|]{1,40})/i)
    || (new RegExp(LEGAL).test(place) ? '' : place) // a sister company is not a location
  // "SICAGEN INDIA LTD, Chennai (SP…" → "SICAGEN INDIA LTD"; "Virginia Transformer Corp. (VTC)" → "Virginia Transformer Corp."
  const name = company.replace(/^M\/s\.?\s*/i, '').replace(/\s+/g, ' ').split(/\s*[,|]\s*/)[0].replace(/\s*\([A-Z]{2,6}\)\.?$/, '')
  return { company: name.replace(/[\s,;:-]+$/, '').slice(0, 60), location }
}

export function extractProfile(text: string): Profile {
  const lines = text.split('\n').map((l) => l.slice(0, 400)).slice(0, 400)
  const head = lines.join('\n')
  const money = (s: string) => (/\d|nego/i.test(s) ? s : '')
  const job = currentJob(lines)
  return {
    education: education(lines),
    dob: pick(head, /\b(?:dob|d\.o\.b\.?|date\s+of\s+birth|born\s+on)\s*[:\-–]?\s*(\d{1,2}\s*(?:st|nd|rd|th)?[\s./-]*(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*|\d{1,2})[\s.,/'’-]*\d{2,4})/i),
    age: pick(head, /\bage\s*[:\-–]?\s*(\d{2})\b/i),
    native: pick(head, /\b(?:native(?:\s*place)?|home\s*town)\s*[:\-–]\s*([A-Za-z][A-Za-z .]{1,30})/i),
    currentCompany: job.company,
    currentLocation: job.location,
    noticePeriod: field(head, /\bnotice\s*period\s*[:\-–]?\s*([^\n|;,]{1,30})/i),
    presentCtc: money(field(head, /\b(?:current|present)\s*(?:ctc|salary|package)\s*[:\-–]?\s*([^\n|;]{1,30})/i)),
    expectedCtc: money(field(head, /\bexpected\s*(?:ctc|salary|package)\s*[:\-–]?\s*([^\n|;]{1,30})/i)),
  }
}
