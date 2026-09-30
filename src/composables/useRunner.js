import { ref, shallowRef, computed, watch, onScopeDispose } from 'vue'
import { createRun, formatValue, splitTopLevel } from '../core/interpreter.js'
import { useWorkspace } from './useWorkspace.js'

const SPEEDS = [700, 380, 180, 70, 12]
const MAX_STEPS = 500_000

export function useRunner(speedRef) {
  const { analysis } = useWorkspace()
  const snapshot = shallowRef(emptySnapshot())
  const presetInputs = ref('')
  const playing = ref(false)
  let run = null
  let pending = null
  let queue = []
  let timer = null
  let readValues = {}

  function emptySnapshot() {
    return { status: 'ready', current: null, currentFn: null, frames: [], vars: [], output: [], ops: 0, steps: 0, calls: 0, maxDepth: 0, visits: {}, lastBranch: null, error: null, awaiting: null, reads: {} }
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

  function takeSnapshot() {
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
      visits: Object.fromEntries(s.visits),
      lastBranch: s.lastBranch,
      error: s.error,
      awaiting: pending?.awaiting ?? null,
      awaitingLine: pending?.line ?? null,
      reads: { ...readValues },
    }
  }

  function reset() {
    stop()
    fast = false
    run = null
    pending = null
    readValues = {}
    snapshot.value = emptySnapshot()
  }

  function ensureRun() {
    if (run || !canRun.value) return !!run
    run = createRun(analysis.value.ast, { maxSteps: MAX_STEPS })
    queue = splitTopLevel(presetInputs.value, ',;\n').map((v) => v.trim()).filter((v) => v !== '').slice(0, 1000)
    readValues = {}
    return true
  }

  /** Avanza una parada. Devuelve false si la ejecución no puede continuar sin intervención. */
  function advance(input) {
    if (!ensureRun()) return false
    if (run.state.status === 'done' || run.state.status === 'error') return false
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
    fast = false
    advance()
    takeSnapshot()
  }

  function play() {
    if (!ensureRun()) return
    if (run.state.status === 'done' || run.state.status === 'error') reset()
    ensureRun()
    fast = false
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

  let fast = false

  function runToEnd() {
    stop()
    if (!ensureRun()) return
    if (run.state.status === 'done' || run.state.status === 'error') { reset(); ensureRun() }
    fast = true
    while (advance()) { /* ejecutar hasta terminar o necesitar un dato */ }
    takeSnapshot()
    if (!snapshot.value.awaiting) fast = false
  }

  function provideInput(value) {
    if (!pending?.awaiting) return
    advance(String(value))
    takeSnapshot()
    if (fast) {
      while (advance()) { /* continuar la ejecución rápida */ }
      takeSnapshot()
      if (!snapshot.value.awaiting) fast = false
    } else if (playing.value) {
      clearTimeout(timer)
      timer = setTimeout(tick, 60)
    }
  }

  // Si cambia el algoritmo, la ejecución anterior deja de tener sentido.
  watch(() => analysis.value.ast, reset)
  onScopeDispose(stop)

  return { snapshot, presetInputs, playing, canRun, step, play, stop, reset, runToEnd, provideInput }
}
