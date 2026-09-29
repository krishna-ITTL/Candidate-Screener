// Self-check for the offline engine with the real embedding model (downloads ~23 MB once). Run: npm run check:offline
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { pipeline } from '@huggingface/transformers'
import { offlineEvaluate, offlineRequirements, type Embed } from './offline'
import { assemble } from './scoring'

const run = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { dtype: 'q8' })
const embed: Embed = async (t) => (await run(t, { pooling: 'mean', normalize: true })).tolist() as number[][]

const jd = readFileSync('src/lib/fixtures/jd.txt', 'utf8')
const reqs = offlineRequirements(jd)
console.log(reqs.map((r) => `${r.kind}:${r.importance[0]}:${r.skill}`).join('\n'))

const score = async (f: string) => {
  const cv = readFileSync(`src/lib/fixtures/${f}.txt`, 'utf8')
  const ev = await offlineEvaluate(reqs, cv, f, embed)
  const r = assemble(f, f, reqs, ev, cv, false, 'offline')
  console.log(`\n${ev.name}: ${r.score}\n` + ev.assessments.map((a) => `  ${a.level.padEnd(7)} ${a.skill}  | ${a.evidence.slice(0, 70)}`).join('\n'))
  return r
}
const priya = await score('priya'), arjun = await score('arjun'), john = await score('john')
assert.ok(priya.score > arjun.score && arjun.score > john.score, 'ranking should be Priya > Arjun > John')
assert.deepEqual((await score('john')).score, john.score, 'deterministic')
assert.ok(reqs.some((r) => r.kind === 'years' && r.years === 5))
console.log('\nok')

// Non-tech JD: plain-language bullets must be matched by meaning.
const ta = readFileSync('src/lib/fixtures/ta-jd.txt', 'utf8')
const taReqs = offlineRequirements(ta)
console.log('\nTA rubric:\n' + taReqs.map((r) => `${r.kind}:${r.importance[0]}:${r.skill}`).join('\n'))
const taScore = async (f: string) => {
  const cv = readFileSync(`src/lib/fixtures/${f}.txt`, 'utf8')
  const ev = await offlineEvaluate(taReqs, cv, f, embed)
  const r = assemble(f, f, taReqs, ev, cv, false, 'offline')
  console.log(`\n${ev.name}: ${r.score}\n` + ev.assessments.map((a) => `  ${a.level.padEnd(7)} ${a.skill}  | ${a.evidence.slice(0, 70)}`).join('\n'))
  return r.score
}
const good = await taScore('ta-good'), weak = await taScore('ta-weak')
assert.ok(taReqs.some((r) => r.kind === 'bullet'), 'plain-language bullets become requirements')
assert.ok(good >= 70 && weak <= 30, `TA lead should score high (${good}), support exec low (${weak})`)
console.log('\nok (non-tech)')
