declare module 'threejs-components/build/cursors/tubes1.min.js' {
  interface TubesOptions {
    tubes?: { colors?: string[]; lights?: { intensity?: number; colors?: string[] } }
  }
  export default function TubesCursor(canvas: HTMLCanvasElement, options?: TubesOptions): {
    tubes: { setColors(c: string[]): void; setLightsColors(c: string[]): void }
    dispose(): void
  }
}
