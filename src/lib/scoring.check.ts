// Fast self-check (no model download): rubric maths, parsing and the lexical fallback engine. Run: npm run check
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { assemble, atsReport, extractContacts, guessName, matchScore, yearsOf } from './scoring'
import { lexicalEmbed, offlineEvaluate, offlineRequirements } from './offline'

const jd = readFileSync('src/lib/fixtures/jd.txt', 'utf8')
const cv = readFileSync('src/lib/fixtures/john.txt', 'utf8')

assert.equal(matchScore([{ skill: 'A', importance: 'essential' }, { skill: 'B', importance: 'preferred' }],
  [{ skill: 'a', level: 'met', evidence: '' }, { skill: 'B', level: 'partial', evidence: '' }]), 83)
assert.equal(matchScore([], []), 0)
assert.equal(guessName(cv, 'x.pdf'), 'John Doe')
assert.equal(guessName('PERSONAL INFORMATION\n42 years\n12 Example Road\nAru Sukumar\naru.sukumar@example.test', 'Naukri_AruSukumar_[18y_0m]_updated.pdf'), 'Aru Sukumar')
assert.equal(guessName('Example Industries Pvt Ltd\nN.V.VIJAYAPRASAD\nvijay.p@example.test', 'resume.pdf'), 'N.V. Vijayaprasad')
assert.equal(guessName('CURRICULUM VITAE\nR.SIVARAJ\nPhone: +91 98765 43210', 'candidate.pdf'), 'R. Sivaraj')
assert.equal(guessName('Address: 12 Sample Nagar\nManikandan R\nEmail: unrelated.alias@example.test', 'new_copy_final.pdf'), 'Manikandan R')
assert.equal(guessName('Name: Kalaiarasan P\nHR Executive\nkalai@example.test', 'resume.pdf'), 'Kalaiarasan P')
// Headings, places, sentences, skills and referees are not names.
assert.equal(guessName('Declaration\nI hereby declare\nRavi Kumar', 'x.pdf'), 'Ravi Kumar')
assert.equal(guessName('Bangalore\nRavi Kumar', 'x.pdf'), 'Ravi Kumar')
assert.equal(guessName('Key Result Areas\nTeam Building\nramesh.babu@x.com', 'Naukri_RameshBabu[10y_2m].pdf'), 'Ramesh Babu')
assert.equal(guessName('Summary\n' + 'Worked on things.\n'.repeat(60), 'Naukri_RameshBabu[10y_2m].pdf'), 'Ramesh Babu')
assert.equal(guessName('Ravi Kumar\nReferences\nSuresh Menon\nsuresh.menon@abc.com', 'x.pdf'), 'Ravi Kumar')
assert.equal(guessName('Mr. Krishna Raju\nkrishna@example.test', 'x.pdf'), 'Krishna Raju')

assert.equal(yearsOf('Experience\nABC Ltd (3 years)\nXYZ Ltd (4 years)'), null) // job durations are not a total
assert.equal(yearsOf('Experience Total: 8 yrs. DOB: 1990'), 8)
assert.equal(yearsOf('Experience Summary: 12.5 years'), 12)
assert.equal(yearsOf('6 years experience', 'X[18y_0m].pdf'), 18)
assert.equal(yearsOf('Age: 42 years\nTotal work experience: 17 Years 0 Month'), 17)
assert.equal(yearsOf('DOB: 12 May 1984\nOver 20 years of experience in operations'), 20)
assert.equal(yearsOf('Born 1980\n20+ years experience'), 20)
assert.equal(yearsOf('Profile\nExperience details unavailable', 'Naukri_Name_[18y_0m]_updated.pdf'), 18)
assert.equal(yearsOf('Age: 52 years\nDOB: 01-01-1974'), null)

const reqs = offlineRequirements(jd)
for (const s of ['TypeScript', 'Next.js', 'React', 'GraphQL', 'Jest', 'CI/CD', '5+ years experience']) assert.ok(reqs.some((r) => r.skill === s), `JD should require ${s}`)
assert.ok(reqs.filter((r) => r.kind === 'bullet').length >= 5, 'responsibility bullets are split out of one-line PDF text')
const rangeReq = offlineRequirements('Requirements\n- 10–15 years of experience\n- 5-8 yrs in engineering')
assert.equal(rangeReq.find((r) => r.kind === 'years')?.years, 10)

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
