import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CheckCircle2, ChevronDown, Files, Loader2, ScanText, X } from 'lucide-react'
import { ACCEPT } from '../lib/extract'
import type { ResumeFile } from '../lib/types'

export function FileIcon({ name }: { name: string }) {
  const ext = name.split('.').pop()?.slice(0, 4).toUpperCase() ?? 'FILE'
  return <span className="file-ico">{ext}</span>
}

const size = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`)

interface Props {
  files: ResumeFile[]
  onAdd: (files: File[]) => void
  onRemove: (id: string) => void
}

export default function ResumePanel({ files, onAdd, onRemove }: Props) {
  const [over, setOver] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const ready = files.filter((f) => f.status === 'ready').length

  return (
    <section className="panel" aria-labelledby="cv-title">
      <div className="panel-head">
        <div className={`step${ready ? ' done' : ''}`}>{ready ? <CheckCircle2 size={18} /> : 2}</div>
        <div>
          <h2 id="cv-title">Candidate resumes</h2>
          <p>Add as many as you like</p>
        </div>
        {files.length > 0 && <span className="count">{ready} of {files.length} ready</span>}
      </div>

      <label
        className={`drop${over ? ' over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); onAdd([...e.dataTransfer.files]) }}
      >
        <input type="file" multiple accept={ACCEPT} onChange={(e) => { onAdd([...(e.target.files ?? [])]); e.target.value = '' }} aria-label="Upload resumes" />
        <span className="drop-icon"><Files size={22} /></span>
        <strong>Drop resumes here or browse</strong>
        <small>PDF, Word (.docx), text, photos and scanned documents</small>
      </label>

      <motion.div layout className="files">
        <AnimatePresence initial={false}>
          {files.map((f) => (
            <motion.div
              layout
              key={f.id}
              className="file"
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, transition: { duration: 0.2 } }}
            >
              <FileIcon name={f.file.name} />
              <div style={{ minWidth: 0 }}>
                <div className="file-name" title={f.file.name}>{f.file.name}</div>
                <div className="file-meta">
                  <span>{size(f.file.size)}</span>
                  {f.status === 'reading' && <span><Loader2 size={12} className="spin" /> {f.note}</span>}
                  {f.status === 'ready' && <span className="ok">{f.ocr ? <ScanText size={13} /> : <CheckCircle2 size={13} />} {f.ocr ? 'Read with OCR' : 'Ready'}</span>}
                  {f.status === 'error' && <span className="err">{f.note}</span>}
                </div>
              </div>
              <div className="file-actions">
                {f.status === 'ready' && (
                  <button className="btn btn-quiet icon-btn" onClick={() => setOpen(open === f.id ? null : f.id)} aria-expanded={open === f.id} aria-label={`Preview ${f.file.name}`} title="Preview extracted text">
                    <motion.span animate={{ rotate: open === f.id ? 180 : 0 }} style={{ display: 'grid' }}><ChevronDown size={18} /></motion.span>
                  </button>
                )}
                <button className="btn btn-quiet icon-btn" onClick={() => onRemove(f.id)} aria-label={`Remove ${f.file.name}`} title="Remove"><X size={18} /></button>
              </div>
              {f.status === 'reading' && <motion.div className="file-progress" animate={{ width: `${Math.max(6, f.progress * 100)}%` }} />}
              <AnimatePresence>
                {open === f.id && (
                  <motion.div className="file-preview" data-lenis-prevent initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                    {f.text}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>
    </section>
  )
}
