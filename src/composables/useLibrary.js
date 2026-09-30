import { ref, computed, watch } from 'vue'
import { loadLibrary, saveLibrary, createItem, sanitizeItem, exportPayload, readImportFile, newId, STORAGE_LIMITS } from '../core/storage.js'

// Estado compartido por toda la aplicación (singleton del módulo).
const items = ref(loadLibrary())
const storageError = ref(false)

watch(items, (list) => { storageError.value = !saveLibrary(list) }, { deep: true })

// Si otra pestaña modifica la biblioteca, se recarga aquí también.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === 'transcriptor.v1.library') items.value = loadLibrary()
  })
}

function downloadText(filename, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function useLibrary() {
  const sorted = computed(() => [...items.value].sort((a, b) => b.updatedAt - a.updatedAt))
  const isFull = computed(() => items.value.length >= STORAGE_LIMITS.maxItems)

  function byId(id) {
    return items.value.find((it) => it.id === id) ?? null
  }

  function add({ name, code, notes }) {
    if (isFull.value) throw new Error(`La biblioteca admite como máximo ${STORAGE_LIMITS.maxItems} algoritmos.`)
    const item = createItem({ name, code, notes })
    if (!item) throw new Error('Pon un nombre y escribe algo de código antes de guardar.')
    items.value.push(item)
    return item
  }

  function update(id, patch) {
    const idx = items.value.findIndex((it) => it.id === id)
    if (idx < 0) return null
    const next = sanitizeItem({ ...items.value[idx], ...patch, updatedAt: Date.now() })
    if (!next) throw new Error('Pon un nombre y escribe algo de código antes de guardar.')
    items.value[idx] = next
    return next
  }

  function remove(id) {
    items.value = items.value.filter((it) => it.id !== id)
  }

  function duplicate(id) {
    const src = byId(id)
    if (!src) return null
    return add({ name: `${src.name} (copia)`.slice(0, STORAGE_LIMITS.maxName), code: src.code, notes: src.notes })
  }

  function exportAll(selection = items.value) {
    const stamp = new Date().toISOString().slice(0, 10)
    downloadText(`transcriptor-${stamp}.json`, exportPayload(selection))
  }

  /** Importa y fusiona: si un id ya existe, se guarda como algoritmo nuevo. */
  async function importFile(file) {
    const incoming = await readImportFile(file)
    const existing = new Set(items.value.map((it) => it.id))
    const room = STORAGE_LIMITS.maxItems - items.value.length
    const accepted = incoming.slice(0, Math.max(0, room)).map((it) => (existing.has(it.id) ? { ...it, id: newId() } : it))
    items.value.push(...accepted)
    return { added: accepted.length, skipped: incoming.length - accepted.length }
  }

  return { items, sorted, isFull, storageError, byId, add, update, remove, duplicate, exportAll, importFile }
}

export { downloadText }
