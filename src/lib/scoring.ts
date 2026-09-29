import { hasTerm, skillWords } from './skills'
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
  const level = new Map(ev.assessments.map((a) => [a.skill.toLowerCase(), a.level]))
  const lv = (r: Requirement) => level.get(r.skill.toLowerCase()) ?? 'missing'
  return {
    id,
    fileName,
    engine,
    eval: ev,
    score: matchScore(reqs, ev.assessments),
    ats: atsReport(resume, reqs, ocr),
    matched: reqs.filter((r) => lv(r) !== 'missing').map((r) => r.skill),
    missingEssential: reqs.filter((r) => r.importance === 'essential' && lv(r) === 'missing').map((r) => r.skill),
    missingPreferred: reqs.filter((r) => r.importance === 'preferred' && lv(r) === 'missing').map((r) => r.skill),
    contacts: extractContacts(resume),
  }
}

// ---------- Resume helpers ----------

export function guessName(text: string, fileName: string) {
  for (const raw of text.split('\n').slice(0, 8)) {
    const line = raw.replace(/^(resume|curriculum vitae|cv)\s*(of|[-:–])?\s*/i, '').trim()
    if (/^[A-Z][a-zA-Z'’.-]+(\s+[A-Z][a-zA-Z'’.-]+){1,3}$/.test(line)) return line
  }
  return fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ')
}

export function yearsOf(text: string) {
  const m = [...text.matchAll(/(\d{1,2})\+?\s*(?:years|yrs)/gi)].map((x) => +x[1])
  return m.length ? Math.max(...m) : null
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
