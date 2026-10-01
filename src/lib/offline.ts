// Offline engine: runs entirely on this computer. A small sentence-embedding model (all-MiniLM-L6-v2, ~23 MB,
// downloaded once then cached by the browser) scores meaning, so "unit tests with Jest" can match
// "automated testing" without an exact keyword. Inference has no randomness, so results are repeatable.
import { findSkills, hasTerm, relatedIn, skillWords, stripTerm } from './skills'
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

// Each sentence is embedded once per page session: rubric bullets once per analysis, resume lines as soon as the file
// is read. Every sentence is embedded on its own, because the quantised model's output depends on what else shares
// the batch; this keeps a vector a pure function of its text, so scores never depend on upload order or Reset.
// Jobs are queued so the model never runs two at once. ponytail: memo grows until Reset (~1.5 KB per sentence).
const memo = new Map<string, Float32Array>()
let queue: Promise<unknown> = Promise.resolve()
let generation = 0 // bumped by Reset, so jobs still in flight do not refill the memo
let modelDown = false // after one failed download, background pre-embedding stops until Analyse tries again

async function embedMissing(texts: string[], gen: number) {
  if (gen !== generation) return // queued before a Reset: that resume is gone
  for (const t of new Set(texts)) {
    if (memo.has(t)) continue
    const [v] = await browserEmbed([t])
    if (gen !== generation) return
    memo.set(t, Float32Array.from(v))
  }
}

export const cachedEmbed: Embed = (texts) => {
  const job = queue.then(async () => {
    await embedMissing(texts, generation)
    modelDown = false
    return texts.map((t) => (memo.get(t) ?? Float32Array.of()) as unknown as number[])
  })
  queue = job.catch(() => {})
  return job
}
export const clearEmbedCache = () => { memo.clear(); generation++ }
/** Start embedding a resume in the background right after it is read, so Analyse only has the rubric left to do. */
export const preEmbed = (resume: string) => {
  const gen = generation
  queue = queue.then(() => (modelDown ? undefined : embedMissing(resumeLines(resume), gen).catch(() => { modelDown = true })))
}

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
const T = { bulletMet: 0.6, bulletPartial: 0.4, lexMet: 0.6, lexPartial: 0.35 }
const RANK: Record<Level, number> = { missing: 0, partial: 1, met: 2 }

// Words that appear in almost every JD bullet and say nothing about the candidate.
const GENERIC = new Set('ensure ensuring manage managing handle handling support work working team company role roles including within other plant staff day keep lead leading drive driving across'.split(' '))
/** Distinct, stemmed content words for the lexical match. */
const contentWords = (s: string) => [...new Set((s.toLowerCase().match(/[a-z][a-z+#&]{2,}/g) ?? [])
  .filter((w) => !STOP.has(w) && !GENERIC.has(w)).map((w) => w.replace(/(ing|ed|(?<!s)s)$/, '').replace(/e$/, '')))] // compliance/compliances → complianc

// ---------- Requirements ----------

export interface OfflineReq extends Requirement { kind: 'skill' | 'years' | 'bullet'; text: string; years?: number }

// PDFs and Word files use many bullet glyphs, incl. private-use U+F0B7 and a stray U+0087 from Symbol fonts.
const BULLET = /^\s*(?:[-*•●▪◦·\u0087�]|\d+[.)])\s*/
const INLINE_BULLET = /\s[•●▪◦\u0087�]\s*/g
const HEAD_REQ = /(requirement|qualification|must.have|skills|competenc|candidate profile|eligibility|what you.ll need|who you are|experience)/i
const HEAD_NICE = /(nice to have|preferred|bonus|good to have|desirable|plus)/i
const HEAD_RESP = /(responsibilit|duties|what you.ll do|role|about the)/i
// Sections that describe the company or the job, not the candidate: never scored.
const HEAD_SKIP = /^(position details|about (us|our|the company|(?!the\b|you\b)[a-z])|(role|job|position) (overview|summary)|overview|company profile|compensation|salary|market salary|benefits|perks|how to apply|working conditions|potential career|career path|key performance|kpis?\b)/i

// Personal characteristics and pay are never requirements. Only label-shaped lines ("Age: 26 years and above",
// "Maximum Monthly Salary: as per norms"), so duties like "Compensation and benefits administration" stay.
const PERSONAL = /^\W*(?:age|gender|sex|marital status|religion|caste|nationality|date of birth|dob)\s*(?:[:\-–(]|\d|limit|between|of\b)/i
const PAY = /^\W*(?:(?:maximum|minimum|expected|monthly|annual|gross|fixed)\s+)*(?:salary|ctc|compensation|package|remuneration|pay)\s*(?:[:\-–(]|\d|range|between|per\b|up\s*to|as per)/i
const ADVANTAGE = /^\W*(?:added advantage|advantage|preferred|desirable|nice to have|good to have)\b/i

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
  // Word-table JDs (like Indo Tech's own) list skills and duties as plain lines; JDs with bullet glyphs keep prose out.
  const plainLines = (jd.match(/^\s*[-*•●▪◦·\u0087�]/gm) ?? []).length < 3
  let aboutSection = false // "About the role" prose describes the job, not the candidate
  for (const line of logicalLines(jd)) {
    const isBullet = BULLET.test(line)
    // A section switch is a short line without "Label: value" text. It is still read for skills and years
    // ("B.Com with 3 years experience in Tally"), it just never becomes a bullet requirement itself.
    let heading = false
    if (!isBullet && line.length < 60 && !/:\s*\S/.test(line)) {
      const next = HEAD_SKIP.test(line) ? 'skip' : HEAD_NICE.test(line) ? 'nice' : HEAD_REQ.test(line) ? 'req' : HEAD_RESP.test(line) ? 'resp' : null
      if (next) {
        heading = true
        section = next
        aboutSection = next === 'resp' && /about the/i.test(line)
      }
    }
    if (section === 'skip') continue
    // "Age: 26 years" is never a requirement, nor 26 years of experience.
    if (!heading && (PERSONAL.test(line) || PAY.test(line))) continue
    const item = isBullet || (plainLines && !heading && !aboutSection && section !== 'other' && line.length >= 15 && line.length <= 220 && !/:$/.test(line))
    const importance = section === 'nice' || ADVANTAGE.test(line) ? 'preferred' : 'essential'
    // A responsibility bullet is scored by meaning as a whole; a skill it merely mentions ("…production, sales and corporate roles") is not a requirement.
    const found = section === 'resp' ? [] : findSkills(line)
    // "Statutory compliance" already covers its "compliance": a shorter skill counts only if it also appears outside
    // the longer skills' text ("React, Redux and React Native" keeps React).
    const skills = found.filter((s) => {
      const rest = found.filter((o) => o.length > s.length).reduce((t, o) => skillWords(o).reduce(stripTerm, t), line)
      return skillWords(s).some((w) => hasTerm(rest, w))
    })
    for (const skill of skills) {
      if (seen.has(skill)) continue
      seen.add(skill)
      reqs.push({ kind: 'skill', skill, text: skill, importance })
    }
    const y = line.match(/(?<![\d.])(\d{1,2})(?:\s*(?:-|–|—|to)\s*\d{1,2})?\s*\+?\s*(?:years|yrs)/i)
    if (y && !reqs.some((r) => r.kind === 'years')) {
      reqs.push({ kind: 'years', skill: `${y[1]}+ years experience`, text: line, years: +y[1], importance })
      continue
    }
    // Bullets without a known skill still matter ("mentor junior developers"): keep them as meaning-based requirements.
    // Responsibilities describe the day-to-day work, so they are always compared by meaning.
    if (item && section !== 'other' && (section === 'resp' || !skills.length)) {
      const label = shortLabel(line)
      if (!seen.has(label)) {
        seen.add(label)
        reqs.push({ kind: 'bullet', skill: label, text: line.replace(BULLET, ''), importance: section === 'req' && importance === 'essential' ? 'essential' : 'preferred' })
      }
    }
  }
  return reqs.slice(0, 24)
}

// ---------- Evaluation ----------

/** A real sentence, not a "Title | Company | 2021" row or a comma-separated skill list. */
const isSentence = (l: string) => l.split(/\s+/).length >= 3 && !l.includes('|') && (l.match(/,/g) ?? []).length < 4

function resumeLines(resume: string) {
  return logicalLines(resume)
    .flatMap((l) => l.split(/(?<=[.;])\s+(?=[A-Z])/))
    .map((l) => l.replace(BULLET, '').trim())
    .filter(isSentence)
    .slice(0, 160)
}

const clip = (s: string) => (s.length > 140 ? s.slice(0, 137).trimEnd() + '…' : s)

export async function offlineEvaluate(reqs: OfflineReq[], resume: string, fileName: string, embed: Embed): Promise<Evaluation> {
  const lines = resumeLines(resume)
  // Lexical evidence comes from sentences only, never from keyword lists ("a, b, c, d, e" or "x | y").
  const raw = logicalLines(resume).map((l) => l.slice(0, 400)).filter(isSentence)
  const resumeWords = raw.map((l, i) => new Set(contentWords(`${l} ${raw[i + 1] ?? ''}`)))
  const years = yearsOf(resume, fileName)
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
        // Depth: used in a sentence, or on 2+ distinct lines, is met; one bare mention in a skills list or course is partial.
        const hits = [...new Set(resume.split('\n').map((l) => l.trim()).filter((l) => skillWords(r.skill).some((x) => hasTerm(l, x))))]
        const sentence = hits.find((l) => isSentence(l) && l.split(/\s+/).length >= 6)
        const evidence = clip(sentence ?? hits[0] ?? '')
        return sentence || hits.length >= 2 ? { skill: r.skill, level: 'met', evidence } : { skill: r.skill, level: 'partial', evidence: `Listed once: ${evidence}` }
      }
      const rel = relatedIn(resume, r.skill)
      return rel.length
        ? { skill: r.skill, level: 'partial', evidence: `Related experience: ${rel.slice(0, 3).join(', ')}` }
        : { skill: r.skill, level: 'missing', evidence: '' }
    }
    const hit = best(semantic.indexOf(r))
    const sem: Level = hit.score >= T.bulletMet ? 'met' : hit.score >= T.bulletPartial ? 'partial' : 'missing'
    // Word overlap catches what the small model misses ("PF, ESI, CLRA" vs "statutory compliance under … CLRA").
    // Evidence must sit together (one line or two adjacent lines), not be scattered across a long resume.
    const words = contentWords(r.text)
    let share = 0
    let at = -1
    if (words.length >= 3) resumeWords.forEach((set, i) => { const s = words.filter((w) => set.has(w)).length / words.length; if (s > share) { share = s; at = i } })
    const lex: Level = share >= T.lexMet ? 'met' : share >= T.lexPartial ? 'partial' : 'missing'
    const level = RANK[sem] >= RANK[lex] ? sem : lex
    const line = RANK[lex] > RANK[sem] ? `${raw[at]} ${raw[at + 1] ?? ''}`.trim() : hit.line
    return { skill: r.skill, level, evidence: level === 'missing' ? '' : clip(line) }
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
