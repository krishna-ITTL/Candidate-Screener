import { History as HistoryIcon, Trash2, Users } from 'lucide-react'
import type { SavedRun } from '../lib/history'

const fmt = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export default function History({ runs, current, onOpen, onDelete }: { runs: SavedRun[]; current: string; onOpen: (r: SavedRun) => void; onDelete: (id: string | null) => void }) {
  return (
    <aside className="rail panel" aria-labelledby="rail-title">
      <div className="rail-head">
        <HistoryIcon size={17} />
        <h2 id="rail-title">Recent screenings</h2>
        {runs.length > 0 && <button className="more" onClick={() => confirm('Remove all saved screenings from this browser?') && onDelete(null)}>Clear</button>}
      </div>
      {runs.length ? (
        <ul className="rail-list">
          {runs.map((r) => {
            const picked = Object.values(r.decisions).filter((d) => d === 'shortlist').length
            return (
              <li key={r.id} className={r.id === current ? 'on' : ''}>
                <button className="rail-open" onClick={() => onOpen(r)} aria-current={r.id === current || undefined}>
                  <b>{r.title || 'Untitled role'}</b>
                  <small><Users size={12} /> {r.results.length} ranked{picked ? `, ${picked} shortlisted` : ''} · {fmt(r.date)}</small>
                </button>
                <button className="btn btn-quiet icon-btn rail-del" onClick={() => onDelete(r.id)} aria-label={`Delete ${r.title}`} title="Delete"><Trash2 size={15} /></button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="rail-empty">Finished screenings are saved here with your decisions and notes, so you can pick up where you left off. They stay in this browser only.</p>
      )}
    </aside>
  )
}
