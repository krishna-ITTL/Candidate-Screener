// Offline JD writer: picks a role family and seniority from the brief and fills a structured JD.
import type { JdBrief } from './ai'

interface Family { test: RegExp; team: string; resp: string[]; skills: string[]; qual: string; nice: string[]; kpis: string[]; path: string[]; conditions?: string }

// ---------- Company defaults ----------

export const DEFAULT_COMPANY = 'Indo Tech Transformers Limited'
export const DEFAULT_WEBSITE = 'https://www.indo-tech.com/'
export const DEFAULT_INDUSTRY = 'Power Transformers & Electrical Equipment'
export const COMPANY_LOCATIONS = ['Kancheepuram, Tamil Nadu (Illuppapattu plant)', 'Thirumazhisai, Chennai (Works 2)', 'Chennai, Tamil Nadu', 'Pan-India (field role)']

/** Facts from indo-tech.com, used by both the offline template and the AI prompt. */
export const ITTL_PROFILE = [
  'Indo Tech Transformers Limited (ITTL) designs and manufactures distribution, power and large power transformers up to 250 MVA, and skid-mounted substations up to 5 MVA (11–33 kV).',
  'In business since 1975 and a public company since 1992, ITTL has built over 66,000 transformers for substations and industries across India and international markets.',
  'Manufacturing is in Tamil Nadu, at Kancheepuram and Thirumazhisai (Chennai), with about 14,000 MVA installed capacity and expansion planned to 50,000 MVA.',
  'Our promise: "Your Reliable Partner For Sustainable Future."',
]

export const isIttl = (company: string) => /indo\s*-?\s*tech/i.test(company)

// ---------- Power and electrical equipment roles (tried first for this industry) ----------

const POWER: Family[] = [
  {
    test: /design/i,
    team: 'Design & Engineering',
    resp: ['Carry out electrical and mechanical design of distribution and power transformers to IS 2026 and IEC 60076.', 'Calculate losses, impedance, temperature rise and short-circuit withstand, and optimise material cost per MVA.', 'Release drawings, bills of material and design sheets to production on schedule.', 'Support sales with technical clauses, deviations and guaranteed technical particulars for tenders.', 'Resolve design issues raised by production, testing and customers, and feed learnings back into standard designs.'],
    skills: ['Transformer electrical design', 'IS 2026 / IEC 60076 standards', 'Loss, impedance and temperature-rise calculations', 'Short-circuit and thermal design', 'AutoCAD or SolidWorks'],
    qual: 'B.E./B.Tech in Electrical Engineering; M.E. in Power Systems preferred',
    nice: ['Design experience up to 220 kV class', 'Finite element analysis (FEA) tools', 'Design of skid-mounted or compact substations'],
    kpis: ['Designs right first time (no redesign after release)', 'Test failures traced to design', 'Material cost per MVA against target', 'Drawing release on schedule'],
    path: ['Design Engineer', 'Senior Design Engineer', 'Design Manager', 'Head of Design'],
  },
  {
    test: /test/i,
    team: 'Testing',
    resp: ['Conduct routine, type and special tests on transformers: ratio, winding resistance, no-load and load loss, impulse, temperature rise, partial discharge and SFRA.', 'Prepare test reports and certificates, and host customer and third-party witness inspections.', 'Analyse test failures with design and production and record root causes.', 'Maintain and calibrate test-bay equipment and follow high-voltage safety procedures.', 'Plan the test schedule with production to meet dispatch dates.'],
    skills: ['Transformer routine and type testing', 'IS 2026 / IEC 60076 test procedures', 'High-voltage test equipment and safety', 'Test report preparation', 'Fault analysis'],
    qual: 'Diploma or B.E. in Electrical Engineering',
    nice: ['NABL lab practices', 'Experience with 132 kV and above transformers'],
    kpis: ['Tests completed on schedule', 'First-time-pass rate', 'Report accuracy and turnaround', 'Safety incidents (target zero)'],
    path: ['Test Engineer', 'Senior Test Engineer', 'Testing In-charge', 'Head of Testing'],
  },
  {
    test: /quality|\bqa\b|\bqc\b|inspection|audit/i,
    team: 'Quality',
    resp: ['Inspect incoming CRGO, copper, insulation, transformer oil and bought-out items against specifications.', 'Carry out stage inspections across winding, core building, core-coil assembly and tanking.', 'Raise NCRs, drive root-cause analysis and close corrective and preventive actions.', 'Maintain ISO 9001 quality documentation and support customer and certification audits.', 'Audit and develop suppliers on quality.'],
    skills: ['QA/QC in electrical manufacturing', 'ISO 9001', 'Root-cause analysis (8D, 5-Why)', 'Inspection and measuring instruments', 'Quality documentation'],
    qual: 'Diploma or B.E. in Electrical or Mechanical Engineering',
    nice: ['Internal auditor certification', 'Six Sigma'],
    kpis: ['Customer complaints and field failures', 'Internal rejection and rework rate', 'NCR closure time', 'Audit findings'],
    path: ['Quality Engineer', 'Senior Quality Engineer', 'Quality Manager', 'Head of Quality'],
  },
  {
    test: /service|commission|erection|site|field/i,
    team: 'Service & Commissioning',
    resp: ['Install, erect and commission transformers at customer substations and plants.', 'Perform pre-commissioning and field tests and hand over with complete documentation.', 'Attend breakdowns and warranty calls, diagnose faults and restore service quickly.', 'Carry out oil filtration, dry-out and site repairs.', 'Be the company face at site and keep customers informed.'],
    skills: ['Transformer erection and commissioning', 'Field testing', 'Fault diagnosis', 'Oil filtration and dry-out', 'Customer communication'],
    qual: 'Diploma or B.E. in Electrical Engineering',
    nice: ['Electrical supervisor licence', 'Experience with utility substations'],
    kpis: ['Commissioning completed on schedule', 'Breakdown response and restoration time', 'Repeat complaints', 'Customer satisfaction'],
    path: ['Service Engineer', 'Senior Service Engineer', 'Service Manager'],
    conditions: 'Extensive travel to customer sites across India.',
  },
  {
    test: /sales|tender|marketing|business development|\bbd\b|estimat|bid/i,
    team: 'Sales & Marketing',
    resp: ['Grow orders from state utilities (DISCOMs and TRANSCOs), EPC contractors, industries and renewable energy developers.', 'Track and bid for tenders on GeM and e-procurement portals and prepare techno-commercial offers.', 'Work with design and costing to price bids competitively.', 'Negotiate terms, secure orders and follow up on collections.', 'Build long-term customer relationships and share market intelligence.'],
    skills: ['B2B sales of transformers or electrical equipment', 'Tendering and bid preparation', 'Techno-commercial negotiation', 'Costing and estimation', 'Customer relationship management'],
    qual: 'B.E. in Electrical Engineering; MBA in Marketing a plus',
    nice: ['Existing network with utilities or EPC contractors', 'Export sales experience'],
    kpis: ['Order booking against target', 'Tender win rate', 'Collections and receivable days', 'New customers added'],
    path: ['Sales Engineer', 'Senior Sales Engineer', 'Regional Sales Manager', 'Head of Sales'],
    conditions: 'Regular travel to customers and tender meetings.',
  },
  {
    test: /purchase|procure|supply|stores|logistic|vendor|sourcing/i,
    team: 'Supply Chain',
    resp: ['Buy CRGO, copper, insulation (pressboard), transformer oil, bushings, tanks and radiators at the right cost and quality.', 'Develop and evaluate vendors, and negotiate prices and terms.', 'Plan materials against the production schedule and keep inventory healthy.', 'Track deliveries and resolve shortages before they stop production.', 'Keep purchase records accurate in the ERP.'],
    skills: ['Procurement of electrical raw materials', 'Vendor development and negotiation', 'Material planning and inventory control', 'ERP (SAP or similar)', 'Commodity price tracking'],
    qual: 'B.E. or Diploma in Electrical or Mechanical; MBA in Supply Chain a plus',
    nice: ['Import procurement', 'Knowledge of CRGO and copper markets'],
    kpis: ['Material cost savings', 'On-time material availability', 'Inventory days', 'Vendor quality rating'],
    path: ['Purchase Engineer', 'Senior Purchase Engineer', 'Purchase Manager', 'Head of Supply Chain'],
  },
  {
    test: /production|manufactur|shop|winding|assembly|plant|maintenance|supervisor|planning|\bppc\b/i,
    team: 'Production',
    resp: ['Plan and run daily production across winding, core building, core-coil assembly, drying and tanking.', 'Deploy manpower and machines to meet the dispatch plan.', 'Enforce EHS, 5S and safe working on the shop floor.', 'Reduce rework and cycle time with quality and design.', 'Keep production records and report output against plan.'],
    skills: ['Transformer manufacturing processes', 'Production planning and control', 'Shop-floor leadership', '5S and lean manufacturing', 'EHS practices'],
    qual: 'Diploma or B.E. in Electrical or Mechanical Engineering',
    nice: ['Experience with power transformers above 10 MVA', 'TPM or Six Sigma'],
    kpis: ['Output against plan (MVA and units)', 'On-time dispatch', 'Rework and scrap', 'Safety incidents (target zero)'],
    path: ['Production Engineer', 'Senior Production Engineer', 'Production Manager', 'Plant Head'],
    conditions: 'Shift work on the shop floor.',
  },
  {
    test: /project/i,
    team: 'Projects',
    resp: ['Execute customer orders from order acceptance to dispatch.', 'Get drawings and documents approved by customers and consultants.', 'Coordinate design, purchase, production and testing to hold the schedule.', 'Arrange inspections, dispatch and site documentation.', 'Report progress and risks to management and customers.'],
    skills: ['Project execution in electrical equipment', 'Drawing and document approvals', 'Scheduling and coordination', 'Customer communication', 'MS Project or Primavera'],
    qual: 'B.E. in Electrical Engineering; PMP a plus',
    nice: ['Utility or EPC project experience'],
    kpis: ['Orders dispatched on time', 'Drawing approval cycle time', 'Customer escalations', 'Billing against plan'],
    path: ['Project Engineer', 'Project Manager', 'Head of Projects'],
  },
]

const ELECTRICAL: Family = {
  test: /engineer|electrical|technician|apprentice|trainee/i,
  team: 'Engineering',
  resp: ['Support day-to-day engineering work on transformers across design, production and testing.', 'Read and work to drawings, specifications and IS / IEC standards.', 'Solve technical issues on the shop floor with the production and quality teams.', 'Maintain accurate technical records.', 'Follow EHS rules and safe working practices.'],
  skills: ['Electrical engineering fundamentals', 'Transformer construction and operation', 'Reading engineering drawings', 'IS / IEC standards', 'MS Excel'],
  qual: 'Diploma or B.E. in Electrical Engineering',
  nice: ['Internship in electrical manufacturing'],
  kpis: ['Tasks completed on time', 'Quality of work', 'Learning milestones achieved'],
  path: ['Graduate Engineer Trainee', 'Engineer', 'Senior Engineer'],
}

// ---------- General roles ----------

const FAMILIES: Family[] = [
  {
    test: /talent|recruit|hiring/i,
    team: 'Human Resources',
    resp: ['Own end-to-end recruitment across engineering, production, sales and corporate roles.', 'Build talent pipelines through sourcing, referrals, job boards and campus hiring from engineering colleges.', 'Partner with hiring managers on workforce plans, role requirements and interview design.', 'Run employer branding for early-career and experienced candidates.', 'Report hiring metrics and improve the candidate experience.'],
    skills: ['Full-cycle recruitment and sourcing', 'ATS and LinkedIn Recruiter', 'Stakeholder management', 'Offer negotiation', 'Employer branding'],
    qual: "Bachelor's degree; MBA in HR preferred",
    nice: ['Experience hiring for manufacturing or engineering companies', 'Data-driven recruiting dashboards'],
    kpis: ['Time-to-hire and time-to-fill', 'Offer acceptance rate', 'Quality of hire (90-day retention)', 'Hiring manager satisfaction'],
    path: ['Talent Acquisition Executive', 'Talent Acquisition Manager', 'Head of Talent Acquisition'],
  },
  {
    // Plant HR: industrial relations and statutory compliance come first in a manufacturing company.
    test: /\bhr\b|human resource|personnel|industrial relation|\bir\b|people|welfare/i,
    team: 'Human Resources',
    resp: ['Manage industrial relations and keep a cordial relationship with unions and workmen, including wage settlements.', 'Ensure statutory compliance under the Factories Act, PF, ESI, CLRA and other labour laws, and handle inspections and returns.', 'Run payroll, time office and attendance for staff, workmen and contract labour.', 'Manage contractors and contract labour on the shop floor.', 'Handle grievances, disciplinary proceedings and domestic enquiries fairly and on time.', 'Drive employee welfare, engagement, training and performance management across the plant.', 'Plan manpower and lead recruitment and onboarding for plant and office roles.'],
    skills: ['Industrial relations', 'Statutory compliance', 'Labour law', 'Payroll', 'Contract labour management', 'Grievance handling', 'Performance management', 'Training and development'],
    qual: 'MBA / MSW / MA in HR or Personnel Management',
    nice: ['HR experience in a heavy engineering or electrical manufacturing plant', 'Setting up HR for a greenfield plant', 'HRMS or SAP HR'],
    kpis: ['Industrial harmony (no lost man-days)', 'Statutory compliance with zero penalties', 'Payroll accuracy and on-time salary', 'Attrition and time-to-fill', 'Training hours per employee'],
    path: ['HR Executive', 'HR Manager', 'Senior Manager HR & IR', 'Head of HR'],
  },
  {
    test: /software|developer|programmer|sde|devops|architect|\bit\b|erp|sap/i,
    team: 'IT',
    resp: ['Design, build and ship reliable, well-tested software.', 'Review code and uphold engineering standards.', 'Collaborate with business users on scope and trade-offs.', 'Improve performance, security and observability of our systems.', 'Mentor teammates and share knowledge.'],
    skills: ['Strong programming fundamentals in a modern language', 'REST APIs and system design', 'Automated testing and CI/CD', 'Git and code review', 'Cloud platforms (AWS, Azure or GCP)'],
    qual: "Bachelor's degree in Computer Science or equivalent experience",
    nice: ['ERP or manufacturing systems experience', 'Open-source contributions'],
    kpis: ['Delivery against commitments', 'Defect and incident rates', 'Code review turnaround', 'System uptime'],
    path: ['Engineer', 'Senior Engineer', 'IT Lead or Manager'],
  },
  {
    test: /data|analyst|analytics|scientist|machine learning|\bml\b|\bai\b|\bbi\b/i,
    team: 'Data',
    resp: ['Turn business questions into analyses, dashboards and models.', 'Build and maintain reliable data pipelines and reports.', 'Present insights and recommendations to leadership.', 'Define metrics and keep them consistent across teams.', 'Partner with operations and sales to measure impact.'],
    skills: ['SQL', 'Python', 'Statistics', 'Power BI or Tableau', 'Stakeholder communication'],
    qual: "Bachelor's degree in a quantitative field",
    nice: ['Manufacturing analytics', 'Experience with cloud data warehouses'],
    kpis: ['Accuracy and freshness of reports', 'Decisions influenced by analysis', 'Stakeholder satisfaction', 'Forecast accuracy'],
    path: ['Analyst', 'Senior Analyst', 'Analytics Lead'],
  },
  {
    test: /sales|business development|account (executive|manager)|\bbd\b/i,
    team: 'Sales',
    resp: ['Build and manage a qualified pipeline of new customers.', 'Run discovery, demos and negotiations through to close.', 'Grow relationships and revenue with key accounts.', 'Keep CRM data accurate and forecasts reliable.', 'Share market feedback with product and marketing.'],
    skills: ['B2B sales and business development', 'Negotiation', 'CRM (Salesforce or HubSpot)', 'Lead generation', 'Account management'],
    qual: "Bachelor's degree; MBA a plus",
    nice: ['Existing network in the industry', 'Experience selling to enterprises'],
    kpis: ['Revenue against quota', 'Pipeline coverage', 'Win rate', 'Sales cycle length'],
    path: ['Account Executive', 'Senior Account Executive', 'Sales Manager'],
  },
  {
    test: /market|brand|seo|content|growth|social media/i,
    team: 'Marketing',
    resp: ['Plan and run campaigns across digital and offline channels.', 'Own content, SEO and social media calendars.', 'Track funnel metrics and optimise spend.', 'Keep brand voice consistent across every touchpoint.', 'Work with sales on lead quality and messaging.'],
    skills: ['Digital marketing', 'SEO and content strategy', 'Social media marketing', 'Google Analytics', 'Campaign budgeting'],
    qual: "Bachelor's degree in Marketing, Communications or similar",
    nice: ['Performance marketing experience', 'Design tool familiarity (Figma, Canva)'],
    kpis: ['Qualified leads generated', 'Customer acquisition cost', 'Engagement and conversion rates', 'Brand reach'],
    path: ['Marketing Executive', 'Marketing Manager', 'Head of Marketing'],
  },
  {
    test: /financ|accountant|accounting|audit|tax|treasury|controller|secretar/i,
    team: 'Finance & Accounts',
    resp: ['Own monthly close, reconciliations and reporting.', 'Prepare budgets, forecasts and variance analysis.', 'Ensure tax, GST and regulatory compliance, including listed-company requirements.', 'Support statutory and internal audits and strengthen internal controls.', 'Partner with business teams on cost and working-capital decisions.'],
    skills: ['Accounting and financial reporting', 'Financial analysis and modelling', 'Budgeting and forecasting', 'GST and taxation', 'Advanced Excel'],
    qual: 'CA, CMA or MBA in Finance',
    nice: ['ERP experience (SAP, Tally or similar)', 'Manufacturing costing'],
    kpis: ['Close timeliness and accuracy', 'Forecast accuracy', 'Audit findings', 'Cost savings delivered'],
    path: ['Finance Executive', 'Finance Manager', 'Financial Controller'],
  },
  {
    test: /design|\bux\b|\bui\b/i,
    team: 'Design',
    resp: ['Design end-to-end user journeys from research to polished UI.', 'Run user research and usability tests.', 'Contribute to and maintain the design system.', 'Work closely with engineers through delivery.', 'Present design rationale to stakeholders.'],
    skills: ['UX design and research', 'UI design', 'Figma', 'Design systems', 'Prototyping'],
    qual: 'Degree in Design, HCI or equivalent portfolio',
    nice: ['Motion and interaction design', 'Accessibility (WCAG) expertise'],
    kpis: ['Task success and usability scores', 'Design delivery against roadmap', 'Design system adoption', 'Customer satisfaction'],
    path: ['Product Designer', 'Senior Product Designer', 'Design Lead'],
  },
  {
    test: /product|project|program|scrum/i,
    team: 'Projects',
    resp: ['Own the plan and prioritise work against clear outcomes.', 'Write clear requirements and acceptance criteria.', 'Coordinate engineering and business teams through delivery.', 'Track risks, dependencies and timelines.', 'Measure results and iterate.'],
    skills: ['Product or project management', 'Agile and Scrum', 'Stakeholder management', 'Data analysis', 'Jira'],
    qual: "Bachelor's degree; PMP or product certification a plus",
    nice: ['Technical background', 'Domain experience in this industry'],
    kpis: ['On-time delivery', 'Adoption', 'Customer satisfaction', 'Outcome metrics moved'],
    path: ['Project Manager', 'Senior Manager', 'Head of PMO'],
  },
  {
    test: /operation|supply|logistic|procure|warehouse|admin/i,
    team: 'Operations',
    resp: ['Run day-to-day operations against service levels.', 'Improve processes, tools and cost efficiency.', 'Manage vendors and procurement.', 'Build reporting on operational health.', 'Lead and develop the operations team.'],
    skills: ['Operations management', 'Vendor management and procurement', 'Process improvement (Lean, Six Sigma)', 'Data analysis', 'Team leadership'],
    qual: "Bachelor's degree; MBA in Operations a plus",
    nice: ['Six Sigma certification', 'ERP experience'],
    kpis: ['SLA adherence', 'Operating cost per unit', 'Process cycle time', 'Team productivity'],
    path: ['Operations Executive', 'Operations Manager', 'Head of Operations'],
  },
]

const GENERIC: Family = {
  test: /./,
  team: 'the',
  resp: ['Own the day-to-day delivery of this function.', 'Plan, prioritise and report against clear goals.', 'Improve the processes and tools the team uses.', 'Collaborate across functions and with key stakeholders.', 'Coach and support colleagues.'],
  skills: ['Core expertise for this role', 'Communication and stakeholder management', 'Problem solving', 'Data-driven decision making', 'Project management'],
  qual: "Bachelor's degree in a relevant field",
  nice: ['Experience in a fast-growing organisation'],
  kpis: ['Delivery against goals', 'Quality of work', 'Stakeholder satisfaction', 'Process improvements'],
  path: ['Current role', 'Senior role', 'Lead or Manager'],
}

const isPowerIndustry = (b: JdBrief) => isIttl(b.company) || /power|electric|transformer|energy|switchgear/i.test(b.industry)
// Non-engineering corporate roles in a power company still use the general templates.
const CORPORATE = /software|developer|\bit\b|data|analyst|\bhr\b|human|talent|recruit|financ|account|secretar|legal|admin/i

export function pickFamily(b: JdBrief): Family {
  const hint = `${b.role} ${b.department}`
  if (isPowerIndustry(b) && !CORPORATE.test(hint)) {
    const f = POWER.find((x) => x.test.test(hint)) ?? (ELECTRICAL.test.test(hint) ? ELECTRICAL : undefined)
    if (f) return f
  }
  return FAMILIES.find((x) => x.test.test(hint)) ?? GENERIC
}

export const SENIORITY_YEARS: Record<string, string> = {
  'Trainee / Fresher': '0–1 years', Junior: '1–3 years', 'Mid-level': '3–5 years', Senior: '5–8 years',
  'Lead / Specialist': '8–12 years', Manager: '10–15 years', 'Head / Director': '15+ years',
}

function seniorityYears(role: string) {
  if (/intern|trainee|fresher|graduate|apprentice/i.test(role)) return '0–1 years'
  if (/junior|associate|executive/i.test(role)) return '1–3 years'
  if (/head|director|vp|chief/i.test(role)) return '15+ years'
  if (/lead|principal|staff|manager/i.test(role)) return '8–12 years'
  if (/senior|sr\.?/i.test(role)) return '5–8 years'
  return '3–5 years'
}

const splitList = (s: string) => s.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean)
const dedupe = (xs: string[]) => xs.filter((x, i) => xs.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i)

export function templateJd(b: JdBrief) {
  const f = pickFamily(b)
  const years = b.experience || SENIORITY_YEARS[b.seniority] || seniorityYears(b.role)
  const company = b.company.trim()
  const team = b.department || (f.team === 'the' ? '' : f.team)
  const li = (xs: string[]) => xs.map((x) => `- ${x}`).join('\n')
  const n = parseInt(b.openings, 10)
  const who = n > 1 ? `${n} ${b.role} positions` : `a ${b.role}`
  const about = isIttl(company) ? ITTL_PROFILE : company ? [`${company} works in the ${b.industry} sector.`] : []
  const conditions = [b.workMode && `Work mode: ${b.workMode}.`, b.employment && `Employment type: ${b.employment}.`, b.conditions, f.conditions].filter(Boolean) as string[]

  return [
    b.role,
    [company, b.location, team, b.employment].filter(Boolean).join(' | '),
    about.length ? `\nAbout ${company}\n${li(about)}${b.website ? `\n- Learn more at ${b.website}` : ''}` : '',
    `\nRole Overview\n- We are hiring ${who}${company ? ` at ${company}` : ''} in ${b.location}${team ? `, in our ${team} team` : ''}.${b.reportsTo ? `\n- Reports to the ${b.reportsTo}.` : ''}\n- You will own outcomes, not just tasks, and help shape how we grow.${b.notes ? `\n- ${b.notes}` : ''}`,
    `\nKey Responsibilities\n${li(f.resp)}`,
    `\nRequired Skills\n${li(dedupe([...splitList(b.mustHave), ...f.skills]).slice(0, 9))}`,
    `\nQualifications and Years of Experience\n- ${b.qualification || f.qual}.\n- ${years} of relevant experience${b.industry && b.industry !== 'Other' ? `, ideally in ${b.industry}` : ''}.`,
    `\nNice to Have\n${li(dedupe([...splitList(b.niceToHave), ...f.nice]))}`,
    conditions.length ? `\nWorking Conditions\n${li(conditions)}` : '',
    `\nPotential Career Path\n- ${f.path.join(' -> ')}, with clear promotion criteria reviewed every year.`,
    `\nKey Performance Indicators (KPIs)\n${li(f.kpis)}`,
    `\nCompensation\n- ${b.salary ? `${b.salary}, based on experience and interview performance.` : `Written offline, so no live salary data was used. Confirm an indicative range for ${b.location} before publishing.`}`,
  ].filter(Boolean).join('\n')
}

// ---------- Reading a JD ----------
// Word-table JDs (like Indo Tech's own) read as one run-on line: "Position Title: Assistant Manager – ElectricalDepartment: DesignReports To: …".
// Labels need a colon, so "department-wise MIS" is not a label; the value stops where the next label starts.
const NEXT_LABEL = String.raw`(?=(?:position\s*title|job\s*title|designation|department|reports?\s*to|location|grade|band|no\.?\s*of)\s*:|$)`

/** The role: a "Position Title:" style label, else the first line that is not just "Job Description". */
export function jdTitle(jd: string) {
  const labelled = jd.match(new RegExp(String.raw`(?:position\s*title|job\s*title|designation)\s*:\s*(.+?)${NEXT_LABEL}`, 'im'))?.[1]
  const first = jd.split('\n').map((l) => l.trim()).find((l) => l && !/^(?:job\s*description|jd)\s*:?$/i.test(l))
  return (labelled ?? first ?? '').replace(/\s+/g, ' ').trim().slice(0, 80)
}

/** Department: a "Department:" label, or the "Company | Location | Department | Type" line Create JD writes. */
export function jdDepartment(jd: string) {
  const labelled = jd.match(new RegExp(String.raw`department\s*:\s*(.+?)${NEXT_LABEL}`, 'im'))?.[1]
  if (labelled) return labelled.replace(/\s+/g, ' ').trim().slice(0, 60)
  const parts = jd.split('\n').slice(0, 4).find((l) => (l.match(/\|/g) ?? []).length >= 3)?.split('|').map((p) => p.trim())
  return parts?.[2] ?? ''
}
