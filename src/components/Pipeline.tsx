import { BadgeCheck, Building2, Crown, UserRound } from 'lucide-react'
import type { Decision, Profile } from '../lib/types'
import { openStages, STAGE_LABEL, type Pipeline, type Stage, type StageStatus } from '../lib/hr'

const EMPTY: Stage = { status: 'pending', when: '', interviewers: '' }

function StageRow({ label, icon, value, onChange }: { label: string; icon: React.ReactNode; value?: Stage; onChange: (s: Stage) => void }) {
  const v = value ?? EMPTY
  const set = (p: Partial<Stage>) => onChange({ ...v, ...p })
  return (
    <div className={`stage-row s-${v.status}`}>
      <span className="interview-label">{icon} {label}</span>
      <select className="select" value={v.status} onChange={(e) => set({ status: e.target.value as StageStatus })} aria-label={`${label} result`}>
        {Object.entries(STAGE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      <input className="input" type="datetime-local" value={v.when} onChange={(e) => set({ when: e.target.value })} aria-label={`${label} interview date`} />
      <input className="input" value={v.interviewers} onChange={(e) => set({ interviewers: e.target.value })} placeholder="Interviewers" aria-label={`${label} interviewers`} />
    </div>
  )
}

/** Stages 2 and 3, the offer, and HR's own notes on notice period and pay. Shown once HR selects the candidate. */
export default function PipelinePanel({ decision, value = {}, profile, onChange }: { decision: Decision; value?: Pipeline; profile?: Profile; onChange: (p: Pipeline) => void }) {
  const open = openStages(decision, value)
  const set = (p: Partial<Pipeline>) => onChange({ ...value, ...p })
  const text = (k: 'noticePeriod' | 'presentCtc' | 'expectedCtc' | 'recommendedCtc' | 'designationOffered' | 'hrInterviewers', label: string, hint = '') => (
    <label className="field-sm">
      <span>{label}</span>
      <input className="input" value={value[k] ?? ''} onChange={(e) => set({ [k]: e.target.value })} placeholder={hint} />
    </label>
  )
  if (!open.hod) return null
  return (
    <div className="pipeline">
      <div className="pipeline-details">
        {text('hrInterviewers', 'HR interviewers')}
        {text('noticePeriod', 'Notice period', profile?.noticePeriod || 'e.g. 30 days')}
        {text('presentCtc', 'Present CTC', profile?.presentCtc || 'e.g. 9 LPA')}
        {text('expectedCtc', 'Expected CTC', profile?.expectedCtc || 'e.g. 12 LPA')}
      </div>
      <StageRow label="Stage 2 · HOD" icon={<UserRound size={15} />} value={value.hod} onChange={(hod) => set({ hod })} />
      {open.ceo && <StageRow label="Stage 3 · CEO/COO" icon={<Crown size={15} />} value={value.ceo} onChange={(ceo) => set({ ceo })} />}
      {open.offer && (
        <div className="pipeline-details offer">
          <span className="interview-label"><BadgeCheck size={15} /> Offer</span>
          {text('designationOffered', 'Designation offered')}
          {text('recommendedCtc', 'Recommended CTC')}
          <label className="field-sm">
            <span>Date of joining</span>
            <input className="input" type="date" value={value.dateOfJoining ?? ''} onChange={(e) => set({ dateOfJoining: e.target.value })} />
          </label>
        </div>
      )}
      {(value.hod?.status === 'rejected' || (open.ceo && value.ceo?.status === 'rejected')) && (
        <p className="pipeline-note"><Building2 size={14} /> Not taken forward by the {value.hod?.status === 'rejected' ? 'HOD' : 'CEO/COO'}.</p>
      )}
    </div>
  )
}
