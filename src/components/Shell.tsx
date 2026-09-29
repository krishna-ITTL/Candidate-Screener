import { useEffect, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CalendarRange, LogOut, Moon, ScanSearch, Settings as Cog, Sun } from 'lucide-react'
import type { Page, Theme } from '../App'

export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden>
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M2.5 4h13M2.5 9h9M2.5 14h5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
        <circle cx="14" cy="14" r="2.6" fill="#F4E35A" />
      </svg>
    </span>
  )
}

export const CompanyLogo = () => <img className="company-logo" src={`${import.meta.env.BASE_URL}indotech-logo.png`} alt="Indo Tech" width={168} height={28} />

interface Props {
  user: string
  page: Page
  onPage: (p: Page) => void
  theme: Theme
  onTheme: () => void
  onSignOut: () => void
  children: ReactNode
}

const NAV: { id: Page; label: string; icon: typeof Cog }[] = [
  { id: 'screening', label: 'Screening', icon: ScanSearch },
  { id: 'reports', label: 'Reports', icon: CalendarRange },
  { id: 'settings', label: 'Settings', icon: Cog },
]

export default function Shell({ user, page, onPage, theme, onTheme, onSignOut, children }: Props) {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])

  const go = (p: Page) => {
    onPage(p)
    ;(window as unknown as { lenis?: { scrollTo: (y: number, o?: object) => void } }).lenis?.scrollTo(0, { immediate: true })
  }

  return (
    <>
      <header className={`header${scrolled ? ' scrolled' : ''}`}>
        <div className="header-inner">
          <div className="brand"><CompanyLogo /><span className="brand-sep" aria-hidden /><BrandMark /> <span className="brand-word">Shortlist</span></div>
          <nav className="nav" aria-label="Main">
            {NAV.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => go(id)} aria-current={page === id ? 'page' : undefined}>
                {page === id && <motion.span layoutId="nav-pill" className="nav-pill" />}
                <Icon size={16} /> <span>{label}</span>
              </button>
            ))}
          </nav>
          <div className="header-right">
            <button className="btn btn-ghost icon-btn" onClick={onTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} title="Toggle light and dark mode">
              <AnimatePresence mode="wait" initial={false}>
                <motion.span key={theme} initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.2 }} style={{ display: 'grid' }}>
                  {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                </motion.span>
              </AnimatePresence>
            </button>
            <div className="user">
              <div className="avatar">HR</div>
              <div className="user-meta">
                <div className="user-name">{user}</div>
                <div className="user-role">Hiring team</div>
              </div>
              <button className="btn btn-quiet icon-btn" onClick={onSignOut} aria-label="Sign out" title="Sign out"><LogOut size={18} /></button>
            </div>
          </div>
        </div>
      </header>
      <main className="page">{children}</main>
    </>
  )
}
