import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2, Lock, Mail, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react'
import { DEFAULT_TEMPLATES, loadTemplates, saveTemplates, TEMPLATE_LABEL, type Template, type TemplateId } from '../lib/hr'
import { friendlyError, PROVIDERS, testKey, type Provider } from '../lib/ai'
import type { SettingsState } from '../App'

const ORDER: Provider[] = ['claude', 'openai', 'gemini']

export default function Settings({ settings, onSave }: { settings: SettingsState; onSave: (s: SettingsState) => void }) {
  const [draft, setDraft] = useState(settings)
  const [show, setShow] = useState(false)
  const [status, setStatus] = useState<{ kind: 'idle' | 'testing' | 'ok' | 'bad' | 'saved'; msg?: string }>({ kind: 'idle' })
  const [cleared, setCleared] = useState(false)

  const p = draft.provider
  const info = PROVIDERS[p]
  const key = draft.keys[p]
  const model = draft.models[p]
  const custom = !info.models.some((m) => m.id === model)
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings)
  const keyLooksWrong = key !== '' && !key.trim().startsWith(info.keyPrefix)

  const update = (next: Partial<SettingsState>) => { setDraft((d) => ({ ...d, ...next })); setStatus({ kind: 'idle' }) }
  const setKey = (v: string) => update({ keys: { ...draft.keys, [p]: v } })
  const setModel = (v: string) => update({ models: { ...draft.models, [p]: v } })

  const test = async () => {
    setStatus({ kind: 'testing' })
    try {
      await testKey({ provider: p, apiKey: key.trim(), model: model.trim() })
      setStatus({ kind: 'ok', msg: `Connected. The key works with ${model}.` })
    } catch (e) {
      setStatus({ kind: 'bad', msg: friendlyError(e) })
    }
  }

  const save = () => {
    const clean = {
      ...draft,
      keys: Object.fromEntries(ORDER.map((k) => [k, draft.keys[k].trim()])) as Record<Provider, string>,
      models: Object.fromEntries(ORDER.map((k) => [k, draft.models[k].trim() || PROVIDERS[k].models[0].id])) as Record<Provider, string>,
    }
    setDraft(clean)
    onSave(clean)
    setStatus({ kind: 'saved', msg: `Settings saved. Screening now uses ${info.short}${clean.keys[p] ? '' : ' once you add its key'}.` })
  }

  const removeKey = () => {
    const next = { ...draft, keys: { ...draft.keys, [p]: '' } }
    setDraft(next)
    onSave(next)
    setStatus({ kind: 'saved', msg: `${info.short} key removed.` })
  }

  const clearCache = () => {
    try {
      Object.keys(localStorage).filter((k) => k.startsWith('shortlist.cache.')).forEach((k) => localStorage.removeItem(k))
    } catch { /* ignore */ }
    setCleared(true)
    setTimeout(() => setCleared(false), 2500)
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p>API keys for AI mode, and the email templates used when you contact candidates. Offline mode needs no key.</p>
        </div>
      </div>

      <div className="settings">
        <section className="panel stack-gap">
          <div className="panel-head" style={{ marginBottom: 0 }}>
            <div className="step"><KeyRound size={17} /></div>
            <div><h2>AI provider</h2><p>Screening uses the provider selected here</p></div>
          </div>

          <div className="providers" role="radiogroup" aria-label="AI provider">
            {ORDER.map((id) => (
              <button key={id} role="radio" aria-checked={p === id} className="provider" onClick={() => { update({ provider: id }); setShow(false) }}>
                {p === id && <motion.span layoutId="provider-pill" className="provider-pill" />}
                <span className={`provider-mark ${id}`} aria-hidden>{PROVIDERS[id].short[0]}</span>
                <span className="provider-text">
                  <b>{PROVIDERS[id].short}</b>
                  <small>{draft.keys[id] ? 'Key added' : 'No key'}</small>
                </span>
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={p} className="stack-gap" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
              <label className="field">
                <span>{info.name} API key</span>
                <div className="key-row">
                  <input
                    className="input"
                    type={show ? 'text' : 'password'}
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    placeholder={info.keyHint}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button className="btn btn-ghost icon-btn" style={{ height: 46, width: 46 }} onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide key' : 'Show key'}>
                    {show ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </label>
              <p className="note">Create a key at {info.keyUrl}</p>
              {keyLooksWrong && <p className="status-bad">{info.short} keys usually start with "{info.keyPrefix}". Check you copied the whole key.</p>}
            </motion.div>
          </AnimatePresence>

          <label className="toggle">
            <input type="checkbox" checked={draft.remember} onChange={(e) => update({ remember: e.target.checked })} />
            Remember keys on this device
          </label>
          <p className="note"><Lock size={15} /> Keys are stored only in this browser and sent only to their own provider. {draft.remember ? 'They stay until you remove them.' : 'They are forgotten when you close this tab.'}</p>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="btn btn-primary" onClick={save} disabled={!dirty}>Save settings</button>
            <button className="btn btn-ghost" onClick={test} disabled={!key.trim() || !model.trim() || status.kind === 'testing'}>
              {status.kind === 'testing' ? <><Loader2 size={16} className="spin" /> Testing</> : 'Test connection'}
            </button>
            {settings.keys[p] && (
              <button className="btn btn-quiet" onClick={removeKey}><Trash2 size={16} /> Remove {info.short} key</button>
            )}
          </div>
          <AnimatePresence mode="wait">
            {status.msg && (
              <motion.p key={status.msg} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={status.kind === 'bad' ? 'status-bad' : 'status-ok'}>
                {status.kind !== 'bad' && <CheckCircle2 size={16} />} {status.msg}
              </motion.p>
            )}
          </AnimatePresence>
        </section>

        <section className="panel stack-gap">
          <div className="panel-head" style={{ marginBottom: 0 }}>
            <div className="step"><ShieldCheck size={17} /></div>
            <div><h2>{info.short} model</h2><p>Same inputs, same score</p></div>
          </div>
          <div className="models" role="radiogroup" aria-label={`${info.short} model`}>
            {info.models.map((m) => (
              <label key={m.id} className="model">
                <input type="radio" name={`model-${p}`} checked={model === m.id} onChange={() => setModel(m.id)} />
                <div><b>{m.label}</b><span>{m.note}</span></div>
              </label>
            ))}
            <label className="model">
              <input type="radio" name={`model-${p}`} checked={custom} onChange={() => setModel('')} />
              <div style={{ display: 'grid', gap: 8 }}>
                <div><b>Other model</b><span>Enter any model ID your key can use</span></div>
                {custom && (
                  <input className="input" value={model} onChange={(e) => setModel(e.target.value)} placeholder={`e.g. ${info.models[0].id}`} spellCheck={false} autoFocus aria-label="Model ID" />
                )}
              </div>
            </label>
          </div>
          <p className="note">
            <ShieldCheck size={15} />
            Scores are repeatable. Requests ask for temperature 0; models that only run at their default setting are retried without it. The score is calculated from a fixed weighted rubric and results are cached, so the same resume and JD always get the same score.
          </p>
          <div>
            <button className="btn btn-ghost btn-sm" onClick={clearCache}><Trash2 size={14} /> Clear cached results</button>
            {cleared && <span className="status-ok" style={{ marginLeft: 10 }}><CheckCircle2 size={15} /> Cache cleared</span>}
          </div>
        </section>

        <EmailTemplates />
      </div>
    </>
  )
}

function EmailTemplates() {
  const [saved, setSaved] = useState(loadTemplates)
  const [draft, setDraft] = useState(saved)
  const [tab, setTab] = useState<TemplateId>('shortlist')
  const [msg, setMsg] = useState('')
  const t = draft[tab]
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)
  const set = (p: Partial<Template>) => { setDraft((d) => ({ ...d, [tab]: { ...d[tab], ...p } })); setMsg('') }
  const save = () => { saveTemplates(draft); setSaved(draft); setMsg('Templates saved.') }

  return (
    <section className="panel stack-gap settings-wide">
      <div className="panel-head" style={{ marginBottom: 0 }}>
        <div className="step"><Mail size={17} /></div>
        <div>
          <h2>Email templates</h2>
          <p>Used by the Email buttons on each candidate. <code>{'{name}'}</code> is the first name, <code>{'{role}'}</code> the job title, <code>{'{interview}'}</code> the interview time and place. A line whose placeholder is empty is left out.</p>
        </div>
      </div>
      <div className="segs" role="tablist" aria-label="Template">
        {(Object.keys(TEMPLATE_LABEL) as TemplateId[]).map((id) => (
          <button key={id} role="tab" aria-selected={tab === id} aria-pressed={tab === id} onClick={() => setTab(id)}>
            {tab === id && <motion.span layoutId="tpl-pill" className="pill" />}
            <span>{TEMPLATE_LABEL[id]}</span>
          </button>
        ))}
      </div>
      <label className="field"><span>Subject</span><input className="input" value={t.subject} onChange={(e) => set({ subject: e.target.value })} /></label>
      <label className="field"><span>Message</span><textarea className="input tpl-body" rows={11} value={t.body} onChange={(e) => set({ body: e.target.value })} data-lenis-prevent /></label>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn btn-primary" onClick={save} disabled={!dirty}>Save templates</button>
        <button className="btn btn-quiet" onClick={() => set(DEFAULT_TEMPLATES[tab])}><RotateCcw size={16} /> Restore default</button>
        {msg && <span className="status-ok"><CheckCircle2 size={16} /> {msg}</span>}
      </div>
    </section>
  )
}
