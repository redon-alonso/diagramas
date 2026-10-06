import { ref, shallowRef, computed, watch } from 'vue'
import { parseProgram } from '../core/parser.js'
import { analyzeCost } from '../core/cost.js'
import { buildFlowchart } from '../core/flow.js'
import { loadDraft, saveDraft } from '../core/storage.js'
import { DEFAULT_CODE, SAMPLES } from '../core/samples.js'
import { useLibrary } from './useLibrary.js'

const cache = new Map()

// Si una fase falla por un error interno (no del código del alumno), las demás siguen funcionando.
const PARSE_CRASH = 'Transcriptor no ha podido leer este código por un fallo interno. No es un error tuyo: prueba a cambiar algo o recarga la página.'
const COST_CRASH = 'No se ha podido calcular el coste por un fallo interno de Transcriptor, no de tu código. El diagrama y la ejecución siguen funcionando.'

/** Resumen de un error inesperado para los informes: tipo, mensaje y primeras líneas de la pila. */
export function errorDetail(err) {
  const head = `${err?.name ?? 'Error'}: ${err?.message ?? String(err)}`
  const stack = String(err?.stack ?? '').split('\n').slice(1, 4).map((l) => l.trim()).join('\n')
  return stack ? `${head}\n${stack}` : head
}

/** Analiza un código completo (con caché, se usa también en la vista de comparación). */
export function analyzeSource(src) {
  if (cache.has(src)) return cache.get(src)
  let parse
  try {
    parse = parseProgram(src)
  } catch (err) {
    console.error(err)
    return { source: src, ok: false, parse: { ok: false, ast: null, lang: 'es', diagnostics: [] }, ast: null, cost: null, flow: null, costError: null, diagnostics: [{ severity: 'error', line: 1, message: PARSE_CRASH }] }
  }
  let cost = null
  let flow = null
  let costError = null
  let costErrorDetail = null
  if (parse.ok) {
    try {
      cost = analyzeCost(parse.ast)
    } catch (err) {
      console.error(err)
      costError = COST_CRASH
      costErrorDetail = errorDetail(err)
    }
    try {
      flow = buildFlowchart(parse.ast)
    } catch (err) {
      console.error(err)
      flow = []
    }
  }
  const diagnostics = [...parse.diagnostics, ...(cost?.warnings ?? [])]
  if (cost?.failed) diagnostics.push({ severity: 'error', line: parse.ast.startLine, message: cost.message })
  diagnostics.sort((a, b) => a.line - b.line)
  const result = { source: src, ok: parse.ok && !cost?.failed, parse, ast: parse.ast, cost, flow, costError, costErrorDetail, diagnostics }
  if (cache.size > 60) cache.delete(cache.keys().next().value)
  cache.set(src, result)
  return result
}

const draft = loadDraft()
const library = useLibrary()

const code = ref(draft?.code?.trim() ? draft.code : DEFAULT_CODE)
const name = ref(draft?.name || (draft ? '' : SAMPLES[0].name))
const itemId = ref(draft?.itemId && library.byId(draft.itemId) ? draft.itemId : null)
const analysis = shallowRef(analyzeSource(code.value))
const lastValid = shallowRef(analysis.value.ok ? analysis.value : null)
const hoverLine = ref(null)
const focusRequest = ref(null)

let timer = null
watch(code, (src) => {
  clearTimeout(timer)
  timer = setTimeout(() => {
    analysis.value = analyzeSource(src)
    if (analysis.value.ok) lastValid.value = analysis.value
  }, 160)
})

let draftTimer = null
watch([code, name, itemId], () => {
  clearTimeout(draftTimer)
  draftTimer = setTimeout(() => saveDraft({ code: code.value, name: name.value, itemId: itemId.value }), 400)
})

export function useWorkspace() {
  const savedItem = computed(() => (itemId.value ? library.byId(itemId.value) : null))
  const dirty = computed(() => !savedItem.value || savedItem.value.code !== code.value || savedItem.value.name !== name.value.trim())

  function open({ code: c, name: n, id = null }) {
    code.value = c
    name.value = n
    itemId.value = id
    analysis.value = analyzeSource(c)
    if (analysis.value.ok) lastValid.value = analysis.value
  }

  function save() {
    const payload = { name: name.value.trim() || 'Sin nombre', code: code.value }
    if (savedItem.value) {
      library.update(itemId.value, payload)
    } else {
      const item = library.add(payload)
      itemId.value = item.id
    }
    name.value = payload.name
  }

  function saveAsNew() {
    const item = library.add({ name: name.value.trim() || 'Sin nombre', code: code.value })
    itemId.value = item.id
    name.value = item.name
  }

  function newDocument(lang = 'es') {
    open({ code: lang === 'en' ? 'START\n    \nEND' : 'INICIO\n    \nFIN', name: '', id: null })
  }

  /** Pide al editor que sitúe el cursor en una línea. */
  function focusLine(line) {
    focusRequest.value = { line, at: Date.now() }
  }

  return { code, name, itemId, analysis, lastValid, hoverLine, focusRequest, savedItem, dirty, open, save, saveAsNew, newDocument, focusLine }
}
