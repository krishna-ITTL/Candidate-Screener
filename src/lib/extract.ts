import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import { createWorker, type Worker } from 'tesseract.js'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export const ACCEPT = '.pdf,.docx,.txt,.md,.rtf,.png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff'

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
  for (let i = 1; i <= doc.numPages; i++) {
    onProgress((i - 1) / doc.numPages, `Reading page ${i} of ${doc.numPages}`)
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
      text = await ocr(canvas, (p) => onProgress((i - 1 + p) / doc.numPages, `Scanning page ${i} of ${doc.numPages}`))
    }
    pages.push(text)
  }
  return { text: pages.join('\n\n'), ocr: usedOcr }
}

export async function extractText(file: File, onProgress: Progress = () => {}): Promise<Extracted> {
  const name = file.name.toLowerCase()
  let out: Extracted
  if (name.endsWith('.pdf')) out = await readPdf(file, onProgress)
  else if (name.endsWith('.docx')) {
    const mammoth = await import('mammoth')
    out = { text: (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value, ocr: false }
  } else if (name.endsWith('.doc')) {
    throw new Error('Old .doc files cannot be read in the browser. Save it as .docx or PDF and add it again.')
  } else if (file.type.startsWith('image/') || /\.(png|jpe?g|webp|bmp|tiff?)$/.test(name)) {
    out = { text: await ocr(file, onProgress), ocr: true }
  } else {
    let text = await file.text()
    if (name.endsWith('.rtf')) text = text.replace(/\\[a-z]+-?\d* ?|[{}]/g, '')
    out = { text, ocr: false }
  }
  out.text = out.text.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  if (out.text.length < 30) throw new Error('No readable text found in this file.')
  onProgress(1, out.ocr ? 'Read with OCR' : 'Ready')
  return out
}
