// Fast self-check (no model download): rubric maths, parsing and the lexical fallback engine. Run: npm run check
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { assemble, atsReport, extractContacts, guessName, matchScore } from './scoring'
import { lexicalEmbed, offlineEvaluate, offlineRequirements } from './offline'

const jd = readFileSync('src/lib/fixtures/jd.txt', 'utf8')
const cv = readFileSync('src/lib/fixtures/john.txt', 'utf8')

assert.equal(matchScore([{ skill: 'A', importance: 'essential' }, { skill: 'B', importance: 'preferred' }],
  [{ skill: 'a', level: 'met', evidence: '' }, { skill: 'B', level: 'partial', evidence: '' }]), 83)
assert.equal(matchScore([], []), 0)
assert.equal(guessName(cv, 'x.pdf'), 'John Doe')

const reqs = offlineRequirements(jd)
for (const s of ['TypeScript', 'Next.js', 'React', 'GraphQL', 'Jest', 'CI/CD', '5+ years experience']) assert.ok(reqs.some((r) => r.skill === s), `JD should require ${s}`)
assert.ok(reqs.filter((r) => r.kind === 'bullet').length >= 5, 'responsibility bullets are split out of one-line PDF text')

const run = async () => assemble('1', 'john.pdf', reqs, await offlineEvaluate(reqs, cv, 'john.pdf', lexicalEmbed), cv, false, 'offline')
const r1 = await run()
assert.deepEqual(r1, await run(), 'scoring must be deterministic')
assert.ok(r1.matched.includes('React') && r1.missingEssential.includes('Next.js') === false, 'Next.js is partial via React')
assert.ok(r1.score > 10 && r1.score < 60, `John is a partial fit, got ${r1.score}`)
assert.ok(atsReport(cv, reqs, false).score > 0)
assert.deepEqual(extractContacts(cv), { email: 'johndoe@email.com', phone: '(123) 456-7890', linkedin: 'https://linkedin.com/in/johndoe', github: '', portfolio: '' })
assert.deepEqual(extractContacts('Asha\n2019 - 2021 | +91 98765 43210 | https://github.com/asha-k | www.asha.dev.'),
  { email: '', phone: '+91 98765 43210', linkedin: '', github: 'https://github.com/asha-k', portfolio: 'https://www.asha.dev' })
console.log('ok', { score: r1.score, ats: r1.ats.score })
