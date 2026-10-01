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

// Legacy .doc: corrupt or non-Word bytes fail with a friendly message, never a crash.
const { isCompoundWord, readWord } = await import('./word')
assert.equal(isCompoundWord(new TextEncoder().encode('{\rtf1 hello}')), false)
const fake = new Uint8Array(4096); fake.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
assert.equal(isCompoundWord(fake), true)
await assert.rejects(readWord(fake), /Could not read this Word file/)
console.log('ok doc')

// Second review: reference numbers, headings vs Naukri file names, casing, age next to experience, totals.
assert.equal(guessName('Reference No: 123\nRavi Kumar\nravi@x.com', 'x.pdf'), 'Ravi Kumar')
assert.equal(guessName('Core Competencies\nTeam Leadership\nPeople Management\nx@y.com', 'Naukri_SKumar[10y_0m].pdf'), 'S Kumar')
assert.equal(guessName('Varaprasad GVB\nvaram@x.com', 'x.pdf'), 'Varaprasad GVB')
assert.equal(guessName("SEAN O'BRIEN\nsean@x.com", 'x.pdf'), "Sean O'Brien")
assert.equal(yearsOf('Age 42 Experience 17 years'), 17)
assert.equal(yearsOf('Experience at ABC Ltd: 3 years\nTotal Experience: 2 years 6 months'), 2)
console.log('ok names 2')

// Third review: dates, aliases and overlapping skills.
assert.equal(yearsOf('Mobile: 9443120567\nHR Officer, ABC Ltd, Jun 2015 - till date\nDeclared on Mar 2024'), 8, 'years inside phone numbers are not dates')
assert.equal(yearsOf('HR Manager, XYZ, Jun 2012 - Present\nHR Officer, ABC, Jan 2005 - May 2012'), null, 'unknown, not undercounted')
assert.equal(yearsOf('Scrum Master, Infosys, Jan 2012 - Dec 2020'), 8)
assert.doesNotThrow(() => yearsOf('Jan 2020 '.repeat(200_000)))
const { findSkills: fs2, hasTerm: ht } = await import('./skills')
assert.ok(ht('Lead IR & HR for the plant', 'ir') && !ht('Perform IR, PI and ratio tests on transformers', 'ir'), 'IR needs HR context')
assert.ok(!fs2('5 years in the T&D sector').includes('Training and development'))
assert.ok(!fs2('Handle customer grievances').includes('Grievance handling'))
const both = offlineRequirements('Requirements\n- 3+ years with React, Redux and React Native\n- Java and JavaScript\n- Statutory compliance under the Factories Act').map((r) => r.skill)
for (const s of ['React', 'React Native', 'Java', 'JavaScript', 'Statutory compliance']) assert.ok(both.includes(s), `${s} kept`)
assert.ok(!both.includes('Compliance'), 'Compliance inside Statutory compliance is not double-counted')
console.log('ok review 3')

// Fourth review: year-only current jobs, "be", months inside words, IR next to transformer tests, plural stems, About the role.
assert.equal(yearsOf('ABC Ltd 2010 - 2020\nXYZ Ltd 2020 - Present'), null)
assert.equal(yearsOf('2012 - 2020 Plant HR, responsible to be the single point of contact'), 8)
assert.equal(yearsOf('Junior 2015 - 2017 Officer'), 2)
assert.ok(!ht('Performed IR and PI tests on industrial transformers', 'ir'))
assert.ok(offlineRequirements('About the role\n- Handle grievances and domestic enquiries for workmen\n- Drive wage settlements with unions').length >= 2, 'duties under About the role are scored')
console.log('ok review 4')

// Candidate tracker: profile fields come from the resume only when written there.
const { extractProfile } = await import('./scoring')
const prof = extractProfile([
  'Ravi Kumar', 'Current CTC: 15.5 lpa, Expected CTC: (Nego.), Notice Period: 1 month', 'Date of Birth: 13 th March 1991', 'Native: Madurai',
  'Experience', 'Assistant Manager - Sales with C&S Electric Ltd. at Agra base location.', 'Education', 'MBA (Marketing), Anna University', 'B.E. Electrical',
].join('\n'))
assert.deepEqual(prof, { education: 'MBA (Marketing)', dob: '13 th March 1991', age: '', native: 'Madurai', currentCompany: 'C&S Electric Ltd.',
  currentLocation: 'Agra', noticePeriod: '1 month', presentCtc: '15.5 lpa', expectedCtc: '(Nego.)' })
assert.equal(extractProfile('Ready to be part of the team\nUsed Windows ME/XP daily').education, '', '"be" and Windows ME are not degrees')
assert.equal(extractProfile('Company: Meiden T&D India Ltd.').currentCompany, 'Meiden T&D India Ltd')
const { jdTitle, jdDepartment } = await import('./jdTemplate')
const wordJd = 'JOB DESCRIPTION\nPosition Details\nPosition Title: Assistant Manager – ElectricalDepartment: DesignReports To: Head – Design\nCandidate Profile\nAge: 26 years and above\nGender: Male / Female\nDesired Experience: 8 years above of relevant experience\nKey Skills & Competencies\nTransformer design calculations'
assert.deepEqual([jdTitle(wordJd), jdDepartment(wordJd)], ['Assistant Manager – Electrical', 'Design'])
const wordReqs = offlineRequirements(wordJd)
assert.equal(wordReqs.find((r) => r.kind === 'years')?.years, 8, 'years from experience, never from age')
assert.ok(!wordReqs.some((r) => /age|gender/i.test(r.skill)), 'age and gender are never requirements')
assert.ok(wordReqs.some((r) => r.skill === 'Transformer design calculations'), 'plain skill lines in a Word-table JD are requirements')
console.log('ok tracker profile')

// Tracker review: plain requirement lines, pay sections, HR duties, About-the-role prose, "-wise" wording.
const plain = offlineRequirements('Accountant\nRequirements\nB.Com with 3 years experience in Tally\nKnowledge of GST filing').map((r) => r.skill)
assert.ok(plain.includes('Tally') && plain.includes('3+ years experience') && plain.includes('GST'), `plain requirement lines are read (${plain})`)
assert.ok(!offlineRequirements('Engineer\nRequirements\n- AutoCAD\nCompensation\n- 9-12 LPA plus incentives').some((r) => /lpa/i.test(r.skill)), 'pay section is never scored')
const duties = offlineRequirements('Responsibilities\n- Compensation and benefits administration\n- Salary benchmarking and payroll\n- Gender diversity initiatives').map((r) => r.skill)
assert.equal(duties.length, 3, `HR duties about pay or gender are kept (${duties})`)
assert.equal(offlineRequirements('About the Role\nWe are a fast-growing startup building tools for creators.\nYou will join a team of five designers.').length, 0, 'About-the-role prose is not scored')
const wise = 'HR Executive\nIndo Tech | Chennai | Human Resources | Full-time\n- Prepare department-wise and designation-wise manpower MIS'
assert.deepEqual([jdTitle(wise), jdDepartment(wise)], ['HR Executive', 'Human Resources'])
const slow = Date.now(); jdTitle('Position Title: a' + ' '.repeat(100_000) + 'b'); assert.ok(Date.now() - slow < 200, 'no backtracking on long whitespace')
console.log('ok tracker review')
