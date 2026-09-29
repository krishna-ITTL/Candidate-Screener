import { useEffect, useRef, useState } from 'react'

// Neon tubes that chase the cursor. Adapted from Kevin Levron's "Tubes" cursor (threejs-components, ISC).
// Kept: the cursor tracking only. Dropped from the reference: the demo overlay and click-to-randomise colours.
// Changed: bundled from npm instead of a runtime CDN import, brand colours, proper dispose() on unmount,
// and a static fallback when WebGL fails or the person prefers reduced motion.

const TUBE_COLORS = ['#5b47e0', '#8b7bff', '#f4e35a']
const LIGHT_COLORS = ['#6f5aff', '#f4e35a', '#b05bff', '#3ccb94']

export default function TubesBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || !canvasRef.current) return
    let app: { dispose(): void } | null = null
    let alive = true
    import('threejs-components/build/cursors/tubes1.min.js')
      .then(({ default: TubesCursor }) => {
        if (!alive || !canvasRef.current) return
        app = TubesCursor(canvasRef.current, {
          tubes: { colors: TUBE_COLORS, lights: { intensity: 200, colors: LIGHT_COLORS } },
        })
        setReady(true)
      })
      .catch(() => { /* no WebGL: the gradient backdrop stays */ })
    return () => {
      alive = false
      app?.dispose()
    }
  }, [])

  return (
    <div className="tubes" aria-hidden>
      <canvas ref={canvasRef} className={ready ? 'ready' : ''} style={{ touchAction: 'none' }} />
    </div>
  )
}
