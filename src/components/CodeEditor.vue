<script setup>
import { computed, ref, watch, nextTick } from 'vue'
import { tokenizeLine, WORDS, LIMITS, isBuiltin } from '../core/lexer.js'

const props = defineProps({
  modelValue: { type: String, required: true },
  diagnostics: { type: Array, default: () => [] },
  lineInfo: { type: Map, default: () => new Map() },
  activeLine: { type: Number, default: null },
  hoverLine: { type: Number, default: null },
  lang: { type: String, default: 'es' },
  focusRequest: { type: Object, default: null },
})
const emit = defineEmits(['update:modelValue', 'cursor-line'])

const LINE_H = 22
const INDENT = '    '
const STRUCT_ROLES = new Set(['START', 'END', 'IF', 'THEN', 'ELSE', 'END_IF', 'WHILE', 'DO', 'END_WHILE', 'FOR', 'FROM', 'TO', 'END_FOR', 'REPEAT', 'UNTIL', 'FUNCTION', 'END_FUNCTION', 'RETURN'])
const LOGIC_ROLES = new Set(['AND', 'OR', 'NOT'])
const LITERAL_ROLES = new Set(['TRUE', 'FALSE', 'NULL'])

const textarea = ref(null)
const scroller = ref(null)
const cursorLine = ref(1)

const lines = computed(() => props.modelValue.split('\n'))
const maxLen = computed(() => Math.max(20, ...lines.value.map((l) => l.length)))

const diagByLine = computed(() => {
  const map = new Map()
  for (const d of props.diagnostics) {
    if (!map.has(d.line)) map.set(d.line, [])
    map.get(d.line).push(d)
  }
  return map
})

function tokenClass(tok, next) {
  switch (tok.t) {
    case 'kw':
      if (LOGIC_ROLES.has(tok.role)) return 'tk-logic'
      if (LITERAL_ROLES.has(tok.role)) return 'tk-num'
      return STRUCT_ROLES.has(tok.role) ? 'tk-kw' : 'tk-io'
    case 'id': return isBuiltin(tok.v) || (next?.t === 'op' && next.v === '(') ? 'tk-fn' : 'tk-id'
    case 'num': return 'tk-num'
    case 'str': return 'tk-str'
    case 'comment': return 'tk-com'
    case 'op': return 'tk-op'
    case 'bad': return 'tk-bad'
    default: return 'tk-id'
  }
}

const rendered = computed(() =>
  lines.value.map((text, i) => {
    const line = i + 1
    const segs = []
    let pos = 0
    const toks = tokenizeLine(text)
    for (const [k, tok] of toks.entries()) {
      if (tok.s > pos) segs.push({ text: text.slice(pos, tok.s), cls: '' })
      segs.push({ text: text.slice(tok.s, tok.e), cls: tokenClass(tok, toks[k + 1]) })
      pos = tok.e
    }
    if (pos < text.length) segs.push({ text: text.slice(pos), cls: '' })
    const diags = diagByLine.value.get(line) ?? []
    const ghost = diags.find((d) => d.ghost)?.ghost ?? null
    const underlines = diags.filter((d) => d.severity === 'error' && Number.isInteger(d.s) && !d.ghost).map((d) => ({ s: d.s, w: Math.max(1, (d.e ?? d.s + 1) - d.s) }))
    const level = diags.some((d) => d.severity === 'error') ? 'error' : diags.length ? 'warning' : null
    return { line, segs, ghost, underlines, level, info: props.lineInfo.get(line) ?? null }
  }),
)

const errorCount = computed(() => props.diagnostics.filter((d) => d.severity === 'error').length)
const warningCount = computed(() => props.diagnostics.length - errorCount.value)

// ---------------------------------------------------------------------------
// Edición
// ---------------------------------------------------------------------------

function updateCursor() {
  const el = textarea.value
  if (!el) return
  const line = el.value.slice(0, el.selectionStart).split('\n').length
  if (line !== cursorLine.value) {
    cursorLine.value = line
    emit('cursor-line', line)
  }
}

/** Inserta texto conservando el historial de deshacer cuando el navegador lo permite. */
function insertText(text) {
  const el = textarea.value
  el.focus()
  const ok = typeof document.execCommand === 'function' && document.execCommand('insertText', false, text)
  if (!ok) {
    el.setRangeText(text, el.selectionStart, el.selectionEnd, 'end')
    emit('update:modelValue', el.value)
  }
}

function onInput(event) {
  const value = event.target.value
  if (value.length > LIMITS.maxChars) {
    event.target.value = props.modelValue
    return
  }
  emit('update:modelValue', value)
  updateCursor()
}

const OPENS_BLOCK = /(\b(ENTONCES|THEN|HACER|DO|SINO|ELSE|INICIO|START|REPETIR|REPEAT)|^\s*(FUNCION|FUNCTION)\b.*\))\s*$/

function onKeydown(event) {
  const el = textarea.value
  if (event.key === 'Tab' && !event.ctrlKey && !event.altKey && !event.metaKey) {
    event.preventDefault()
    if (event.shiftKey) {
      const start = el.value.lastIndexOf('\n', el.selectionStart - 1) + 1
      const lead = el.value.slice(start, start + INDENT.length).match(/^ */)[0].length
      if (lead) {
        el.setSelectionRange(start, start + lead)
        insertText('')
      }
    } else {
      insertText(INDENT)
    }
    return
  }
  if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey) {
    event.preventDefault()
    const start = el.value.lastIndexOf('\n', el.selectionStart - 1) + 1
    const current = el.value.slice(start, el.selectionStart)
    const indent = current.match(/^[ \t]*/)[0]
    insertText('\n' + indent + (OPENS_BLOCK.test(current) ? INDENT : ''))
  }
}

// Plantillas de la barra de herramientas, en el idioma del algoritmo.
const snippets = computed(() => {
  const w = WORDS[props.lang === 'en' ? 'en' : 'es']
  return [
    { label: w.IF, title: 'Condición', body: [`${w.IF} x > 0 ${w.THEN}`, `${INDENT}`, w.END_IF] },
    { label: `${w.IF}…${w.ELSE}`, title: 'Condición con alternativa', body: [`${w.IF} x > 0 ${w.THEN}`, `${INDENT}`, w.ELSE, `${INDENT}`, w.END_IF] },
    { label: w.WHILE, title: 'Bucle mientras', body: [`${w.WHILE} i < n ${w.DO}`, `${INDENT}i = i + 1`, w.END_WHILE] },
    { label: w.FOR, title: 'Bucle con contador', body: [`${w.FOR} i ${w.FROM} 1 ${w.TO} n ${w.DO}`, `${INDENT}`, w.END_FOR] },
    { label: `${w.REPEAT}…`, title: 'Repetir hasta que se cumpla', body: [w.REPEAT, `${INDENT}i = i + 1`, `${w.UNTIL} i >= n`] },
    { label: w.PRINT, title: 'Mostrar en pantalla', body: [`${w.PRINT} "Hola"`] },
    { label: w.READ, title: 'Leer del teclado', body: [`${w.READ} n`] },
    { label: props.lang === 'en' ? 'list' : 'lista', title: 'Crear una lista de n elementos', body: [props.lang === 'en' ? 'v = LIST(n, 0)' : 'v = LISTA(n, 0)'] },
    { label: w.FUNCTION, title: 'Función (va fuera del bloque principal)', body: [`${w.FUNCTION} doble(x)`, `${INDENT}${w.RETURN} x * 2`, w.END_FUNCTION] },
  ]
})

function insertSnippet(snippet) {
  const el = textarea.value
  const start = el.value.lastIndexOf('\n', el.selectionStart - 1) + 1
  const current = el.value.slice(start, el.selectionStart)
  const indent = current.match(/^[ \t]*/)[0]
  const onEmptyLine = current.trim() === '' && (el.value.indexOf('\n', el.selectionStart) === el.selectionStart || el.selectionStart === el.value.length || el.value.slice(el.selectionStart, el.value.indexOf('\n', el.selectionStart)).trim() === '')
  const body = snippet.body.map((l, i) => (i === 0 ? l : indent + l)).join('\n')
  if (onEmptyLine) {
    el.setSelectionRange(start + indent.length, el.selectionEnd)
    insertText(body)
  } else {
    const end = el.value.indexOf('\n', el.selectionStart)
    el.setSelectionRange(end < 0 ? el.value.length : end, end < 0 ? el.value.length : end)
    insertText('\n' + indent + body)
  }
  updateCursor()
}

// ---------------------------------------------------------------------------
// Navegación
// ---------------------------------------------------------------------------

function scrollToLine(line) {
  const sc = scroller.value
  if (!sc) return
  const top = (line - 1) * LINE_H
  if (top < sc.scrollTop + LINE_H || top > sc.scrollTop + sc.clientHeight - LINE_H * 3) {
    sc.scrollTo({ top: Math.max(0, top - sc.clientHeight / 3), behavior: 'smooth' })
  }
}

function goToLine(line) {
  const el = textarea.value
  if (!el) return
  const all = el.value.split('\n')
  const clamped = Math.min(Math.max(1, line), all.length)
  const offset = all.slice(0, clamped - 1).reduce((acc, l) => acc + l.length + 1, 0)
  const indent = all[clamped - 1].match(/^[ \t]*/)[0].length
  el.focus({ preventScroll: true })
  el.setSelectionRange(offset + indent, offset + all[clamped - 1].length)
  scrollToLine(clamped)
  updateCursor()
}

watch(() => props.focusRequest, (req) => { if (req) nextTick(() => goToLine(req.line)) })
watch(() => props.activeLine, (line) => { if (line) scrollToLine(line) })

defineExpose({ goToLine })
</script>

<template>
  <div class="editor">
    <div class="snippets" role="toolbar" aria-label="Insertar estructura">
      <button
        v-for="s in snippets"
        :key="s.label"
        type="button"
        class="snippet"
        :title="`Insertar: ${s.title}`"
        @mousedown.prevent
        @click="insertSnippet(s)"
      >{{ s.label }}</button>
    </div>

    <div ref="scroller" class="scroller">
      <div class="gutter" aria-hidden="true">
        <div
          v-for="r in rendered"
          :key="r.line"
          class="g-line"
          :class="[r.level && `lv-${r.level}`, r.info && `g-${r.info.cls}`, { cursor: r.line === cursorLine }]"
          @mousedown.prevent="goToLine(r.line)"
        >
          <span class="heat" />
          <span class="num">{{ r.line }}</span>
        </div>
      </div>

      <div class="code-area" :style="{ minWidth: `calc(${maxLen + 14}ch + 24px)` }">
        <div class="layer" aria-hidden="true">
          <div
            v-for="r in rendered"
            :key="r.line"
            class="c-line"
            :class="{ active: r.line === activeLine, hover: r.line === hoverLine && r.line !== activeLine, cursor: r.line === cursorLine }"
          ><span v-for="(seg, i) in r.segs" :key="i" :class="seg.cls">{{ seg.text }}</span><span
            v-if="r.ghost"
            class="ghost"
          >{{ r.ghost }}</span><span
            v-else-if="r.info"
            class="count"
            :class="`g-${r.info.cls}`"
          >×{{ r.info.count }}</span><span
            v-for="(u, i) in r.underlines"
            :key="`u${i}`"
            class="squiggle"
            :style="{ left: `${u.s}ch`, width: `${u.w}ch` }"
          /></div>
        </div>
        <textarea
          ref="textarea"
          class="input"
          :value="modelValue"
          spellcheck="false"
          autocapitalize="off"
          autocomplete="off"
          autocorrect="off"
          wrap="off"
          :maxlength="LIMITS.maxChars"
          aria-label="Editor de pseudocódigo"
          aria-describedby="editor-help"
          @input="onInput"
          @keydown="onKeydown"
          @keyup="updateCursor"
          @click="updateCursor"
          @select="updateCursor"
        />
      </div>
    </div>

    <p id="editor-help" class="visually-hidden">Tabulador inserta sangría. Pulsa Escape y después Tabulador para salir del editor.</p>

    <div class="problems" :class="{ clean: diagnostics.length === 0 }" aria-live="polite">
      <div v-if="diagnostics.length === 0" class="all-good">Sin errores. El diagrama está al día.</div>
      <template v-else>
        <div class="summary">
          <span v-if="errorCount" class="pill err">{{ errorCount }} {{ errorCount === 1 ? 'error' : 'errores' }}</span>
          <span v-if="warningCount" class="pill warn">{{ warningCount }} {{ warningCount === 1 ? 'aviso' : 'avisos' }}</span>
        </div>
        <ul>
          <li v-for="(d, i) in diagnostics" :key="i">
            <button type="button" class="diag" :class="d.severity" @click="goToLine(d.line)">
              <span class="where">Línea {{ d.line }}</span>
              <span class="msg">{{ d.message }}</span>
            </button>
          </li>
        </ul>
      </template>
    </div>
  </div>
</template>

<style scoped>
.editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--panel);
}

.snippets {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--rule);
}

.snippet {
  padding: 2px 8px;
  border: 1px dashed var(--rule);
  border-radius: var(--radius-s);
  background: transparent;
  font-family: var(--font-code);
  font-size: 12px;
  color: var(--ink-soft);
  cursor: pointer;
}

.snippet:hover {
  border-style: solid;
  border-color: var(--ink-soft);
  color: var(--ink);
}

.scroller {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: start;
  font-family: var(--font-code);
  font-size: 14px;
  line-height: 22px;
}

.gutter {
  position: sticky;
  left: 0;
  z-index: 2;
  padding: 10px 0 40px;
  background: var(--panel-2);
  border-right: 1px solid var(--rule);
  min-height: 100%;
  user-select: none;
}

.g-line {
  display: flex;
  align-items: center;
  height: 22px;
  padding-right: 10px;
  color: var(--ink-faint);
  font-size: 12px;
  cursor: pointer;
}

.g-line.cursor {
  color: var(--ink);
}

.heat {
  width: 4px;
  height: 100%;
  margin-right: 8px;
  background: var(--g, transparent);
  opacity: 0.85;
}

.num {
  min-width: 2.5ch;
  text-align: right;
}

.g-line.lv-error .num {
  color: var(--red);
  font-weight: 700;
}

.g-line.lv-warning .num {
  color: var(--amber);
  font-weight: 700;
}

.code-area {
  position: relative;
  display: grid;
  padding: 10px 0 40px;
}

.layer,
.input {
  grid-area: 1 / 1;
  margin: 0;
  padding: 0 12px;
  font: inherit;
  line-height: inherit;
  letter-spacing: 0;
  tab-size: 4;
  white-space: pre;
}

.c-line {
  position: relative;
  height: 22px;
  margin: 0 -12px;
  padding: 0 12px;
}

.c-line.cursor {
  background: color-mix(in srgb, var(--ink) 4%, transparent);
}

.c-line.hover {
  background: color-mix(in srgb, var(--mark) 35%, transparent);
}

.c-line.active {
  background: var(--mark);
  color: var(--mark-ink);
}

.input {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  border: 0;
  outline: none;
  resize: none;
  overflow: hidden;
  background: transparent;
  color: transparent;
  caret-color: var(--ink);
}

.input::selection {
  background: color-mix(in srgb, var(--c1) 30%, transparent);
  color: transparent;
}

.tk-kw { color: var(--ink); font-weight: 700; }
.tk-io { color: var(--g-linear); font-weight: 700; }
.tk-logic { color: var(--g-nlogn); font-weight: 700; }
.tk-fn { color: var(--g-log); }
.tk-num { color: var(--g-quad); }
.tk-str { color: var(--g-const); }
.tk-com { color: var(--ink-faint); font-style: italic; }
.tk-op { color: var(--ink-soft); }
.tk-id { color: var(--ink); }
.tk-bad { color: var(--red); text-decoration: underline wavy var(--red); }

.c-line.active :is(.tk-kw, .tk-io, .tk-num, .tk-str, .tk-op, .tk-id, .tk-logic, .tk-fn) {
  color: var(--mark-ink);
}

.ghost {
  margin-left: 2ch;
  color: var(--red);
  font-family: var(--font-ui);
  font-style: italic;
  font-weight: 700;
}

.count {
  margin-left: 2ch;
  color: var(--g, var(--ink-faint));
  font-size: 12px;
  opacity: 0.9;
}

.squiggle {
  position: absolute;
  bottom: 1px;
  height: 4px;
  margin-left: 12px;
  background: linear-gradient(135deg, transparent 35%, var(--red) 35%, var(--red) 55%, transparent 55%) 0 0 / 5px 4px repeat-x;
  pointer-events: none;
}

.problems {
  max-height: 34%;
  overflow: auto;
  border-top: 1px solid var(--rule);
  font-size: 13.5px;
}

.all-good {
  padding: 9px 14px;
  color: var(--green);
  font-weight: 600;
}

.summary {
  display: flex;
  gap: 6px;
  padding: 8px 12px 2px;
}

.pill {
  padding: 0 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.pill.err { background: var(--red-soft); color: var(--red); }
.pill.warn { background: var(--amber-soft); color: var(--amber); }

.problems ul {
  margin: 0;
  padding: 4px 6px 8px;
  list-style: none;
}

.diag {
  display: grid;
  grid-template-columns: 5.5em 1fr;
  gap: 8px;
  width: 100%;
  padding: 5px 8px;
  border: 0;
  border-left: 3px solid var(--amber);
  border-radius: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.diag.error {
  border-left-color: var(--red);
}

.diag:hover {
  background: var(--panel-2);
}

.where {
  color: var(--ink-soft);
  font-weight: 700;
  white-space: nowrap;
}

.diag.error .msg {
  color: var(--red);
}
</style>
