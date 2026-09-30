import { ref, shallowRef, computed, watch } from 'vue'
import { parseProgram } from '../core/parser.js'
import { analyzeCost } from '../core/cost.js'
import { buildFlowchart } from '../core/flow.js'
import { loadDraft, saveDraft } from '../core/storage.js'
import { DEFAULT_CODE, SAMPLES } from '../core/samples.js'
import { useLibrary } from './useLibrary.js'

const cache = new Map()

/** Analiza un código completo (con caché, se usa también en la vista de comparación). */
export function analyzeSource(src) {
  if (cache.has(src)) return cache.get(src)
  const parse = parseProgram(src)
  let cost = null
  let flow = null
  if (parse.ok) {
    cost = analyzeCost(parse.ast)
    flow = buildFlowchart(parse.ast)
  }
  const diagnostics = [...parse.diagnostics, ...(cost?.warnings ?? [])]
  if (cost?.failed) diagnostics.push({ severity: 'error', line: parse.ast.startLine, message: cost.message })
  diagnostics.sort((a, b) => a.line - b.line)
  const result = { source: src, ok: parse.ok && !cost?.failed, parse, ast: parse.ast, cost, flow, diagnostics }
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
