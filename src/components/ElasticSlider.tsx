import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { animate, motion, useMotionValue, useMotionValueEvent, useTransform } from 'motion/react'
import { Minus, Plus } from 'lucide-react'

// Adapted from the ElasticSlider showcase: controlled, keyboard-accessible (role="slider"),
// Tailwind swapped for index.css tokens, framer-motion for motion/react.

const MAX_OVERFLOW = 40

interface Props {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  leftIcon?: ReactNode
  rightIcon?: ReactNode
  label: string
  className?: string
}

/** Sigmoid squash so dragging past the end stretches less the further you pull. */
function decay(value: number, max: number) {
  const s = 2 * (1 / (1 + Math.exp(-value / max)) - 0.5)
  return s * max
}

export function ElasticSlider({
  value, onChange, min = 0, max = 100, step = 1,
  leftIcon = <Minus size={14} />, rightIcon = <Plus size={14} />, label, className = '',
}: Props) {
  const track = useRef<HTMLDivElement>(null)
  const [region, setRegion] = useState<'left' | 'middle' | 'right'>('middle')
  const clientX = useMotionValue(0)
  const overflow = useMotionValue(0)
  const scale = useMotionValue(1)

  useMotionValueEvent(clientX, 'change', (x) => {
    const r = track.current?.getBoundingClientRect()
    if (!r) return
    const next = x < r.left ? 'left' : x > r.right ? 'right' : 'middle'
    setRegion(next)
    overflow.jump(decay(next === 'left' ? r.left - x : next === 'right' ? x - r.right : 0, MAX_OVERFLOW))
  })

  const set = (v: number) => {
    const snapped = Math.min(max, Math.max(min, Math.round((v - min) / step) * step + min))
    if (snapped !== value) onChange(snapped)
  }

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const r = track.current?.getBoundingClientRect()
    if (!e.buttons || !r) return
    set(min + ((e.clientX - r.left) / r.width) * (max - min))
    clientX.jump(e.clientX)
  }

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    onMove(e)
    animate(scale, 1.1, { duration: 0.2, ease: 'easeOut' })
  }

  const onUp = () => {
    animate(overflow, 0, { type: 'spring', bounce: 0.5, stiffness: 200, damping: 20 })
    animate(scale, 1, { duration: 0.3, ease: 'easeOut' })
  }

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const big = (max - min) / 10
    const moves: Record<string, number> = {
      ArrowLeft: value - step, ArrowDown: value - step, ArrowRight: value + step, ArrowUp: value + step,
      PageDown: value - big, PageUp: value + big, Home: min, End: max,
    }
    if (!(e.key in moves)) return
    e.preventDefault()
    set(moves[e.key])
  }

  const leftX = useTransform(() => (region === 'left' ? -overflow.get() / scale.get() : 0))
  const rightX = useTransform(() => (region === 'right' ? overflow.get() / scale.get() : 0))
  const scaleX = useTransform(() => 1 + overflow.get() / (track.current?.offsetWidth || 1))
  const scaleY = useTransform(overflow, [0, MAX_OVERFLOW], [1, 0.85])
  const origin = useTransform(() => {
    const r = track.current?.getBoundingClientRect()
    return r && clientX.get() < r.left + r.width / 2 ? 'right' : 'left'
  })
  const pct = max === min ? 0 : ((value - min) / (max - min)) * 100
  const pulse = { duration: 0.3, ease: 'easeOut' } as const

  return (
    <motion.div className={`eslider ${className}`} style={{ scale }}>
      <motion.span className="eslider-icon" aria-hidden="true" style={{ x: leftX }}
        animate={{ scale: region === 'left' ? [1, 1.3, 1] : 1 }} transition={pulse}>
        {leftIcon}
      </motion.span>

      <div
        ref={track}
        className="eslider-hit"
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={onKey}
      >
        <motion.div className="eslider-track" style={{ scaleX, scaleY, transformOrigin: origin }}>
          <div className="eslider-fill" style={{ width: `${pct}%` }} />
        </motion.div>
      </div>

      <motion.span className="eslider-icon" aria-hidden="true" style={{ x: rightX }}
        animate={{ scale: region === 'right' ? [1, 1.3, 1] : 1 }} transition={pulse}>
        {rightIcon}
      </motion.span>
    </motion.div>
  )
}
