export type Importance = 'essential' | 'preferred'
export type Level = 'met' | 'partial' | 'missing'

export interface Requirement {
  skill: string
  importance: Importance
}

export interface Assessment {
  skill: string
  level: Level
  evidence: string
}

export interface Evaluation {
  name: string
  headline: string
  yearsExperience: number | null
  summary: string
  strengths: string[]
  concerns: string[]
  assessments: Assessment[]
  interviewQuestions: string[]
}

export interface AtsReport {
  score: number
  checks: { label: string; ok: boolean }[]
}

export type Decision = 'none' | 'shortlist' | 'hold' | 'reject'

export interface Result {
  id: string
  fileName: string
  score: number
  ats: AtsReport
  eval: Evaluation
  matched: string[]
  missingEssential: string[]
  missingPreferred: string[]
  engine: 'ai' | 'offline'
  contacts?: Contacts // missing on screenings saved before contacts were extracted
  profile?: Profile // for HR's candidate tracker; missing on older saved screenings
}

/** Facts HR records in the candidate tracker. Taken from the resume when written there; never used in scoring. */
export interface Profile {
  education: string
  dob: string
  age: string
  native: string
  currentCompany: string
  currentLocation: string
  noticePeriod: string
  presentCtc: string
  expectedCtc: string
}

export interface Contacts {
  email: string
  phone: string
  linkedin: string
  github: string
  portfolio: string
}

export interface ResumeFile {
  id: string
  file: File
  status: 'reading' | 'ready' | 'error'
  progress: number
  note: string
  text: string
  ocr: boolean
}
