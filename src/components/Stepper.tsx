import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { animate, motion } from 'motion/react'
import { Check } from 'lucide-react'

// Adapted from the AnimatedStepper reference: indicator circles with complete/active/inactive states,
// a filling connector, an active glow, slide transitions and a spring-animated height.
// Differences: our CSS tokens instead of Tailwind, a controlled `step`, and every pane stays mounted
// (only the visible one is animated) so form state inside a step survives Back/Continue.

const EASE: [number, number, number, number] = [0.33, 1, 0.68, 1] // Power3-style ease-out, as in the reference

interface Props {
  labels: string[]
  step: number // 1-based
  canReach: (step: number) => boolean
  onStep: (step: number) => void
  footer: ReactNode
  children: ReactNode[]
}

export default function Stepper({ labels, step, canReach, onStep, footer, children }: Props) {
  const [shown, setShown] = useState(step)
  const [height, setHeight] = useState<number | 'auto'>('auto')
  const panes = useRef<(HTMLDivElement | null)[]>([])
  const prev = useRef(step)

  // Slide the old pane out, swap, slide the new one in from the side we are moving towards.
  useEffect(() => {
    if (step === prev.current) return
    const dir = step > prev.current ? 1 : -1
    const from = panes.current[prev.current - 1]
    prev.current = step
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    const swapIn = () => {
      setShown(step)
      const to = panes.current[step - 1]
      if (to && !reduce) animate(to, { x: [dir * 20, 0], opacity: [0, 1] }, { x: { type: 'spring', stiffness: 300, damping: 30 }, opacity: { duration: 0.2 } })
    }
    if (from && !reduce) animate(from, { x: -dir * 20, opacity: 0 }, { duration: 0.15, ease: EASE }).then(swapIn)
    else swapIn()
  }, [step])

  // Track the visible pane's height (it changes as files are added) and spring the container to it.
  useLayoutEffect(() => {
    const el = panes.current[shown - 1]
    if (!el) return
    const ro = new ResizeObserver(() => setHeight(el.offsetHeight))
    ro.observe(el)
    setHeight(el.offsetHeight)
    return () => ro.disconnect()
  }, [shown])

  return (
    <section className="stepper">
      <ol className="stepper-head" aria-label="Screening steps">
        {labels.map((label, i) => {
          const n = i + 1
          const status = n === step ? 'active' : n < step ? 'complete' : 'inactive'
          const reachable = n !== step && canReach(n)
          return (
            <li key={label} className="stepper-item">
              <button
                className={`stepper-dot ${status}`}
                onClick={() => reachable && onStep(n)}
                disabled={!reachable && n !== step}
                aria-current={n === step ? 'step' : undefined}
                aria-label={`Step ${n}: ${label}${status === 'complete' ? ' (done)' : ''}`}
              >
                {status === 'active' && <motion.span layoutId="stepper-glow" className="stepper-glow" />}
                <span className="stepper-num">{status === 'complete' ? <Check size={18} strokeWidth={2.6} /> : n}</span>
              </button>
              <span className={`stepper-label ${status}`}>{label}</span>
              {n < labels.length && (
                <span className="stepper-line" aria-hidden>
                  <motion.i initial={false} animate={{ scaleX: n < step ? 1 : 0 }} transition={{ duration: 0.5, ease: EASE }} />
                </span>
              )}
            </li>
          )
        })}
      </ol>

      <motion.div className="stepper-body" animate={{ height }} transition={{ type: 'spring', damping: 25, stiffness: 200 }}>
        {children.map((child, i) => (
          <div key={i} ref={(el) => { panes.current[i] = el }} className="stepper-pane" hidden={shown !== i + 1}>
            {child}
          </div>
        ))}
      </motion.div>

      <div className="stepper-foot">{footer}</div>
    </section>
  )
}
