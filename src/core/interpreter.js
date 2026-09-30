// Intérprete paso a paso. Es un generador: cada `yield` es una parada en un nodo del diagrama,
// de modo que la interfaz puede avanzar, animar o ejecutar de golpe. No usa eval ni Function.
// Cuenta las operaciones con el mismo modelo que el análisis estático (ver cost.js).

import { COST_MODEL } from './cost.js'

export class RuntimeError extends Error {
  constructor(message, line) {
    super(message)
    this.line = line
  }
}

class ReturnSignal {
  constructor(value) {
    this.value = value
  }
}

const MAX_OUTPUT_LINES = 2000
const MAX_STRING = 10000
const MAX_LIST = 1_000_000
const MAX_DEPTH = 800

const WORDS = {
  es: { true: 'VERDADERO', false: 'FALSO', null: 'NULO' },
  en: { true: 'TRUE', false: 'FALSE', null: 'NULL' },
}

export function formatValue(v, lang = 'es', depth = 0) {
  const w = WORDS[lang] ?? WORDS.es
  if (v === null || v === undefined) return w.null
  if (typeof v === 'boolean') return v ? w.true : w.false
  if (typeof v === 'number') {
    if (Number.isInteger(v) || !Number.isFinite(v)) return String(v)
    return String(Number.parseFloat(v.toPrecision(12)))
  }
  if (Array.isArray(v)) {
    if (depth > 3) return '[…]'
    const shown = v.slice(0, 50).map((x) => (typeof x === 'string' ? `"${x}"` : formatValue(x, lang, depth + 1)))
    return `[${shown.join(', ')}${v.length > 50 ? `, … (${v.length} elementos)` : ''}]`
  }
  return String(v)
}

/** Divide por comas de primer nivel (fuera de corchetes y comillas). */
export function splitTopLevel(text, seps = ',') {
  const parts = []
  let depth = 0
  let quoted = false
  let cur = ''
  for (const ch of text) {
    if (ch === '"') quoted = !quoted
    if (!quoted && ch === '[') depth++
    if (!quoted && ch === ']') depth--
    if (!quoted && depth === 0 && seps.includes(ch)) { parts.push(cur); cur = '' } else cur += ch
  }
  parts.push(cur)
  return parts
}

/** Interpreta lo que escribe el usuario en LEER: número, lógico, NULO, lista [ … ], "texto" o texto. */
export function parseInput(raw, depth = 0) {
  const text = String(raw ?? '').trim().slice(0, 20000)
  if (/^[-+]?(\d+\.?\d*|\.\d+)$/.test(text)) return Number(text)
  if (/^(VERDADERO|TRUE)$/.test(text)) return true
  if (/^(FALSO|FALSE)$/.test(text)) return false
  if (/^(NULO|NULL)$/.test(text)) return null
  if (depth < 3 && text.startsWith('[') && text.endsWith(']')) {
    const inner = text.slice(1, -1).trim()
    if (!inner) return []
    return splitTopLevel(inner).slice(0, 10000).map((p) => parseInput(p, depth + 1))
  }
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) return text.slice(1, -1)
  return text
}

const typeName = (v) => (v === null ? 'NULO' : Array.isArray(v) ? 'una lista' : typeof v === 'number' ? 'un número' : typeof v === 'boolean' ? 'un valor lógico' : 'un texto')

export function createRun(ast, options = {}) {
  const maxSteps = options.maxSteps ?? 200_000
  const lang = ast.lang === 'en' ? 'en' : 'es'
  const functions = new Map(ast.functions.map((f) => [f.name, f]))
  const state = {
    frames: [{ name: null, vars: new Map() }],
    ops: 0,
    steps: 0,
    output: [],
    visits: new Map(),
    status: 'ready',
    current: null,
    currentFn: null,
    lastBranch: null,
    error: null,
    changed: null,
    maxDepth: 1,
    calls: 0,
  }
  const frame = () => state.frames.at(-1)

  function visit(id) {
    state.visits.set(id, (state.visits.get(id) ?? 0) + 1)
    state.current = id
    state.currentFn = frame().name
    if (++state.steps > maxSteps) {
      throw new RuntimeError(`Se alcanzó el límite de ${maxSteps.toLocaleString('es')} pasos: probablemente es un bucle infinito o una recursión sin fin.`, null)
    }
  }

  const truthy = (v) => (typeof v === 'boolean' ? v : typeof v === 'number' ? v !== 0 : Array.isArray(v) ? v.length > 0 : v !== '' && v !== null)

  function needNumber(v, what, line) {
    if (typeof v !== 'number') throw new RuntimeError(`${what} necesita un número y recibe ${typeName(v)}.`, line)
    return v
  }

  function checkIndex(list, i, name, line) {
    if (!Array.isArray(list) && typeof list !== 'string') throw new RuntimeError(`"${name}" no es una lista (es ${typeName(list)}), no se puede usar ${name}[…].`, line)
    if (typeof i !== 'number' || !Number.isInteger(i)) throw new RuntimeError(`El índice de ${name} debe ser un número entero (recibe ${formatValue(i, lang)}).`, line)
    if (i < 1 || i > list.length) {
      throw new RuntimeError(`Índice ${i} fuera de ${name}: tiene ${list.length} elementos, los índices van de 1 a ${list.length}.`, line)
    }
    return i - 1
  }

  function* evaluate(e, line) {
    switch (e.k) {
      case 'num': return e.v
      case 'str': return e.v
      case 'bool': return e.v
      case 'null': return null
      case 'var': {
        const vars = frame().vars
        if (!vars.has(e.name)) throw new RuntimeError(`La variable "${e.name}" no tiene valor todavía.`, line)
        return vars.get(e.name)
      }
      case 'neg': {
        const x = yield* evaluate(e.x, line)
        state.ops += COST_MODEL.arith
        return -needNumber(x, 'El cambio de signo', line)
      }
      case 'not': {
        const x = yield* evaluate(e.x, line)
        state.ops += COST_MODEL.logic
        return !truthy(x)
      }
      case 'index': {
        const list = yield* evaluate(e.target, line)
        const i = yield* evaluate(e.index, line)
        state.ops += COST_MODEL.index
        return list[checkIndex(list, i, e.target.src, line)]
      }
      case 'list': {
        const out = []
        for (const item of e.items) out.push(yield* evaluate(item, line))
        state.ops += 1
        return out
      }
      case 'call':
        return e.builtin ? yield* builtin(e, line) : yield* callUser(e, line)
      case 'bin': {
        if (e.op === 'and' || e.op === 'or') {
          const l = truthy(yield* evaluate(e.l, line))
          state.ops += COST_MODEL.logic
          if (e.op === 'and' ? !l : l) return l
          return truthy(yield* evaluate(e.r, line))
        }
        const l = yield* evaluate(e.l, line)
        const r = yield* evaluate(e.r, line)
        state.ops += 1
        switch (e.op) {
          case '+':
            if (typeof l === 'number' && typeof r === 'number') return l + r
            if (typeof l === 'string' || typeof r === 'string') {
              if (Array.isArray(l) || Array.isArray(r)) throw new RuntimeError('No se puede sumar un texto y una lista.', line)
              return (formatValue(l, lang) + formatValue(r, lang)).slice(0, MAX_STRING)
            }
            throw new RuntimeError(`No se puede sumar ${typeName(l)} y ${typeName(r)} (en "${e.src}").`, line)
          case '-': case '*': case '/': case '%': {
            if (typeof l !== 'number' || typeof r !== 'number') {
              throw new RuntimeError(`La operación "${e.op}" solo funciona con números y recibe ${typeName(l)} y ${typeName(r)} (en "${e.src}").`, line)
            }
            if ((e.op === '/' || e.op === '%') && r === 0) throw new RuntimeError(`División entre cero en "${e.src}".`, line)
            if (e.op === '-') return l - r
            if (e.op === '*') return l * r
            if (e.op === '/') return l / r
            return l % r
          }
          case '==': return l === r
          case '!=': return l !== r
          default: {
            const bothNum = typeof l === 'number' && typeof r === 'number'
            const bothStr = typeof l === 'string' && typeof r === 'string'
            if (!bothNum && !bothStr) throw new RuntimeError(`No se puede comparar ${typeName(l)} con ${typeName(r)} usando "${e.op}" (en "${e.src}").`, line)
            if (e.op === '<') return l < r
            if (e.op === '>') return l > r
            if (e.op === '<=') return l <= r
            return l >= r
          }
        }
      }
      default: throw new RuntimeError('Expresión no válida.', line)
    }
  }

  function* builtin(e, line) {
    const a = []
    for (const x of e.args) a.push(yield* evaluate(x, line))
    state.ops += COST_MODEL.builtin
    switch (e.builtin) {
      case 'len':
        if (!Array.isArray(a[0]) && typeof a[0] !== 'string') throw new RuntimeError(`${e.name} necesita una lista o un texto y recibe ${typeName(a[0])}.`, line)
        return a[0].length
      case 'list': {
        const n = needNumber(a[0], e.name, line)
        if (!Number.isInteger(n) || n < 0 || n > MAX_LIST) throw new RuntimeError(`${e.name} necesita un tamaño entero entre 0 y ${MAX_LIST.toLocaleString('es')}.`, line)
        state.ops += n
        return new Array(n).fill(a[1])
      }
      case 'int': return Math.trunc(needNumber(a[0], e.name, line))
      case 'abs': return Math.abs(needNumber(a[0], e.name, line))
      case 'sqrt': {
        const x = needNumber(a[0], e.name, line)
        if (x < 0) throw new RuntimeError(`${e.name} de un número negativo no existe.`, line)
        return Math.sqrt(x)
      }
      case 'max': return Math.max(needNumber(a[0], e.name, line), needNumber(a[1], e.name, line))
      case 'min': return Math.min(needNumber(a[0], e.name, line), needNumber(a[1], e.name, line))
      case 'random': {
        const lo = Math.ceil(needNumber(a[0], e.name, line))
        const hi = Math.floor(needNumber(a[1], e.name, line))
        if (hi < lo) throw new RuntimeError(`${e.name}(a, b) necesita a ≤ b.`, line)
        return lo + Math.floor(Math.random() * (hi - lo + 1))
      }
      default: throw new RuntimeError(`Función desconocida ${e.name}.`, line)
    }
  }

  function* callUser(e, line) {
    const fn = functions.get(e.name)
    if (!fn) throw new RuntimeError(`La función "${e.name}" no está definida.`, line)
    const args = []
    for (const x of e.args) args.push(yield* evaluate(x, line))
    state.ops += COST_MODEL.call
    if (state.frames.length >= MAX_DEPTH) {
      throw new RuntimeError(`Demasiadas llamadas anidadas (${MAX_DEPTH}): ¿falta el caso base de la recursión?`, line)
    }
    state.calls++
    state.frames.push({ name: fn.name, vars: new Map(fn.params.map((p, i) => [p, args[i]])), callLine: line })
    state.maxDepth = Math.max(state.maxDepth, state.frames.length)
    let result = null
    visit(`fstart:${fn.name}`)
    yield { id: `fstart:${fn.name}`, line: fn.line }
    try {
      yield* block(fn.body)
    } catch (err) {
      if (!(err instanceof ReturnSignal)) throw err
      result = err.value
    }
    visit(`fend:${fn.name}`)
    yield { id: `fend:${fn.name}`, line: fn.endLine }
    state.frames.pop()
    state.currentFn = frame().name
    return result
  }

  function setVar(name, value) {
    frame().vars.set(name, value)
    state.changed = { name, index: null }
  }

  function* assignTo(target, value, line) {
    const vars = frame().vars
    if (target.indexes.length === 0) {
      setVar(target.name, value)
      return
    }
    if (!vars.has(target.name)) throw new RuntimeError(`La lista "${target.name}" no existe todavía. Créala antes, por ejemplo con LISTA(n, 0).`, line)
    let list = vars.get(target.name)
    let name = target.name
    for (let k = 0; k < target.indexes.length; k++) {
      const i = yield* evaluate(target.indexes[k], line)
      state.ops += COST_MODEL.index
      if (!Array.isArray(list)) throw new RuntimeError(`"${name}" no es una lista (es ${typeName(list)}).`, line)
      const pos = checkIndex(list, i, name, line)
      if (k === target.indexes.length - 1) {
        list[pos] = value
        state.changed = { name: target.name, index: target.indexes.length === 1 ? pos : null }
      } else {
        list = list[pos]
        name = `${name}[${i}]`
      }
    }
  }

  function print(text) {
    if (state.output.length < MAX_OUTPUT_LINES) state.output.push(text)
    else if (state.output.length === MAX_OUTPUT_LINES) state.output.push('… (salida recortada)')
  }

  function* block(stmts) {
    for (const s of stmts) yield* stmt(s)
  }

  function* stmt(s) {
    state.changed = null
    state.lastBranch = null
    switch (s.type) {
      case 'assign': {
        const value = yield* evaluate(s.expr, s.line)
        yield* assignTo(s.target, value, s.line)
        state.ops += COST_MODEL.assign
        visit(s.id)
        yield s
        break
      }
      case 'print': {
        const parts = []
        for (const a of s.args) {
          const v = yield* evaluate(a, s.line)
          parts.push(formatValue(v, lang))
          state.ops += COST_MODEL.io
        }
        print(parts.join(' '))
        visit(s.id)
        yield s
        break
      }
      case 'read': {
        for (const t of s.targets) {
          visit(s.id)
          state.status = 'input'
          const value = yield { ...s, awaiting: t.src }
          state.status = 'running'
          yield* assignTo(t, parseInput(value), s.line)
          state.ops += COST_MODEL.io
        }
        break
      }
      case 'call': {
        yield* evaluate(s.call, s.line)
        visit(s.id)
        yield s
        break
      }
      case 'return': {
        const value = s.expr ? yield* evaluate(s.expr, s.line) : null
        state.ops += COST_MODEL.ret
        visit(s.id)
        yield s
        throw new ReturnSignal(value)
      }
      case 'if': {
        const ok = truthy(yield* evaluate(s.cond, s.line))
        visit(s.id)
        state.lastBranch = ok ? 'yes' : 'no'
        yield s
        if (ok) yield* block(s.then)
        else if (s.else) yield* block(s.else)
        break
      }
      case 'while': {
        for (;;) {
          const ok = truthy(yield* evaluate(s.cond, s.line))
          visit(s.id)
          state.lastBranch = ok ? 'yes' : 'no'
          yield s
          if (!ok) break
          yield* block(s.body)
        }
        break
      }
      case 'repeat': {
        for (;;) {
          visit(`${s.id}:top`)
          yield* block(s.body)
          const done = truthy(yield* evaluate(s.cond, s.endLine ?? s.line))
          visit(s.id)
          state.lastBranch = done ? 'yes' : 'no'
          yield { ...s, line: s.endLine ?? s.line }
          if (done) break
        }
        break
      }
      case 'for': {
        const from = yield* evaluate(s.from, s.line)
        const to = yield* evaluate(s.to, s.line)
        needNumber(from, 'El valor inicial de PARA', s.line)
        needNumber(to, 'El valor final de PARA', s.line)
        setVar(s.var, from)
        state.ops += COST_MODEL.forInit
        for (;;) {
          const value = frame().vars.get(s.var)
          if (typeof value !== 'number') throw new RuntimeError(`La variable contadora "${s.var}" dejó de ser un número.`, s.line)
          const ok = value <= to
          state.ops += COST_MODEL.compare
          visit(s.id)
          state.lastBranch = ok ? 'yes' : 'no'
          yield s
          if (!ok) break
          yield* block(s.body)
          setVar(s.var, frame().vars.get(s.var) + 1)
          state.ops += COST_MODEL.forStep
        }
        break
      }
      default:
        break
    }
  }

  function* program() {
    try {
      state.status = 'running'
      visit('start')
      yield { id: 'start', line: ast.startLine }
      yield* block(ast.body)
      visit('end')
      state.status = 'done'
      yield { id: 'end', line: ast.endLine }
    } catch (err) {
      if (err instanceof RuntimeError) {
        state.status = 'error'
        state.error = { message: err.message, line: err.line }
      } else if (err instanceof RangeError) {
        state.status = 'error'
        state.error = { message: 'La recursión es demasiado profunda para el navegador.', line: null }
      } else {
        throw err
      }
    }
  }

  return { state, iterator: program() }
}
