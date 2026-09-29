import { Ban, Code2, Copy, Globe, Hourglass, Inbox, Mail, UserSquare2, PauseCircle, Phone, ThumbsUp, Users } from 'lucide-react'
import type { Decision, Requirement, Result } from '../lib/types'
import { describeInterview, type Interview, type TemplateId } from '../lib/hr'

const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0)

const GROUPS: { id: Decision; label: string; icon: typeof Ban; tone: string }[] = [
  { id: 'shortlist', label: 'Shortlisted', icon: ThumbsUp, tone: 'var(--good)' },
  { id: 'hold', label: 'On hold', icon: PauseCircle, tone: 'var(--warn)' },
  { id: 'reject', label: 'Rejected', icon: Ban, tone: 'var(--bad)' },
  { id: 'none', label: 'Undecided', icon: Hourglass, tone: 'var(--faint)' },
]

export function Stats({ results, reqs, received, decision }: { results: Result[]; reqs: Requirement[]; received: number; decision: (id: string) => Decision }) {
  const n = results.length
  const count = (d: Decision) => results.filter((r) => decision(r.id) === d).length
  const bins = Array.from({ length: 10 }, (_, i) => results.filter((r) => Math.min(9, Math.floor(r.score / 10)) === i).length)
  const binMax = Math.max(1, ...bins)
  const gaps = reqs
    .map((q) => ({ q, missing: results.filter((r) => r.missingEssential.includes(q.skill) || r.missingPreferred.includes(q.skill)).length }))
    .filter((g) => g.missing)
    .sort((a, b) => b.missing - a.missing || (a.q.importance === 'essential' ? -1 : 1))
    .slice(0, 8)

  const tiles = [
    { label: 'Received', value: received, icon: Inbox },
    { label: 'Screened', value: n, icon: Users },
    ...GROUPS.map((g) => ({ label: g.label, value: count(g.id), icon: g.icon, tone: g.tone })),
    { label: 'Avg match', value: avg(results.map((r) => r.score)) },
    { label: 'Avg ATS', value: avg(results.map((r) => r.ats.score)) },
  ]

  return (
    <div className="stats">
      <div className="tiles">
        {tiles.map((t) => (
          <div key={t.label} className="tile">
            <span>{t.icon && <t.icon size={14} color={'tone' in t ? t.tone : 'var(--iris)'} />} {t.label}</span>
            <b>{t.value}</b>
          </div>
        ))}
      </div>

      <div className="charts">
        <figure className="chart panel">
          <figcaption>Match score distribution <small>candidates per 10-point band</small></figcaption>
          <div className="hist" role="img" aria-label={`Score distribution: ${bins.map((b, i) => `${i * 10} to ${i * 10 + 9}: ${b}`).join(', ')}`}>
            {bins.map((b, i) => (
              <div key={i} className="hist-col" title={`${i * 10}–${i === 9 ? 100 : i * 10 + 9}: ${b} candidate${b === 1 ? '' : 's'}`}>
                <span className="hist-n">{b || ''}</span>
                <i style={{ height: `${(b / binMax) * 100}%` }} />
              </div>
            ))}
          </div>
          <div className="hist-axis">{bins.map((_, i) => <span key={i}>{i * 10}</span>)}</div>
        </figure>

        <figure className="chart panel">
          <figcaption>Decisions so far <small>{n - count('none')} of {n} decided</small></figcaption>
          <div className="stack-bar" role="img" aria-label={GROUPS.map((g) => `${g.label} ${count(g.id)}`).join(', ')}>
            {GROUPS.map((g) => count(g.id) > 0 && <i key={g.id} style={{ flexGrow: count(g.id), background: g.tone }} title={`${g.label}: ${count(g.id)}`} />)}
          </div>
          <ul className="legend">
            {GROUPS.map((g) => (
              <li key={g.id}><g.icon size={14} color={g.tone} /> {g.label} <b>{count(g.id)}</b> <small>{n ? Math.round((100 * count(g.id)) / n) : 0}%</small></li>
            ))}
          </ul>
        </figure>

        <figure className="chart panel wide">
          <figcaption>Most common skill gaps <small>share of candidates missing each requirement</small></figcaption>
          {gaps.length ? (
            <div className="bars">
              {gaps.map(({ q, missing }) => (
                <div key={q.skill} className="bar-row" title={`${missing} of ${n} candidates missing ${q.skill}`}>
                  <span className="bar-label">{q.skill}<small>{q.importance}</small></span>
                  <span className="bar-track"><i style={{ width: `${(100 * missing) / n}%` }} /></span>
                  <b>{Math.round((100 * missing) / n)}%</b>
                </div>
              ))}
            </div>
          ) : <p className="none">Every candidate covers every requirement.</p>}
        </figure>
      </div>
    </div>
  )
}

interface ContactsProps {
  results: Result[]
  decision: (id: string) => Decision
  rank: Map<string, number>
  onToast: (m: string) => void
  emailFor: (r: Result) => string
  bulkEmail: (d: TemplateId, to: string[]) => string
  interviews: Record<string, Interview>
}

export function Contacts({ results, decision, rank, onToast, emailFor, bulkEmail, interviews }: ContactsProps) {
  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); onToast(`${what} copied.`) } catch { onToast('Could not copy. Check the browser clipboard permission.') }
  }
  const short = (u: string) => u.replace(/^https:\/\/(www\.)?/, '')

  return (
    <div className="contacts">
      {GROUPS.map((g) => {
        const rows = results.filter((r) => decision(r.id) === g.id)
        const emails = rows.map((r) => r.contacts?.email).filter(Boolean) as string[]
        return (
          <section key={g.id} className="panel contact-group" style={{ borderTopColor: g.tone }}>
            <header>
              <h3><g.icon size={17} color={g.tone} /> {g.label} <span className="n">{rows.length}</span></h3>
              {emails.length > 0 && (
                <div className="results-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => copy(emails.join('; '), `${emails.length} email address${emails.length === 1 ? '' : 'es'}`)}><Copy size={14} /> Copy emails</button>
                  {g.id !== 'none' && <a className="btn btn-ghost btn-sm" href={bulkEmail(g.id, emails)} title="One email to everyone in this group, addresses hidden (BCC), using your template"><Mail size={14} /> Email all (BCC)</a>}
                </div>
              )}
            </header>
            {rows.length ? (
              <div className="table-scroll" data-lenis-prevent>
                <table className="contact-table">
                  <thead><tr><th>#</th><th>Candidate</th><th>Match</th><th>Email</th><th>Phone</th><th>Links</th>{g.id === 'shortlist' && <th>Interview</th>}<th /></tr></thead>
                  <tbody>
                    {rows.map((r) => {
                      const c = r.contacts
                      return (
                        <tr key={r.id}>
                          <td>{rank.get(r.id)}</td>
                          <td><b>{r.eval.name}</b><small>{r.eval.headline}</small></td>
                          <td>{r.score}</td>
                          <td>{c?.email ? <a href={`mailto:${c.email}`}><Mail size={13} /> {c.email}</a> : <span className="none">Not found</span>}</td>
                          <td>{c?.phone ? <a href={`tel:${c.phone.replace(/[^\d+]/g, '')}`}><Phone size={13} /> {c.phone}</a> : <span className="none">Not found</span>}</td>
                          <td className="links">
                            {c?.linkedin && <a href={c.linkedin} target="_blank" rel="noopener noreferrer" title={short(c.linkedin)}><UserSquare2 size={13} /> LinkedIn</a>}
                            {c?.github && <a href={c.github} target="_blank" rel="noopener noreferrer" title={short(c.github)}><Code2 size={13} /> GitHub</a>}
                            {c?.portfolio && <a href={c.portfolio} target="_blank" rel="noopener noreferrer" title={short(c.portfolio)}><Globe size={13} /> {short(c.portfolio).split('/')[0]}</a>}
                            {!c?.linkedin && !c?.github && !c?.portfolio && <span className="none">None</span>}
                          </td>
                          {g.id === 'shortlist' && <td>{interviews[r.id]?.when ? describeInterview(interviews[r.id]) : <span className="none">Not scheduled</span>}</td>}
                          <td>{emailFor(r) && <a className="btn btn-ghost btn-sm" href={emailFor(r)} title="Email with the template filled in"><Mail size={13} /> Email</a>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : <p className="none">No candidates here yet. Use the Shortlist, Hold and Reject buttons on each card.</p>}
          </section>
        )
      })}
    </div>
  )
}
