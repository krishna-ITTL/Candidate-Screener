import { useEffect, useState } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import Lenis from 'lenis'
import Login from './components/Login'
import Shell from './components/Shell'
import Screening from './components/Screening'
import Settings from './components/Settings'
import Reports from './components/Reports'
import { PROVIDERS, type AiSettings, type Provider } from './lib/ai'

export type Page = 'screening' | 'reports' | 'settings'
export type Theme = 'light' | 'dark'

const read = (k: string) => { try { return localStorage.getItem(k) ?? sessionStorage.getItem(k) } catch { return null } }

export interface SettingsState {
  provider: Provider
  keys: Record<Provider, string>
  models: Record<Provider, string>
  remember: boolean
}

const DEFAULT_MODELS = Object.fromEntries(Object.entries(PROVIDERS).map(([p, v]) => [p, v.models[0].id])) as Record<Provider, string>

function loadSettings(): SettingsState {
  const parse = <T,>(k: string): Partial<T> => { try { return JSON.parse(read(k) ?? '{}') } catch { return {} } }
  const prefs = parse<{ provider: Provider; models: Record<Provider, string> }>('shortlist.prefs')
  const keys = { claude: '', openai: '', gemini: '', ...parse<Record<Provider, string>>('shortlist.keys') }
  // Older builds stored a single Claude key and model.
  const legacyKey = read('shortlist.key')
  if (legacyKey && !keys.claude) keys.claude = legacyKey
  let remember = false
  try { remember = !!localStorage.getItem('shortlist.keys') || !!localStorage.getItem('shortlist.key') } catch { /* private mode */ }
  return {
    provider: prefs.provider && prefs.provider in PROVIDERS ? prefs.provider : 'claude',
    keys,
    models: { ...DEFAULT_MODELS, ...(read('shortlist.model') ? { claude: read('shortlist.model')! } : {}), ...prefs.models },
    remember,
  }
}

export default function App() {
  const [user, setUser] = useState<string | null>(() => read('shortlist.user'))
  const [page, setPage] = useState<Page>('screening')
  const [settings, setSettingsState] = useState(loadSettings)
  const [theme, setTheme] = useState<Theme>(() =>
    (document.documentElement.dataset.theme as Theme) ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  )

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem('shortlist.theme', theme) } catch { /* ignore */ }
  }, [theme])

  // Smooth inertial scrolling; skipped for people who ask for reduced motion.
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const lenis = new Lenis({ lerp: 0.11, wheelMultiplier: 0.95 })
    let raf = requestAnimationFrame(function loop(t) { lenis.raf(t); raf = requestAnimationFrame(loop) })
    ;(window as unknown as { lenis?: Lenis }).lenis = lenis
    return () => { cancelAnimationFrame(raf); lenis.destroy() }
  }, [])

  const saveSettings = (next: SettingsState) => {
    setSettingsState(next)
    try {
      for (const st of [localStorage, sessionStorage]) for (const k of ['shortlist.key', 'shortlist.model', 'shortlist.keys']) st.removeItem(k)
      const hasKey = Object.values(next.keys).some(Boolean)
      if (hasKey) (next.remember ? localStorage : sessionStorage).setItem('shortlist.keys', JSON.stringify(next.keys))
      localStorage.setItem('shortlist.prefs', JSON.stringify({ provider: next.provider, models: next.models }))
    } catch { /* storage blocked: settings live for this tab only */ }
  }

  const active: AiSettings = { provider: settings.provider, apiKey: settings.keys[settings.provider], model: settings.models[settings.provider] }

  const signIn = (email: string) => {
    try { localStorage.setItem('shortlist.user', email) } catch { /* ignore */ }
    setUser(email)
  }
  const signOut = () => {
    try { localStorage.removeItem('shortlist.user') } catch { /* ignore */ }
    setUser(null)
    setPage('screening')
  }

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    const doc = document as Document & { startViewTransition?: (cb: () => void) => void }
    if (doc.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) doc.startViewTransition(() => setTheme(next))
    else setTheme(next)
  }

  return (
    <MotionConfig reducedMotion="user" transition={{ type: 'spring', stiffness: 380, damping: 34 }}>
      <AnimatePresence mode="wait">
        {!user ? (
          <motion.div key="login" exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.3 }}>
            <Login onSignIn={signIn} />
          </motion.div>
        ) : (
          <motion.div key="app" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.45 }}>
            <Shell user={user} page={page} onPage={setPage} theme={theme} onTheme={toggleTheme} onSignOut={signOut}>
              {/* Screening stays mounted so uploaded files and results survive a trip to Settings. */}
              <div hidden={page !== 'screening'}>
                <Screening settings={active} onOpenSettings={() => setPage('settings')} />
              </div>
              <AnimatePresence mode="wait">
                {page === 'reports' && (
                  <motion.div key="reports" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                    <Reports />
                  </motion.div>
                )}
                {page === 'settings' && (
                  <motion.div key="settings" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                    <Settings settings={settings} onSave={saveSettings} />
                  </motion.div>
                )}
              </AnimatePresence>
            </Shell>
          </motion.div>
        )}
      </AnimatePresence>
    </MotionConfig>
  )
}
