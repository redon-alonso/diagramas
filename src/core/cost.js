// Análisis estático del coste: cuenta operaciones elementales y deduce T(n) y su orden.
//
// Modelo de coste (orientativo, el mismo que usa el intérprete al medir):
//   · asignación                              → 1 + operaciones de la expresión
//   · cada + − * / %, comparación, Y, O, NO    → 1
//   · acceso a una lista v[i]                  → 1
//   · MOSTRAR / LEER                           → 1 por valor
//   · función predefinida                      → 1 (LISTA(n, x) cuesta además n)
//   · llamada a una función propia             → 1 + el coste de ejecutarla
//   · RETORNAR                                 → 1 + operaciones de la expresión
//   · PARA: inicialización 1, comprobación 1 por vuelta (+1 final), incremento 2 por vuelta
//   · MIENTRAS / REPETIR: la condición se evalúa en cada comprobación

import { Poly, bigO, bigOWithDifferences, sumOver, mainSymbol, degreeOf, logSymbol, expSymbol, formatSymbol, compareGrowth, growthClass } from './poly.js'
import { walk, walkExpr } from './parser.js'

export const COST_MODEL = Object.freeze({
  assign: 1, arith: 1, compare: 1, logic: 1, index: 1, io: 1, builtin: 1, call: 1, ret: 1, forInit: 1, forStep: 2,
})

const ARITH = new Set(['+', '-', '*', '/', '%'])
const CMP = new Set(['==', '!=', '>', '<', '>=', '<='])
const FLIP = { '<': '>', '>': '<', '<=': '>=', '>=': '<=', '==': '==', '!=': '!=' }
const NEGATE = { '<': '>=', '>': '<=', '<=': '>', '>=': '<', '==': '!=', '!=': '==' }
const SIM_LIMIT = 1_000_000
const PROBE_1 = 1_000_003
const PROBE_2 = 1_000_000_007

const C = (x) => Poly.const(x)
const pc = (x) => ({ w: C(x), b: C(x) })
const padd = (a, b) => ({ w: a.w.add(b.w), b: a.b.add(b.b) })
const isArr = (v) => v != null && v.arr === true

export function exprVars(e, out = new Set()) {
  walkExpr(e, (x) => { if (x.k === 'var') out.add(x.name) })
  return out
}

// ---------------------------------------------------------------------------
// Valores simbólicos de las variables
// ---------------------------------------------------------------------------

/** Longitud simbólica de una lista, o null. */
function lenOf(e, env) {
  if (!e) return null
  if (e.k === 'var') {
    const v = env.get(e.name)
    if (isArr(v) && v.len) return v.len
    return Poly.sym(`len_${e.name}`)
  }
  if (e.k === 'list') return C(e.items.length)
  if (e.k === 'call' && e.builtin === 'list') return toPoly(e.args[0], env)
  return null
}

/** Si la expresión produce una lista, su descripción { arr, len }; si no, null. */
function arrValue(e, env) {
  if (e.k === 'list') return { arr: true, len: C(e.items.length) }
  if (e.k === 'call' && e.builtin === 'list') return { arr: true, len: toPoly(e.args[0], env) }
  if (e.k === 'var' && isArr(env.get(e.name))) return env.get(e.name)
  return null
}

/** Convierte una expresión en polinomio usando los valores conocidos; null si no se puede. */
function toPoly(e, env) {
  if (!e) return null
  switch (e.k) {
    case 'num': return C(e.v)
    case 'var': {
      const v = env.get(e.name)
      if (isArr(v)) return null
      return v ?? Poly.sym(e.name)
    }
    case 'neg': {
      const x = toPoly(e.x, env)
      return x && x.scale(-1)
    }
    case 'call': {
      switch (e.builtin) {
        case 'int':
        case 'abs': return toPoly(e.args[0], env)
        case 'sqrt': return toPoly(e.args[0], env)?.pow(0.5) ?? null
        case 'len': return lenOf(e.args[0], env)
        case 'max':
        case 'min': {
          const a = toPoly(e.args[0], env)?.constValue()
          const b = toPoly(e.args[1], env)?.constValue()
          if (a == null || b == null) return null
          return C(e.builtin === 'max' ? Math.max(a, b) : Math.min(a, b))
        }
        default: return null
      }
    }
    case 'bin': {
      if (!ARITH.has(e.op)) return null
      const l = toPoly(e.l, env)
      const r = toPoly(e.r, env)
      if (!l || !r) return null
      if (e.op === '+') return l.add(r)
      if (e.op === '-') return l.sub(r)
      if (e.op === '*') return l.mul(r)
      const rc = r.constValue()
      const lc = l.constValue()
      if (e.op === '/') {
        if (rc === null || rc === 0) return null
        return lc !== null ? C(lc / rc) : l.scale(1 / rc)
      }
      if (lc === null || rc === null || rc === 0) return null
      return C(lc % rc)
    }
    default: return null
  }
}

/** Evalúa numéricamente una expresión con variables numéricas; null si no se puede. */
function numEval(e, lookup) {
  if (!e) return null
  switch (e.k) {
    case 'num': return e.v
    case 'var': return lookup(e.name)
    case 'neg': {
      const x = numEval(e.x, lookup)
      return x === null ? null : -x
    }
    case 'call': {
      const a = e.args.map((x) => numEval(x, lookup))
      if (a.some((x) => x === null)) return null
      switch (e.builtin) {
        case 'int': return Math.trunc(a[0])
        case 'abs': return Math.abs(a[0])
        case 'sqrt': return a[0] < 0 ? null : Math.sqrt(a[0])
        case 'max': return Math.max(a[0], a[1])
        case 'min': return Math.min(a[0], a[1])
        default: return null
      }
    }
    case 'bin': {
      const l = numEval(e.l, lookup)
      const r = numEval(e.r, lookup)
      if (l === null || r === null) return null
      switch (e.op) {
        case '+': return l + r
        case '-': return l - r
        case '*': return l * r
        case '/': return r === 0 ? null : l / r
        case '%': return r === 0 ? null : l % r
        default: return null
      }
    }
    default: return null
  }
}

function compareNum(a, op, b) {
  switch (op) {
    case '<': return a < b
    case '<=': return a <= b
    case '>': return a > b
    case '>=': return a >= b
    case '==': return a === b
    case '!=': return a !== b
    default: return false
  }
}

const sameValue = (a, b) => a === b || (a instanceof Poly && b instanceof Poly && a.toString() === b.toString())

/** Variables escalares que se asignan en un bloque (las listas modificadas con v[i] = x no cuentan). */
function assignedVars(stmts) {
  const out = new Set()
  walk(stmts, (s) => {
    if (s.type === 'assign' && s.target.indexes.length === 0) out.add(s.target.name)
    else if (s.type === 'read') s.targets.forEach((t) => { if (t.indexes.length === 0) out.add(t.name) })
    else if (s.type === 'for') out.add(s.var)
  })
  return out
}

/** Asignaciones de `v` en un bloque, indicando si alguna está dentro de un bucle anidado. */
function assignmentsOf(stmts, v) {
  const out = []
  let inLoop = false
  let read = false
  const visit = (list, loopDepth) => {
    for (const s of list) {
      if (s.type === 'assign' && s.target.indexes.length === 0 && s.target.name === v) {
        out.push({ stmt: s, topLevel: list === stmts })
        if (loopDepth > 0) inLoop = true
      }
      if (s.type === 'read' && s.targets.some((t) => t.name === v && t.indexes.length === 0)) read = true
      if (s.type === 'for' && s.var === v) read = true
      if (s.type === 'if') { visit(s.then, loopDepth); if (s.else) visit(s.else, loopDepth) }
      if (s.type === 'while' || s.type === 'for' || s.type === 'repeat') visit(s.body, loopDepth + 1)
    }
  }
  visit(stmts, 0)
  return { list: out, inLoop, read }
}

/** ¿Todo camino por el bloque asigna alguna de las variables? */
function everyPathAssigns(stmts, vars) {
  for (const s of stmts) {
    if (s.type === 'assign' && s.target.indexes.length === 0 && vars.has(s.target.name)) return true
    if (s.type === 'if' && s.else && everyPathAssigns(s.then, vars) && everyPathAssigns(s.else, vars)) return true
  }
  return false
}

// ---------------------------------------------------------------------------
// Comparación de costes para el peor / mejor caso
// ---------------------------------------------------------------------------

const probe = (p, n) => p.evaluate(() => n)

function larger(a, b) {
  const cmp = compareGrowth(bigO(a).growth, bigO(b).growth)
  if (cmp !== 0) return cmp > 0 ? a : b
  return probe(a, 1000) >= probe(b, 1000) ? a : b
}

// ---------------------------------------------------------------------------
// Contexto
// ---------------------------------------------------------------------------

class Context {
  constructor(ast) {
    this.warnings = []
    this.notes = []
    this.exact = true
    this.kCount = 0
    this.kSymbols = []
    this.inputs = new Set()
    this.warnedUndefined = new Set()
    this.functions = new Map(ast.functions.filter((f) => !f.broken).map((f) => [f.name, f]))
    this.summaries = new Map()
    this.fnStack = []
    this.recCount = 0
    this.fnLines = []
    this.recurrences = []
  }

  warn(line, message) {
    if (!this.warnings.some((w) => w.line === line && w.message === message)) {
      this.warnings.push({ severity: 'warning', line, message })
    }
  }

  note(line, message) {
    if (!this.notes.some((n) => n.line === line && n.message === message)) this.notes.push({ line, message })
  }

  freshK(line, reason) {
    const name = `k${++this.kCount}`
    this.kSymbols.push({ name, line, reason })
    this.exact = false
    return Poly.sym(name)
  }
}

/** El menor de dos costes (null = ese camino no existe). */
function minP(a, b) {
  if (!a) return b
  if (!b) return a
  return larger(a, b) === a ? b : a
}

// Resultado de analizar una instrucción o bloque:
//   w   coste en el peor caso
//   bc  mejor coste entre los caminos que siguen después (null si todos retornan)
//   br  mejor coste entre los caminos que terminan con RETORNAR (null si ninguno)
//   b   mejor coste total = el menor de bc y br
function emptyResult() {
  return { w: Poly.zero(), bc: Poly.zero(), br: null, b: Poly.zero(), lines: new Map(), returns: 'never' }
}

function addLine(lines, line, count, unit, kind) {
  const prev = lines.get(line)
  if (prev) lines.set(line, { ...prev, count: prev.count.add(count) })
  else lines.set(line, { count, unit, kind })
}

/** Transforma los contadores por línea aplicando una función (sumatorio o producto). */
function mapLines(lines, fn) {
  const out = new Map()
  for (const [line, info] of lines) out.set(line, { ...info, count: fn(info.count) })
  return out
}

function mergeLines(target, source) {
  for (const [line, info] of source) addLine(target, line, info.count, info.unit, info.kind)
}

function checkDefined(exprs, defined, ctx, line) {
  for (const expr of exprs) {
    for (const v of exprVars(expr)) {
      const key = `${ctx.fnStack.at(-1)?.name ?? ''}:${v}`
      if (!defined.has(v) && !ctx.warnedUndefined.has(key)) {
        ctx.warnedUndefined.add(key)
        ctx.warn(line, `La variable "${v}" se usa sin haberle dado un valor antes. Para el coste se trata como un dato de entrada; al ejecutar dará error.`)
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Coste de las expresiones
// ---------------------------------------------------------------------------

function exprCost(e, env, ctx, line) {
  if (!e) return pc(0)
  switch (e.k) {
    case 'num': case 'str': case 'bool': case 'null': case 'var':
      return pc(0)
    case 'neg':
    case 'not':
      return padd(pc(1), exprCost(e.x, env, ctx, line))
    case 'bin':
      return padd(pc(1), padd(exprCost(e.l, env, ctx, line), exprCost(e.r, env, ctx, line)))
    case 'index':
      return padd(pc(COST_MODEL.index), padd(exprCost(e.target, env, ctx, line), exprCost(e.index, env, ctx, line)))
    case 'list':
      return e.items.reduce((acc, x) => padd(acc, exprCost(x, env, ctx, line)), pc(1))
    case 'call': {
      let cost = e.args.reduce((acc, x) => padd(acc, exprCost(x, env, ctx, line)), pc(0))
      if (e.builtin) {
        cost = padd(cost, pc(COST_MODEL.builtin))
        if (e.builtin === 'list') {
          const n = toPoly(e.args[0], env) ?? ctx.freshK(line, 'tamaño de la lista creada con LISTA')
          cost = padd(cost, { w: n, b: n })
        }
        return cost
      }
      return padd(cost, callCost(e, env, ctx, line))
    }
    default:
      return pc(0)
  }
}

function argInfo(a, env) {
  return { poly: toPoly(a, env), varName: a.k === 'var' ? a.name : null, isList: !!arrValue(a, env) }
}

function callCost(e, env, ctx, line) {
  const top = ctx.fnStack.at(-1)
  if (top && top.name === e.name) {
    const sym = `__rec${ctx.recCount++}`
    top.recCalls.push({ sym, args: e.args.map((a) => argInfo(a, env)), line })
    const w = C(COST_MODEL.call).add(Poly.sym(sym))
    return { w, b: w }
  }
  if (ctx.fnStack.some((f) => f.name === e.name)) {
    ctx.warn(line, `"${e.name}" y otra función se llaman entre sí (recursión cruzada): su coste no se puede calcular automáticamente.`)
    const k = ctx.freshK(line, `coste de la llamada a ${e.name}`)
    return { w: k.add(C(1)), b: k.add(C(1)) }
  }
  const summary = summarize(e.name, ctx)
  if (!summary) return pc(COST_MODEL.call)
  const w = applySummary(summary, summary.worst, e, env, ctx, line)
  const b = applySummary(summary, summary.best, e, env, ctx, line)
  return { w: C(COST_MODEL.call).add(w), b: C(COST_MODEL.call).add(b) }
}

/** Traduce el coste de una función (en función de sus parámetros) al punto de la llamada. */
function applySummary(summary, poly, call, env, ctx, line) {
  let p = poly
  const params = summary.params
  if (summary.recursive) {
    const m = summary.recursive
    const measure = m.kind === 'single'
      ? toPoly(call.args[m.i], env)
      : (() => {
        const hi = toPoly(call.args[m.b], env)
        const lo = toPoly(call.args[m.a], env)
        return hi && lo ? hi.sub(lo) : null
      })()
    p = p.substitute('__m', measure ?? ctx.freshK(line, `tamaño del problema en la llamada a ${call.name}`))
  }
  params.forEach((name, i) => {
    if (p.hasSymbol(name)) p = p.substitute(name, Poly.sym(`__t${i}`))
    if (p.hasSymbol(`len_${name}`)) p = p.substitute(`len_${name}`, Poly.sym(`__l${i}`))
  })
  params.forEach((name, i) => {
    if (p.hasSymbol(`__t${i}`)) {
      const v = toPoly(call.args[i], env) ?? ctx.freshK(line, `valor de "${name}" en la llamada a ${call.name}`)
      p = p.substitute(`__t${i}`, v)
    }
    if (p.hasSymbol(`__l${i}`)) {
      const v = lenOf(call.args[i], env) ?? ctx.freshK(line, `longitud de "${name}" en la llamada a ${call.name}`)
      p = p.substitute(`__l${i}`, v)
    }
  })
  return p
}

// ---------------------------------------------------------------------------
// Funciones y recursión
// ---------------------------------------------------------------------------

function summarize(name, ctx) {
  if (ctx.summaries.has(name)) return ctx.summaries.get(name)
  const fn = ctx.functions.get(name)
  if (!fn) return null
  const env = new Map(fn.params.map((p) => [p, Poly.sym(p)]))
  const defined = new Set(fn.params)
  ctx.fnStack.push({ name, recCalls: [] })
  const r = analyzeBlock(fn.body, env, defined, ctx)
  const frame = ctx.fnStack.pop()

  let summary
  if (frame.recCalls.length === 0) {
    summary = { params: fn.params, worst: r.w, best: r.b, recursive: null }
  } else {
    summary = solveRecursion(fn, r, frame, ctx)
  }
  // En el desglose por línea, cada llamada recursiva cuenta como una llamada (coste 1).
  const lines = new Map()
  for (const [line, info] of r.lines) {
    let unit = info.unit
    for (const c of frame.recCalls) if (unit.hasSymbol(c.sym)) unit = unit.substitute(c.sym, C(0))
    lines.set(line, { ...info, unit })
  }
  let shownWorst = summary.worst
  let shownBest = summary.best
  if (summary.recursive) {
    const m = summary.recursive
    const size = m.kind === 'single' ? Poly.sym(fn.params[m.i]) : Poly.sym('n')
    shownWorst = shownWorst.substitute('__m', size)
    shownBest = shownBest.substitute('__m', size)
  }
  ctx.fnLines.push({
    name,
    line: fn.line,
    params: fn.params,
    lines,
    recurrence: summary.recurrence ?? null,
    worst: shownWorst,
    bigO: bigOWithDifferences(shownWorst).text,
    bigOmega: bigOWithDifferences(shownBest).text,
    growthClass: growthClass(bigO(shownWorst).growth),
  })
  ctx.summaries.set(name, summary)
  return summary
}

/** Clasifica cómo reduce el tamaño una llamada recursiva: resta (n − d) o división (n / b). */
function classifyReduction(newMeasure, evalAt) {
  const n1 = evalAt(newMeasure, PROBE_1)
  const n2 = evalAt(newMeasure, PROBE_2)
  if (!Number.isFinite(n1) || !Number.isFinite(n2)) return null
  const d1 = PROBE_1 - n1
  const d2 = PROBE_2 - n2
  if (Math.abs(d1 - d2) < 1e-6 * Math.max(1, Math.abs(d1)) && Math.abs(d1) > 1e-9) {
    return { type: 'sub', d: Math.round(d1 * 1000) / 1000 }
  }
  const r1 = n1 / PROBE_1
  const r2 = n2 / PROBE_2
  if (Math.abs(r1 - r2) < 1e-3 && r1 > 0) return { type: 'div', b: Math.round((1 / r1) * 1000) / 1000 }
  return null
}

/** ¿Alguna condición depende de datos (listas, otros parámetros) y no solo del tamaño? */
function decisionsDependOnData(body, sizeVars) {
  const derived = new Set(sizeVars)
  let depends = false
  walk(body, (s) => {
    if (s.type === 'assign' && s.target.indexes.length === 0) {
      let pure = true
      walkExpr(s.expr, (x) => {
        if (x.k === 'index' || (x.k === 'call' && !['int', 'abs'].includes(x.builtin)) || (x.k === 'var' && !derived.has(x.name))) pure = false
      })
      if (pure) derived.add(s.target.name)
    }
    if (s.type === 'if' || s.type === 'while' || s.type === 'repeat') {
      walkExpr(s.cond, (x) => {
        if (x.k === 'index' || (x.k === 'call' && !x.builtin) || (x.k === 'var' && !derived.has(x.name))) depends = true
      })
    }
  })
  return depends
}

function solveRecursion(fn, r, frame, ctx) {
  const params = fn.params
  const fail = (message) => {
    ctx.warn(fn.line, `No se puede resolver el coste de la recursión de "${fn.name}": ${message}`)
    const k = ctx.freshK(fn.line, `coste de cada llamada a ${fn.name} (recursión no resuelta)`)
    return { params, worst: k, best: k, recursive: null }
  }

  // ¿Qué parámetros cambian de una llamada a la siguiente?
  const changed = new Set()
  for (const call of frame.recCalls) {
    call.args.forEach((info, i) => {
      if (info.varName === params[i]) return
      if (info.poly && info.poly.toString() === params[i]) return
      changed.add(i)
    })
  }
  const idx = [...changed].sort((a, b) => a - b)
  if (idx.length === 0) return fail('los parámetros no cambian en la llamada recursiva, así que no termina nunca.')
  if (idx.some((i) => frame.recCalls.some((c) => !c.args[i].poly))) {
    return fail('el tamaño del problema en la llamada recursiva no es un número calculable (¿se pasa una lista distinta?).')
  }

  let measure
  let newMeasure
  let evalAt
  let measureName
  if (idx.length === 1) {
    const p = params[idx[0]]
    measure = { kind: 'single', i: idx[0] }
    newMeasure = (c) => c.args[idx[0]].poly
    evalAt = (poly, M) => poly.evaluate((s) => (s === p ? M : 1))
    measureName = p
  } else if (idx.length === 2) {
    const [a, b] = idx
    measure = { kind: 'pair', a, b }
    newMeasure = (c) => c.args[b].poly.sub(c.args[a].poly)
    evalAt = (poly, M) => poly.evaluate((s) => (s === params[a] ? 0 : s === params[b] ? M : 1))
    measureName = `${params[b]} − ${params[a]}`
  } else {
    return fail('cambian más de dos parámetros a la vez.')
  }

  const reductions = new Map()
  for (const call of frame.recCalls) {
    const red = classifyReduction(newMeasure(call), evalAt)
    if (!red || (red.type === 'sub' && red.d <= 0) || (red.type === 'div' && red.b <= 1)) {
      return fail(`la llamada de la línea ${call.line} no reduce el tamaño del problema (${measureName}).`)
    }
    reductions.set(call.sym, red)
  }

  /** Separa T = f + Σ a·T(llamada) y expresa f en función del tamaño (__m). */
  function extract(poly) {
    let f = poly
    const calls = []
    for (const call of frame.recCalls) {
      const co = f.coeffsIn(call.sym)
      if (!co || co.length > 2) return { error: 'hay llamadas recursivas anidadas dentro de otras.' }
      const a = co[1] ? co[1].constValue() : 0
      if (a === null) return { error: 'hay llamadas recursivas dentro de un bucle, así que su número depende del tamaño.' }
      if (a) calls.push({ ...reductions.get(call.sym), a })
      f = co[0] ?? Poly.zero()
    }
    const M = Poly.sym('__m')
    if (measure.kind === 'single') f = f.substitute(params[measure.i], M)
    else f = f.substitute(params[measure.b], Poly.sym(params[measure.a]).add(M)).substitute(params[measure.a], C(0))
    return { f, calls }
  }

  function solve({ f, calls }) {
    if (calls.length === 0) return { T: f }
    const f1 = Math.max(1, f.evaluate(() => 1))
    if (calls.every((c) => c.type === 'sub')) {
      const a = calls.reduce((acc, c) => acc + c.a, 0)
      if (a === 1) {
        const d = calls[0].d
        const T = sumOver(f.substitute('__m', Poly.sym('__j')), '__j', C(1), Poly.sym('__m')).poly.scale(1 / d)
        return { T, text: `T(n) = T(n − ${d}) + ${bigO(f).text === '1' ? 'c' : `O(${bigO(f).text.replaceAll('__m', 'n')})`}` }
      }
      // a llamadas que restan: crecimiento r^n con Σ a·r^(−d) = 1
      const g = (x) => calls.reduce((acc, c) => acc + c.a * x ** -c.d, 0) - 1
      let lo = 1
      let hi = a + 1
      for (let i = 0; i < 80; i++) {
        const mid = (lo + hi) / 2
        if (g(mid) > 0) lo = mid
        else hi = mid
      }
      const root = (lo + hi) / 2
      const terms = calls.map((c) => `${c.a > 1 ? c.a + '·' : ''}T(n − ${c.d})`).join(' + ')
      return { T: Poly.sym(expSymbol(root, '__m')).scale(f1), text: `T(n) = ${terms} + c → crece como ${String(Math.round(root * 1000) / 1000).replace('.', ',')}ⁿ` }
    }
    if (calls.every((c) => c.type === 'div') && calls.every((c) => Math.abs(c.b - calls[0].b) < 0.02)) {
      const a = calls.reduce((acc, c) => acc + c.a, 0)
      const b = calls[0].b
      const [x, p] = bigO(f).growth
      if (x > 0) return null
      const crit = Math.log(a) / Math.log(b)
      const fText = bigO(f).text === '1' ? 'c' : `O(${bigO(f).text.replaceAll('__m', 'n')})`
      const text = `T(n) = ${a > 1 ? a + '·' : ''}T(n/${b}) + ${fText}`
      if (p > crit + 1e-6) return { T: f.scale(1 / (1 - a / b ** p)), text: `${text} → domina el trabajo de cada llamada` }
      if (Math.abs(p - crit) < 1e-6) return { T: f.mul(Poly.sym(logSymbol(b, '__m'))).add(f), text: `${text} → ${a > 1 ? 'se reparte en' : 'se repite'} log n niveles` }
      const q = Math.round(crit * 1000) / 1000
      return { T: (Poly.sym('__m').pow(q) ?? Poly.sym('__m')).scale(f1), text: `${text} → dominan las llamadas (n^${String(q).replace('.', ',')})` }
    }
    return null
  }

  const worstParts = extract(r.w)
  if (worstParts.error) return fail(worstParts.error)
  const worst = solve(worstParts)
  if (!worst) return fail('el patrón de llamadas no es de los que se pueden resolver (restar o dividir siempre igual).')
  // Si todas las decisiones dependen solo del tamaño (como "n <= 1"), el caso base no se puede
  // elegir con una entrada favorable: el mejor caso coincide con el peor.
  const measureParams = new Set(idx.map((i) => params[i]))
  const dataDependent = decisionsDependOnData(fn.body, measureParams)
  const bestParts = dataDependent ? extract(r.b) : worstParts
  const best = bestParts.error ? null : solve(bestParts)

  ctx.exact = false
  const recurrence = `${worst.text}${idx.length === 2 ? ` (n = ${measureName})` : measureName !== 'n' ? ` (n = ${measureName})` : ''}`
  ctx.note(fn.line, `Recursión de "${fn.name}": ${recurrence}. Coste aproximado.`)
  ctx.recurrences.push({ name: fn.name, line: fn.line, text: recurrence })
  return { params, worst: worst.T, best: best?.T ?? worst.T, recursive: measure, recurrence }
}

// ---------------------------------------------------------------------------
// Instrucciones
// ---------------------------------------------------------------------------

function analyzeBlock(stmts, env, defined, ctx) {
  const out = emptyResult()
  let warned = false
  let acc = Poly.zero()
  for (const s of stmts) {
    if (out.returns === 'always') {
      if (!warned) ctx.warn(s.line, 'Esta línea nunca se ejecuta: hay un RETORNAR antes en el mismo bloque.')
      warned = true
      continue
    }
    const r = analyzeStmt(s, env, defined, ctx)
    out.w = out.w.add(r.w)
    if (acc && r.br) out.br = minP(out.br, acc.add(r.br))
    acc = acc && r.bc ? acc.add(r.bc) : null
    mergeLines(out.lines, r.lines)
    if (r.returns === 'always') out.returns = 'always'
    else if (r.returns === 'may' && out.returns === 'never') out.returns = 'may'
  }
  out.bc = acc
  out.b = minP(out.bc, out.br) ?? out.w
  return out
}

function simple(s, cost, kind, returns = false) {
  return {
    w: cost.w,
    bc: returns ? null : cost.b,
    br: returns ? cost.b : null,
    b: cost.b,
    lines: new Map([[s.line, { count: C(1), unit: cost.w, kind }]]),
    returns: returns ? 'always' : 'never',
  }
}

function analyzeStmt(s, env, defined, ctx) {
  switch (s.type) {
    case 'assign': {
      const t = s.target
      checkDefined([s.expr, ...t.indexes], defined, ctx, s.line)
      if (t.indexes.length) checkDefined([{ k: 'var', name: t.name }], defined, ctx, s.line)
      let cost = padd(pc(COST_MODEL.assign), exprCost(s.expr, env, ctx, s.line))
      for (const ix of t.indexes) cost = padd(cost, padd(pc(COST_MODEL.index), exprCost(ix, env, ctx, s.line)))
      if (t.indexes.length === 0) {
        env.set(t.name, arrValue(s.expr, env) ?? toPoly(s.expr, env))
        env.delete(`@up:${t.name}`)
        env.delete(`@down:${t.name}`)
        defined.add(t.name)
      }
      return simple(s, cost, 'process')
    }
    case 'print': {
      checkDefined(s.args, defined, ctx, s.line)
      const cost = s.args.reduce((acc, a) => padd(acc, padd(pc(COST_MODEL.io), exprCost(a, env, ctx, s.line))), pc(0))
      return simple(s, cost, 'io')
    }
    case 'read': {
      let cost = pc(0)
      for (const t of s.targets) {
        cost = padd(cost, pc(COST_MODEL.io))
        for (const ix of t.indexes) cost = padd(cost, padd(pc(COST_MODEL.index), exprCost(ix, env, ctx, s.line)))
        if (t.indexes.length === 0) {
          env.set(t.name, Poly.sym(t.name))
          defined.add(t.name)
          ctx.inputs.add(t.name)
        }
      }
      return simple(s, cost, 'io')
    }
    case 'call': {
      checkDefined([s.call], defined, ctx, s.line)
      return simple(s, exprCost(s.call, env, ctx, s.line), 'call')
    }
    case 'return': {
      if (s.expr) checkDefined([s.expr], defined, ctx, s.line)
      const cost = padd(pc(COST_MODEL.ret), exprCost(s.expr, env, ctx, s.line))
      return simple(s, cost, 'terminator', true)
    }
    case 'if': return analyzeIf(s, env, defined, ctx)
    case 'for': return analyzeFor(s, env, defined, ctx)
    case 'while': return analyzeWhile(s, env, defined, ctx)
    case 'repeat': return analyzeRepeat(s, env, defined, ctx)
    default: return emptyResult()
  }
}

function analyzeIf(s, env, defined, ctx) {
  checkDefined([s.cond], defined, ctx, s.line)
  const cond = exprCost(s.cond, env, ctx, s.line)
  const envThen = new Map(env)
  const envElse = new Map(env)
  const defThen = new Set(defined)
  const defElse = new Set(defined)
  const a = analyzeBlock(s.then, envThen, defThen, ctx)
  const b = s.else ? analyzeBlock(s.else, envElse, defElse, ctx) : emptyResult()
  // Tras el SI, una variable conserva su valor solo si coincide en ambas ramas
  // (una rama que siempre retorna no llega hasta aquí).
  const reach = [a.returns !== 'always' && envThen, b.returns !== 'always' && envElse].filter(Boolean)
  for (const key of new Set([...envThen.keys(), ...envElse.keys()])) {
    const vals = reach.map((e) => e.get(key))
    if (vals.length === 0) continue
    env.set(key, vals.every((v) => sameValue(v, vals[0])) ? vals[0] : key.startsWith('@') ? undefined : null)
    if (env.get(key) === undefined) env.delete(key)
  }
  for (const v of [...defThen, ...defElse]) defined.add(v)

  const lines = new Map([[s.line, { count: C(1), unit: cond.w, kind: 'decision' }]])
  mergeLines(lines, a.lines)
  mergeLines(lines, b.lines)
  const worstBranch = larger(a.w, b.w) === a.w ? a : b
  if (a.w.toString() !== b.w.toString() && (!a.w.isZero() || !b.w.isZero())) {
    ctx.note(s.line, `Peor caso del SI: rama ${worstBranch === a ? 'SÍ' : 'NO'}.`)
  }
  const returns = a.returns === 'always' && b.returns === 'always' ? 'always' : a.returns !== 'never' || b.returns !== 'never' ? 'may' : 'never'
  const bcBranch = minP(a.bc, b.bc)
  const brBranch = minP(a.br, b.br)
  const bc = bcBranch && cond.b.add(bcBranch)
  const br = brBranch && cond.b.add(brBranch)
  return { w: cond.w.add(worstBranch.w), bc, br, b: minP(bc, br), lines, returns }
}

/** Prepara el entorno del cuerpo de un bucle: lo que cambia dentro deja de ser conocido. */
function loopBodyEnv(env, body) {
  const bodyEnv = new Map(env)
  for (const v of assignedVars(body)) bodyEnv.set(v, null)
  return bodyEnv
}

/** Paso constante de una asignación v = v + c (o null). */
function stepOf(f, v, env) {
  const fEnv = new Map(env)
  fEnv.set(v, Poly.sym(v))
  const fp = toPoly(f, fEnv)
  if (fp) {
    const co = fp.coeffsIn(v)
    const c0 = co?.[0]?.constValue()
    if (co && co.length === 2 && co[1].constValue() === 1 && c0 !== null && c0 !== 0) return c0
  }
  const lookup = (name) => (name === v ? null : (env.get(name) instanceof Poly ? env.get(name).constValue() : null))
  const y1 = numEval(f, (name) => (name === v ? PROBE_1 : lookup(name)))
  const y2 = numEval(f, (name) => (name === v ? PROBE_2 : lookup(name)))
  if (y1 === null || y2 === null) return null
  const d1 = y1 - PROBE_1
  const d2 = y2 - PROBE_2
  return d1 !== 0 && Math.abs(d1 - d2) < 1e-6 * Math.max(1, Math.abs(d1)) ? d1 : null
}

function afterLoopEnv(env, body, finals = {}) {
  for (const v of assignedVars(body)) {
    const before = env.get(v)
    const { list, read } = assignmentsOf(body, v)
    const steps = read ? [null] : list.map((a) => stepOf(a.stmt.expr, v, env))
    const up = steps.length > 0 && steps.every((c) => c !== null && c > 0)
    const down = steps.length > 0 && steps.every((c) => c !== null && c < 0)
    const bound = before instanceof Poly ? before : env.get(`@${up ? 'up' : 'down'}:${v}`)
    env.delete(`@up:${v}`)
    env.delete(`@down:${v}`)
    if ((up || down) && bound instanceof Poly) env.set(`@${up ? 'up' : 'down'}:${v}`, bound)
    env.set(v, null)
  }
  for (const [k, v] of Object.entries(finals)) if (v) env.set(k, v)
}

function negateCond(e) {
  if (!e) return e
  if (e.k === 'bin' && CMP.has(e.op)) return { ...e, op: NEGATE[e.op] }
  if (e.k === 'bin' && (e.op === 'and' || e.op === 'or')) {
    return { ...e, op: e.op === 'and' ? 'or' : 'and', l: negateCond(e.l), r: negateCond(e.r) }
  }
  if (e.k === 'not') return e.x
  return { k: 'not', x: e, src: e.src }
}

/**
 * Intenta deducir cuántas vueltas da un bucle cuya condición de continuar es `cond`.
 * Devuelve { iters, exact, v?, range?, bound?, finals, maybeZero? } o null.
 */
function inferSingle(cond, body, env, ctx, line) {
  if (!cond || cond.k !== 'bin' || !CMP.has(cond.op)) return null
  const assignedAll = assignedVars(body)
  for (const v of exprVars(cond)) {
    if (!assignedAll.has(v)) continue
    let op
    let B
    if (cond.l.k === 'var' && cond.l.name === v && !exprVars(cond.r).has(v)) { op = cond.op; B = cond.r }
    else if (cond.r.k === 'var' && cond.r.name === v && !exprVars(cond.l).has(v)) { op = FLIP[cond.op]; B = cond.l }
    else continue
    if ([...exprVars(B)].some((x) => assignedAll.has(x))) continue
    const { list, inLoop, read } = assignmentsOf(body, v)
    if (inLoop || read || list.length === 0) continue
    const lookup = (name) => (name === v ? null : (env.get(name) instanceof Poly ? env.get(name).constValue() : null))
    const Bp = toPoly(B, env)
    const single = list.length === 1 && list[0].topLevel ? list[0].stmt.expr : null
    if (single && [...exprVars(single)].some((x) => x !== v && assignedAll.has(x))) continue

    // Valor inicial (o cota, si la variable ya se movió en un bucle anterior en el mismo sentido).
    let v0 = env.get(v)
    let fromBound = false
    if (isArr(v0)) continue
    if (!(v0 instanceof Poly)) {
      const upB = env.get(`@up:${v}`)
      const downB = env.get(`@down:${v}`)
      if (upB || downB) { v0 = upB ?? downB; fromBound = true } else if (!env.has(v)) continue
      else v0 = Poly.sym(v)
    }

    // Caso 1: todo numérico y una sola asignación directa → se simula exactamente.
    const v0c = v0.constValue()
    const bc = Bp?.constValue() ?? null
    if (single && !fromBound && v0c !== null && bc !== null) {
      let x = v0c
      let n = 0
      let ok = true
      while (compareNum(x, op, bc)) {
        const next = numEval(single, (name) => (name === v ? x : lookup(name)))
        if (next === null || !Number.isFinite(next)) { ok = false; break }
        x = next
        if (++n >= SIM_LIMIT) {
          ctx.warn(line, `El bucle supera ${SIM_LIMIT.toLocaleString('es')} vueltas: probablemente no termina nunca.`)
          return { iters: C(n), exact: false, finals: {} }
        }
      }
      if (ok) {
        ctx.note(line, `Vueltas calculadas simulando el bucle: ${n}.`)
        return { iters: C(n), exact: true, v, finals: { [v]: C(x) } }
      }
    }
    if (!Bp) continue

    // Caso 2: simbólico. ¿Cómo cambia v en cada vuelta?
    let step = null
    let ratio = null
    let approx = fromBound
    if (single) {
      step = stepOf(single, v, env)
      if (step === null) {
        const fEnv = new Map(env)
        fEnv.set(v, Poly.sym(v))
        const fp = toPoly(single, fEnv)
        const co = fp?.coeffsIn(v)
        const c0 = co?.[0]?.constValue()
        const c1 = co?.[1]?.constValue()
        if (co && co.length === 2 && c0 === 0 && c1 !== null && c1 > 0 && c1 !== 1) ratio = c1
        else {
          const y1 = numEval(single, (name) => (name === v ? PROBE_1 : lookup(name)))
          const y2 = numEval(single, (name) => (name === v ? PROBE_2 : lookup(name)))
          if (y1 !== null && y2 !== null) {
            const r1 = y1 / PROBE_1
            if (r1 > 0 && Math.abs(r1 - 1) > 1e-3 && Math.abs(r1 - y2 / PROBE_2) < 1e-3) ratio = r1
          }
        }
      }
    } else {
      // Varias asignaciones (p. ej. en ramas de un SI): todas deben avanzar en el mismo sentido
      // y todo camino por el cuerpo debe hacer avanzar la variable.
      const steps = list.map((a) => stepOf(a.stmt.expr, v, env))
      if (steps.some((c) => c === null) || !(steps.every((c) => c > 0) || steps.every((c) => c < 0))) continue
      if (!everyPathAssigns(body, new Set([v]))) continue
      step = steps.reduce((m, c) => (Math.abs(c) < Math.abs(m) ? c : m))
      approx = true
    }

    const incl = op === '<=' || op === '>='
    if (step !== null) {
      const up = step > 0
      if ((up && (op === '>' || op === '>=')) || (!up && (op === '<' || op === '<='))) {
        ctx.warn(line, `"${v}" ${up ? 'crece' : 'decrece'} en cada vuelta, pero la condición necesita lo contrario para terminar: posible bucle infinito.`)
        continue
      }
      if (op === '==') continue
      const dist = up ? Bp.sub(v0) : v0.sub(Bp)
      let iters = dist.scale(1 / Math.abs(step))
      if (incl) iters = iters.add(C(1))
      const exact = Math.abs(step) === 1 && !approx
      if (Math.abs(step) !== 1) ctx.note(line, `Paso de ${Math.abs(step)} por vuelta: el número de vueltas es aproximado (se ignora el redondeo).`)
      let range = null
      if (exact) {
        const lastUp = incl ? Bp : Bp.sub(C(1))
        const lastDown = incl ? Bp : Bp.add(C(1))
        range = up ? { from: v0, to: lastUp } : { from: lastDown, to: v0 }
      }
      const finalV = exact ? (up ? (incl ? Bp.add(C(1)) : Bp) : (incl ? Bp.sub(C(1)) : Bp)) : null
      return { iters, exact, v, range, bound: up ? Bp : v0, finals: { [v]: finalV } }
    }
    if (ratio !== null) {
      const up = ratio > 1
      const base = up ? ratio : 1 / ratio
      const target = up ? Bp : v0
      const sym = mainSymbol(target)
      if ((up && !['<', '<=', '!='].includes(op)) || (!up && !['>', '>=', '!='].includes(op))) {
        ctx.warn(line, `"${v}" ${up ? 'crece' : 'decrece'} en cada vuelta, pero la condición necesita lo contrario para terminar: posible bucle infinito.`)
        continue
      }
      if (!sym) continue
      const iters = Poly.sym(logSymbol(base, sym)).scale(degreeOf(target, sym)).add(C(1))
      ctx.note(line, `"${v}" se ${up ? 'multiplica' : 'divide'} por ${Math.round(base * 1000) / 1000} en cada vuelta: unas ${formatSymbol(logSymbol(base, sym))} vueltas (aproximado).`)
      return { iters, exact: false, v, bound: up ? Bp : v0, finals: {} }
    }
  }
  return null
}

/** Bucles con varias condiciones unidas por Y (como el de mezclar dos listas). */
function inferAnd(cond, body, env, ctx, line) {
  const parts = []
  const flatten = (e) => {
    if (e?.k === 'bin' && e.op === 'and') { flatten(e.l); flatten(e.r) } else parts.push(e)
  }
  flatten(cond)
  const results = parts.map((p) => inferSingle(p, body, env, ctx, line))
  const ok = results.filter(Boolean)
  const maybeZero = results.some((r) => !r)
  if (ok.length) {
    // La vuelta termina en cuanto falla una condición: vale la cota más pequeña.
    const best = ok.reduce((m, r) => (larger(m.iters, r.iters) === m.iters ? r : m))
    return { ...best, exact: best.exact && ok.length === parts.length && ok.length === 1, maybeZero, finals: ok.length === parts.length ? best.finals : {} }
  }
  // Patrón "mezcla": cada vuelta avanza al menos una variable de las condiciones.
  const ranges = []
  const vars = new Set()
  for (const p of parts) {
    if (!p || p.k !== 'bin' || !CMP.has(p.op)) return null
    const side = p.l.k === 'var' ? { v: p.l.name, op: p.op, B: p.r } : p.r.k === 'var' ? { v: p.r.name, op: FLIP[p.op], B: p.l } : null
    if (!side || !['<', '<='].includes(side.op)) return null
    const { list, inLoop, read } = assignmentsOf(body, side.v)
    if (inLoop || read || list.length === 0) return null
    const steps = list.map((a) => stepOf(a.stmt.expr, side.v, env))
    if (!steps.every((c) => c !== null && c > 0)) return null
    const v0 = env.get(side.v) instanceof Poly ? env.get(side.v) : env.get(`@up:${side.v}`)
    const Bp = toPoly(side.B, env)
    if (!(v0 instanceof Poly) || !Bp) return null
    ranges.push(Bp.sub(v0).add(C(side.op === '<=' ? 1 : 0)).scale(1 / Math.min(...steps)))
    vars.add(side.v)
  }
  if (!everyPathAssigns(body, vars)) return null
  ctx.note(line, 'Cada vuelta avanza al menos una de las variables de la condición: como mucho tantas vueltas como la suma de sus recorridos.')
  return { iters: ranges.reduce((a, b) => a.add(b)), exact: false, maybeZero: false, finals: {} }
}

/** Valor de una condición que no depende de ninguna variable, o null. */
function constTruth(e) {
  if (!e) return null
  if (e.k === 'bool') return e.v
  if (e.k === 'not') {
    const x = constTruth(e.x)
    return x === null ? null : !x
  }
  if (e.k === 'bin' && (e.op === 'and' || e.op === 'or')) {
    const l = constTruth(e.l)
    const r = constTruth(e.r)
    if (l === null || r === null) return null
    return e.op === 'and' ? l && r : l || r
  }
  if (e.k === 'bin' && CMP.has(e.op)) {
    const l = numEval(e.l, () => null)
    const r = numEval(e.r, () => null)
    return l === null || r === null ? null : compareNum(l, e.op, r)
  }
  return null
}

function inferIterations(cond, body, env, ctx, line) {
  const constant = constTruth(cond)
  if (constant === true) {
    const k = ctx.freshK(line, 'vueltas del bucle (la condición siempre se cumple)')
    ctx.warn(line, `La condición siempre se cumple: el bucle no termina nunca, salvo que salga con RETORNAR desde una función. Se usa ${k} para el número de vueltas.`)
    return { iters: k, exact: false, finals: {} }
  }
  if (constant === false) {
    ctx.note(line, 'La condición nunca se cumple: el cuerpo del bucle no se ejecuta.')
    return { iters: C(0), exact: true, finals: {} }
  }
  const unknown = (msg) => {
    const k = ctx.freshK(line, 'vueltas del bucle (no se pueden deducir)')
    ctx.warn(line, `${msg} El número de vueltas se representa como ${k}.`)
    return { iters: k, exact: false, finals: {} }
  }
  if (!cond) return unknown('La condición no es válida.')
  const condVars = exprVars(cond)
  const assignedAll = assignedVars(body)
  const touchesCalls = (() => { let found = false; walkExpr(cond, (x) => { if (x.k === 'call' && !x.builtin) found = true }); return found })()
  if (![...condVars].some((v) => assignedAll.has(v)) && !touchesCalls) {
    const k = ctx.freshK(line, 'vueltas del bucle (su condición no cambia)')
    ctx.warn(line, `Ninguna variable de la condición cambia dentro del bucle: si la condición se cumple una vez, el bucle no termina nunca. Se usa ${k} para el número de vueltas.`)
    return { iters: k, exact: false, finals: {} }
  }
  let r = null
  if (cond.k === 'bin' && cond.op === 'and') r = inferAnd(cond, body, env, ctx, line)
  else if (cond.k === 'bin' && cond.op === 'or') {
    const a = inferSingle(cond.l, body, env, ctx, line)
    const b = inferSingle(cond.r, body, env, ctx, line)
    if (a && b) r = { iters: a.iters.add(b.iters), exact: false, finals: {} }
  } else r = inferSingle(cond, body, env, ctx, line)
  if (!r) return unknown('No se puede deducir cuántas vueltas da este bucle.')
  if (!r.exact) ctx.exact = false
  return r
}

/** Agrega el coste del cuerpo de un MIENTRAS/REPETIR a lo largo de todas sus vueltas. */
function aggregator(info, iters, ctx, line) {
  return (p) => {
    if (info.v && p.hasSymbol(info.v)) {
      if (info.range) return sumOver(p, info.v, info.range.from, info.range.to).poly
      ctx.exact = false
      ctx.note(line, `El coste del cuerpo depende de "${info.v}": se usa una cota superior.`)
      return p.substitute(info.v, info.bound).mul(iters)
    }
    return p.mul(iters)
  }
}

function analyzeFor(s, env, defined, ctx) {
  checkDefined([s.from, s.to], defined, ctx, s.line)
  const init = padd(pc(COST_MODEL.forInit), padd(exprCost(s.from, env, ctx, s.line), exprCost(s.to, env, ctx, s.line)))
  let from = toPoly(s.from, env)
  let to = toPoly(s.to, env)
  if (!from) {
    from = ctx.freshK(s.line, `valor inicial "${s.from.src}"`)
    ctx.warn(s.line, `No se puede simplificar el valor inicial "${s.from.src}"; se representa como ${from}.`)
  }
  if (!to) {
    to = ctx.freshK(s.line, `valor final "${s.to.src}"`)
    ctx.warn(s.line, `No se puede simplificar el valor final "${s.to.src}"; se representa como ${to}.`)
  }
  if (assignedVars(s.body).has(s.var) && assignmentsOf(s.body, s.var).list.length) {
    ctx.warn(s.line, `Se modifica la variable contadora "${s.var}" dentro del bucle. El análisis supone que no cambia; al ejecutar el número de vueltas puede ser distinto.`)
    ctx.exact = false
  }

  const fromC = from.constValue()
  const toC = to.constValue()
  let iterations = to.sub(from).add(C(1))
  if (fromC !== null && toC !== null) {
    const it = Math.max(0, Math.floor(toC) - Math.ceil(fromC) + 1)
    iterations = C(it)
    if (it === 0) ctx.note(s.line, 'El bucle no se ejecuta nunca: el valor inicial es mayor que el final.')
  }

  const bodyEnv = loopBodyEnv(env, s.body)
  bodyEnv.set(s.var, Poly.sym(s.var))
  const bodyDefined = new Set(defined).add(s.var)
  const body = analyzeBlock(s.body, bodyEnv, bodyDefined, ctx)
  for (const v of bodyDefined) defined.add(v)

  const perIter = C(COST_MODEL.compare + COST_MODEL.forStep)
  const fixed = { w: init.w.add(C(COST_MODEL.compare)), b: init.b.add(C(COST_MODEL.compare)) }
  let w
  let bc
  let br = null
  let lines
  if (iterations.constValue() === 0) {
    w = Poly.zero(); bc = Poly.zero(); lines = mapLines(body.lines, () => Poly.zero())
  } else {
    const sum = (p) => {
      const r = sumOver(p, s.var, from, to)
      if (!r.exact) {
        ctx.exact = false
        ctx.note(s.line, `El coste del cuerpo depende de "${s.var}" de forma no polinómica: se usa una cota superior.`)
      }
      return r.poly
    }
    w = sum(body.w.add(perIter))
    bc = body.bc ? sum(body.bc.add(perIter)) : Poly.zero()
    if (body.br) br = fixed.b.add(body.br.substitute(s.var, from))
    lines = mapLines(body.lines, sum)
  }
  lines.set(s.line, { count: iterations.add(C(1)), unit: C(COST_MODEL.compare), kind: 'loop' })
  afterLoopEnv(env, s.body, { [s.var]: to.add(C(1)) })
  defined.add(s.var)
  const bcTotal = fixed.b.add(bc)
  return { w: fixed.w.add(w), bc: bcTotal, br, b: minP(bcTotal, br), lines, returns: body.returns === 'never' ? 'never' : 'may' }
}

function analyzeWhile(s, env, defined, ctx) {
  checkDefined([s.cond], defined, ctx, s.line)
  const cond = exprCost(s.cond, env, ctx, s.line)
  const info = inferIterations(s.cond, s.body, env, ctx, s.line)
  const bodyEnv = loopBodyEnv(env, s.body)
  const bodyDefined = new Set(defined)
  const body = analyzeBlock(s.body, bodyEnv, bodyDefined, ctx)
  for (const v of bodyDefined) defined.add(v)

  const iters = info.iters
  const aggregate = aggregator(info, iters, ctx, s.line)
  const checks = iters.add(C(1))
  const w = checks.mul(cond.w).add(aggregate(body.w))
  const bc = info.maybeZero ? cond.b : checks.mul(cond.b).add(aggregate(body.bc ?? Poly.zero()))
  const br = body.br ? cond.b.add(body.br) : null
  const lines = mapLines(body.lines, aggregate)
  lines.set(s.line, { count: checks, unit: cond.w, kind: 'loop' })
  afterLoopEnv(env, s.body, info.finals)
  return { w, bc, br, b: minP(bc, br), lines, returns: body.returns === 'never' ? 'never' : 'may' }
}

function analyzeRepeat(s, env, defined, ctx) {
  // REPETIR … HASTA_QUE c  ≡  el cuerpo se ejecuta y se repite mientras NO c (al menos una vez).
  const bodyEnv = loopBodyEnv(env, s.body)
  const bodyDefined = new Set(defined)
  const body = analyzeBlock(s.body, bodyEnv, bodyDefined, ctx)
  for (const v of bodyDefined) defined.add(v)
  checkDefined([s.cond], defined, ctx, s.line)
  const cond = exprCost(s.cond, bodyEnv, ctx, s.endLine ?? s.line)
  const info = inferIterations(negateCond(s.cond), s.body, env, ctx, s.line)
  const ic = info.iters.constValue()
  const iters = ic !== null ? C(Math.max(1, ic)) : info.iters
  const aggregate = aggregator(info, iters, ctx, s.line)
  const w = iters.mul(cond.w).add(aggregate(body.w))
  const bc = iters.mul(cond.b).add(aggregate(body.bc ?? Poly.zero()))
  const br = body.br
  const lines = mapLines(body.lines, aggregate)
  lines.set(s.endLine ?? s.line, { count: iters, unit: cond.w, kind: 'loop' })
  afterLoopEnv(env, s.body, info.finals)
  return { w, bc, br, b: minP(bc, br), lines, returns: body.returns === 'never' ? 'never' : 'may' }
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/** Métricas estructurales del algoritmo (programa principal y funciones). */
export function structureMetrics(ast) {
  let decisions = 0
  let loops = 0
  let statements = 0
  let maxDepth = 0
  const vars = new Set()
  const visit = (s, depth) => {
    statements++
    const block = ['if', 'while', 'for', 'repeat'].includes(s.type)
    maxDepth = Math.max(maxDepth, depth + (block ? 1 : 0))
    if (block) decisions++
    if (s.type === 'while' || s.type === 'for' || s.type === 'repeat') loops++
    if (s.type === 'assign' && s.target.indexes.length === 0) vars.add(s.target.name)
    if (s.type === 'read') s.targets.forEach((t) => vars.add(t.name))
    if (s.type === 'for') vars.add(s.var)
  }
  walk(ast.body, visit)
  for (const fn of ast.functions) {
    fn.params.forEach((p) => vars.add(`${fn.name}.${p}`))
    walk(fn.body, visit)
  }
  const recursive = ast.functions.filter((fn) => {
    let found = false
    walk(fn.body, (s) => {
      for (const e of [s.expr, s.cond, s.call, s.from, s.to, ...(s.args ?? [])]) {
        walkExpr(e, (x) => { if (x.k === 'call' && x.name === fn.name) found = true })
      }
    })
    return found
  }).length
  return { statements, decisions, loops, maxDepth, cyclomatic: decisions + 1, variables: vars.size, functions: ast.functions.length, recursive }
}

export function analyzeCost(ast) {
  const ctx = new Context(ast)
  const env = new Map()
  const defined = new Set()
  let result
  try {
    result = analyzeBlock(ast.body, env, defined, ctx)
    // Las funciones que no se llaman también se analizan, para mostrar su desglose.
    for (const name of ctx.functions.keys()) summarize(name, ctx)
  } catch (err) {
    if (!(err instanceof RangeError)) throw err
    return { failed: true, message: 'La expresión de coste es demasiado grande para simplificarla.' }
  }
  const worst = result.w
  const best = result.b
  const o = bigO(worst)
  const omega = bigO(best)
  const symbols = [...new Set([...worst.symbols()].map((sym) => sym.replace(/^(?:log|exp)_[0-9.]+\((.*)\)$/, '$1')))]
  return {
    failed: false,
    worst,
    best,
    bigO: o.text,
    bigOmega: omega.text,
    theta: o.text === omega.text ? o.text : null,
    growth: o.growth,
    growthClass: growthClass(o.growth),
    exact: ctx.exact,
    lines: result.lines,
    fnLines: ctx.fnLines.sort((a, b) => a.line - b.line),
    recurrences: ctx.recurrences,
    warnings: ctx.warnings,
    notes: ctx.notes.sort((a, b) => a.line - b.line),
    symbols,
    inputs: [...ctx.inputs],
    kSymbols: ctx.kSymbols,
    metrics: structureMetrics(ast),
  }
}

/** Valor numérico de T con todas las variables de tamaño iguales a n. */
export function evalAt(poly, n) {
  const v = poly.evaluate(() => n)
  return Number.isNaN(v) ? 0 : Math.max(0, v)
}
