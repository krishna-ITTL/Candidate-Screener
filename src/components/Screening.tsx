import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { AlertTriangle, ArrowLeft, ArrowRight, Check, CheckCircle2, Circle, Cpu, FileText, ListChecks, Loader2, RotateCcw, ScanSearch, Sparkles, Trophy, UserSearch, Users } from 'lucide-react'
import JdPanel from './JdPanel'
import ResumePanel from './ResumePanel'
import Results from './Results'
import Stepper from './Stepper'
import History from './History'
import { loadHistory, saveHistory, type SavedRun } from '../lib/history'
import { jdTitle as titleOf } from '../lib/jdTemplate'
import { extractText } from '../lib/extract'
import { evaluate, extractRequirements, friendlyError, PROVIDERS, type AiSettings } from '../lib/ai'
import { assemble } from '../lib/scoring'
import { cachedEmbed, clearEmbedCache, lexicalEmbed, offlineEvaluate, offlineRequirements, onModelProgress, preEmbed, type Embed } from '../lib/offline'
import type { Decision, Requirement, Result, ResumeFile } from '../lib/types'
import type { Interview, Pipeline } from '../lib/hr'

const STAGES = [
  { title: 'Reading files', text: 'Text from every document', icon: ScanSearch },
  { title: 'Building rubric', text: 'Requirements from the JD', icon: ListChecks },
  { title: 'Assessing candidates', text: 'Each resume against the rubric', icon: UserSearch },
  { title: 'Ranking', text: 'Scores, ATS and order', icon: Trophy },
]

const uid = () => crypto.randomUUID()
// Lenis caches the page height; resize first so targets in freshly rendered content are not clamped.
const scrollTo = (t: Element | number, o?: object) => {
  const l = (window as unknown as { lenis?: { resize: () => void; scrollTo: (t: Element | number, o?: object) => void } }).lenis
  if (!l) return typeof t === 'number' ? window.scrollTo({ top: t }) : t.scrollIntoView()
  l.resize()
  l.scrollTo(t, o)
}

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  const queue = [...items]
  await Promise.all(Array.from({ length: Math.min(size, queue.length) }, async () => {
    while (queue.length) await fn(queue.shift()!)
  }))
}

export type Mode = 'ai' | 'offline'

function loadMode(): Mode {
  try { return localStorage.getItem('shortlist.mode') === 'ai' ? 'ai' : 'offline' } catch { return 'offline' }
}

export default function Screening({ settings, onOpenSettings }: { settings: AiSettings; onOpenSettings: () => void }) {
  const [mode, setModeState] = useState<Mode>(loadMode)
  const [step, setStep] = useState(1)
  const [note, setNote] = useState('')
  const [jd, setJd] = useState('')
  const [files, setFiles] = useState<ResumeFile[]>([])
  const [stage, setStage] = useState(-1)
  const [done, setDone] = useState(0)
  const [total, setTotal] = useState(0)
  const [errors, setErrors] = useState<string[]>([])
  const [results, setResults] = useState<Result[]>([])
  const [reqs, setReqs] = useState<Requirement[]>([])
  const [toast, setToast] = useState('')
  const [jdKey, setJdKey] = useState(0)
  const [decisions, setDecisions] = useState<Record<string, Decision>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [interviews, setInterviews] = useState<Record<string, Interview>>({})
  const [pipeline, setPipeline] = useState<Record<string, Pipeline>>({})
  const [run, setRun] = useState<{ id: string; date: number; title: string; jd: string; received: number } | null>(null)
  const [history, setHistory] = useState(loadHistory)
  const progressRef = useRef<HTMLDivElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)

  const busy = stage >= 0 && stage < 4
  const readyFiles = files.filter((f) => f.status === 'ready')
  const jdReady = jd.trim().length >= 40
  const provider = PROVIDERS[settings.provider]
  const aiReady = mode === 'ai' && !!settings.apiKey
  const needsKey = mode === 'ai' && !settings.apiKey
  const canAnalyse = jdReady && readyFiles.length > 0 && !busy && !needsKey
  const failedFiles = files.filter((f) => f.status === 'error').length
  const readingFiles = files.filter((f) => f.status === 'reading').length
  // A step is reachable once everything before it is done.
  const canReach = (n: number) => n === 1 || (jdReady && (n === 2 || readyFiles.length > 0))
  const jdTitle = titleOf(jd)
  const setMode = (m: Mode) => {
    setModeState(m)
    try { localStorage.setItem('shortlist.mode', m) } catch { /* ignore */ }
  }
  const modelLabel = provider.models.find((m) => m.id === settings.model)?.label ?? `${provider.short} ${settings.model}`

  // The finished run, with decisions and notes as they change, sits at the top of Recent screenings.
  const runs = run && results.length ? [{ ...run, reqs, results, decisions, notes, interviews, pipeline }, ...history.filter((x) => x.id !== run.id)] : history
  useEffect(() => { if (run && results.length) saveHistory(runs) }, [run, results, reqs, decisions, notes, interviews, pipeline]) // eslint-disable-line react-hooks/exhaustive-deps

  const openRun = (r: SavedRun) => {
    if (busy) return
    setHistory(runs)
    setJd(r.jd); setJdKey((k) => k + 1); setFiles([]); setStep(1)
    setReqs(r.reqs); setResults(r.results); setDecisions(r.decisions); setNotes(r.notes); setInterviews(r.interviews ?? {}); setPipeline(r.pipeline ?? {})
    setRun({ id: r.id, date: r.date, title: r.title, jd: r.jd, received: r.received ?? r.results.length })
    setErrors([]); setNote(`Reopened from ${new Date(r.date).toLocaleDateString()}`); setStage(4)
    setTimeout(() => resultsRef.current && scrollTo(resultsRef.current, { offset: -80 }), 100)
  }
  const deleteRun = (id: string | null) => {
    const next = id ? runs.filter((x) => x.id !== id) : []
    setHistory(next)
    saveHistory(next)
    if (!id || id === run?.id) setRun(null)
  }

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3200) }
  const patch = (id: string, p: Partial<ResumeFile>) => setFiles((fs) => fs.map((f) => (f.id === id ? { ...f, ...p } : f)))

  const addFiles = (list: File[]) => {
    const fresh = list
      .filter((f) => !files.some((x) => x.file.name === f.name && x.file.size === f.size))
      .map((file): ResumeFile => ({ id: uid(), file, status: 'reading', progress: 0, note: 'Queued', text: '', ocr: false }))
    if (fresh.length < list.length) showToast('Skipped files that were already added.')
    setFiles((fs) => [...fs, ...fresh])
    fresh.forEach(async (r) => {
      try {
        const { text, ocr } = await extractText(r.file, (progress, note) => patch(r.id, { progress, note }))
        patch(r.id, { status: 'ready', text, ocr, progress: 1 })
        if (mode === 'offline') preEmbed(text)
      } catch (e) {
        patch(r.id, { status: 'error', note: friendlyError(e) })
      }
    })
  }

  const analyse = async () => {
    const batch = readyFiles
    setErrors([])
    setResults([])
    setHistory(runs)
    setDecisions({})
    setNotes({})
    setInterviews({}); setPipeline({})
    setRun(null)
    setDone(0)
    setTotal(batch.length)
    setStage(0)
    requestAnimationFrame(() => progressRef.current && scrollTo(progressRef.current, { offset: -100 }))

    const useAi = aiReady
    setNote('')
    try {
      setStage(1)
      const rubric = useAi ? await extractRequirements(settings, jd) : offlineRequirements(jd)
      if (!rubric.length) throw new Error('No skills or requirements were found in the job description. Add more detail and try again.')
      setReqs(rubric)

      // Offline: load the on-device model once; without it (no internet on first use) fall back to word-overlap matching.
      let embed: Embed = lexicalEmbed
      if (!useAi) {
        onModelProgress((p, msg) => setNote(`${msg} ${Math.round(p * 100)}%`))
        try {
          await cachedEmbed(['warm up'])
          embed = cachedEmbed
        } catch {
          setNote('Offline model unavailable, using word matching')
        }
        onModelProgress(() => {})
      }

      setStage(2)
      const out: Result[] = []
      const failed: string[] = []
      await pool(batch, useAi ? 3 : 1, async (f) => {
        try {
          const ev = useAi ? await evaluate(settings, jd, rubric, f.text) : await offlineEvaluate(rubric as Parameters<typeof offlineEvaluate>[0], f.text, f.file.name, embed)
          out.push(assemble(f.id, f.file.name, rubric, ev, f.text, f.ocr, useAi ? 'ai' : 'offline'))
        } catch (e) {
          failed.push(`${f.file.name}: ${friendlyError(e)}`)
        }
        setDone((d) => d + 1)
      })

      setStage(3)
      // Stable, deterministic order: score, then ATS, then file name.
      out.sort((a, b) => b.score - a.score || b.ats.score - a.ats.score || a.fileName.localeCompare(b.fileName))
      setResults(out)
      setErrors(failed)
      setStage(4)
      if (out.length) setRun({ id: uid(), date: Date.now(), title: jdTitle, jd, received: files.length })
      if (out.length) setTimeout(() => resultsRef.current && scrollTo(resultsRef.current, { offset: -80, duration: 1.4 }), 250)
    } catch (e) {
      setErrors([friendlyError(e)])
      setStage(-2)
    }
  }

  const reset = () => {
    if (results.length && !confirm('Clear the job description, all resumes and the current ranking?')) return
    setJd(''); setFiles([]); setResults([]); setReqs([]); setHistory(runs); setDecisions({}); setNotes({}); setInterviews({}); setPipeline({}); setRun(null); setErrors([]); setStage(-1); setDone(0); setTotal(0)
    setJdKey((k) => k + 1)
    clearEmbedCache()
    setStep(1)
    scrollTo(0)
    showToast('Cleared. Ready for a new screening.')
  }

  const pct = stage < 0 ? 0 : stage === 2 ? 0.25 + 0.6 * (total ? done / total : 0) : [0.08, 0.18, 0.25, 0.92, 1][stage]

  return (
    <>
      <div className="page-head">
        <div>
          <h1>New screening</h1>
          <p>Add a job description and the resumes you received. Every candidate is scored against the same rubric, then ranked.</p>
        </div>
        <div className="mode">
          <div className="mode-switch" role="radiogroup" aria-label="Analysis mode">
            {(['ai', 'offline'] as const).map((m) => (
              <button key={m} role="radio" aria-checked={mode === m} onClick={() => setMode(m)} disabled={busy}>
                {mode === m && <motion.span layoutId="mode-pill" className={`mode-pill ${m}`} />}
                <span className="mode-label">
                  {m === 'ai' ? <Sparkles size={16} /> : <Cpu size={16} />}
                  <b>{m === 'ai' ? 'AI' : 'Offline'}</b>
                </span>
              </button>
            ))}
          </div>
          <p className="mode-caption">
            {needsKey
              ? <>AI mode needs a {provider.short} API key. <button onClick={onOpenSettings}>Add it in Settings</button> or switch to Offline.</>
              : mode === 'ai'
                ? <>Deep, evidence-based review by {modelLabel}. <button onClick={onOpenSettings}>Change</button></>
                : <>Private and free. Nothing leaves this computer.</>}
          </p>
        </div>
      </div>

      <div className="workspace">
      <Stepper
        labels={['Job description', 'Resumes', 'Review & analyse']}
        step={step}
        canReach={canReach}
        onStep={setStep}
        footer={
          <>
            {step > 1
              ? <button className="btn btn-quiet" onClick={() => setStep(step - 1)} disabled={busy}><ArrowLeft size={16} /> Back</button>
              : <button className="btn btn-quiet" onClick={reset} disabled={busy || (!jd && !files.length)}><RotateCcw size={16} /> Reset</button>}
            <span className="stepper-hint">
              {step === 1 && !jdReady && 'Add a job description to continue'}
              {step === 2 && !readyFiles.length && (readingFiles ? 'Reading your files…' : 'Add at least one resume to continue')}
              {step === 3 && needsKey && 'Add an API key in Settings or switch to Offline'}
            </span>
            {step < 3 ? (
              <motion.button className="btn btn-primary btn-lg" onClick={() => setStep(step + 1)} disabled={!canReach(step + 1)} whileTap={{ scale: 0.97 }}>
                Continue <ArrowRight size={17} />
              </motion.button>
            ) : (
              <motion.button className="btn btn-primary btn-lg" onClick={analyse} disabled={!canAnalyse} whileTap={{ scale: 0.97 }}>
                {busy ? <><Loader2 size={18} className="spin" /> Analysing</> : <><Sparkles size={18} /> Analyse {readyFiles.length} resume{readyFiles.length === 1 ? '' : 's'}</>}
              </motion.button>
            )}
          </>
        }
      >
        {[
          <JdPanel key={jdKey} jd={jd} onJd={setJd} ai={aiReady ? settings : null} onToast={showToast} />,
          <ResumePanel key="resumes" files={files} onAdd={addFiles} onRemove={(id) => setFiles((fs) => fs.filter((f) => f.id !== id))} />,
          <div key="review" className="review">
            <h2>Ready to screen</h2>
            <p className="muted">Check the details, then run the analysis. You can go back and change anything.</p>
            <div className="review-rows">
              <button className="review-row" onClick={() => setStep(1)} disabled={busy}>
                <span className="review-ico"><FileText size={18} /></span>
                <span><b>Job description</b><small>{jdTitle || 'Not added'} ({jd.split(/\s+/).filter(Boolean).length} words)</small></span>
                <span className="review-edit">Edit</span>
              </button>
              <button className="review-row" onClick={() => setStep(2)} disabled={busy}>
                <span className="review-ico"><Users size={18} /></span>
                <span>
                  <b>{readyFiles.length} resume{readyFiles.length === 1 ? '' : 's'} ready</b>
                  <small>{readyFiles.slice(0, 4).map((f) => f.file.name).join(', ')}{readyFiles.length > 4 ? ` and ${readyFiles.length - 4} more` : ''}{failedFiles ? `. ${failedFiles} could not be read and will be skipped.` : ''}</small>
                </span>
                <span className="review-edit">Edit</span>
              </button>
              <div className="review-row static">
                <span className="review-ico">{mode === 'ai' ? <Sparkles size={18} /> : <Cpu size={18} />}</span>
                <span><b>{mode === 'ai' ? 'AI mode' : 'Offline mode'}</b><small>{mode === 'ai' ? (needsKey ? `No ${provider.short} API key yet` : modelLabel) : 'Runs on this computer, nothing is uploaded'}</small></span>
              </div>
            </div>
          </div>,
        ]}
      </Stepper>
      <History runs={runs} current={run?.id ?? ''} onOpen={openRun} onDelete={deleteRun} />
      </div>

      <AnimatePresence>
        {stage !== -1 && (
          <motion.section ref={progressRef} className="panel progress-panel" aria-live="polite" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
            <div className="panel-head" style={{ marginBottom: 0 }}>
              <div className={`step${stage === 4 ? ' done' : ''}`}>{busy ? <Loader2 size={18} className="spin" /> : stage === 4 ? <Check size={18} /> : <AlertTriangle size={18} />}</div>
              <div>
                <h2>{busy ? 'Analysing candidates' : stage === 4 ? 'Analysis complete' : 'Analysis stopped'}</h2>
                <p>{busy ? (stage === 2 ? `${done} of ${total} resumes assessed` : note || STAGES[stage].title) : stage === 4 ? `${results.length} candidate${results.length === 1 ? '' : 's'} ranked below${note ? `. ${note}.` : ''}` : 'Fix the issue below and run it again.'}</p>
              </div>
              <span className="count">{Math.round(pct * 100)}%</span>
            </div>
            <div className="progress-track"><motion.div className="progress-fill" animate={{ width: `${pct * 100}%` }} transition={{ duration: 0.6, ease: 'easeOut' }} /></div>
            <div className="stages">
              {STAGES.map((s, i) => {
                const state = stage > i || stage === 4 ? 'done' : stage === i ? 'active' : ''
                const Icon = state === 'done' ? Check : state === 'active' ? Loader2 : Circle
                return (
                  <div key={s.title} className={`stage ${state}`}>
                    <span className="stage-ico"><Icon size={15} className={state === 'active' ? 'spin' : ''} /></span>
                    <b>{s.title}</b>
                    <span>{i === 2 && state === 'active' ? `${done} of ${total} done` : s.text}</span>
                  </div>
                )
              })}
            </div>
            {stage === -2 && errors.map((e) => <div key={e} className="error-box"><AlertTriangle size={18} /> {e}</div>)}
          </motion.section>
        )}
      </AnimatePresence>

      {stage === 4 && (
        <div ref={resultsRef} className="results">
          {errors.map((e) => <div key={e} className="error-box" style={{ marginBottom: 12 }}><AlertTriangle size={18} /> Skipped {e}</div>)}
          <Results
            results={results} reqs={reqs} files={files} title={run?.title ?? jdTitle} onToast={showToast}
            date={run?.date ?? 0} received={run?.received ?? results.length}
            decisions={decisions} onDecide={(id, v) => setDecisions((s) => ({ ...s, [id]: v }))}
            notes={notes} onNote={(id, v) => setNotes((s) => ({ ...s, [id]: v }))}
            interviews={interviews} onInterview={(id, i) => setInterviews((s) => ({ ...s, [id]: i }))}
            pipeline={pipeline} onPipeline={(id, p) => setPipeline((s) => ({ ...s, [id]: p }))}
            history={runs} runId={run?.id ?? ''} jd={run?.jd ?? jd}
          />
        </div>
      )}

      <AnimatePresence>
        {toast && (
          <motion.div className="toast" role="status" initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}>
            <CheckCircle2 size={17} /> {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
