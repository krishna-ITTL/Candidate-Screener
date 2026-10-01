// Word 97-2003 (.doc) text: the compound file's WordDocument stream, read through the piece table.
// Every offset is bounds-checked, because the file is untrusted input.
const MAX_TEXT_CHARS = 100_000

export function wordError() { return new Error('Could not read this Word file.') }

function u16(bytes: Uint8Array, offset: number) {
  if (offset < 0 || offset + 2 > bytes.length) throw wordError()
  return bytes[offset] | (bytes[offset + 1] << 8)
}

function u32(bytes: Uint8Array, offset: number) {
  if (offset < 0 || offset + 4 > bytes.length) throw wordError()
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0
}

// Fields are "0x13 code 0x14 shown result 0x15" and can nest; only the shown result is text.
function cleanWordText(text: string) {
  const fields: boolean[] = [] // per open field: still in its code part?
  let out = ''
  for (const char of text) {
    const code = char.charCodeAt(0)
    if (code === 0x13) { fields.push(true); continue }
    if (code === 0x14) { if (fields.length) fields[fields.length - 1] = false; continue }
    if (code === 0x15) { fields.pop(); continue }
    if (fields.includes(true)) continue
    if (code === 0x0d || code === 0x0b || code === 0x0c) out += '\n'
    else if (code === 0x07) out += '\t'
    else if (code === 0x1e) out += '-'
    else if (code === 0x09 || (code >= 0x20 && code !== 0x7f)) out += char
    if (out.length >= MAX_TEXT_CHARS) break
  }
  return out
}

export async function readWord(bytes: Uint8Array): Promise<string> {
  try {
    const mod = await import('cfb')
    const CFB = mod.default ?? mod // CommonJS package: default export in Vite, namespace in some loaders
    const compound = CFB.read(bytes, { type: 'array' })
    // Top-level streams only (not embedded objects); cfb returns Buffers in Node and plain arrays in some browsers.
    const stream = (path: string) => { const c = CFB.find(compound, path)?.content; return c && c.length ? Uint8Array.from(c as ArrayLike<number>) : null }
    const word = stream('/WordDocument')
    if (!word) throw wordError()

    const flags = u16(word, 0x0a)
    if (flags & 0x0100) throw new Error('This Word file is password-protected.')
    const table = stream(flags & 0x0200 ? '/1Table' : '/0Table')
    if (!table) throw wordError()

    const fcClx = u32(word, 0x01a2)
    const lcbClx = u32(word, 0x01a6)
    if (fcClx > table.length || lcbClx > table.length - fcClx) throw wordError()
    const end = fcClx + lcbClx
    let offset = fcClx
    while (offset < end && table[offset] === 0x01) {
      const size = u16(table, offset + 1)
      offset += 3
      if (size > end - offset) throw wordError()
      offset += size
    }
    if (offset + 5 > end || table[offset] !== 0x02) throw wordError()
    const plcSize = u32(table, offset + 1)
    offset += 5
    if (plcSize < 4 || plcSize > end - offset || (plcSize - 4) % 12 !== 0) throw wordError()
    const pieceCount = (plcSize - 4) / 12
    const pcdStart = offset + 4 * (pieceCount + 1)
    if (pcdStart > offset + plcSize) throw wordError()

    // Pieces are decoded first, then cleaned once, so fields that span pieces are handled.
    // Real pieces never decode more bytes than the stream holds; overlapping hostile pieces would.
    let text = ''
    let decoded = 0
    const cp1252 = new TextDecoder('windows-1252')
    const utf16 = new TextDecoder('utf-16le')
    for (let index = 0; index < pieceCount && text.length < MAX_TEXT_CHARS * 2; index++) {
      const cpStart = u32(table, offset + index * 4)
      const cpEnd = u32(table, offset + (index + 1) * 4)
      if (cpEnd < cpStart) throw wordError()
      const pcd = pcdStart + index * 8
      if (pcd + 8 > offset + plcSize) throw wordError()
      const fc = u32(table, pcd + 2)
      const compressed = (fc & 0x40000000) !== 0
      const byteOffset = compressed ? (fc & 0x3fffffff) / 2 : fc
      const charCount = cpEnd - cpStart
      const byteLength = compressed ? charCount : charCount * 2
      if (!Number.isSafeInteger(byteLength) || byteOffset > word.length || byteLength > word.length - byteOffset) throw wordError()
      decoded += byteLength
      if (decoded > word.length) throw wordError()
      text += (compressed ? cp1252 : utf16).decode(word.subarray(byteOffset, byteOffset + byteLength))
    }
    return cleanWordText(text)
  } catch (error) {
    if (error instanceof Error && error.message === 'This Word file is password-protected.') throw error
    throw wordError()
  }
}

export function isCompoundWord(bytes: Uint8Array) {
  return bytes.length >= 8 && [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every((byte, index) => bytes[index] === byte)
}
