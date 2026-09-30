// Persistencia local (localStorage). Todo lo que se lee se valida antes de usarse:
// el almacenamiento y los ficheros importados se tratan como datos no fiables.

import { LIMITS } from './lexer.js'

const LIBRARY_KEY = 'transcriptor.v1.library'
const DRAFT_KEY = 'transcriptor.v1.draft'
const PREFS_KEY = 'transcriptor.v1.prefs'

export const STORAGE_LIMITS = Object.freeze({
  maxItems: 200,
  maxName: 80,
  maxNotes: 2000,
  maxImportBytes: 2 * 1024 * 1024,
})

const ID_RE = /^[a-zA-Z0-9-]{1,64}$/

function safeGet(key) {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSet(key, value) {
  try {
    window.localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID()
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Elimina caracteres de control (salvo saltos de línea y tabuladores) y recorta. */
function cleanText(value, max, { multiline = false } = {}) {
  if (typeof value !== 'string') return ''
  const pattern = multiline ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/g : /[\u0000-\u001F\u007F‪-‮⁦-⁩]/g
  return value.replace(/\r\n?/g, '\n').replace(pattern, '').slice(0, max)
}

const validTime = (t) => (Number.isFinite(t) && t > 0 && t < 8.64e15 ? Math.floor(t) : Date.now())

/** Valida y normaliza un algoritmo guardado. Devuelve null si no es aprovechable. */
export function sanitizeItem(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const code = cleanText(raw.code, LIMITS.maxChars, { multiline: true })
  const name = cleanText(raw.name, STORAGE_LIMITS.maxName).trim()
  if (!code.trim() || !name) return null
  return {
    id: typeof raw.id === 'string' && ID_RE.test(raw.id) ? raw.id : newId(),
    name,
    code,
    notes: cleanText(raw.notes, STORAGE_LIMITS.maxNotes, { multiline: true }),
    createdAt: validTime(raw.createdAt),
    updatedAt: validTime(raw.updatedAt),
  }
}

export function loadLibrary() {
  const raw = safeGet(LIBRARY_KEY)
  if (!raw) return []
  try {
    const data = JSON.parse(raw)
    const list = Array.isArray(data?.items) ? data.items : []
    const seen = new Set()
    return list
      .slice(0, STORAGE_LIMITS.maxItems)
      .map(sanitizeItem)
      .filter((it) => it && !seen.has(it.id) && seen.add(it.id))
  } catch {
    return []
  }
}

export function saveLibrary(items) {
  return safeSet(LIBRARY_KEY, JSON.stringify({ version: 1, items }))
}

export function createItem({ name, code, notes = '' }) {
  const now = Date.now()
  return sanitizeItem({ id: newId(), name, code, notes, createdAt: now, updatedAt: now })
}

export function loadDraft() {
  const raw = safeGet(DRAFT_KEY)
  if (!raw) return null
  try {
    const d = JSON.parse(raw)
    return {
      code: cleanText(d?.code, LIMITS.maxChars, { multiline: true }),
      name: cleanText(d?.name, STORAGE_LIMITS.maxName),
      itemId: typeof d?.itemId === 'string' && ID_RE.test(d.itemId) ? d.itemId : null,
    }
  } catch {
    return null
  }
}

export function saveDraft(draft) {
  safeSet(DRAFT_KEY, JSON.stringify({ code: draft.code, name: draft.name, itemId: draft.itemId }))
}

export function loadPrefs() {
  try {
    const p = JSON.parse(safeGet(PREFS_KEY) ?? '{}')
    return {
      theme: ['light', 'dark', 'auto'].includes(p?.theme) ? p.theme : 'auto',
      speed: Number.isFinite(p?.speed) ? Math.min(Math.max(p.speed, 1), 5) : 3,
    }
  } catch {
    return { theme: 'auto', speed: 3 }
  }
}

export function savePrefs(prefs) {
  safeSet(PREFS_KEY, JSON.stringify(prefs))
}

/** Genera el contenido de un fichero de exportación. */
export function exportPayload(items) {
  return JSON.stringify({ app: 'transcriptor', version: 1, exportedAt: new Date().toISOString(), items }, null, 2)
}

/**
 * Lee un fichero de exportación. Lanza un Error con mensaje legible si no es válido.
 * @param {File} file
 */
export async function readImportFile(file) {
  if (!file) throw new Error('No se ha seleccionado ningún fichero.')
  if (file.size > STORAGE_LIMITS.maxImportBytes) throw new Error('El fichero es demasiado grande (máximo 2 MB).')
  if (!/\.json$/i.test(file.name)) throw new Error('Solo se pueden importar ficheros .json exportados desde esta aplicación.')
  const text = await file.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('El fichero no contiene JSON válido.')
  }
  if (data?.app !== 'transcriptor' || !Array.isArray(data.items)) {
    throw new Error('El fichero no es una exportación de Transcriptor.')
  }
  const items = data.items.slice(0, STORAGE_LIMITS.maxItems).map(sanitizeItem).filter(Boolean)
  if (items.length === 0) throw new Error('El fichero no contiene algoritmos válidos.')
  return items
}

export { newId }
