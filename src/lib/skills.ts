// Vocabulary for the offline engine: "Canonical|alias|alias". Matching is case-insensitive on word boundaries.
// ponytail: fixed dictionary, the Claude engine handles anything not listed here.
const RAW = `JavaScript|js|es6|ecmascript
TypeScript|ts
React|react.js|reactjs
Next.js|nextjs|next js
Vue|vue.js|vuejs
Angular|angularjs
Svelte
Redux|redux toolkit
Zustand
GraphQL
Apollo Client|apollo
REST APIs|rest api|rest apis|restful|restful apis
HTML|html5
CSS|css3
Sass|scss
Tailwind CSS|tailwind
Webpack
Vite
Jest
React Testing Library|testing library|rtl
Cypress
Playwright
Unit testing|unit tests|unit test|automated testing|automated tests|test automation
Server-side rendering|ssr|server side rendering
Component library|design system
Accessibility|a11y|wcag
Performance optimization|web performance|performance tuning
Node.js|node|nodejs
Express|express.js
Python
Django
Flask
FastAPI
Java
Spring Boot|spring
Kotlin
Go (Golang)|golang
Rust
C#|c sharp
.NET|dotnet|asp.net
C++
PHP
Laravel
Ruby
Ruby on Rails|rails
Swift|swiftui
iOS
Android
React Native
Flutter
SQL
PostgreSQL|postgres
MySQL
MongoDB
Redis
Elasticsearch
Kafka
Microservices
System design|software architecture
AWS|amazon web services
Azure
GCP|google cloud
Docker
Kubernetes|k8s
Terraform
CI/CD|continuous integration|continuous deployment|ci cd
DevOps
GitHub Actions
Jenkins
Git
Linux
Security|application security|owasp
Machine learning|ml
Deep learning
NLP|natural language processing
LLMs|large language models|generative ai|genai
Data analysis|data analytics
Power BI|powerbi
Tableau
MS Excel|advanced excel|ms excel|microsoft excel
Statistics
Figma
UI design|user interface design
UX design|user experience|ux research
Agile|scrum|kanban
Jira
Product management|product roadmap
Project management|pmp
Stakeholder management
Team leadership|leadership|people management|team management
Mentoring|coaching
Communication|communication skills
Recruitment|recruiting|talent acquisition|hiring
Sourcing|candidate sourcing|headhunting
Onboarding
Employer branding
ATS|applicant tracking system
Workday
HRIS|hrms|hr-mis|hrmis
Payroll|payroll processing|salary processing|wage administration
Employee relations
Performance management|pms|performance appraisal|appraisals
Compensation and benefits|compensation|c&b
Labour law|labor law|employment law|labour laws|labor laws|labour legislation|labour legislations|industrial disputes act
Industrial relations|ir|industrial relation|union management|trade union|wage settlement|long term settlement
Statutory compliance|statutory compliances|labour compliance|factories act|epf|esic|clra
Contract labour management|contract labour|contract labor|contract workmen|contract workforce
Time office|attendance management|timekeeping
Employee welfare|labour welfare|welfare activities|canteen management
Employee engagement|engagement activities
Training and development|training & development|training need analysis
Manpower planning|workforce planning|manpower budgeting
HR policies|hr policy|policy making|policy formulation
Grievance handling|grievance redressal|employee grievances|grievance handling
Disciplinary proceedings|domestic enquiry|domestic inquiry|disciplinary action
Sales|business development
Account management|key account management
Lead generation
Negotiation
CRM|salesforce|hubspot
Digital marketing
SEO|search engine optimization
Content marketing|content strategy
Social media marketing|social media
Google Analytics
Financial analysis|financial modelling|financial modeling
Accounting|bookkeeping
GST|taxation
Budgeting|forecasting
Risk management
Compliance|regulatory compliance
Audit|auditing
Customer service|customer support
Operations management|operations manager
Supply chain|logistics
Procurement|vendor management
Six Sigma|lean six sigma
Quality assurance|qa
Manual testing
Selenium
Clinical research
Nursing
Teaching|curriculum development
AutoCAD
SAP
Tally`

export const SKILLS = RAW.split('\n').map((line) => {
  const [canonical, ...aliases] = line.split('|')
  const words = [canonical, ...aliases].map((w) => w.toLowerCase())
  return { canonical, words }
})

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')

// "IR" means industrial relations only in capitals and next to HR words; in a transformer plant it is also
// insulation resistance ("IR, PI and ratio tests").
const HR_NEAR = /\b(?:HR|ER)\b|\b(?:union|labou?r|welfare|relations|industrial|personnel|employee)/i
function irHit(text: string) {
  for (const m of text.matchAll(/(?<![\w.])IR(?![\w])/g)) if (HR_NEAR.test(text.slice(Math.max(0, m.index - 40), m.index + 42))) return true
  return false
}

/** Removes every whole-word occurrence of a term, so overlapping skills can be told apart. */
export const stripTerm = (text: string, term: string) => text.replace(new RegExp(`(?<![\\w.])${esc(term)}(?![\\w])`, 'gi'), ' ')

export function hasTerm(text: string, term: string) {
  // (?<![\w]) instead of \b so terms like "C#", ".NET" and "C++" still match
  if (term === 'ir') return irHit(text)
  return new RegExp(`(?<![\\w.])${esc(term)}(?![\\w])`, 'i').test(text)
}

export function findSkills(text: string) {
  return SKILLS.filter((s) => s.words.some((w) => hasTerm(text, w))).map((s) => s.canonical)
}

export function skillWords(canonical: string) {
  return SKILLS.find((s) => s.canonical === canonical)?.words ?? [canonical.toLowerCase()]
}

// Partial credit: having a closely related skill shows transferable experience.
// ponytail: hand-curated pairs; extend as new roles come up.
const RELATED: Record<string, string[]> = {
  'Next.js': ['React', 'Server-side rendering', 'Vue', 'Angular'],
  'Server-side rendering': ['Next.js'],
  TypeScript: ['JavaScript'],
  React: ['Vue', 'Angular', 'Svelte', 'React Native'],
  Vue: ['React', 'Angular'],
  Angular: ['React', 'Vue'],
  Redux: ['Zustand'],
  Zustand: ['Redux'],
  'Apollo Client': ['GraphQL'],
  GraphQL: ['Apollo Client'],
  Jest: ['Unit testing', 'React Testing Library', 'Cypress', 'Playwright'],
  'React Testing Library': ['Jest', 'Unit testing'],
  'Unit testing': ['Jest', 'Cypress', 'Playwright', 'Selenium'],
  'CI/CD': ['GitHub Actions', 'Jenkins', 'DevOps'],
  DevOps: ['Docker', 'Kubernetes', 'CI/CD', 'Terraform', 'AWS', 'Azure', 'GCP'],
  Kubernetes: ['Docker'],
  AWS: ['Azure', 'GCP'],
  Azure: ['AWS', 'GCP'],
  GCP: ['AWS', 'Azure'],
  PostgreSQL: ['MySQL', 'SQL'],
  MySQL: ['PostgreSQL', 'SQL'],
  'Component library': ['UI design'],
  'UX design': ['UI design', 'Figma'],
  'UI design': ['Figma', 'UX design'],
  Python: ['Django', 'Flask', 'FastAPI'],
  'Spring Boot': ['Java'],
  Kotlin: ['Java', 'Android'],
  'Data analysis': ['SQL', 'MS Excel', 'Power BI', 'Tableau', 'Python'],
  'Power BI': ['Tableau'],
  Tableau: ['Power BI'],
  Recruitment: ['Sourcing', 'Onboarding', 'ATS'],
  Sourcing: ['Recruitment'],
  'Employer branding': ['Social media marketing', 'Content marketing'],
  Workday: ['HRIS'],
  HRIS: ['Workday'],
  'Industrial relations': ['Employee relations', 'Labour law', 'Grievance handling'],
  'Statutory compliance': ['Labour law', 'Payroll', 'Compliance'],
  'Labour law': ['Statutory compliance', 'Industrial relations'],
  'Contract labour management': ['Statutory compliance', 'Industrial relations'],
  'Time office': ['Payroll'],
  Payroll: ['Time office', 'Statutory compliance'],
  'Employee welfare': ['Employee engagement', 'Employee relations'],
  'Employee engagement': ['Employee welfare'],
  'Training and development': ['Performance management'],
  'HR policies': ['Employee relations'],
  'Grievance handling': ['Employee relations', 'Industrial relations'],
  'Disciplinary proceedings': ['Industrial relations', 'Labour law'],
  'Manpower planning': ['Recruitment'],
  'Team leadership': ['Mentoring', 'Project management'],
  Mentoring: ['Team leadership'],
  'Stakeholder management': ['Communication', 'Project management'],
  Sales: ['Business development', 'Account management', 'Lead generation'],
  CRM: ['Sales'],
  'Financial analysis': ['Accounting', 'Budgeting', 'MS Excel'],
}

/** Related skills (canonical names) present in the text, for partial credit. */
export function relatedIn(text: string, canonical: string) {
  return (RELATED[canonical] ?? []).filter((r) => skillWords(r).some((w) => hasTerm(text, w)))
}
