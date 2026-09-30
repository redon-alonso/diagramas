<script setup>
import { computed, ref, watch, nextTick } from 'vue'
import AppIcon from './AppIcon.vue'
import { formatBig } from '../core/format.js'
import { parseInput } from '../core/interpreter.js'
import { STEP_LIMITS } from '../composables/useRunner.js'

const props = defineProps({
  runner: { type: Object, required: true },
  cost: { type: Object, default: null },
  speed: { type: Number, default: 3 },
})
const emit = defineEmits(['update:speed', 'focus-line'])

const { snapshot, presetInputs, playing, busy, stepLimit, canRun } = props.runner

// Avisos del análisis estático sobre bucles que podrían no terminar.
const loopWarnings = computed(() =>
  (props.cost?.warnings ?? []).filter((w) => /no termina nunca|bucle infinito|siempre se cumple|lo contrario para terminar|supera .* vueltas/.test(w.message)),
)

const errorTitle = computed(() => ({
  loop: 'Bucle infinito detectado',
  recursion: 'Recursión infinita detectada',
  limit: 'Límite de pasos alcanzado',
})[snapshot.value.error?.kind] ?? 'Error')

const nextLimit = computed(() => STEP_LIMITS.find((l) => l > stepLimit.value) ?? null)

function raiseLimitAndRetry() {
  if (!nextLimit.value) return
  stepLimit.value = nextLimit.value
  props.runner.runToEnd()
}

const limitLabel = (l) => (l >= 1e6 ? `${l / 1e6} ${l === 1e6 ? 'millón' : 'millones'}` : `${l / 1e3} mil`)
const answer = ref('')
const answerInput = ref(null)
const console_ = ref(null)

const statusText = computed(() => {
  const s = snapshot.value
  if (busy.value) return `Ejecutando… ${formatBig(s.steps)} pasos.`
  if (s.stopped) return 'Detenido. Puedes seguir paso a paso, reproducir o continuar hasta el final.'
  switch (s.status) {
    case 'ready': return 'Preparado. Pulsa Reproducir o Paso.'
    case 'running': return s.awaiting ? `Esperando un valor para "${s.awaiting}".` : playing.value ? 'Ejecutando…' : 'En pausa.'
    case 'input': return `Esperando un valor para "${s.awaiting}".`
    case 'done': return 'Ejecución terminada.'
    case 'error': return 'La ejecución se detuvo por un error.'
    default: return ''
  }
})

// Previsión del análisis estático con los valores realmente leídos.
const predicted = computed(() => {
  const c = props.cost
  const s = snapshot.value
  if (!c || s.status !== 'done') return null
  const values = {}
  for (const sym of c.symbols) {
    const isLen = sym.startsWith('len_')
    const read = parseInput(s.reads[isLen ? sym.slice(4) : sym])
    const raw = isLen ? (Array.isArray(read) || typeof read === 'string' ? read.length : NaN) : read
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return null
    values[sym] = raw
  }
  return Math.max(0, c.worst.evaluate((sym) => values[sym] ?? 0))
})

watch(() => snapshot.value.awaiting, (name) => {
  if (name) {
    answer.value = ''
    nextTick(() => answerInput.value?.focus())
  }
})

watch(() => snapshot.value.output.length, () => {
  nextTick(() => { if (console_.value) console_.value.scrollTop = console_.value.scrollHeight })
})

function submit() {
  props.runner.provideInput(answer.value)
  answer.value = ''
}
</script>

<template>
  <div class="run">
    <p v-if="!canRun" class="blocked">Corrige los errores del código para poder ejecutarlo.</p>

    <label class="inputs">
      <span>Datos de entrada para <code>LEER</code> <small>(separados por comas, en orden)</small></span>
      <input v-model="presetInputs" class="field mono" type="text" maxlength="2000" placeholder="Por ejemplo: 10, 4 o [5, 2, 9], 7" spellcheck="false" />
    </label>

    <div class="controls" role="toolbar" aria-label="Controles de ejecución">
      <button v-if="busy" type="button" class="btn primary stop" @click="runner.halt"><AppIcon name="pause" />Detener</button>
      <button v-else-if="!playing" type="button" class="btn primary" :disabled="!canRun" @click="runner.play"><AppIcon name="play" />Reproducir</button>
      <button v-else type="button" class="btn primary" @click="runner.halt"><AppIcon name="pause" />Pausar</button>
      <button type="button" class="btn" :disabled="!canRun || playing || busy" title="Avanzar un paso" @click="runner.step"><AppIcon name="step" />Paso</button>
      <button type="button" class="btn" :disabled="!canRun || busy" title="Ejecutar hasta el final" @click="runner.runToEnd"><AppIcon name="fast" />Hasta el final</button>
      <button type="button" class="btn ghost icon" :disabled="snapshot.status === 'ready'" title="Reiniciar" aria-label="Reiniciar" @click="runner.reset"><AppIcon name="reset" /></button>
    </div>

    <div v-if="busy" class="progress" role="progressbar" :aria-valuenow="snapshot.steps" aria-valuemin="0" :aria-valuemax="stepLimit">
      <span :style="{ width: `${Math.min(100, (snapshot.steps / stepLimit) * 100)}%` }" />
    </div>

    <div v-if="loopWarnings.length && snapshot.status === 'ready'" class="static-warn" role="note">
      <strong>El análisis avisa antes de ejecutar:</strong>
      <ul>
        <li v-for="(w, i) in loopWarnings" :key="i">
          <button type="button" class="link" @click="emit('focus-line', w.line)">Línea {{ w.line }}</button>: {{ w.message }}
        </li>
      </ul>
      <p>La ejecución lo vigila: se detendrá sola si el bucle repite exactamente el mismo estado.</p>
    </div>

    <label class="limit">
      <span>Límite de pasos</span>
      <select v-model.number="stepLimit" class="field" :disabled="busy">
        <option v-for="l in STEP_LIMITS" :key="l" :value="l">{{ limitLabel(l) }}</option>
      </select>
    </label>

    <label class="speed">
      <span>Velocidad</span>
      <input type="range" min="1" max="5" step="1" :value="speed" aria-label="Velocidad de reproducción" @input="emit('update:speed', Number($event.target.value))" />
    </label>

    <p class="status" :class="snapshot.status" role="status">{{ statusText }}</p>

    <form v-if="snapshot.awaiting" class="ask" @submit.prevent="submit">
      <label :for="'ask-input'">Valor para <code>{{ snapshot.awaiting }}</code></label>
      <div class="ask-row">
        <input id="ask-input" ref="answerInput" v-model="answer" class="field mono" type="text" maxlength="500" autocomplete="off" />
        <button type="submit" class="btn primary">Enviar</button>
      </div>
    </form>

    <div v-if="snapshot.error" class="error" :class="snapshot.error.kind" role="alert">
      <strong class="err-title">{{ errorTitle }}<template v-if="snapshot.error.line"> en la <button type="button" class="link" @click="emit('focus-line', snapshot.error.line)">línea {{ snapshot.error.line }}</button></template></strong>
      <p>{{ snapshot.error.message }}</p>
      <button v-if="snapshot.error.kind === 'limit' && nextLimit" type="button" class="btn" @click="raiseLimitAndRetry">
        Subir el límite a {{ limitLabel(nextLimit) }} y volver a ejecutar
      </button>
    </div>

    <section class="counters">
      <div><span class="k">Operaciones medidas</span><span class="v mono">{{ formatBig(snapshot.ops) }}</span></div>
      <div><span class="k">Pasos</span><span class="v mono">{{ formatBig(snapshot.steps) }}</span></div>
      <div v-if="predicted !== null" class="pred">
        <span class="k">Previsión (peor caso)</span><span class="v mono">{{ formatBig(predicted) }}</span>
      </div>
    </section>
    <p v-if="predicted !== null" class="compare-note">
      <template v-if="Math.abs(predicted - snapshot.ops) < 0.5">La medida coincide con la fórmula del análisis.</template>
      <template v-else-if="snapshot.ops < predicted && !cost.exact">La previsión es una cota aproximada del peor caso; esta ejecución hizo menos operaciones.</template>
      <template v-else-if="snapshot.ops < predicted">Se hicieron menos operaciones que en el peor caso: alguna condición evitó la rama más cara.</template>
      <template v-else>Se hicieron más operaciones de las previstas: el análisis de este algoritmo es una estimación.</template>
    </p>

    <section v-if="snapshot.frames.length > 1 || snapshot.calls" class="stack-section">
      <h3>Pila de llamadas</h3>
      <ol class="stack" aria-label="Pila de llamadas, de la más antigua a la actual">
        <li v-for="(f, i) in snapshot.frames" :key="i" :class="{ top: i === snapshot.frames.length - 1 }">
          {{ f ?? 'Principal' }}
        </li>
      </ol>
      <p class="muted">{{ formatBig(snapshot.calls) }} llamadas en total · profundidad máxima {{ snapshot.maxDepth }}</p>
    </section>

    <section>
      <h3>Variables<template v-if="snapshot.frames.length > 1"> de <code>{{ snapshot.frames.at(-1) }}</code></template></h3>
      <p v-if="snapshot.vars.length === 0" class="muted">Todavía no hay variables.</p>
      <table v-else class="vars">
        <tbody>
          <tr v-for="v in snapshot.vars" :key="v.name" :class="{ changed: v.changed && v.type !== 'lista' }">
            <th scope="row" class="mono">{{ v.name }}</th>
            <td v-if="v.type === 'lista'" class="list-cell">
              <div class="cells" :aria-label="`Lista de ${v.length} elementos`">
                <span
                  v-for="(item, i) in v.items"
                  :key="i"
                  class="cell mono"
                  :class="{ hot: v.changedIndex === i }"
                  :title="`${v.name}[${i + 1}] = ${item}`"
                ><small>{{ i + 1 }}</small>{{ item }}</span>
                <span v-if="v.more" class="more">+{{ v.more }}</span>
                <span v-if="v.length === 0" class="muted">vacía</span>
              </div>
            </td>
            <td v-else class="mono" :class="`t-${v.type}`">{{ v.type === 'texto' ? `"${v.value}"` : v.value }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section>
      <h3>Pantalla</h3>
      <div ref="console_" class="console mono" aria-live="polite">
        <div v-if="snapshot.output.length === 0" class="muted">Aquí aparecerá lo que muestre el algoritmo.</div>
        <div v-for="(line, i) in snapshot.output" :key="i">{{ line }}</div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.run {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
}

.blocked {
  margin: 0;
  color: var(--red);
  font-weight: 600;
}

.inputs {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13.5px;
}

.inputs small {
  color: var(--ink-soft);
}

.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.limit {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13.5px;
}

.limit select {
  flex: 1;
}

.progress {
  height: 6px;
  border-radius: 3px;
  background: var(--panel-2);
  overflow: hidden;
}

.progress span {
  display: block;
  height: 100%;
  background: var(--ink);
  transition: width 0.2s;
}

.btn.stop {
  background: var(--red);
  border-color: var(--red);
}

.static-warn {
  padding: 8px 10px;
  border: 1.5px solid var(--amber);
  border-radius: var(--radius-s);
  background: var(--amber-soft);
  font-size: 13.5px;
}

.static-warn ul {
  margin: 4px 0;
  padding-left: 18px;
}

.static-warn p {
  margin: 0;
  color: var(--ink-soft);
}

.err-title {
  display: block;
}

.error p {
  margin: 4px 0 0;
}

.error .btn {
  margin-top: 8px;
}

.speed {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13.5px;
}

.speed input {
  flex: 1;
  accent-color: var(--ink);
}

.status {
  margin: 0;
  padding: 6px 10px;
  border-left: 3px solid var(--rule);
  font-size: 13.5px;
  color: var(--ink-soft);
}

.status.done { border-left-color: var(--green); color: var(--green); font-weight: 600; }
.status.error { border-left-color: var(--red); color: var(--red); font-weight: 600; }

.ask {
  padding: 10px;
  border: 2px solid var(--mark);
  border-radius: var(--radius-m);
  background: color-mix(in srgb, var(--mark) 18%, var(--panel));
  font-size: 14px;
}

.ask-row {
  display: flex;
  gap: 6px;
  margin-top: 6px;
}

.ask-row input {
  flex: 1;
  min-width: 0;
}

.error {
  padding: 8px 10px;
  border: 1.5px solid var(--red);
  border-radius: var(--radius-s);
  background: var(--red-soft);
  color: var(--red);
  font-size: 14px;
}

.link {
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  font-weight: 700;
  text-decoration: underline;
  cursor: pointer;
}

.counters {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 8px;
}

.counters div {
  display: flex;
  flex-direction: column;
  padding: 6px 10px;
  border: 1px solid var(--rule);
  border-radius: var(--radius-s);
}

.counters .pred {
  border-style: dashed;
}

.k {
  font-size: 12.5px;
  color: var(--ink-soft);
}

.v {
  font-size: 20px;
  font-weight: 700;
}

.compare-note {
  margin: -6px 0 0;
  font-size: 13px;
  color: var(--ink-soft);
}

h3 {
  margin: 0 0 6px;
  font-size: 15px;
}

.muted {
  margin: 0;
  color: var(--ink-faint);
  font-size: 13.5px;
}

.vars {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.vars th,
.vars td {
  padding: 3px 8px;
  border-bottom: 1px solid color-mix(in srgb, var(--rule) 60%, transparent);
  text-align: left;
}

.vars th {
  width: 40%;
  color: var(--ink-soft);
  font-weight: 400;
}

.vars tr.changed td {
  background: var(--mark);
  color: var(--mark-ink);
  font-weight: 700;
}

.stack {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 0 0 4px;
  padding: 0;
  list-style: none;
}

.stack li {
  padding: 1px 8px;
  border: 1px solid var(--rule);
  border-radius: var(--radius-s);
  font-family: var(--font-code);
  font-size: 12.5px;
}

.stack li + li::before {
  content: '→ ';
  color: var(--ink-faint);
}

.stack li.top {
  border-color: var(--ink);
  background: var(--mark);
  color: var(--mark-ink);
  font-weight: 700;
}

.list-cell {
  padding: 4px 8px;
}

.cells {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}

.cell {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  min-width: 28px;
  padding: 1px 4px 2px;
  border: 1px solid var(--rule);
  border-radius: 3px;
  background: var(--panel);
  font-size: 12.5px;
  line-height: 1.2;
}

.cell small {
  font-size: 9.5px;
  color: var(--ink-faint);
}

.cell.hot {
  border-color: var(--ink);
  background: var(--mark);
  color: var(--mark-ink);
  font-weight: 700;
}

.cell.hot small {
  color: var(--mark-ink);
}

.more {
  align-self: center;
  font-size: 12px;
  color: var(--ink-soft);
}

.t-nulo,
.t-lógico {
  color: var(--g-nlogn);
  font-weight: 700;
}

.console {
  max-height: 220px;
  overflow: auto;
  padding: 8px 10px;
  border-radius: var(--radius-s);
  background: var(--s-term);
  color: var(--s-term-ink);
  font-size: 13px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.console .muted {
  color: color-mix(in srgb, var(--s-term-ink) 60%, transparent);
}
</style>
