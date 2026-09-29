// Offline engine: runs entirely on this computer. A small sentence-embedding model (all-MiniLM-L6-v2, ~23 MB,
// downloaded once then cached by the browser) scores meaning, so "unit tests with Jest" can match
// "automated testing" without an exact keyword. Inference has no randomness, so results are repeatable.
import { findSkills, hasTerm, relatedIn, skillWords } from './skills'
import { guessName, yearsOf } from './scoring'
import type { Assessment, Evaluation, Level, Requirement } from './types'

export type Embed = (texts: string[]) => Promise<number[][]>

type Progress = (pct: number, note: string) => void
let extractor: Promise<(t: string[], o: object) => Promise<{ tolist(): number[][] }>> | null = null
let report: Progress = () => {}

/** Browser embedder, loaded lazily on first offline analysis. */
export const browserEmbed: Embed = async (texts) => {
  extractor ??= import('@huggingface/transformers').then(({ pipeline }) =>
    pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      dtype: 'q8',
      progress_callback: (p: { status: string; progress?: number }) => {
        if (p.status === 'progress_total' || p.status === 'progress') report((p.progress ?? 0) / 100, 'Downloading offline model (first time only)')
      },
    }) as unknown as Promise<(t: string[], o: object) => Promise<{ tolist(): number[][] }>>,
  ).catch((e) => { extractor = null; throw e })
  const run = await extractor
  const out: number[][] = []
  for (let i = 0; i < texts.length; i += 32) out.push(...(await run(texts.slice(i, i + 32), { pooling: 'mean', normalize: true })).tolist())
  return out
}

export function onModelProgress(fn: Progress) { report = fn }

const STOP = new Set('the and for with our you your are will this that from have has into using use able across such etc their them they its per any all can who what when also well'.split(' '))

/** Fallback when the model cannot load (no internet on first use): hashed bag-of-words, so similarity = word overlap. */
export const lexicalEmbed: Embed = async (texts) =>
  texts.map((t) => {
    const v = new Array(512).fill(0)
    for (const w of t.toLowerCase().match(/[a-z][a-z+#.]{2,}/g) ?? []) {
      if (STOP.has(w)) continue
      const stem = w.replace(/(ing|ed|es|s)$/, '')
      let h = 0
      for (const c of stem) h = (h * 31 + c.charCodeAt(0)) >>> 0
      v[h % 512] += 1
    }
    const n = Math.hypot(...v) || 1
    return v.map((x) => x / n)
  })

const cos = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i], 0)

// Sentence-to-sentence similarity thresholds, calibrated on sample JD bullets vs resume lines.
// Single skill names embed poorly with this model, so skills use exact aliases + the related-skills map instead.
const T = { bulletMet: 0.6, bulletPartial: 0.4 }

// ---------- Requirements ----------

export interface OfflineReq extends Requirement { kind: 'skill' | 'years' | 'bullet'; text: string; years?: number }

// PDFs and Word files use many bullet glyphs, incl. private-use U+F0B7 and a stray U+0087 from Symbol fonts.
const BULLET = /^\s*(?:[-*•●▪◦·\u0087�]|\d+[.)])\s*/
const INLINE_BULLET = /\s[•●▪◦\u0087�]\s*/g
const HEAD_REQ = /(requirement|qualification|must.have|skills|what you.ll need|who you are|experience)/i
const HEAD_NICE = /(nice to have|preferred|bonus|good to have|desirable|plus)/i
const HEAD_RESP = /(responsibilit|duties|what you.ll do|role|about the)/i
// Sections that describe the company or the job, not the candidate: never scored.
const HEAD_SKIP = /^(about (us|our|the company|(?!the\b|you\b)[a-z])|company profile|compensation|salary|market salary|benefits|perks|how to apply|working conditions|potential career|career path|key performance|kpis?\b)/i

function shortLabel(s: string) {
  const clean = s.replace(BULLET, '').replace(/[.;:]+$/, '').trim()
  if (clean.length <= 60) return clean
  return clean.slice(0, 60).replace(/\s+\S*$/, '') + '…'
}

/** Joins wrapped PDF lines back into whole bullets/sentences. */
function logicalLines(text: string) {
  const out: string[] = []
  for (const raw of text.replace(INLINE_BULLET, '\n• ').split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const prev = out[out.length - 1]
    const continues = prev && !BULLET.test(line) && /^[a-z(]/.test(line) && !/[.:]$/.test(prev)
    if (continues) out[out.length - 1] = `${prev} ${line}`
    else out.push(line)
  }
  return out
}

export function offlineRequirements(jd: string): OfflineReq[] {
  const reqs: OfflineReq[] = []
  const seen = new Set<string>()
  let section: 'req' | 'nice' | 'resp' | 'other' | 'skip' = 'other'
  for (const line of logicalLines(jd)) {
    const isBullet = BULLET.test(line)
    if (!isBullet && line.length < 60) {
      if (HEAD_SKIP.test(line)) section = 'skip'
      else if (HEAD_NICE.test(line)) section = 'nice'
      else if (HEAD_REQ.test(line)) section = 'req'
      else if (HEAD_RESP.test(line)) section = 'resp'
    }
    if (section === 'skip') continue
    const importance = section === 'nice' ? 'preferred' : 'essential'
    const skills = findSkills(line)
    for (const skill of skills) {
      if (seen.has(skill)) continue
      seen.add(skill)
      reqs.push({ kind: 'skill', skill, text: skill, importance: section === 'resp' ? 'essential' : importance })
    }
    const y = line.match(/(\d{1,2})\s*\+?\s*(?:years|yrs)/i)
    if (y && !reqs.some((r) => r.kind === 'years')) {
      reqs.push({ kind: 'years', skill: `${y[1]}+ years experience`, text: line, years: +y[1], importance })
      continue
    }
    // Bullets without a known skill still matter ("mentor junior developers"): keep them as meaning-based requirements.
    // Responsibilities describe the day-to-day work, so they are always compared by meaning.
    if (isBullet && section !== 'other' && (section === 'resp' || !skills.length)) {
      const label = shortLabel(line)
      if (!seen.has(label)) {
        seen.add(label)
        reqs.push({ kind: 'bullet', skill: label, text: line.replace(BULLET, ''), importance: section === 'req' ? 'essential' : 'preferred' })
      }
    }
  }
  return reqs.slice(0, 24)
}

// ---------- Evaluation ----------

function resumeLines(resume: string) {
  return logicalLines(resume)
    .flatMap((l) => l.split(/(?<=[.;])\s+(?=[A-Z])/))
    .map((l) => l.replace(BULLET, '').trim())
    // Real sentences only: skip "Title | Company | 2021" rows and comma-separated skill lists.
    .filter((l) => l.split(/\s+/).length >= 3 && !l.includes('|') && (l.match(/,/g) ?? []).length < 4)
    .slice(0, 160)
}

const clip = (s: string) => (s.length > 140 ? s.slice(0, 137).trimEnd() + '…' : s)

export async function offlineEvaluate(reqs: OfflineReq[], resume: string, fileName: string, embed: Embed): Promise<Evaluation> {
  const lines = resumeLines(resume)
  const years = yearsOf(resume)
  const semantic = reqs.filter((r) => r.kind === 'bullet')
  const queries = semantic.map((r) => r.text)
  const vecs = lines.length && queries.length ? await embed([...queries, ...lines]) : []
  const qv = vecs.slice(0, queries.length)
  const lv = vecs.slice(queries.length)

  const best = (i: number) => {
    let score = -1
    let at = -1
    lv.forEach((v, j) => { const c = cos(qv[i], v); if (c > score) { score = c; at = j } })
    return { score, line: at >= 0 ? lines[at] : '' }
  }

  const assessments: Assessment[] = reqs.map((r) => {
    if (r.kind === 'years') {
      const level: Level = years === null ? 'missing' : years >= r.years! ? 'met' : years >= r.years! * 0.6 ? 'partial' : 'missing'
      return { skill: r.skill, level, evidence: years === null ? 'No total experience stated' : `${years} years of experience stated` }
    }
    if (r.kind === 'skill') {
      const w = skillWords(r.skill).find((w) => hasTerm(resume, w))
      if (w) {
        const hits = resume.split('\n').map((l) => l.trim()).filter((l) => hasTerm(l, w))
        return { skill: r.skill, level: 'met', evidence: clip(hits.find((l) => (l.match(/,/g) ?? []).length < 4) ?? hits[0] ?? '') }
      }
      const rel = relatedIn(resume, r.skill)
      return rel.length
        ? { skill: r.skill, level: 'partial', evidence: `Related experience: ${rel.slice(0, 3).join(', ')}` }
        : { skill: r.skill, level: 'missing', evidence: '' }
    }
    const hit = best(semantic.indexOf(r))
    const level: Level = hit.score >= T.bulletMet ? 'met' : hit.score >= T.bulletPartial ? 'partial' : 'missing'
    return { skill: r.skill, level, evidence: level === 'missing' ? '' : clip(hit.line) }
  })

  const name = guessName(resume, fileName)
  const first = name.split(' ')[0]
  const by = (lv: Level, imp?: string) => assessments.filter((a, i) => a.level === lv && (!imp || reqs[i].importance === imp))
  const met = by('met')
  const partial = by('partial')
  const missEss = by('missing', 'essential')
  const coverage = reqs.length ? (met.length + partial.length / 2) / reqs.length : 0
  const verdict = coverage >= 0.75 ? 'a strong fit' : coverage >= 0.5 ? 'a reasonable fit with some gaps' : 'a weak fit'
  const lines0 = resume.split('\n').map((l) => l.trim()).filter(Boolean)

  return {
    name,
    headline: lines0.find((l, i) => i > 0 && l.length > 3 && l.length < 60 && !/@|\d{5}/.test(l) && !/resume/i.test(l)) ?? '',
    yearsExperience: years,
    summary:
      `${first} looks like ${verdict} for this role, fully meeting ${met.length} of ${reqs.length} requirements` +
      (partial.length ? ` and partly meeting ${partial.length} more` : '') +
      (years !== null ? `, with ${years} years of stated experience` : '') + '. ' +
      (missEss.length ? `The main gaps are ${missEss.slice(0, 3).map((a) => a.skill).join(', ')}.` : 'No essential requirement is missing.'),
    strengths: met.filter((a) => reqs.find((r) => r.skill === a.skill)?.importance === 'essential').slice(0, 4).map((a) => a.skill),
    concerns: [
      ...missEss.slice(0, 3).map((a) => `No evidence of ${a.skill}`),
      ...partial.slice(0, 4 - Math.min(3, missEss.length)).map((a) => `Only partial evidence of ${a.skill}`),
    ].slice(0, 4),
    assessments,
    interviewQuestions: [...missEss, ...partial].slice(0, 3).map((a, i) =>
      [
        `The role needs ${a.skill}. Tell me about a time you used it, or how you would get up to speed.`,
        `How would you approach ${a.skill.toLowerCase()} in your first three months here?`,
        `What is the closest experience you have to ${a.skill}, and what was the outcome?`,
      ][i],
    ),
  }
}
