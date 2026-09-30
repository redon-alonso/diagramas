import { ref, shallowRef, computed, watch, onScopeDispose } from 'vue'
import { createRun, formatValue, splitTopLevel } from '../core/interpreter.js'
import { useWorkspace } from './useWorkspace.js'

const SPEEDS = [700, 380, 180, 70, 12]
// Límites de pasos que se pueden elegir; por encima de 10 millones el navegador sufre.
export const STEP_LIMITS = [100_000, 1_000_000, 10_000_000]
// Tiempo máximo de cálculo seguido antes de devolver el control al navegador (ms).
const SLICE_MS = 30

export function useRunner(speedRef) {
  const { analysis } = useWorkspace()
  const snapshot = shallowRef(emptySnapshot())
  const presetInputs = ref('')
  const playing = ref(false)
  // Ejecución rápida ("Hasta el final") en curso: se hace por tramos para no congelar la página.
  const busy = ref(false)
  const stepLimit = ref(STEP_LIMITS[1])
  let run = null
  let pending = null
  let queue = []
  let timer = null
  let fastTimer = null
  let readValues = {}
  let fast = false

  function emptySnapshot() {
    return { status: 'ready', current: null, currentFn: null, frames: [], vars: [], output: [], ops: 0, steps: 0, calls: 0, maxDepth: 0, visits: {}, lastBranch: null, error: null, awaiting: null, reads: {}, stopped: false }
  }

  const canRun = computed(() => analysis.value.ok)

  function describe(name, value, changed, lang) {
    if (Array.isArray(value)) {
      return {
        name,
        type: 'lista',
        items: value.slice(0, 60).map((x) => formatValue(x, lang)),
        more: Math.max(0, value.length - 60),
        length: value.length,
        changed: changed?.name === name,
        changedIndex: changed?.name === name ? changed.index : null,
      }
    }
    const type = value === null ? 'nulo' : typeof value === 'number' ? 'número' : typeof value === 'boolean' ? 'lógico' : 'texto'
    return { name, type, value: formatValue(value, lang), changed: changed?.name === name }
  }

  function takeSnapshot(extra = {}) {
    const s = run.state
    const lang = analysis.value.ast?.lang ?? 'es'
    const top = s.frames.at(-1)
    snapshot.value = {
      status: s.status,
      current: s.current,
      currentFn: s.currentFn,
      frames: s.frames.map((f) => f.name ?? null),
      calls: s.calls,
      maxDepth: s.maxDepth,
      vars: [...top.vars].map(([name, value]) => describe(name, value, s.changed, lang)),
      output: s.output.slice(-400),
      ops: s.ops,
      steps: s.steps,
      maxSteps: stepLimit.value,
      visits: Object.fromEntries(s.visits),
      lastBranch: s.lastBranch,
      error: s.error,
      awaiting: pending?.awaiting ?? null,
      awaitingLine: pending?.line ?? null,
      reads: { ...readValues },
      stopped: false,
      ...extra,
    }
  }

  function stopFast() {
    busy.value = false
    fast = false
    clearTimeout(fastTimer)
  }

  function reset() {
    stop()
    stopFast()
    run = null
    pending = null
    readValues = {}
    snapshot.value = emptySnapshot()
  }

  function ensureRun() {
    if (run || !canRun.value) return !!run
    run = createRun(analysis.value.ast, { maxSteps: stepLimit.value })
    queue = splitTopLevel(presetInputs.value, ',;\n').map((v) => v.trim()).filter((v) => v !== '').slice(0, 1000)
    readValues = {}
    return true
  }

  const finished = () => run.state.status === 'done' || run.state.status === 'error'

  /** Avanza una parada. Devuelve false si la ejecución no puede continuar sin intervención. */
  function advance(input) {
    if (!ensureRun()) return false
    if (finished()) return false
    let res
    if (pending?.awaiting) {
      if (input === undefined) {
        if (!queue.length) return false
        input = queue.shift()
      }
      const name = pending.awaiting
      if (!(name in readValues)) readValues[name] = input
      res = run.iterator.next(input)
    } else {
      res = run.iterator.next()
    }
    pending = res.done ? null : res.value
    if (pending?.awaiting && queue.length === 0) return false
    return !res.done
  }

  function step() {
    stop()
    stopFast()
    advance()
    takeSnapshot()
  }

  function play() {
    stopFast()
    if (!ensureRun()) return
    if (finished()) reset()
    ensureRun()
    playing.value = true
    tick()
  }

  function tick() {
    if (!playing.value) return
    const more = advance()
    takeSnapshot()
    if (!more) {
      // Si espera un dato, seguirá sola en cuanto el usuario lo escriba.
      if (!snapshot.value.awaiting) playing.value = false
      return
    }
    timer = setTimeout(tick, SPEEDS[(speedRef?.value ?? 3) - 1] ?? 180)
  }

  function stop() {
    playing.value = false
    clearTimeout(timer)
  }

  /** Ejecuta un tramo de pasos y cede el control al navegador para que la página siga respondiendo. */
  function pump() {
    if (!fast) return
    const start = performance.now()
    let more = true
    while (more && performance.now() - start < SLICE_MS) {
      for (let i = 0; i < 400 && more; i++) more = advance()
    }
    takeSnapshot()
    if (more) {
      fastTimer = setTimeout(pump, 0)
    } else {
      busy.value = false
      // Si se ha parado a esperar un dato, sigue en modo rápido al recibirlo.
      if (!snapshot.value.awaiting) fast = false
    }
  }

  function runToEnd() {
    stop()
    stopFast()
    if (!ensureRun()) return
    if (finished()) { reset(); ensureRun() }
    fast = true
    busy.value = true
    pump()
  }

  /** Detiene la ejecución rápida o la reproducción, dejando el estado donde esté. */
  function halt() {
    const wasBusy = busy.value || playing.value
    stop()
    stopFast()
    if (run && wasBusy && !finished()) takeSnapshot({ stopped: true })
  }

  function provideInput(value) {
    if (!pending?.awaiting) return
    advance(String(value))
    takeSnapshot()
    if (fast) {
      busy.value = true
      pump()
    } else if (playing.value) {
      clearTimeout(timer)
      timer = setTimeout(tick, 60)
    }
  }

  // Si cambia el algoritmo o el límite, la ejecución anterior deja de tener sentido.
  watch(() => analysis.value.ast, reset)
  watch(stepLimit, reset)
  onScopeDispose(() => { stop(); stopFast() })

  return { snapshot, presetInputs, playing, busy, stepLimit, canRun, step, play, stop, halt, reset, runToEnd, provideInput }
}
