// Self-check for Create JD (offline): role families and which sections get scored. Run: npm run check:jd
import assert from 'node:assert/strict'
import { DEFAULT_COMPANY, DEFAULT_INDUSTRY, DEFAULT_WEBSITE, pickFamily, templateJd } from './jdTemplate'
import { offlineRequirements } from './offline'
import type { JdBrief } from './ai'

const brief = (p: Partial<JdBrief>): JdBrief => ({
  role: '', location: 'Kancheepuram, Tamil Nadu', industry: DEFAULT_INDUSTRY, experience: '', company: DEFAULT_COMPANY, notes: '',
  website: DEFAULT_WEBSITE, department: '', seniority: '', employment: 'Full-time', workMode: 'On-site', openings: '1',
  qualification: '', salary: '', mustHave: '', niceToHave: '', reportsTo: '', conditions: '', ...p,
})

// At Indo Tech, engineering roles get transformer-specific templates; corporate roles keep the general ones.
assert.equal(pickFamily(brief({ role: 'Transformer Design Engineer' })).team, 'Design & Engineering')
assert.equal(pickFamily(brief({ role: 'Test Engineer' })).team, 'Testing')
assert.equal(pickFamily(brief({ role: 'Sales Engineer (Tenders)' })).team, 'Sales & Marketing')
assert.equal(pickFamily(brief({ role: 'Graduate Engineer Trainee' })).team, 'Engineering')
assert.equal(pickFamily(brief({ role: 'Talent Acquisition Executive' })).team, 'Human Resources')
assert.equal(pickFamily(brief({ role: 'Software Engineer' })).team, 'IT')
// Elsewhere, "engineer" still means software.
assert.equal(pickFamily(brief({ role: 'Software Engineer', company: 'Acme', industry: 'Information Technology' })).team, 'IT')

const jd = templateJd(brief({ role: 'Senior Design Engineer', seniority: 'Senior', mustHave: 'AutoCAD, Transformer winding design', salary: '₹9–12 LPA', openings: '2', reportsTo: 'Design Manager' }))
assert.match(jd, /About Indo Tech Transformers Limited\n- Indo Tech Transformers Limited \(ITTL\) designs/)
assert.match(jd, /hiring 2 Senior Design Engineer positions at Indo Tech Transformers Limited/)
assert.match(jd, /Required Skills\n- AutoCAD\n- Transformer winding design\n/)
assert.match(jd, /5–8 years of relevant experience/)
assert.match(jd, /Compensation\n- ₹9–12 LPA/)

// Company facts, career path, KPIs and pay describe the job, not the candidate: none of it is scored.
const reqs = offlineRequirements(jd).map((r) => r.text.toLowerCase())
for (const junk of ['66,000', 'reliable partner', 'drawing release on schedule', 'head of design', 'lpa']) {
  assert.ok(!reqs.some((t) => t.includes(junk)), `"${junk}" should not be a requirement`)
}
assert.ok(offlineRequirements(jd).some((r) => r.skill === 'AutoCAD' && r.importance === 'essential'), 'must-have skills are essential')
console.log('ok jd', offlineRequirements(jd).length, 'requirements')

// HR roles: recruiters get the talent acquisition template, every other HR role the plant HR & IR one.
for (const role of ['HR Manager', 'Manager - HR & IR', 'Personnel Officer', 'HR & Admin Executive']) {
  assert.ok(pickFamily(brief({ role })).skills.includes('Industrial relations'), `${role} → plant HR`)
}
assert.ok(pickFamily(brief({ role: 'Manager', department: 'Human Resources' })).skills.includes('Industrial relations'), 'department-only HR → plant HR')
for (const role of ['Talent Acquisition Executive', 'Recruiter']) assert.ok(!pickFamily(brief({ role })).skills.includes('Industrial relations'), `${role} → TA`)
const hrJd = templateJd(brief({ role: 'HR Manager', seniority: 'Manager', department: 'Human Resources' }))
const hrReqs = offlineRequirements(hrJd)
assert.equal(hrReqs.find((r) => r.kind === 'years')?.years, 10, 'Manager = 10-15 years, scored from the lower bound')
for (const junk of ['we are hiring', 'own outcomes', 'sales']) assert.ok(!hrReqs.some((r) => r.skill.toLowerCase().includes(junk)), `"${junk}" should not be a requirement`)
assert.ok(!hrReqs.some((r) => r.skill === 'Compliance'), 'Statutory compliance is not double-counted as Compliance')
console.log('ok hr template', hrReqs.length, 'requirements')
