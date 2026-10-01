import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, animate, motion, useInView, useMotionValue, useTransform } from 'motion/react'
import { useRef } from 'react'
import {
  Ban, BarChart3, Briefcase, CalendarClock, CalendarPlus, Copy, GitCompare, CheckCircle2, Contact, FileSpreadsheet, LayoutList, Loader2, Mail, Phone, ChevronDown, CircleCheck, CircleDashed, CircleX, ClipboardCopy, Crown, Download, FileText,
  HelpCircle, NotebookPen, Users, PauseCircle, Search, Star, ThumbsUp, TriangleAlert, XCircle,
} from 'lucide-react'
import type { Decision, Requirement, Result, ResumeFile } from '../lib/types'
import { ElasticSlider } from './ElasticSlider'
import { Contacts, Stats } from './Insights'
import { downloadExcel, downloadTracker } from '../lib/excel'
import Compare from './Compare'
import PipelinePanel from './Pipeline'
import { buildIcs, describeInterview, download, findDuplicates, firstName, loadTemplates, mailto, MODE_LABEL, type Dup, type Interview, type InterviewMode, type Pipeline } from '../lib/hr'
import type { SavedRun } from '../lib/history'

function InterviewRow({ value, onChange, onCalendar }: { value?: Interview; onChange: (i: Interview) => void; onCalendar: () => void }) {
  const v = value ?? { when: '', mode: 'video' as InterviewMode, where: '' }
  const set = (p: Partial<Interview>) => onChange({ ...v, ...p })
  return (
    <div className="interview">
      <span className="interview-label"><CalendarClock size={15} /> Interview</span>
      <input className="input" type="datetime-local" value={v.when} onChange={(e) => set({ when: e.target.value })} aria-label="Interview date and time" />
      <select className="select" value={v.mode} onChange={(e) => set({ mode: e.target.value as InterviewMode })} aria-label="Interview format">
        {Object.entries(MODE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      <input className="input" value={v.where} onChange={(e) => set({ where: e.target.value })} aria-label="Meeting link or location"
        placeholder={v.mode === 'in-person' ? 'Office address' : v.mode === 'video' ? 'Meeting link' : 'Who calls whom'} />
      <button className="btn btn-ghost btn-sm" onClick={onCalendar} disabled={!v.when} title="Download a calendar invite (.ics) for Outlook or Google Calendar"><CalendarPlus size={14} /> Add to calendar</button>
    </div>
  )
}


const tone = (s: number) => (s >= 75 ? 'strong' : s >= 55 ? 'maybe' : 'weak')
const TONE_LABEL = { strong: 'Strong match', maybe: 'Worth a look', weak: 'Weak match' }
const toneColor = (s: number) => (s >= 75 ? 'var(--good)' : s >= 55 ? 'var(--warn)' : 'var(--bad)')

function ScoreRing({ value }: { value: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-40px' })
  const mv = useMotionValue(0)
  const shown = useTransform(mv, (v) => Math.round(v))
  const R = 44
  const C = 2 * Math.PI * R
  const dash = useTransform(mv, (v) => C * (1 - v / 100))
  useEffect(() => {
    if (!inView) return
    const c = animate(mv, value, { duration: 1.4, ease: [0.22, 1, 0.36, 1] })
    return () => c.stop()
  }, [inView, value, mv])
  return (
    <div className="ring" ref={ref} role="img" aria-label={`Match score ${value} out of 100`}>
      <svg width="104" height="104" viewBox="0 0 104 104">
        <circle cx="52" cy="52" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="9" />
        <motion.circle cx="52" cy="52" r={R} fill="none" stroke={toneColor(value)} strokeWidth="9" strokeLinecap="round" strokeDasharray={C} style={{ strokeDashoffset: dash }} />
      </svg>
      <div className="ring-value"><motion.b>{shown}</motion.b><small>match</small></div>
    </div>
  )
}

const LEVEL_ICON = { met: CircleCheck, partial: CircleDashed, missing: CircleX }
const LEVEL_TEXT = { met: 'Met', partial: 'Partial', missing: 'Missing' }
const PAST_LABEL: Record<Decision, string> = { shortlist: 'shortlisted', hold: 'on hold', reject: 'rejected', none: 'no decision' }

interface CardProps {
  r: Result; rank: number; reqs: Requirement[]; text: string
  decision: Decision; onDecide: (d: Decision) => void
  note: string; onNote: (v: string) => void
  interview?: Interview; onInterview: (i: Interview) => void; onCalendar: () => void
  pipeline?: Pipeline; onPipeline: (p: Pipeline) => void
  emailHref: string; dup?: Dup; dupNames: string
  picked: boolean; onPick: () => void; pickFull: boolean
}

function Card({ r, rank, reqs, text, decision, onDecide, note, onNote, interview, onInterview, onCalendar, pipeline, onPipeline, emailHref, dup, dupNames, picked, onPick, pickFull }: CardProps) {
  const [open, setOpen] = useState(false)
  const [showText, setShowText] = useState(false)
  const t = tone(r.score)
  const top = rank === 1
  const imp = new Map(reqs.map((q) => [q.skill.toLowerCase(), q.importance]))
  const e = r.eval

  return (
    <motion.article
      layout
      className={`card${top ? ' top' : ''} d-${decision}`}
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ layout: { type: 'spring', stiffness: 320, damping: 32 }, default: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } }}
    >
      <div className="card-main">
        <div className="rank" aria-label={`Rank ${rank}`}>{rank}</div>
        <ScoreRing value={r.score} />
        <div style={{ minWidth: 0 }}>
          <div className="cand-top">
            <h3 className="cand-name">{e.name}</h3>
            {top && <span className="badge top"><Crown size={13} /> Top match</span>}
            <span className={`badge ${t}`}>{TONE_LABEL[t]}</span>
            {dup && <span className="badge dup"><Copy size={12} /> {dup.sameRun.length ? 'Possible duplicate' : 'Applied before'}</span>}
          </div>
          <div className="cand-file">{r.fileName}</div>
          <div className="cand-sub">
            {e.headline && <span><Briefcase size={14} /> {e.headline}</span>}
            {e.yearsExperience !== null && <span>{e.yearsExperience} yrs experience</span>}
            {r.contacts?.email && <a href={`mailto:${r.contacts.email}`}><Mail size={14} /> {r.contacts.email}</a>}
            {r.contacts?.phone && <a href={`tel:${r.contacts.phone.replace(/[^\d+]/g, '')}`}><Phone size={14} /> {r.contacts.phone}</a>}
          </div>
          <p className="cand-summary">{e.summary}</p>
          {note && !open && <p className="cand-note"><NotebookPen size={14} /> {note}</p>}
          {dup && (
            <p className="cand-note dup-note">
              <Copy size={14} />
              <span>
                {dup.sameRun.length > 0 && <>Same email or phone as {dupNames} in this screening. </>}
                {dup.past.map((p, i) => <span key={i}>Applied for {p.title || 'an earlier role'} on {new Date(p.date).toLocaleDateString()} ({PAST_LABEL[p.decision]}). </span>)}
              </span>
            </p>
          )}
          {decision === 'shortlist' && <InterviewRow value={interview} onChange={onInterview} onCalendar={onCalendar} />}
          <PipelinePanel decision={decision} value={pipeline} profile={r.profile} onChange={onPipeline} />
          <div className="skill-groups">
            <div>
              <h4><CheckCircle2 size={14} color="var(--good)" /> Matched skills ({r.matched.length})</h4>
              <div className="chips">{r.matched.length ? r.matched.map((s) => <span key={s} className="chip hit">{s}</span>) : <span className="none">None found</span>}</div>
            </div>
            <div>
              <h4><XCircle size={14} color="var(--bad)" /> Missing essentials ({r.missingEssential.length})</h4>
              <div className="chips">
                {r.missingEssential.length ? r.missingEssential.map((s) => <span key={s} className="chip miss">{s}</span>) : <span className="none">All essentials covered</span>}
              </div>
            </div>
          </div>
        </div>
        <div className="side">
          <div className="ats" title="How well an applicant tracking system can parse this resume and find the JD keywords">
            ATS <b>{r.ats.score}</b>
            <span className="ats-bar"><i style={{ width: `${r.ats.score}%`, background: toneColor(r.ats.score) }} /></span>
          </div>
          <div className="decide" role="group" aria-label={`Decision for ${e.name}`}>
            <button className="s" aria-pressed={decision === 'shortlist'} onClick={() => onDecide(decision === 'shortlist' ? 'none' : 'shortlist')}><ThumbsUp size={14} /> Shortlist</button>
            <button className="h" aria-pressed={decision === 'hold'} onClick={() => onDecide(decision === 'hold' ? 'none' : 'hold')} title="On hold"><PauseCircle size={14} /> Hold</button>
            <button className="r" aria-pressed={decision === 'reject'} onClick={() => onDecide(decision === 'reject' ? 'none' : 'reject')} title="Reject"><Ban size={14} /> Reject</button>
          </div>
          <div className="card-tools">
            {emailHref
              ? <a className="btn btn-ghost btn-sm" href={emailHref} title="Opens your email app with the matching template filled in"><Mail size={14} /> Email</a>
              : <button className="btn btn-ghost btn-sm" disabled title={r.contacts?.email ? 'Choose Shortlist, Hold or Reject first' : 'No email address found in the resume'}><Mail size={14} /> Email</button>}
            <label className={`pick${picked ? ' on' : ''}`} title={pickFull && !picked ? 'You can compare up to 3 candidates' : 'Add to side-by-side comparison'}>
              <input type="checkbox" checked={picked} onChange={onPick} disabled={pickFull && !picked} /> <GitCompare size={14} /> Compare
            </label>
          </div>
          <button className="more" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? 'Hide details' : 'Full assessment'}
            <motion.span animate={{ rotate: open ? 180 : 0 }} style={{ display: 'grid' }}><ChevronDown size={16} /></motion.span>
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div className="details" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
            <div className="details-inner">
              <div>
                <h4>Requirement by requirement</h4>
                <table className="rubric">
                  <tbody>
                    {e.assessments.map((a) => {
                      const Icon = LEVEL_ICON[a.level]
                      return (
                        <tr key={a.skill}>
                          <td style={{ width: '38%' }}>{a.skill}<span className="imp">{imp.get(a.skill.toLowerCase()) ?? ''}</span></td>
                          <td style={{ width: 90 }}><span className={`lvl ${a.level}`}><Icon size={14} /> {LEVEL_TEXT[a.level]}</span></td>
                          <td className="ev">{a.evidence || '-'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <label className="note-field">
                  <h4><NotebookPen size={14} /> Your notes</h4>
                  <textarea className="input" rows={3} value={note} onChange={(ev) => onNote(ev.target.value)} placeholder="Phone screen booked, salary expectation, notice period..." />
                </label>
                {text && (
                  <div style={{ marginTop: 18 }}>
                    <button className="more" onClick={() => setShowText((s) => !s)}><FileText size={14} /> {showText ? 'Hide resume text' : 'Show resume text'}</button>
                    {showText && <div className="resume-text" data-lenis-prevent style={{ marginTop: 8 }}>{text}</div>}
                  </div>
                )}
              </div>
              <div className="stack-sections">
                {e.strengths.length > 0 && (
                  <div><h4>Strengths</h4><ul className="list">{e.strengths.map((s) => <li key={s}><Star size={14} color="var(--good)" /> {s}</li>)}</ul></div>
                )}
                {e.concerns.length > 0 && (
                  <div><h4>Concerns</h4><ul className="list">{e.concerns.map((s) => <li key={s}><TriangleAlert size={14} color="var(--warn)" /> {s}</li>)}</ul></div>
                )}
                {r.missingPreferred.length > 0 && (
                  <div><h4>Missing nice-to-haves</h4><div className="chips">{r.missingPreferred.map((s) => <span key={s} className="chip soft">{s}</span>)}</div></div>
                )}
                <div>
                  <h4>ATS readiness: {r.ats.score}/100</h4>
                  <ul className="list">
                    {r.ats.checks.map((c) => (
                      <li key={c.label}>{c.ok ? <CircleCheck size={14} color="var(--good)" /> : <CircleX size={14} color="var(--bad)" />} {c.label}</li>
                    ))}
                  </ul>
                </div>
                {e.interviewQuestions.length > 0 && (
                  <div><h4>Suggested interview questions</h4><ul className="list">{e.interviewQuestions.map((q) => <li key={q}><HelpCircle size={14} color="var(--iris)" /> {q}</li>)}</ul></div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  )
}

type Filter = 'all' | 'shortlist' | 'hold' | 'reject' | 'open'
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Undecided' },
  { id: 'shortlist', label: 'Shortlisted' },
  { id: 'hold', label: 'On hold' },
  { id: 'reject', label: 'Rejected' },
]

// Resume text is untrusted: prefix cells that spreadsheets would treat as formulas.
const cell = (c: string | number) => {
  const s = String(c)
  return `"${(/^[=+\-@\t\r]/.test(s) ? "'" + s : s).replace(/"/g, '""')}"`
}
function csv(rows: (string | number)[][]) {
  return rows.map((r) => r.map(cell).join(',')).join('\r\n')
}

interface Props {
  results: Result[]
  reqs: Requirement[]
  files: ResumeFile[]
  title: string
  decisions: Record<string, Decision>
  onDecide: (id: string, d: Decision) => void
  notes: Record<string, string>
  onNote: (id: string, v: string) => void
  onToast: (msg: string) => void
  date: number
  received: number
  interviews: Record<string, Interview>
  onInterview: (id: string, i: Interview) => void
  history: SavedRun[]
  runId: string
  jd: string
  pipeline: Record<string, Pipeline>
  onPipeline: (id: string, p: Pipeline) => void
}

export default function Results({ results, reqs, files, title, decisions, onDecide, notes, onNote, onToast, date, received, interviews, onInterview, history, runId, jd, pipeline, onPipeline }: Props) {
  const [picked, setPicked] = useState<string[]>([])
  const [comparing, setComparing] = useState(false)
  const [view, setView] = useState<'cards' | 'stats' | 'contacts'>('cards')
  const [exporting, setExporting] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [min, setMin] = useState(0)

  const d = (id: string) => decisions[id] ?? 'none'
  const rankOf = useMemo(() => new Map(results.map((r, i) => [r.id, i + 1])), [results])
  const textOf = useMemo(() => new Map(files.map((f) => [f.id, f.text])), [files])
  const count = (f: Filter) => results.filter((r) => f === 'all' || (f === 'open' ? d(r.id) === 'none' : d(r.id) === f)).length

  const shown = results
    .filter((r) => filter === 'all' || (filter === 'open' ? d(r.id) === 'none' : d(r.id) === filter))
    .filter((r) => r.score >= min)
    .filter((r) => !query || `${r.eval.name} ${r.fileName} ${r.matched.join(' ')}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => rankOf.get(a.id)! - rankOf.get(b.id)!)

  const dups = useMemo(() => findDuplicates(results, history, runId), [results, history, runId])
  const templates = loadTemplates()
  const role = title.replace(/^(job description|jd)\s*[:\-–]\s*/i, '')
  const vars = (r: Result) => ({ name: firstName(r.eval.name), role, interview: interviews[r.id]?.when ? describeInterview(interviews[r.id]) : '' })
  const emailFor = (r: Result) => {
    const dec = d(r.id)
    return dec === 'none' || !r.contacts?.email ? '' : mailto([r.contacts.email], templates[dec], vars(r))
  }
  const scheduled = results.filter((r) => d(r.id) === 'shortlist' && interviews[r.id]?.when)
  const calendar = (rs: Result[]) => {
    download(`interviews-${new Date().toISOString().slice(0, 10)}.ics`, buildIcs(rs.map((r) => ({
      id: `${runId}-${r.id}`, name: r.eval.name, role, interview: interviews[r.id], email: r.contacts?.email, phone: r.contacts?.phone,
    }))), 'text/calendar;charset=utf-8')
    onToast('Calendar file downloaded. Open it to add to Outlook or Google Calendar.')
  }
  const togglePick = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id].slice(-3)))

  const strong = results.filter((r) => r.score >= 75).length
  const avg = results.length ? Math.round(results.reduce((s, r) => s + r.score, 0) / results.length) : 0

  const exportCsv = () => {
    const rows = [
      ['Rank', 'Name', 'Match score', 'ATS score', 'Decision', 'Years', 'Summary', 'Matched skills', 'Missing essential skills', 'Notes', 'File'],
      ...results.map((r) => [rankOf.get(r.id)!, r.eval.name, r.score, r.ats.score, d(r.id) === 'none' ? '' : d(r.id), r.eval.yearsExperience ?? '', r.eval.summary, r.matched.join('; '), r.missingEssential.join('; '), notes[r.id] ?? '', r.fileName]),
    ]
    const url = URL.createObjectURL(new Blob(['﻿' + csv(rows)], { type: 'text/csv;charset=utf-8' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: `joblens-${new Date().toISOString().slice(0, 10)}.csv` })
    a.click()
    URL.revokeObjectURL(url)
  }

  // Plain text for pasting into an email or chat to the hiring manager.
  const copyShortlist = async () => {
    const line = (r: Result) => `- ${r.eval.name}: match ${r.score}, ATS ${r.ats.score}${r.eval.yearsExperience !== null ? `, ${r.eval.yearsExperience} yrs` : ''}. ${r.eval.summary}${notes[r.id] ? `\n  Note: ${notes[r.id]}` : ''}`
    const group = (label: string, dec: Decision) => {
      const rs = results.filter((r) => d(r.id) === dec)
      return rs.length ? `${label} (${rs.length})\n${rs.map(line).join('\n')}` : ''
    }
    const body = [group('Shortlisted', 'shortlist'), group('On hold', 'hold')].filter(Boolean).join('\n\n')
    if (!body) return onToast('Mark candidates as Shortlist or Hold first.')
    try {
      await navigator.clipboard.writeText(`${title || 'Screening'}: ${results.length} candidates screened\n\n${body}`)
      onToast('Shortlist copied. Paste it into an email or chat.')
    } catch {
      onToast('Could not copy. Check the browser clipboard permission.')
    }
  }

  // HR's own candidate tracker: same 24 columns, ready to paste into their sheet.
  const exportTracker = async () => {
    try {
      await downloadTracker({ title, date: date || Date.now(), received, results, reqs, decisions, notes, interviews, jd, pipeline })
      onToast('Candidate tracker downloaded.')
    } catch {
      onToast('Could not build the candidate tracker. Try again.')
    }
  }

  const exportExcel = async () => {
    setExporting(true)
    try {
      await downloadExcel({ title, date: date || Date.now(), received, results, reqs, decisions, notes, interviews })
      onToast('Excel report downloaded.')
    } catch {
      onToast('Could not build the Excel report. Try again, or use CSV.')
    }
    setExporting(false)
  }

  return (
    <section aria-labelledby="results-title">
      <div className="results-head">
        <div>
          <h2 id="results-title">Ranked candidates</h2>
          <p>
            {results.length} assessed against {reqs.length} requirements. {strong} strong match{strong === 1 ? '' : 'es'} (75+), average score {avg}.
            {results[0]?.engine === 'offline' ? ' Scored offline on this computer.' : ' Assessed by AI.'}
          </p>
        </div>
        <div className="results-actions">
          {scheduled.length > 0 && <button className="btn btn-ghost" onClick={() => calendar(scheduled)} title="All scheduled interviews in one calendar file"><CalendarPlus size={16} /> Interviews ({scheduled.length})</button>}
          <button className="btn btn-ghost" onClick={copyShortlist}><ClipboardCopy size={16} /> Copy shortlist</button>
          <button className="btn btn-quiet" onClick={exportCsv} title="Plain CSV, for importing into other tools"><Download size={16} /> CSV</button>
          <button className="btn btn-ghost" onClick={exportTracker} title="HR's candidate tracker format (24 columns)"><Users size={16} /> Candidate tracker</button>
          <button className="btn btn-primary" onClick={exportExcel} disabled={exporting}>{exporting ? <Loader2 size={16} className="spin" /> : <FileSpreadsheet size={16} />} Excel report</button>
        </div>
      </div>

      <div className="segs view-switch" role="tablist" aria-label="Results view">
        {([['cards', 'Candidates', LayoutList], ['stats', 'Statistics', BarChart3], ['contacts', 'Contacts', Contact]] as const).map(([id, label, Icon]) => (
          <button key={id} role="tab" aria-selected={view === id} aria-pressed={view === id} onClick={() => setView(id)}>
            {view === id && <motion.span layoutId="view-pill" className="pill" />}
            <span><Icon size={15} /> {label}</span>
          </button>
        ))}
      </div>

      {view === 'stats' && <Stats results={results} reqs={reqs} received={received} decision={d} />}
      {view === 'contacts' && <Contacts results={results} decision={d} rank={rankOf} onToast={onToast} emailFor={emailFor} interviews={interviews} bulkEmail={(dec, to) => mailto(to, templates[dec], { name: 'there', role, interview: '' }, true)} />}
      {view === 'cards' && <>

      <div className="toolbar">
        <div className="segs" role="group" aria-label="Filter by decision">
          {FILTERS.map((f) => (
            <button key={f.id} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              {filter === f.id && <motion.span layoutId="seg-pill" className="pill" />}
              <span>{f.label} <span className="n">{count(f.id)}</span></span>
            </button>
          ))}
        </div>
        <label className="search">
          <Search size={16} />
          <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or skill" aria-label="Search candidates" />
        </label>
        <div className="range">
          Min score
          <ElasticSlider label="Minimum score" value={min} onChange={setMin} step={5} />
          <output>{min}</output>
        </div>
      </div>

      <motion.div layout className="cards">
        <AnimatePresence mode="popLayout">
          {shown.map((r) => (
            <Card key={r.id} r={r} rank={rankOf.get(r.id)!} reqs={reqs} text={textOf.get(r.id) ?? ''} decision={d(r.id)} onDecide={(v) => onDecide(r.id, v)} note={notes[r.id] ?? ''} onNote={(v) => onNote(r.id, v)}
              interview={interviews[r.id]} onInterview={(i) => onInterview(r.id, i)} onCalendar={() => calendar([r])}
              pipeline={pipeline[r.id]} onPipeline={(p) => onPipeline(r.id, p)}
              emailHref={emailFor(r)} dup={dups.get(r.id)} dupNames={(dups.get(r.id)?.sameRun ?? []).map((id) => `#${rankOf.get(id)} ${results.find((x) => x.id === id)?.eval.name}`).join(', ')}
              picked={picked.includes(r.id)} onPick={() => togglePick(r.id)} pickFull={picked.length >= 3} />
          ))}
        </AnimatePresence>
        {!shown.length && (
          <motion.div className="empty panel" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Search size={28} />
            <b>No candidates match these filters</b>
            <button className="btn btn-ghost btn-sm" onClick={() => { setFilter('all'); setQuery(''); setMin(0) }}>Clear filters</button>
          </motion.div>
        )}
      </motion.div>
      </>}

      <AnimatePresence>
        {picked.length > 0 && (
          <motion.div className="compare-tray" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 30 }}>
            <GitCompare size={17} />
            <span><b>{picked.length} of 3 selected:</b> {picked.map((id) => results.find((r) => r.id === id)?.eval.name).join(', ')}</span>
            <button className="btn btn-quiet btn-sm" onClick={() => setPicked([])}>Clear</button>
            <button className="btn btn-primary btn-sm" onClick={() => setComparing(true)} disabled={picked.length < 2} title={picked.length < 2 ? 'Pick at least 2 candidates' : undefined}>Compare side by side</button>
          </motion.div>
        )}
      </AnimatePresence>
      {comparing && (
        <Compare picked={results.filter((r) => picked.includes(r.id))} reqs={reqs} rank={rankOf} decision={d} notes={notes} interviews={interviews} onClose={() => setComparing(false)} />
      )}
    </section>
  )
}
