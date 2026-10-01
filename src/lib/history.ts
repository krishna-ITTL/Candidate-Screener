import type { Decision, Requirement, Result } from './types'
import type { Interview, Pipeline } from './hr'

export interface SavedRun {
  id: string
  date: number
  title: string
  jd: string
  received?: number // resumes uploaded, including ones that could not be read
  reqs: Requirement[]
  results: Result[]
  decisions: Record<string, Decision>
  notes: Record<string, string>
  interviews?: Record<string, Interview>
  pipeline?: Record<string, Pipeline>
}

const KEY = 'shortlist.history'
const MAX = 12

export function loadHistory(): SavedRun[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') } catch { return [] }
}

export function saveHistory(runs: SavedRun[]) {
  // Resume text is not stored, only results, so runs stay small. Drop the oldest if storage is full.
  for (let list = runs.slice(0, MAX); list.length; list = list.slice(0, -1)) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); return } catch { /* quota: try fewer */ }
  }
  try { localStorage.removeItem(KEY) } catch { /* storage blocked */ }
}
