import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import { createWorker, type Worker } from 'tesseract.js'
import { isCompoundWord, readWord, wordError } from './word'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export const ACCEPT = '.pdf,.doc,.docx,.txt,.md,.rtf,.png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff'

const MAX_FILE_BYTES = 15 * 1024 * 1024
const MAX_TEXT_CHARS = 100_000
const MAX_PDF_PAGES = 30

type Progress = (pct: number, note: string) => void
export interface Extracted { text: string; ocr: boolean }

let ocrWorker: Promise<Worker> | null = null
let ocrReport: Progress = () => {}
let ocrQueue: Promise<unknown> = Promise.resolve()

function getOcr() {
  ocrWorker ??= createWorker('eng', 1, {
    logger: (m) => m.status === 'recognizing text' && ocrReport(m.progress, 'Reading scanned text'),
  })
  return ocrWorker
}

// One shared Tesseract worker; jobs queue so progress reports go to the right file.
function ocr(image: Blob | HTMLCanvasElement, onProgress: Progress) {
  const job = ocrQueue.then(async () => {
    ocrReport = onProgress
    onProgress(0, 'Loading OCR engine')
    const w = await getOcr()
    const { data } = await w.recognize(image)
    return data.text
  })
  ocrQueue = job.catch(() => {})
  return job
}

async function readPdf(file: File, onProgress: Progress): Promise<Extracted> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const pages: string[] = []
  let usedOcr = false
  let textLength = 0
  const pageCount = Math.min(doc.numPages, MAX_PDF_PAGES)
  for (let i = 1; i <= pageCount; i++) {
    onProgress((i - 1) / pageCount, `Reading page ${i} of ${pageCount}`)
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    let text = content.items.map((it) => ('str' in it ? it.str + (it.hasEOL ? '\n' : ' ') : '')).join('')
    if (text.replace(/\s/g, '').length < 40) {
      // Scanned page: render to canvas and OCR it.
      usedOcr = true
      const viewport = page.getViewport({ scale: 2 })
      const canvas = document.createElement('canvas')
      canvas.width = viewport.width
      canvas.height = viewport.height
      await page.render({ canvas, viewport }).promise
      text = await ocr(canvas, (p) => onProgress((i - 1 + p) / pageCount, `Scanning page ${i} of ${pageCount}`))
    }
    pages.push(text)
    textLength += text.length
    if (textLength >= MAX_TEXT_CHARS) break
  }
  return { text: pages.join('\n\n'), ocr: usedOcr }
}

// Linear scan (no backtracking regex) over untrusted markup: drops tags, comments, <style> and <script> blocks.
function stripHtml(html: string) {
  const lower = html.toLowerCase()
  let text = ''
  for (let i = 0; i < html.length && text.length < MAX_TEXT_CHARS;) {
    const start = lower.indexOf('<', i)
    if (start < 0) { text += html.slice(i); break }
    text += html.slice(i, start)
    const close = lower.startsWith('<!--', start) ? '-->' : lower.startsWith('<style', start) ? '</style>' : lower.startsWith('<script', start) ? '</script>' : '>'
    const end = lower.indexOf(close, start + 1)
    if (end < 0) break
    if (/^<\/?(?:p|br|div|tr|li|h\d)\b/.test(lower.slice(start, start + 6))) text += '\n'
    i = end + close.length
  }
  return text.replace(/&(nbsp|amp|lt|gt|quot|#39);|&#(\d+);|&#x([\da-f]+);/gi, (_match, named, decimal, hex) => {
    if (decimal || hex) {
      const code = Number.parseInt(decimal || hex, hex ? 16 : 10)
      return Number.isSafeInteger(code) && code <= 0x10ffff ? String.fromCodePoint(code) : ''
    }
    return ({ nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" } as Record<string, string>)[named.toLowerCase()] ?? ''
  })
}

// RTF: drop font/colour/style tables and {\* ...} groups, keep paragraphs, decode \'hh as Windows-1252.
function rtfText(rtf: string) {
  const cp1252 = new TextDecoder('windows-1252')
  return rtf.slice(0, MAX_TEXT_CHARS * 4)
    .replace(/\{\\(?:\*|fonttbl|colortbl|stylesheet|info)[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, '')
    .replace(/\\(?:par|line)\b ?/g, '\n')
    .replace(/\\'([0-9a-f]{2})/gi, (_m, h: string) => cp1252.decode(new Uint8Array([parseInt(h, 16)])))
    .replace(/\\[a-z]+-?\d* ?|[{}]/g, '')
}

export async function extractText(file: File, onProgress: Progress = () => {}): Promise<Extracted> {
  if (file.size > MAX_FILE_BYTES) throw new Error('This file is larger than the 15 MB limit.')
  const name = file.name.toLowerCase()
  let out: Extracted
  if (name.endsWith('.pdf')) out = await readPdf(file, onProgress)
  else if (name.endsWith('.docx')) {
    const mammoth = await import('mammoth')
    out = { text: (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value, ocr: false }
  } else if (name.endsWith('.doc')) {
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (isCompoundWord(bytes)) out = { text: await readWord(bytes), ocr: false }
    else {
      const text = new TextDecoder().decode(bytes)
      if (text.startsWith('{\\rtf')) out = { text: rtfText(text), ocr: false }
      else if (text.trimStart().startsWith('<')) out = { text: stripHtml(text), ocr: false }
      else throw wordError()
    }
  } else if (file.type.startsWith('image/') || /\.(png|jpe?g|webp|bmp|tiff?)$/.test(name)) {
    out = { text: await ocr(file, onProgress), ocr: true }
  } else {
    let text = await file.text()
    if (name.endsWith('.rtf')) text = rtfText(text)
    out = { text, ocr: false }
  }
  out.text = out.text.slice(0, MAX_TEXT_CHARS).replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  if (out.text.length < 30) throw new Error('No readable text found in this file.')
  onProgress(1, out.ocr ? 'Read with OCR' : 'Ready')
  return out
}
