import { useEffect, useState, type FormEvent } from 'react'
import { motion } from 'motion/react'
import { ArrowRight, Eye, EyeOff, Loader2 } from 'lucide-react'
import { BrandMark, CompanyLogo } from './Shell'
import TubesBackground from './TubesBackground'

const DEMO = { email: 'hr@joblens.demo', password: 'JobLens@2026' }

const PEOPLE = [
  { name: 'Priya Raman', role: 'Senior Frontend Engineer', score: 92, color: '#f4e35a' },
  { name: 'Daniel Okafor', role: 'Full-stack Developer', score: 81, color: '#9ee6c6' },
  { name: 'Mei Tanaka', role: 'React Developer', score: 74, color: '#b8adff' },
  { name: 'Arjun Mehta', role: 'UI Engineer', score: 63, color: '#ffc2a8' },
  { name: 'Sara Lindqvist', role: 'Web Developer', score: 48, color: '#a8d8ff' },
]
const SHUFFLED = [3, 0, 4, 2, 1]
const SORTED = [0, 1, 2, 3, 4]

function RankingStack() {
  const [sorted, setSorted] = useState(false)
  useEffect(() => {
    const id = setInterval(() => setSorted((s) => !s), 2600)
    return () => clearInterval(id)
  }, [])
  return (
    <div className="stack" aria-hidden>
      {(sorted ? SORTED : SHUFFLED).map((i, pos) => {
        const p = PEOPLE[i]
        const top = sorted && pos === 0
        return (
          <motion.div layout key={p.name} className={`stack-card${top ? ' top' : ''}`} transition={{ type: 'spring', stiffness: 260, damping: 28 }}>
            <div className="stack-avatar" style={{ background: p.color }}>{p.name.split(' ').map((w) => w[0]).join('')}</div>
            <div>
              <div className="stack-name">{p.name}</div>
              <div className="stack-role">{p.role}</div>
              <div className="stack-bar">
                <motion.i animate={{ width: sorted ? `${p.score}%` : '12%' }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} />
              </div>
            </div>
            <motion.div className="stack-score" animate={{ opacity: sorted ? 1 : 0.25 }}>{p.score}</motion.div>
          </motion.div>
        )
      })}
    </div>
  )
}

export default function Login({ onSignIn }: { onSignIn: (email: string) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (email.trim().toLowerCase() !== DEMO.email || password !== DEMO.password) {
      setError('That email and password do not match. Use the demo account below.')
      return
    }
    setError('')
    setBusy(true)
    setTimeout(() => onSignIn(DEMO.email), 650)
  }

  const fillDemo = () => { setEmail(DEMO.email); setPassword(DEMO.password); setError('') }

  return (
    <div className="login">
      <TubesBackground />
      <section className="login-art">
        <div className="brand"><CompanyLogo /><span className="brand-sep" aria-hidden /><BrandMark /> Job Lens</div>
        <div>
          <motion.h1 initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}>
            Every resume read. The best ones on top.
          </motion.h1>
          <motion.p className="lede" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}>
            Upload one job description and a stack of resumes. Job Lens scores each candidate against the same rubric,
            checks ATS readiness, and ranks them so you can decide in minutes.
          </motion.p>
        </div>
        <RankingStack />
      </section>

      <section className="login-form-wrap">
        <motion.form className="login-form" onSubmit={submit} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }} noValidate>
          <div>
            <h2>Sign in</h2>
            <p className="muted" style={{ marginTop: 6 }}>Use your hiring team account to open the screening workspace.</p>
          </div>
          <label className="field">
            <span>Work email</span>
            <input className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" required />
          </label>
          <label className="field">
            <span>Password</span>
            <div style={{ position: 'relative' }}>
              <input className="input" type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ paddingRight: 46 }} />
              <button type="button" className="btn btn-quiet icon-btn" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'} style={{ position: 'absolute', right: 2, top: 1 }}>
                {show ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>
          {error && <motion.p className="form-error" role="alert" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: [0, -6, 6, -3, 0] }}>{error}</motion.p>}
          <button className="btn btn-primary btn-lg" disabled={busy}>
            {busy ? <><Loader2 size={18} className="spin" /> Signing in</> : <>Sign in <ArrowRight size={18} /></>}
          </button>
          <div className="demo-hint">
            <div>
              <b>Demo account</b>
              <div className="muted">{DEMO.email} / {DEMO.password}</div>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={fillDemo}>Fill in</button>
          </div>
        </motion.form>
      </section>
    </div>
  )
}
