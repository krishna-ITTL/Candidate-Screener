import { useEffect, useRef, type ReactNode } from 'react'
import { CircleCheck, CircleDashed, CircleX, X } from 'lucide-react'
import type { Decision, Requirement, Result } from '../lib/types'
import { describeInterview, type Interview } from '../lib/hr'

const LEVEL = { met: { icon: CircleCheck, text: 'Met' }, partial: { icon: CircleDashed, text: 'Partial' }, missing: { icon: CircleX, text: 'Missing' } }
const DECISION: Record<Decision, string> = { shortlist: 'Shortlisted', hold: 'On hold', reject: 'Rejected', none: 'Undecided' }

interface Props {
  picked: Result[]
  reqs: Requirement[]
  rank: Map<string, number>
  decision: (id: string) => Decision
  notes: Record<string, string>
  interviews: Record<string, Interview>
  onClose: () => void
}

/** Side-by-side view of 2 or 3 candidates on the same rubric. The best value in each numeric row is highlighted. */
export default function Compare({ picked, reqs, rank, decision, notes, interviews, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { ref.current?.showModal() }, [])

  const best = (v: (r: Result) => number | null) => {
    const vals = picked.map(v).filter((x): x is number => x !== null)
    const top = Math.max(...vals)
    return (r: Result) => (vals.length > 1 && v(r) === top && vals.filter((x) => x === top).length < vals.length ? ' best' : '')
  }
  const levelOf = (r: Result, skill: string) => r.eval.assessments.find((a) => a.skill.toLowerCase() === skill.toLowerCase())?.level ?? 'missing'
  const metCount = (r: Result) => reqs.filter((q) => levelOf(r, q.skill) === 'met').length
  const rows: { label: string; cell: (r: Result) => ReactNode; cls?: (r: Result) => string }[] = [
    { label: 'Match score', cell: (r) => <b>{r.score}</b>, cls: best((r) => r.score) },
    { label: 'ATS score', cell: (r) => r.ats.score, cls: best((r) => r.ats.score) },
    { label: 'Experience', cell: (r) => (r.eval.yearsExperience !== null ? `${r.eval.yearsExperience} yrs` : 'Not stated'), cls: best((r) => r.eval.yearsExperience) },
    { label: 'Requirements met', cell: (r) => `${metCount(r)} of ${reqs.length}`, cls: best(metCount) },
    { label: 'Decision', cell: (r) => DECISION[decision(r.id)] },
    { label: 'Interview', cell: (r) => (interviews[r.id]?.when ? describeInterview(interviews[r.id]) : '-') },
    { label: 'Contact', cell: (r) => <>{r.contacts?.email || '-'}<small>{r.contacts?.phone}</small></> },
    { label: 'Summary', cell: (r) => <span className="muted">{r.eval.summary}</span> },
    { label: 'Strengths', cell: (r) => (r.eval.strengths.length ? <ul>{r.eval.strengths.map((s) => <li key={s}>{s}</li>)}</ul> : '-') },
    { label: 'Concerns', cell: (r) => (r.eval.concerns.length ? <ul>{r.eval.concerns.map((s) => <li key={s}>{s}</li>)}</ul> : '-') },
    { label: 'Your notes', cell: (r) => notes[r.id] || '-' },
  ]

  return (
    <dialog ref={ref} className="compare" onClose={onClose} onClick={(e) => e.target === ref.current && ref.current.close()} aria-labelledby="compare-title">
      <div className="compare-inner" data-lenis-prevent>
        <header>
          <h2 id="compare-title">Compare candidates</h2>
          <button className="btn btn-quiet icon-btn" onClick={() => ref.current?.close()} aria-label="Close"><X size={18} /></button>
        </header>
        <div className="table-scroll">
          <table className="compare-table" style={{ ['--cols' as string]: picked.length }}>
            <thead>
              <tr><th />{picked.map((r) => <th key={r.id}><span className="rank-sm">#{rank.get(r.id)}</span> {r.eval.name}<small>{r.eval.headline}</small></th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label}><th scope="row">{row.label}</th>{picked.map((r) => <td key={r.id} className={row.cls?.(r)}>{row.cell(r)}</td>)}</tr>
              ))}
              <tr className="compare-section"><th colSpan={picked.length + 1}>Requirement by requirement</th></tr>
              {reqs.map((q) => (
                <tr key={q.skill}>
                  <th scope="row">{q.skill}<small>{q.importance}</small></th>
                  {picked.map((r) => {
                    const l = LEVEL[levelOf(r, q.skill)]
                    return <td key={r.id}><span className={`lvl ${levelOf(r, q.skill)}`}><l.icon size={14} /> {l.text}</span></td>
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </dialog>
  )
}
