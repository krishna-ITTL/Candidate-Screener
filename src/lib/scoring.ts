import { findSkills, hasTerm, skillWords } from './skills'
import type { Assessment, AtsReport, Contacts, Evaluation, Requirement, Result } from './types'

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
  }
}

// ---------- Resume helpers ----------

const NAME_BAD = new Set('curriculum vitae resume profile summary objective background personal information career aspiration experience address street road nagar division estate page contact email mobile phone skills manager executive hr human resources engineer automobile industry india manufacturing responsibilities languages education canteen declaration hobbies hobby interests references reference key result areas achievements strengths details project projects generalist engineering date birth marital status competencies competency relations synopsis administration management leadership core'.split(' '))
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
    .replace(/\b(?:resume|cv|updated|new|copy|final|date|dates|candidate|profile|hr|manager|executive|engineer)\b/gi, ' ')
    .replace(/([\p{Ll}])([\p{Lu}])/gu, '$1 $2').replace(/\b(\p{Lu})(\p{Lu}\p{Ll})/gu, '$1 $2').replace(/[\d_.-]+/g, ' ').replace(/\s+/g, ' ').trim()
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
    if (source === 'resume' && naukri && fileWords.size && !known) score -= 10
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
  return pick.length ? Math.max(...pick) : null
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
