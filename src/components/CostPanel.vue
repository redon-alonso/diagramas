<script setup>
import { computed, ref } from 'vue'
import GrowthChart from './GrowthChart.vue'
import { evalAt, COST_MODEL } from '../core/cost.js'
import { classOf, formatBig, formatDuration, viability, OPS_PER_SECOND } from '../core/format.js'
import { formatSymbol, bigOWithDifferences } from '../core/poly.js'

const props = defineProps({
  cost: { type: Object, default: null },
  code: { type: String, default: '' },
  stale: { type: Boolean, default: false },
  hoverLine: { type: Number, default: null },
})
const emit = defineEmits(['hover-line', 'focus-line'])

const exponent = ref(3)
const speed = ref(OPS_PER_SECOND)
const n = computed(() => Math.max(1, Math.round(10 ** exponent.value)))
const SPEEDS = [
  { v: 1e6, label: 'Muy lento (10⁶ op/s)' },
  { v: 1e8, label: 'Ordenador normal (10⁸ op/s)' },
  { v: 1e10, label: 'Muy rápido (10¹⁰ op/s)' },
]

const ops = computed(() => (props.cost ? evalAt(props.cost.worst, n.value) : 0))
const seconds = computed(() => ops.value / speed.value)
const verdict = computed(() => viability(seconds.value))

const codeLines = computed(() => props.code.split('\n'))

function toRows(lines, total) {
  return [...lines.entries()]
    .sort(([a], [b]) => a - b)
    .map(([line, info]) => {
      const at = evalAt(info.count, n.value) * evalAt(info.unit, n.value)
      return {
        line,
        text: (codeLines.value[line - 1] ?? '').trim(),
        count: info.count.toString(),
        unit: info.unit.constValue() !== null ? info.unit.toString() : `O(${bigOWithDifferences(info.unit).text})`,
        unitFull: info.unit.toString(),
        cls: classOf(info.count).id,
        share: Math.min(1, at / total),
      }
    })
}

// Programa principal: peso de cada línea sobre el total.
const rows = computed(() => (props.cost ? toRows(props.cost.lines, Math.max(ops.value, 1)) : []))

// Funciones: cada una con su coste y su desglose por llamada.
const functions = computed(() => {
  if (!props.cost) return []
  return props.cost.fnLines.map((fn) => {
    const perCall = Math.max(evalAt(fn.worst, n.value), 1)
    return { ...fn, worstText: fn.worst.toString(), rows: toRows(fn.lines, perCall) }
  })
})

const symbolNotes = computed(() => {
  if (!props.cost) return []
  const out = []
  for (const s of props.cost.symbols) {
    const shown = formatSymbol(s)
    const k = props.cost.kSymbols.find((ks) => ks.name === s)
    if (k) out.push({ s: shown, text: `${k.reason ?? 'valor desconocido'}, línea ${k.line}. No se puede deducir; en las gráficas se toma ${s} = n.` })
    else if (s.startsWith('len_')) out.push({ s: shown, text: `longitud de la lista ${s.slice(4)}${props.cost.inputs.includes(s.slice(4)) ? ' (leída con LEER)' : ''}: es el tamaño de la entrada` })
    else if (props.cost.inputs.includes(s)) out.push({ s: shown, text: 'valor leído con LEER: es el tamaño de la entrada' })
    else out.push({ s: shown, text: 'valor desconocido al analizar; se trata como tamaño de la entrada' })
  }
  return out
})

const multiVar = computed(() => (props.cost?.symbols.length ?? 0) > 1)
const series = computed(() => (props.cost ? [{ id: 'self', name: 'Este algoritmo', color: 'var(--c1)', fn: (x) => evalAt(props.cost.worst, x) }] : []))
</script>

<template>
  <div class="cost" :class="{ stale }">
    <p v-if="!cost" class="empty">Corrige los errores del código para calcular el coste.</p>
    <template v-else>
      <section class="headline" :class="`g-${cost.growthClass.id}`">
        <div class="big">
          <span class="o">{{ cost.theta ? 'Θ' : 'O' }}</span>(<span class="expr">{{ cost.bigO }}</span>)
        </div>
        <div class="meta">
          <span class="cls">Complejidad {{ cost.growthClass.label }}</span>
          <span v-if="!cost.theta" class="best">Mejor caso: Ω({{ cost.bigOmega }})</span>
          <span class="exact" :class="cost.exact ? 'ok' : 'approx'">{{ cost.exact ? 'Recuento exacto' : 'Estimación aproximada' }}</span>
        </div>
      </section>

      <section class="formula">
        <div class="row">
          <span class="lbl">Peor caso</span>
          <code>T = {{ cost.worst.toString() }}</code>
        </div>
        <div v-if="cost.best.toString() !== cost.worst.toString()" class="row">
          <span class="lbl">Mejor caso</span>
          <code>T = {{ cost.best.toString() }}</code>
        </div>
        <ul v-if="symbolNotes.length" class="symbols">
          <li v-for="sn in symbolNotes" :key="sn.s"><code>{{ sn.s }}</code>: {{ sn.text }}</li>
        </ul>
      </section>

      <section class="viability">
        <h3>¿Es viable?</h3>
        <label class="slider">
          <span>Tamaño de la entrada <strong class="mono">n = {{ formatBig(n) }}</strong></span>
          <input v-model.number="exponent" type="range" min="0" max="9" step="0.1" aria-label="Tamaño de la entrada (escala logarítmica)" />
        </label>
        <label class="speed">
          <span>Velocidad supuesta</span>
          <select v-model.number="speed" class="field">
            <option v-for="s in SPEEDS" :key="s.v" :value="s.v">{{ s.label }}</option>
          </select>
        </label>
        <div class="verdict" :class="verdict.id">
          <span class="badge">{{ verdict.label }}</span>
          <span><strong>{{ formatBig(ops) }}</strong> operaciones · unos <strong>{{ formatDuration(seconds) }}</strong></span>
        </div>
        <p v-if="multiVar" class="hint">Hay varias variables ({{ cost.symbols.join(', ') }}); en el cálculo todas valen n.</p>
        <GrowthChart :series="series" :max-n="Math.max(10, n)" :mark-n="n" :height="200" label="Operaciones de este algoritmo frente a curvas de referencia" />
      </section>

      <section class="breakdown">
        <h3>Desglose por línea</h3>
        <p class="hint">Cuántas veces se ejecuta cada línea y qué parte del total supone con n = {{ formatBig(n) }}.</p>
        <table>
          <thead>
            <tr><th scope="col">Línea</th><th scope="col">Veces</th><th scope="col" title="Operaciones por ejecución">Ops</th><th scope="col">Peso</th></tr>
          </thead>
          <tbody>
            <tr
              v-for="r in rows"
              :key="r.line"
              :class="[`g-${r.cls}`, { hover: r.line === hoverLine }]"
              @pointerenter="emit('hover-line', r.line)"
              @pointerleave="emit('hover-line', null)"
              @click="emit('focus-line', r.line)"
            >
              <td class="ln">
                <span class="num">{{ r.line }}</span>
                <span class="src" :title="r.text">{{ r.text }}</span>
              </td>
              <td class="mono cnt">{{ r.count }}</td>
              <td class="mono unit" :title="`${r.unitFull} operaciones por vez`">{{ r.unit }}</td>
              <td class="share"><span class="bar" :style="{ width: `${Math.max(2, r.share * 100)}%` }" /><span class="pct">{{ Math.round(r.share * 100) }}%</span></td>
            </tr>
          </tbody>
        </table>
      </section>

      <section v-if="functions.length" class="functions">
        <h3>Funciones</h3>
        <p class="hint">Coste de una llamada, según sus parámetros. El desglose es por cada llamada.</p>
        <details v-for="fn in functions" :key="fn.name" class="fn" :class="`g-${fn.growthClass.id}`" open>
          <summary>
            <code class="sig">{{ fn.name }}({{ fn.params.join(', ') }})</code>
            <span class="o">O({{ fn.bigO }})</span>
            <span v-if="fn.bigOmega !== fn.bigO" class="om">Ω({{ fn.bigOmega }})</span>
          </summary>
          <p v-if="fn.recurrence" class="rec">Recursiva: <code>{{ fn.recurrence }}</code></p>
          <p class="formula-line"><code>T = {{ fn.worstText }}</code></p>
          <table>
            <tbody>
              <tr
                v-for="r in fn.rows"
                :key="r.line"
                :class="[`g-${r.cls}`, { hover: r.line === hoverLine }]"
                @pointerenter="emit('hover-line', r.line)"
                @pointerleave="emit('hover-line', null)"
                @click="emit('focus-line', r.line)"
              >
                <td class="ln"><span class="num">{{ r.line }}</span><span class="src" :title="r.text">{{ r.text }}</span></td>
                <td class="mono cnt">{{ r.count }}</td>
                <td class="mono unit" :title="`${r.unitFull} operaciones por vez`">{{ r.unit }}</td>
              </tr>
            </tbody>
          </table>
        </details>
      </section>

      <section class="metrics">
        <h3>Estructura</h3>
        <dl>
          <div><dt>Instrucciones</dt><dd>{{ cost.metrics.statements }}</dd></div>
          <div><dt>Decisiones</dt><dd>{{ cost.metrics.decisions }}</dd></div>
          <div><dt>Bucles</dt><dd>{{ cost.metrics.loops }}</dd></div>
          <div><dt>Anidamiento máximo</dt><dd>{{ cost.metrics.maxDepth }}</dd></div>
          <div><dt title="Número de caminos independientes: decisiones + 1">Complejidad ciclomática</dt><dd>{{ cost.metrics.cyclomatic }}</dd></div>
          <div><dt>Variables (memoria)</dt><dd>{{ cost.metrics.variables }}</dd></div>
          <div v-if="cost.metrics.functions"><dt>Funciones</dt><dd>{{ cost.metrics.functions }}<small v-if="cost.metrics.recursive"> ({{ cost.metrics.recursive }} recursiva{{ cost.metrics.recursive > 1 ? 's' : '' }})</small></dd></div>
        </dl>
      </section>

      <section v-if="cost.notes.length" class="notes">
        <h3>Cómo se ha calculado</h3>
        <ul>
          <li v-for="(nt, i) in cost.notes" :key="i"><button type="button" class="link" @click="emit('focus-line', nt.line)">Línea {{ nt.line }}</button> {{ nt.message }}</li>
        </ul>
      </section>

      <details class="model">
        <summary>Modelo de coste utilizado</summary>
        <ul>
          <li>Asignación: {{ COST_MODEL.assign }} + una por cada operación aritmética.</li>
          <li>Cada <code>+ − * / %</code>, comparación, <code>Y</code>, <code>O</code>, <code>NO</code> o acceso <code>v[i]</code>: 1.</li>
          <li>Función predefinida: 1 (<code>LISTA(n, x)</code> cuesta además n). Llamada a una función propia: 1 + lo que cueste ejecutarla.</li>
          <li><code>RETORNAR</code>: 1 + las operaciones de la expresión.</li>
          <li><code>MOSTRAR</code> / <code>LEER</code>: 1 por cada valor.</li>
          <li><code>PARA</code>: {{ COST_MODEL.forInit }} al empezar, 1 comprobación por vuelta (más la final) y {{ COST_MODEL.forStep }} para incrementar.</li>
          <li><code>MIENTRAS</code>: la condición se evalúa una vez más que las vueltas. <code>REPETIR</code>: una vez por vuelta.</li>
          <li>Recursión: se deduce la recurrencia (restar o dividir el tamaño) y se resuelve de forma aproximada.</li>
          <li><code>SI</code>: la condición y, en el peor caso, la rama más costosa.</li>
        </ul>
        <p>Es un modelo orientativo para comparar algoritmos, no una medida real de tiempo.</p>
      </details>
    </template>
  </div>
</template>

<style scoped>
.cost {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 16px;
}

.cost.stale {
  opacity: 0.5;
}

.empty {
  color: var(--ink-soft);
}

h3 {
  margin: 0 0 8px;
  font-size: 15px;
}

.headline {
  padding-left: 14px;
  border-left: 5px solid var(--g);
}

.big {
  font-family: var(--font-code);
  font-size: 40px;
  line-height: 1.1;
  letter-spacing: -0.02em;
  overflow-wrap: anywhere;
}

.big .o {
  font-family: var(--font-ui);
  font-weight: 800;
}

.big .expr {
  color: var(--g);
  font-weight: 700;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  margin-top: 6px;
  font-size: 13.5px;
  color: var(--ink-soft);
}

.cls {
  color: var(--ink);
  font-weight: 700;
}

.exact.ok { color: var(--green); }
.exact.approx { color: var(--amber); }

.formula .row {
  display: grid;
  grid-template-columns: 6.5em 1fr;
  gap: 8px;
  align-items: baseline;
  margin-bottom: 4px;
}

.lbl {
  font-size: 13px;
  color: var(--ink-soft);
}

.formula code {
  font-size: 15px;
  overflow-wrap: anywhere;
}

.symbols {
  margin: 8px 0 0;
  padding-left: 18px;
  font-size: 13px;
  color: var(--ink-soft);
}

.viability {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.slider,
.speed {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13.5px;
}

.slider input {
  width: 100%;
  accent-color: var(--ink);
}

.verdict {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 10px;
  border-radius: var(--radius-s);
  background: var(--green-soft);
  font-size: 14px;
}

.verdict .badge {
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--green);
  color: var(--panel);
  font-weight: 700;
  font-size: 12.5px;
}

.verdict.slow { background: var(--amber-soft); }
.verdict.slow .badge { background: var(--amber); }
.verdict.bad { background: var(--red-soft); }
.verdict.bad .badge { background: var(--red); }

.hint {
  margin: 0 0 6px;
  font-size: 13px;
  color: var(--ink-soft);
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  table-layout: fixed;
}

th {
  padding: 4px 6px;
  border-bottom: 1px solid var(--rule);
  color: var(--ink-soft);
  font-weight: 600;
  text-align: left;
}

th:nth-child(1) { width: 42%; }
th:nth-child(3) { width: 5.5em; }
th:nth-child(4) { width: 26%; }

td {
  padding: 4px 6px;
  border-bottom: 1px solid color-mix(in srgb, var(--rule) 50%, transparent);
  vertical-align: middle;
}

tbody tr {
  cursor: pointer;
}

tbody tr:hover,
tbody tr.hover {
  background: color-mix(in srgb, var(--mark) 35%, transparent);
}

.ln {
  display: flex;
  gap: 6px;
  min-width: 0;
}

.ln .num {
  color: var(--ink-faint);
  font-family: var(--font-code);
}

.ln .src {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-code);
}

.cnt {
  color: var(--g);
  font-weight: 700;
  overflow-wrap: anywhere;
}

.share {
  position: relative;
}

.bar {
  display: block;
  height: 8px;
  border-radius: 0 4px 4px 0;
  background: var(--g);
}

.pct {
  font-size: 11px;
  color: var(--ink-soft);
}

.fn {
  margin-bottom: 8px;
  padding: 6px 10px;
  border: 1px solid var(--rule);
  border-left: 4px solid var(--g);
  border-radius: var(--radius-s);
}

.fn summary {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
  cursor: pointer;
}

.fn .sig {
  font-weight: 700;
}

.fn .o {
  font-family: var(--font-code);
  font-weight: 700;
  color: var(--g);
}

.fn .om {
  font-family: var(--font-code);
  font-size: 13px;
  color: var(--ink-soft);
}

.rec,
.formula-line {
  margin: 6px 0 4px;
  font-size: 13px;
  overflow-wrap: anywhere;
}

.unit {
  width: 5em;
  color: var(--ink-soft);
  overflow-wrap: anywhere;
}

dd small {
  font-size: 12px;
  font-weight: 400;
  color: var(--ink-soft);
}

.metrics dl {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 8px;
  margin: 0;
}

.metrics dl div {
  padding: 6px 10px;
  border: 1px solid var(--rule);
  border-radius: var(--radius-s);
}

dt {
  font-size: 12.5px;
  color: var(--ink-soft);
}

dd {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
}

.notes ul,
.model ul {
  margin: 0;
  padding-left: 18px;
  font-size: 13.5px;
}

.link {
  padding: 0;
  border: 0;
  background: none;
  color: var(--ink);
  font-weight: 700;
  text-decoration: underline;
  cursor: pointer;
}

.model {
  font-size: 13.5px;
  color: var(--ink-soft);
}

.model summary {
  cursor: pointer;
  color: var(--ink);
  font-weight: 600;
}
</style>
