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

// Plant HR Manager JD from Create JD: depth of IR/compliance experience and seniority decide the order.
import { templateJd, DEFAULT_COMPANY, DEFAULT_INDUSTRY, DEFAULT_WEBSITE } from './jdTemplate'
const hrJd = templateJd({ role: 'HR Manager', location: 'Kancheepuram, Tamil Nadu', industry: DEFAULT_INDUSTRY, experience: '', company: DEFAULT_COMPANY, notes: '',
  website: DEFAULT_WEBSITE, department: 'Human Resources', seniority: 'Manager', employment: 'Full-time', workMode: 'On-site', openings: '1',
  qualification: 'MBA / MSW in HR', salary: '', mustHave: '', niceToHave: '', reportsTo: '', conditions: '' })
const hrReqs = offlineRequirements(hrJd)
const hrScore = async (f: string) => {
  const cv = readFileSync(`src/lib/fixtures/${f}.txt`, 'utf8')
  return assemble(f, `${f}.pdf`, hrReqs, await offlineEvaluate(hrReqs, cv, `${f}.pdf`, embed), cv, false, 'offline').score
}
const [hs, hm, hw] = [await hrScore('hr-strong'), await hrScore('hr-mid'), await hrScore('hr-weak')]
const soft = await Promise.all(['priya', 'arjun', 'john'].map(hrScore))
console.log('\nHR Manager JD:', { strong: hs, mid: hm, weak: hw, software: soft })
assert.ok(hs > hm && hm > hw, `plant HR ranking should be strong > mid > weak (${hs}, ${hm}, ${hw})`)
assert.ok(hs >= 65, `a strong plant HR manager should score 65+ (${hs})`)
assert.ok(soft.every((s) => s <= 25), `software resumes should not fit an HR role (${soft})`)
console.log('ok (plant HR)')

// Word-table engineering JD (Indo Tech's own format): a transformer designer must beat a salesperson from the same industry.
const engJd = `JOB DESCRIPTION
Position Details
Position Title: Assistant Manager – ElectricalDepartment: DesignReports To: Head – Design
Candidate Profile
Age: 26 years and above
Minimum Education: B.E. / B. Tech in Electrical Engineering
Desired Experience: 6 years above of relevant experience in electrical design of transformers
Language: English
Key Skills & Competencies
Electrical design of Distribution and Power Transformers
Transformer design calculations
Short-circuit and thermal calculations
Customer drawing preparation
Position Responsibilities
Prepare electrical designs for distribution and power transformers as per customer specifications.
Prepare customer drawings and manufacturing drawings using AutoCAD.
Estimate materials and prepare bills of materials for tenders.`
const engReqs = offlineRequirements(engJd)
const engScore = async (cv: string) => assemble('x', 'x.pdf', engReqs, await offlineEvaluate(engReqs, cv, 'x.pdf', embed), cv, false, 'offline').score
const designer = await engScore(`Arun Design
Design Engineer - Electrical, Example Transformers Ltd | 2018 to 2025
Total experience: 7 years
- Electrical design of distribution and power transformers up to 100 MVA.
- Carried out transformer design calculations including short-circuit and thermal calculations.
- Prepared customer drawings and manufacturing drawings in AutoCAD.
- Prepared bills of materials and material estimates for tenders.
Education: B.E. Electrical Engineering`)
const seller = await engScore(`Vikram Sales
Sales Manager, Example Power Products Ltd | 2012 to 2025
Total experience: 13 years
- Sold power and distribution transformers to utilities and EPC contractors.
- Met sales targets and followed up on payments with customers.
- Coordinated with the design team on customer specifications for tenders.
Education: B.Tech Electrical Engineering`)
console.log('\nEngineering JD:', { designer, seller })
assert.ok(designer > seller + 10, `designer (${designer}) should clearly beat salesperson (${seller})`)
console.log('ok (engineering JD)')
