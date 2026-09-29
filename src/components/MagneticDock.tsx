import { useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring, useTransform, type MotionValue } from 'motion/react'

// Adapted from @componentry/magnetic-dock: Tailwind swapped for index.css tokens, framer-motion for motion/react.

export interface DockItemData {
  id: string
  label: string
  /** Any node, e.g. a lucide icon. */
  icon: ReactNode
  onClick?: () => void
  isActive?: boolean
  badge?: number
}

interface Props {
  items: DockItemData[]
  iconSize?: number
  maxScale?: number
  /** Pointer distance (px) at which items stop growing. */
  magneticDistance?: number
  showLabels?: boolean
  position?: 'bottom' | 'top' | 'left' | 'right'
  variant?: 'glass' | 'solid' | 'transparent'
  className?: string
}

const SPRING = { damping: 20, stiffness: 300, mass: 0.5 }

interface ItemProps {
  item: DockItemData
  pointer: MotionValue<number>
  iconSize: number
  maxScale: number
  magneticDistance: number
  showLabels: boolean
  vertical: boolean
  reduced: boolean
}

function DockItem({ item, pointer, iconSize, maxScale, magneticDistance, showLabels, vertical, reduced }: ItemProps) {
  const ref = useRef<HTMLButtonElement>(null)
  const [hover, setHover] = useState(false)
  const [focus, setFocus] = useState(false)

  const distance = useTransform(pointer, (p: number) => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return magneticDistance + 1
    return p - (vertical ? r.top + r.height / 2 : r.left + r.width / 2)
  })
  const scale = useSpring(useTransform(distance, [-magneticDistance, 0, magneticDistance], [1, maxScale, 1]), SPRING)
  const size = useTransform(scale, (s) => s * iconSize)
  const lift = useSpring(useTransform(scale, (s) => (s - 1) * -10), SPRING)

  const pop = reduced ? false : { scale: 0, opacity: 0 }
  const popExit = reduced ? { opacity: 0 } : { scale: 0, opacity: 0 }

  return (
    <motion.button
      ref={ref}
      type="button"
      className={`dock-item${item.isActive ? ' is-active' : ''}`}
      aria-label={item.label}
      aria-current={item.isActive ? 'page' : undefined}
      onClick={item.onClick}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: reduced ? iconSize : size,
        height: reduced ? iconSize : size,
        y: reduced || vertical ? 0 : lift,
        x: reduced || !vertical ? 0 : lift,
      }}
      whileTap={reduced ? undefined : { scale: 0.9 }}
    >
      <span className="dock-icon" aria-hidden="true">{item.icon}</span>

      <AnimatePresence initial={false}>
        {!!item.badge && item.badge > 0 && (
          <motion.span key="badge" className="dock-badge" initial={pop} animate={{ scale: 1, opacity: 1 }} exit={popExit}>
            {item.badge > 99 ? '99+' : item.badge}
          </motion.span>
        )}
        {item.isActive && (
          <motion.span key="dot" className="dock-dot" initial={pop} animate={{ scale: 1, opacity: 1 }} exit={popExit} />
        )}
        {showLabels && (hover || focus) && (
          <motion.span
            key="label"
            className="dock-label"
            aria-hidden="true"
            initial={reduced ? false : { opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
          >
            {item.label}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  )
}

export function MagneticDock({
  items,
  iconSize = 56,
  maxScale = 1.5,
  magneticDistance = 150,
  showLabels = true,
  position = 'bottom',
  variant = 'glass',
  className = '',
}: Props) {
  const pointer = useMotionValue(Infinity)
  const reduced = useReducedMotion() ?? false
  const vertical = position === 'left' || position === 'right'

  return (
    <div
      className={`dock dock--${variant} dock--${position} ${className}`}
      onMouseMove={reduced ? undefined : (e) => pointer.set(vertical ? e.clientY : e.clientX)}
      onMouseLeave={() => pointer.set(Infinity)}
    >
      {items.map((item) => (
        <DockItem
          key={item.id}
          item={item}
          pointer={pointer}
          iconSize={iconSize}
          maxScale={maxScale}
          magneticDistance={magneticDistance}
          showLabels={showLabels}
          vertical={vertical}
          reduced={reduced}
        />
      ))}
    </div>
  )
}
