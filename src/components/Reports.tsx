import { useState } from 'react'
import { Ban, CalendarClock, FileSpreadsheet, FolderSearch, Hourglass, Inbox, Loader2, PauseCircle, ThumbsUp, Users } from 'lucide-react'
import { loadHistory } from '../lib/history'
import { formatWhen, MODE_LABEL, monthly } from '../lib/hr'
import { downloadMonthlyExcel } from '../lib/excel'

const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }

export default function Reports() {
  const [month, setMonth] = useState(thisMonth)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  // Read fresh on each render: the Screening page saves runs to storage as decisions change.
  const history = loadHistory()
  const m = monthly(history, month)
  const t = m.totals

  const exportMonth = async () => {
    setBusy(true)
    try { await downloadMonthlyExcel(history, month); setMsg('Downloaded.') } catch { setMsg('Could not build the report. Try again.') }
    setBusy(false)
  }

  const tiles = [
    { label: 'Screenings', value: t.screenings, icon: FolderSearch },
    { label: 'Received', value: t.received, icon: Inbox },
    { label: 'Screened', value: t.screened, icon: Users },
    { label: 'Shortlisted', value: t.shortlist, icon: ThumbsUp, tone: 'var(--good)' },
    { label: 'On hold', value: t.hold, icon: PauseCircle, tone: 'var(--warn)' },
    { label: 'Rejected', value: t.reject, icon: Ban, tone: 'var(--bad)' },
    { label: 'Undecided', value: t.none, icon: Hourglass, tone: 'var(--faint)' },
    { label: 'Interviews', value: t.interviews, icon: CalendarClock },
  ]

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Monthly report</h1>
          <p>Totals across every screening saved in this browser, for the month you pick. Interviews are counted in the month they take place.</p>
        </div>
        <div className="report-controls">
          <label className="field"><span>Month</span><input className="input" type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} /></label>
          <button className="btn btn-primary" onClick={exportMonth} disabled={busy}>{busy ? <Loader2 size={16} className="spin" /> : <FileSpreadsheet size={16} />} Download Excel</button>
          {msg && <span className="mode-caption" role="status">{msg}</span>}
        </div>
      </div>

      <div className="stats">
        <div className="tiles">
          {tiles.map((x) => (
            <div key={x.label} className="tile"><span><x.icon size={14} color={x.tone ?? 'var(--iris)'} /> {x.label}</span><b>{x.value}</b></div>
          ))}
        </div>

        <section className="panel">
          <h2 className="report-h">By role</h2>
          {m.roles.length ? (
            <div className="table-scroll" data-lenis-prevent>
              <table className="contact-table">
                <thead><tr><th>Role</th><th>Screened on</th><th>Received</th><th>Screened</th><th>Shortlisted</th><th>On hold</th><th>Rejected</th><th>Undecided</th><th>Avg match</th><th>Top candidate</th></tr></thead>
                <tbody>
                  {m.roles.map((r, i) => (
                    <tr key={i}><td><b>{r.title}</b></td><td>{new Date(r.date).toLocaleDateString()}</td><td>{r.received}</td><td>{r.screened}</td><td>{r.shortlist}</td><td>{r.hold}</td><td>{r.reject}</td><td>{r.none}</td><td>{r.avg}</td><td>{r.top}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="none">No screenings saved for this month. Finished screenings are saved automatically.</p>}
        </section>

        <div className="charts">
          <section className="panel">
            <h2 className="report-h">Interviews ({m.interviews.length})</h2>
            {m.interviews.length ? (
              <ul className="report-list">
                {m.interviews.map(({ run, r, i }) => (
                  <li key={`${run.id}-${r.id}`}><b>{formatWhen(i.when)}</b><span>{r.eval.name} · {run.title}</span><small>{MODE_LABEL[i.mode]}{i.where ? ` · ${i.where}` : ''}</small></li>
                ))}
              </ul>
            ) : <p className="none">No interviews scheduled in this month.</p>}
          </section>
          <section className="panel">
            <h2 className="report-h">Shortlisted ({m.shortlisted.length})</h2>
            {m.shortlisted.length ? (
              <ul className="report-list">
                {m.shortlisted.map(({ run, r }) => (
                  <li key={`${run.id}-${r.id}`}><b>{r.eval.name}</b><span>{run.title} · match {r.score}</span><small>{[r.contacts?.email, r.contacts?.phone].filter(Boolean).join(' · ')}</small></li>
                ))}
              </ul>
            ) : <p className="none">Nobody shortlisted in this month yet.</p>}
          </section>
        </div>
      </div>
    </>
  )
}
