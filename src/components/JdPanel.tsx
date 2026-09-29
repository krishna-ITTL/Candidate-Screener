import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CheckCircle2, FilePlus2, Loader2, PenLine, Sparkles, UploadCloud, X } from 'lucide-react'
import { ACCEPT, extractText } from '../lib/extract'
import { createJd, friendlyError, type AiSettings, type JdBrief } from '../lib/ai'
import { COMPANY_LOCATIONS, DEFAULT_COMPANY, DEFAULT_INDUSTRY, DEFAULT_WEBSITE, SENIORITY_YEARS, templateJd } from '../lib/jdTemplate'
import { FileIcon } from './ResumePanel'

const INDUSTRIES = [
  DEFAULT_INDUSTRY, 'Energy & Utilities', 'Information Technology', 'Banking, Financial Services & Insurance', 'Fintech', 'Healthcare & Pharma',
  'Manufacturing', 'Retail & E-commerce', 'Education & EdTech', 'Telecom', 'Consulting & Professional Services',
  'Media & Entertainment', 'Logistics & Supply Chain', 'Real Estate & Construction',
  'Hospitality & Travel', 'Automotive', 'Government & Public Sector', 'Non-profit', 'Other',
]

const DEPARTMENTS = ['Design & Engineering', 'Production', 'Testing', 'Quality', 'Service & Commissioning', 'Projects', 'Sales & Marketing', 'Supply Chain', 'Finance & Accounts', 'Human Resources', 'IT', 'Administration', 'EHS']
const ROLE_IDEAS = ['Transformer Design Engineer', 'Senior Design Engineer', 'Test Engineer', 'Quality Engineer', 'Production Engineer', 'Winding Supervisor', 'Service Engineer', 'Sales Engineer (Tenders)', 'Purchase Engineer', 'Project Engineer', 'Graduate Engineer Trainee', 'Talent Acquisition Executive', 'Accounts Executive']
const QUALIFICATIONS = ['B.E./B.Tech in Electrical Engineering', 'Diploma in Electrical Engineering (DEEE)', 'B.E./B.Tech in Mechanical Engineering', 'M.E. in Power Systems', 'ITI (Electrician / Fitter)', 'MBA', 'CA / CMA', "Any bachelor's degree"]
const EMPLOYMENT = ['Full-time', 'Contract', 'Internship', 'Apprenticeship']
const WORK_MODE = ['On-site', 'Hybrid', 'Remote']

const EMPTY_BRIEF: JdBrief = {
  role: '', location: COMPANY_LOCATIONS[0], industry: DEFAULT_INDUSTRY, experience: '', company: DEFAULT_COMPANY, notes: '',
  website: DEFAULT_WEBSITE, department: '', seniority: '', employment: 'Full-time', workMode: 'On-site', openings: '1',
  qualification: '', salary: '', mustHave: '', niceToHave: '', reportsTo: '', conditions: '',
}

type Tab = 'upload' | 'paste' | 'create'
const TABS: { id: Tab; label: string; icon: typeof PenLine }[] = [
  { id: 'upload', label: 'Upload', icon: UploadCloud },
  { id: 'paste', label: 'Paste text', icon: PenLine },
  { id: 'create', label: 'Create JD', icon: Sparkles },
]

interface Props {
  jd: string
  onJd: (text: string) => void
  /** Provider settings in AI mode, null in Offline mode. */
  ai: AiSettings | null
  onToast: (msg: string) => void
}

export default function JdPanel({ jd, onJd, ai, onToast }: Props) {
  const [tab, setTab] = useState<Tab>('upload')
  const [file, setFile] = useState<{ name: string; status: 'reading' | 'ready' | 'error'; note: string; pct: number } | null>(null)
  const [brief, setBrief] = useState<JdBrief>(EMPTY_BRIEF)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [over, setOver] = useState(false)

  const ready = jd.trim().length >= 40
  const canCreate = brief.role.trim() && brief.location.trim() && brief.industry

  const load = async (f: File | undefined) => {
    if (!f) return
    setFile({ name: f.name, status: 'reading', note: 'Reading', pct: 0 })
    try {
      const { text } = await extractText(f, (pct, note) => setFile((cur) => cur && { ...cur, pct, note }))
      onJd(text)
      setFile({ name: f.name, status: 'ready', note: `${text.split(/\s+/).length} words extracted`, pct: 1 })
    } catch (e) {
      setFile({ name: f.name, status: 'error', note: friendlyError(e), pct: 0 })
    }
  }

  const removeFile = () => { setFile(null); onJd('') }

  const create = async () => {
    setCreating(true)
    setCreateError('')
    try {
      const text = ai ? await createJd(ai, brief) : templateJd(brief)
      onJd(text)
      setFile(null)
      setTab('paste')
      onToast(ai ? 'JD created. Review and edit it before analysing.' : 'JD drafted offline. Review and edit it before analysing.')
    } catch (e) {
      setCreateError(friendlyError(e))
    } finally {
      setCreating(false)
    }
  }

  const set = (k: keyof JdBrief) => (e: { target: { value: string } }) => setBrief((b) => ({ ...b, [k]: e.target.value }))

  return (
    <section className="panel" aria-labelledby="jd-title">
      <div className="panel-head">
        <div className={`step${ready ? ' done' : ''}`}>{ready ? <CheckCircle2 size={18} /> : 1}</div>
        <div>
          <h2 id="jd-title">Job description</h2>
          <p>One role per screening</p>
        </div>
      </div>

      <div className="tabs" role="tablist">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            <Icon size={15} /> {label}
            {tab === id && <motion.span layoutId="jd-tab" className="tab-line" />}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
          {tab === 'upload' && (
            <>
              {!file ? (
                <label
                  className={`drop${over ? ' over' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); setOver(true) }}
                  onDragLeave={() => setOver(false)}
                  onDrop={(e) => { e.preventDefault(); setOver(false); load(e.dataTransfer.files[0]) }}
                >
                  <input type="file" accept={ACCEPT} onChange={(e) => { load(e.target.files?.[0]); e.target.value = '' }} aria-label="Upload job description" />
                  <span className="drop-icon"><FilePlus2 size={22} /></span>
                  <strong>Drop the job description here</strong>
                  <small>PDF, Word (.docx), text or an image. Scanned files are read with OCR.</small>
                </label>
              ) : (
                <div className="files" style={{ marginTop: 0 }}>
                  <div className="file">
                    <FileIcon name={file.name} />
                    <div style={{ minWidth: 0 }}>
                      <div className="file-name">{file.name}</div>
                      <div className="file-meta">
                        {file.status === 'reading' && <><Loader2 size={13} className="spin" /> {file.note}</>}
                        {file.status === 'ready' && <span className="ok"><CheckCircle2 size={13} /> {file.note}</span>}
                        {file.status === 'error' && <span className="err">{file.note}</span>}
                      </div>
                    </div>
                    <button className="btn btn-quiet icon-btn" onClick={removeFile} aria-label={`Remove ${file.name}`}><X size={18} /></button>
                    {file.status === 'reading' && <motion.div className="file-progress" animate={{ width: `${Math.max(6, file.pct * 100)}%` }} />}
                  </div>
                  {file.status === 'ready' && (
                    <button className="more" onClick={() => setTab('paste')}><PenLine size={14} /> Review extracted text</button>
                  )}
                </div>
              )}
            </>
          )}

          {tab === 'paste' && (
            <textarea
              className="textarea"
              value={jd}
              onChange={(e) => onJd(e.target.value)}
              placeholder="Paste the full job description: responsibilities, required skills, experience and nice-to-haves."
              aria-label="Job description text"
            />
          )}

          {tab === 'create' && (
            <div className="jd-form">
              <h3 className="jd-group full">Role</h3>
              <label className="field full"><span>Role name *</span><input className="input" list="jd-roles" value={brief.role} onChange={set('role')} placeholder="e.g. Transformer Design Engineer" /></label>
              <datalist id="jd-roles">{ROLE_IDEAS.map((r) => <option key={r} value={r} />)}</datalist>
              <label className="field">
                <span>Department</span>
                <select className="select" value={brief.department} onChange={set('department')}>
                  <option value="">Work it out from the role</option>
                  {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Seniority</span>
                <select className="select" value={brief.seniority} onChange={set('seniority')}>
                  <option value="">Work it out from the role</option>
                  {Object.keys(SENIORITY_YEARS).map((s) => <option key={s}>{s}</option>)}
                </select>
              </label>
              <label className="field"><span>Experience</span><input className="input" value={brief.experience} onChange={set('experience')} placeholder={SENIORITY_YEARS[brief.seniority] ? `${SENIORITY_YEARS[brief.seniority]} (from seniority)` : 'e.g. 5–8 years'} /></label>
              <label className="field"><span>Reports to</span><input className="input" value={brief.reportsTo} onChange={set('reportsTo')} placeholder="e.g. Design Manager" /></label>

              <h3 className="jd-group full">Company</h3>
              <label className="field"><span>Company</span><input className="input" value={brief.company} onChange={set('company')} /></label>
              <label className="field"><span>Website</span><input className="input" value={brief.website} onChange={set('website')} placeholder="https://" /></label>
              <label className="field">
                <span>Industry *</span>
                <select className="select" value={brief.industry} onChange={set('industry')}>
                  <option value="" disabled>Select an industry</option>
                  {INDUSTRIES.map((i) => <option key={i}>{i}</option>)}
                </select>
              </label>
              <label className="field"><span>Location *</span><input className="input" list="jd-locations" value={brief.location} onChange={set('location')} placeholder="e.g. Kancheepuram, Tamil Nadu" /></label>
              <datalist id="jd-locations">{COMPANY_LOCATIONS.map((l) => <option key={l} value={l} />)}</datalist>

              <h3 className="jd-group full">Terms</h3>
              <label className="field">
                <span>Employment type</span>
                <select className="select" value={brief.employment} onChange={set('employment')}>{EMPLOYMENT.map((x) => <option key={x}>{x}</option>)}</select>
              </label>
              <label className="field">
                <span>Work mode</span>
                <select className="select" value={brief.workMode} onChange={set('workMode')}>{WORK_MODE.map((x) => <option key={x}>{x}</option>)}</select>
              </label>
              <label className="field"><span>Openings</span><input className="input" type="number" min={1} max={500} value={brief.openings} onChange={set('openings')} /></label>
              <label className="field"><span>Salary (CTC)</span><input className="input" value={brief.salary} onChange={set('salary')} placeholder="Optional, e.g. ₹6–9 LPA" /></label>

              <h3 className="jd-group full">Candidate</h3>
              <label className="field full"><span>Qualification</span><input className="input" list="jd-quals" value={brief.qualification} onChange={set('qualification')} placeholder="e.g. B.E./B.Tech in Electrical Engineering" /></label>
              <datalist id="jd-quals">{QUALIFICATIONS.map((q) => <option key={q} value={q} />)}</datalist>
              <label className="field full"><span>Must-have skills</span><input className="input" value={brief.mustHave} onChange={set('mustHave')} placeholder="Comma separated, e.g. AutoCAD, IS 2026, transformer winding" /></label>
              <label className="field full"><span>Nice-to-have skills</span><input className="input" value={brief.niceToHave} onChange={set('niceToHave')} placeholder="Comma separated, e.g. SAP, 132 kV experience" /></label>
              <label className="field full"><span>Working conditions</span><input className="input" value={brief.conditions} onChange={set('conditions')} placeholder="Optional, e.g. rotational shifts, 30% travel to customer sites" /></label>
              <label className="field full"><span>Anything else the JD should cover</span><input className="input" value={brief.notes} onChange={set('notes')} placeholder="Optional, e.g. replacement for a retiring senior engineer" /></label>
              <div className="full" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <button className="btn btn-primary" disabled={!canCreate || creating} onClick={create}>
                  {creating ? <><Loader2 size={16} className="spin" /> Writing JD</> : <><Sparkles size={16} /> Create JD</>}
                </button>
                <span className="muted" style={{ fontSize: 13 }}>{canCreate ? (ai ? 'Written by AI, max 500 words.' : 'Drafted offline from role templates. Review before use.') : 'Fill in role, location and industry to continue.'}</span>
              </div>
              {createError && <p className="form-error full">{createError}</p>}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {ready && tab !== 'paste' && (
        <p className="jd-ready"><CheckCircle2 size={16} /> Job description ready ({jd.split(/\s+/).length} words)</p>
      )}
    </section>
  )
}
