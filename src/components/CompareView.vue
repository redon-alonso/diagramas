<script setup>
import { computed, ref } from 'vue'
import GrowthChart from './GrowthChart.vue'
import FlowChart from './FlowChart.vue'
import { useLibrary } from '../composables/useLibrary.js'
import { useWorkspace, analyzeSource } from '../composables/useWorkspace.js'
import { SAMPLES } from '../core/samples.js'
import { evalAt } from '../core/cost.js'
import { formatBig, formatDuration, viability } from '../core/format.js'

const emit = defineEmits(['edit'])

const MAX_SELECTED = 6
const SLOTS = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)']

const library = useLibrary()
const ws = useWorkspace()

// Cada candidato: { key, name, code, origin }
const candidates = computed(() => {
  const out = [{ key: 'current', name: ws.name.value.trim() || 'Algoritmo actual', code: ws.code.value, origin: 'Abierto en el taller' }]
  for (const it of library.sorted.value) {
    if (it.id === ws.itemId.value) continue
    out.push({ key: `lib:${it.id}`, name: it.name, code: it.code, origin: 'Guardado' })
  }
  for (const s of SAMPLES) out.push({ key: `sample:${s.name}`, name: s.name, code: s.code, origin: `Ejemplo · ${s.group}` })
  return out
})

// Ranura de color fija por algoritmo: el color sigue a la entidad, no a su posición.
const slots = ref(new Map([['current', 0]]))
const exponent = ref(3)
const logY = ref(true)
const speed = ref(1e8)
const n = computed(() => Math.max(1, Math.round(10 ** exponent.value)))

function toggle(key) {
  const next = new Map(slots.value)
  if (next.has(key)) next.delete(key)
  else {
    if (next.size >= MAX_SELECTED) return
    const used = new Set(next.values())
    next.set(key, [0, 1, 2, 3, 4, 5].find((i) => !used.has(i)))
  }
  slots.value = next
}

const selected = computed(() =>
  candidates.value
    .filter((c) => slots.value.has(c.key))
    .map((c) => {
      const a = analyzeSource(c.code)
      return { ...c, color: SLOTS[slots.value.get(c.key)], analysis: a, ok: a.ok && !!a.cost }
    }),
)

const valid = computed(() => selected.value.filter((s) => s.ok))
const series = computed(() => valid.value.map((s) => ({ id: s.key, name: s.name, color: s.color, fn: (x) => evalAt(s.analysis.cost.worst, x) })))

const rows = computed(() => {
  const list = valid.value.map((s) => {
    const ops = evalAt(s.analysis.cost.worst, n.value)
    const seconds = ops / speed.value
    return { ...s, ops, seconds, verdict: viability(seconds), cost: s.analysis.cost }
  })
  const best = Math.min(...list.map((r) => r.ops))
  return list.map((r) => ({ ...r, ratio: best > 0 ? r.ops / best : 1, best: r.ops === best }))
})

const groupedCandidates = computed(() => {
  const groups = new Map()
  for (const c of candidates.value) {
    const g = c.key === 'current' ? 'Taller' : c.key.startsWith('lib:') ? 'Tu biblioteca' : 'Ejemplos'
    if (!groups.has(g)) groups.set(g, [])
    groups.get(g).push(c)
  }
  return [...groups.entries()]
})

function summary(code) {
  const a = analyzeSource(code)
  if (!a.ok) return { text: 'con errores', cls: 'err' }
  return a.cost ? { text: `O(${a.cost.bigO})`, cls: `g-${a.cost.growthClass.id}` } : { text: 'sin coste', cls: 'err' }
}
</script>

<template>
  <div class="compare">
    <aside class="picker" aria-label="Elegir algoritmos">
      <h2>Comparar</h2>
      <p class="hint">Elige hasta {{ MAX_SELECTED }} algoritmos. Guarda los tuyos desde el taller para que aparezcan aquí.</p>
      <div v-for="[group, list] in groupedCandidates" :key="group" class="group">
        <h3>{{ group }}</h3>
        <ul>
          <li v-for="c in list" :key="c.key">
            <label class="cand" :class="{ on: slots.has(c.key) }">
              <input
                type="checkbox"
                :checked="slots.has(c.key)"
                :disabled="!slots.has(c.key) && slots.size >= MAX_SELECTED"
                @change="toggle(c.key)"
              />
              <span class="swatch" :style="{ background: slots.has(c.key) ? SLOTS[slots.get(c.key)] : 'transparent' }" />
              <span class="txt">
                <span class="name">{{ c.name }}</span>
                <span class="o" :class="summary(c.code).cls">{{ summary(c.code).text }}</span>
              </span>
            </label>
          </li>
        </ul>
      </div>
    </aside>

    <main class="stage">
      <p v-if="selected.length === 0" class="empty">Marca algún algoritmo a la izquierda para ver cómo crece su coste.</p>
      <template v-else>
        <div class="toolbar">
          <label class="slider">
            <span>Tamaño de la entrada <strong class="mono">n = {{ formatBig(n) }}</strong></span>
            <input v-model.number="exponent" type="range" min="0" max="9" step="0.1" aria-label="Tamaño de la entrada (escala logarítmica)" />
          </label>
          <label class="opt">
            <input v-model="logY" type="checkbox" />
            Escala logarítmica
          </label>
          <label class="opt">
            Velocidad
            <select v-model.number="speed" class="field">
              <option :value="1e6">10⁶ op/s</option>
              <option :value="1e8">10⁸ op/s</option>
              <option :value="1e10">10¹⁰ op/s</option>
            </select>
          </label>
        </div>

        <section class="panel">
          <h3>Crecimiento del coste (peor caso)</h3>
          <GrowthChart :series="series" :max-n="Math.max(10, n)" :mark-n="n" :log-y="logY" :height="300" />
          <p v-if="selected.some((s) => !s.ok)" class="warn">
            No se dibujan los algoritmos con errores: {{ selected.filter((s) => !s.ok).map((s) => s.name).join(', ') }}.
          </p>
        </section>

        <section class="panel table-wrap">
          <h3>Con n = {{ formatBig(n) }}</h3>
          <table>
            <thead>
              <tr>
                <th scope="col">Algoritmo</th>
                <th scope="col">Orden</th>
                <th scope="col">T(n) peor caso</th>
                <th scope="col">Operaciones</th>
                <th scope="col">Tiempo estimado</th>
                <th scope="col">Frente al mejor</th>
                <th scope="col" title="Decisiones + 1">Ciclomática</th>
                <th scope="col">Anidamiento</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in rows" :key="r.key">
                <th scope="row"><span class="swatch" :style="{ background: r.color }" />{{ r.name }}</th>
                <td class="mono o" :class="`g-${r.cost.growthClass.id}`">O({{ r.cost.bigO }})</td>
                <td class="mono formula">{{ r.cost.worst.toString() }}</td>
                <td class="mono num">{{ formatBig(r.ops) }}</td>
                <td><span class="verdict" :class="r.verdict.id">{{ r.verdict.label }}</span> {{ formatDuration(r.seconds) }}</td>
                <td class="mono num">{{ r.best ? 'el mejor' : `×${formatBig(r.ratio)}` }}</td>
                <td class="num">{{ r.cost.metrics.cyclomatic }}</td>
                <td class="num">{{ r.cost.metrics.maxDepth }}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="panel">
          <h3>Diagramas lado a lado</h3>
          <div class="flows">
            <article v-for="s in selected" :key="s.key" class="flow-card">
              <header>
                <span class="swatch" :style="{ background: s.color }" />
                <span class="name">{{ s.name }}</span>
                <button v-if="s.key !== 'current'" type="button" class="btn ghost" @click="emit('edit', s)">Abrir en el taller</button>
              </header>
              <div class="flow-box">
                <FlowChart :diagrams="s.analysis.flow ?? []" :stale="!s.ok" :name="s.name" compact />
              </div>
            </article>
          </div>
        </section>
      </template>
    </main>
  </div>
</template>

<style scoped>
.compare {
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  height: 100%;
  min-height: 0;
}

.picker {
  overflow: auto;
  padding: 16px;
  border-right: 1px solid var(--rule);
  background: var(--panel);
}

h2 {
  margin: 0 0 4px;
  font-size: 22px;
}

h3 {
  margin: 0 0 8px;
  font-size: 15px;
}

.hint {
  margin: 0 0 12px;
  font-size: 13.5px;
  color: var(--ink-soft);
}

.group h3 {
  margin: 14px 0 4px;
  font-size: 13px;
  color: var(--ink-soft);
}

.group ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

.cand {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: var(--radius-s);
  cursor: pointer;
}

.cand:hover {
  background: var(--panel-2);
}

.cand input {
  accent-color: var(--ink);
}

.swatch {
  display: inline-block;
  flex: none;
  width: 12px;
  height: 12px;
  margin-right: 6px;
  border: 1px solid var(--rule);
  border-radius: 3px;
  vertical-align: -1px;
}

.cand .swatch {
  margin-right: 0;
}

.txt {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.txt .name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
  font-size: 14px;
}

.o {
  font-family: var(--font-code);
  font-size: 12.5px;
  font-weight: 700;
  color: var(--g, var(--ink-soft));
}

.o.err {
  color: var(--red);
}

.stage {
  min-width: 0;
  overflow: auto;
  padding: 16px 20px 40px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.empty {
  margin: 40px auto;
  color: var(--ink-soft);
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px 24px;
}

.slider {
  display: flex;
  flex-direction: column;
  flex: 1 1 260px;
  font-size: 13.5px;
}

.slider input {
  accent-color: var(--ink);
}

.opt {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13.5px;
}

.panel {
  padding: 14px 16px;
  border: 1px solid var(--rule);
  border-radius: var(--radius-m);
  background: var(--panel);
}

.warn {
  margin: 8px 0 0;
  color: var(--amber);
  font-size: 13.5px;
}

.table-wrap {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13.5px;
}

th,
td {
  padding: 6px 8px;
  border-bottom: 1px solid color-mix(in srgb, var(--rule) 60%, transparent);
  text-align: left;
  vertical-align: middle;
}

thead th {
  color: var(--ink-soft);
  font-weight: 600;
  white-space: nowrap;
}

tbody th {
  font-weight: 700;
  white-space: nowrap;
}

.formula {
  min-width: 140px;
}

.num {
  text-align: right;
  white-space: nowrap;
}

.verdict {
  padding: 0 7px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  color: var(--panel);
  background: var(--green);
}

.verdict.slow { background: var(--amber); }
.verdict.bad { background: var(--red); }

.flows {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}

.flow-card {
  border: 1px solid var(--rule);
  border-radius: var(--radius-m);
  overflow: hidden;
}

.flow-card header {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--rule);
}

.flow-card .name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 700;
}

.flow-box {
  height: 380px;
}

@media (max-width: 900px) {
  .compare {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
    overflow: auto;
  }

  .picker {
    max-height: 40vh;
    border-right: 0;
    border-bottom: 1px solid var(--rule);
  }

  .stage {
    overflow: visible;
    padding: 16px;
  }
}
</style>
