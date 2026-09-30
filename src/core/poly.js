// Polinomios multivariable con coeficientes racionales, para expresar T(n) de forma exacta.
// Además de variables normales admite tres tipos de símbolo especiales:
//   · log_B(x)  logaritmo en base B de x
//   · exp_B(x)  B elevado a x (costes exponenciales de la recursión múltiple)
//   · len_x     longitud de la lista x (se muestra como |x|)
// Los exponentes pueden ser fraccionarios (n^1.585, √n = n^0.5).

// ---------------------------------------------------------------------------
// Fracciones
// ---------------------------------------------------------------------------

function gcd(a, b) {
  a = Math.abs(a)
  b = Math.abs(b)
  while (b) [a, b] = [b, a % b]
  return a || 1
}

export function frac(n, d = 1) {
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) throw new RangeError('Fracción no válida')
  if (!Number.isInteger(n) || !Number.isInteger(d)) return fromNumber(n / d)
  if (Math.abs(n) > Number.MAX_SAFE_INTEGER || Math.abs(d) > Number.MAX_SAFE_INTEGER) throw new RangeError('Coeficiente demasiado grande')
  if (d < 0) { n = -n; d = -d }
  const g = gcd(n, d)
  return { n: n / g, d: d / g }
}

/** Aproxima un número decimal por una fracción (denominador máximo 10000). */
export function fromNumber(x) {
  if (!Number.isFinite(x)) throw new RangeError('Número no finito')
  if (Number.isInteger(x)) return frac(x, 1)
  const sign = Math.sign(x)
  let v = Math.abs(x)
  let [h0, h1, k0, k1] = [0, 1, 1, 0]
  for (let i = 0; i < 30; i++) {
    const a = Math.floor(v)
    ;[h0, h1] = [h1, a * h1 + h0]
    ;[k0, k1] = [k1, a * k1 + k0]
    if (k1 > 10000) { h1 = h0; k1 = k0; break }
    const rest = v - a
    if (rest < 1e-12) break
    v = 1 / rest
  }
  return frac(sign * h1, k1)
}

const fadd = (a, b) => frac(a.n * b.d + b.n * a.d, a.d * b.d)
const fmul = (a, b) => frac(a.n * b.n, a.d * b.d)
const fval = (a) => a.n / a.d

// ---------------------------------------------------------------------------
// Símbolos especiales
// ---------------------------------------------------------------------------

const NUM = '([0-9]+(?:\\.[0-9]+)?)'
const IDENT = '([A-Za-z_][A-Za-z0-9_]*)'
const LOG_RE = new RegExp(`^log_${NUM}\\(${IDENT}\\)$`)
const EXP_RE = new RegExp(`^exp_${NUM}\\(${IDENT}\\)$`)

const round3 = (x) => Math.round(x * 1000) / 1000

export function logSymbol(base, arg) {
  return `log_${round3(base)}(${arg})`
}

export function expSymbol(base, arg) {
  return `exp_${round3(base)}(${arg})`
}

export function parseLog(sym) {
  const m = LOG_RE.exec(sym)
  return m ? { base: Number(m[1]), arg: m[2] } : null
}

export function parseExp(sym) {
  const m = EXP_RE.exec(sym)
  return m ? { base: Number(m[1]), arg: m[2] } : null
}

/** Variable de la que depende un símbolo (la propia, o el argumento de log/exp). */
export function baseVar(sym) {
  return parseLog(sym)?.arg ?? parseExp(sym)?.arg ?? sym
}

// ---------------------------------------------------------------------------
// Polinomios: Map<clave, { c: fracción, f: [[símbolo, exponente], ...] }>
// ---------------------------------------------------------------------------

const keyOf = (factors) => factors.map(([s, e]) => (e === 1 ? s : `${s}^${e}`)).join('*')

function normFactors(obj) {
  return Object.entries(obj)
    .filter(([, e]) => Math.abs(e) > 1e-12)
    .map(([s, e]) => [s, round3(e) === Math.round(e) ? Math.round(e) : round3(e)])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
}

export class Poly {
  constructor(terms = new Map()) {
    this.terms = terms
  }

  static const(x) {
    const p = new Poly()
    const c = typeof x === 'object' ? x : fromNumber(x)
    if (c.n !== 0) p.terms.set('', { c, f: [] })
    return p
  }

  static sym(name) {
    const p = new Poly()
    p.terms.set(name, { c: frac(1), f: [[name, 1]] })
    return p
  }

  static zero() { return new Poly() }

  clone() {
    return new Poly(new Map(this.terms))
  }

  addTerm(c, factors) {
    if (c.n === 0) return this
    const key = keyOf(factors)
    const prev = this.terms.get(key)
    if (prev) {
      const sum = fadd(prev.c, c)
      if (sum.n === 0) this.terms.delete(key)
      else this.terms.set(key, { c: sum, f: factors })
    } else {
      this.terms.set(key, { c, f: factors })
    }
    return this
  }

  add(other) {
    const out = this.clone()
    for (const { c, f } of other.terms.values()) out.addTerm(c, f)
    return out
  }

  sub(other) {
    return this.add(other.scale(-1))
  }

  scale(k) {
    const kf = typeof k === 'object' ? k : fromNumber(k)
    const out = new Poly()
    if (kf.n === 0) return out
    for (const { c, f } of this.terms.values()) out.addTerm(fmul(c, kf), f)
    return out
  }

  mul(other) {
    const out = new Poly()
    for (const a of this.terms.values()) {
      for (const b of other.terms.values()) {
        const exps = Object.fromEntries(a.f)
        for (const [s, e] of b.f) exps[s] = (exps[s] ?? 0) + e
        out.addTerm(fmul(a.c, b.c), normFactors(exps))
      }
    }
    if (out.terms.size > 400) throw new RangeError('Expresión de coste demasiado grande')
    return out
  }

  /** Potencia entera, o fraccionaria si el polinomio es un solo término positivo. */
  pow(k) {
    if (Number.isInteger(k) && k >= 0) {
      let out = Poly.const(1)
      for (let i = 0; i < k; i++) out = out.mul(this)
      return out
    }
    return this.monomialPow(k)
  }

  /** c·x^a → c^k·x^(a·k). Devuelve null si no es un único término positivo. */
  monomialPow(k) {
    if (this.terms.size !== 1) return null
    const [{ c, f }] = this.terms.values()
    if (c.n <= 0) return null
    const exps = {}
    for (const [s, e] of f) exps[s] = e * k
    const out = new Poly()
    out.addTerm(fromNumber(fval(c) ** k), normFactors(exps))
    return out
  }

  isZero() { return this.terms.size === 0 }

  /** Valor numérico si el polinomio es constante; si no, null. */
  constValue() {
    if (this.terms.size === 0) return 0
    if (this.terms.size === 1 && this.terms.has('')) return fval(this.terms.get('').c)
    return null
  }

  symbols() {
    const out = new Set()
    for (const { f } of this.terms.values()) for (const [s] of f) out.add(s)
    return out
  }

  /** ¿Depende de `sym`, directamente o dentro de un log/exp? */
  hasSymbol(sym) {
    for (const { f } of this.terms.values()) if (f.some(([s]) => baseVar(s) === sym)) return true
    return false
  }

  /** Coeficientes respecto a `sym` (solo potencias enteras): array indexado por potencia. */
  coeffsIn(sym) {
    const out = []
    for (const { c, f } of this.terms.values()) {
      const e = f.find(([s]) => s === sym)?.[1] ?? 0
      if (!Number.isInteger(e)) return null
      const rest = f.filter(([s]) => s !== sym)
      out[e] = (out[e] ?? new Poly()).addTerm(c, rest)
    }
    for (let i = 0; i < out.length; i++) out[i] ??= new Poly()
    return out
  }

  /**
   * Sustituye `sym` por el polinomio `value`, también dentro de log(sym) y exp(sym):
   *   log(c·m^k + …) ≈ k·log(m)      exp_B(α·m + c) = B^c · exp_(B^α)(m)
   */
  substitute(sym, value) {
    let out = new Poly()
    for (const { c, f } of this.terms.values()) {
      let term = Poly.const(c)
      const rest = {}
      for (const [s, e] of f) {
        let factor = null
        if (s === sym) factor = value.pow(e) ?? approxPow(value, e)
        else {
          const log = parseLog(s)
          const exp = parseExp(s)
          if (log?.arg === sym) factor = logOf(value, log.base).pow(e) ?? approxPow(logOf(value, log.base), e)
          else if (exp?.arg === sym) factor = expOf(value, exp.base).pow(e) ?? approxPow(expOf(value, exp.base), e)
        }
        if (factor) term = term.mul(factor)
        else rest[s] = (rest[s] ?? 0) + e
      }
      const restPoly = new Poly().addTerm(frac(1), normFactors(rest))
      out = out.add(term.mul(restPoly))
    }
    return out
  }

  /** Evalúa numéricamente. `value(sym)` devuelve el valor de cada variable. */
  evaluate(value) {
    let total = 0
    for (const { c, f } of this.terms.values()) {
      let t = fval(c)
      for (const [s, e] of f) {
        const log = parseLog(s)
        const exp = parseExp(s)
        let v
        if (log) v = Math.log(Math.max(value(log.arg), 1)) / Math.log(log.base)
        else if (exp) v = exp.base ** value(exp.arg)
        else v = value(s)
        t *= v ** e
      }
      total += t
    }
    return total
  }

  /** Términos ordenados de mayor a menor crecimiento. */
  sortedTerms() {
    return [...this.terms.values()].sort((a, b) =>
      compareGrowth(growth1(b.f), growth1(a.f)) || (a.c.n < 0) - (b.c.n < 0) || keyOf(a.f).localeCompare(keyOf(b.f)))
  }

  toString() {
    if (this.isZero()) return '0'
    return this.sortedTerms()
      .map((t, i) => {
        const neg = t.c.n < 0
        const body = formatTerm({ n: Math.abs(t.c.n), d: t.c.d }, t.f)
        if (i === 0) return neg ? `−${body}` : body
        return neg ? ` − ${body}` : ` + ${body}`
      })
      .join('')
  }

  toJSON() {
    return this.toString()
  }
}

/** Potencia aproximada usando solo el término dominante. */
function approxPow(poly, k) {
  const main = mainSymbol(poly)
  if (!main) {
    const v = poly.constValue() ?? 0
    return Poly.const(Math.max(0, v) ** k)
  }
  return Poly.sym(main).pow(k * degreeOf(poly, main)) ?? Poly.sym(main)
}

/** log_B de un polinomio: constante si lo es; si no, k·log_B(m) con m la variable dominante. */
function logOf(value, base) {
  const c = value.constValue()
  if (c !== null) return Poly.const(Math.max(0, Math.log(Math.max(c, 1)) / Math.log(base)))
  const main = mainSymbol(value)
  if (!main) return Poly.zero()
  return Poly.sym(logSymbol(base, main)).scale(degreeOf(value, main))
}

/** B elevado a un polinomio: exacto si es α·m + c; aproximado por la variable dominante si no. */
function expOf(value, base) {
  const c = value.constValue()
  if (c !== null) {
    const v = base ** c
    if (!Number.isFinite(v)) throw new RangeError('Número demasiado grande')
    return Poly.const(v)
  }
  const syms = [...value.symbols()].filter((s) => !parseLog(s) && !parseExp(s))
  if (syms.length === 1) {
    const coeffs = value.coeffsIn(syms[0])
    const a = coeffs?.[1]?.constValue()
    const k = coeffs?.[0]?.constValue() ?? 0
    if (coeffs && coeffs.length === 2 && a !== null && a > 0 && k !== null) {
      const mult = base ** k
      return Poly.sym(expSymbol(base ** a, syms[0])).scale(Number.isFinite(mult) && mult > 0 ? mult : 1)
    }
  }
  const main = mainSymbol(value)
  return main ? Poly.sym(expSymbol(base, main)) : Poly.const(1)
}

// ---------------------------------------------------------------------------
// Crecimiento asintótico: [exponencial, potencia, potencia del log]
// ---------------------------------------------------------------------------

/** Crecimiento de un monomio por variable base. */
function growthBy(factors) {
  const g = new Map()
  for (const [s, e] of factors) {
    const log = parseLog(s)
    const exp = parseExp(s)
    const base = baseVar(s)
    const [x, p, l] = g.get(base) ?? [0, 0, 0]
    if (exp) g.set(base, [x + Math.log(exp.base) * e, p, l])
    else if (log) g.set(base, [x, p, l + e])
    else g.set(base, [x, p + e, l])
  }
  return g
}

/** Crecimiento si todas las variables valieran n. */
export function growth1(factors) {
  let x = 0
  let p = 0
  let l = 0
  for (const [s, e] of factors) {
    const exp = parseExp(s)
    if (exp) x += Math.log(exp.base) * e
    else if (parseLog(s)) l += e
    else p += e
  }
  return [x, p, l]
}

const EPS = 1e-9
const cmpNum = (a, b) => (Math.abs(a - b) < EPS ? 0 : a - b)

export function compareGrowth(a, b) {
  return cmpNum(a[0], b[0]) || cmpNum(a[1], b[1]) || cmpNum(a[2], b[2])
}

function dominates(ga, gb) {
  const bases = new Set([...ga.keys(), ...gb.keys()])
  let strict = false
  for (const b of bases) {
    const cmp = compareGrowth(ga.get(b) ?? [0, 0, 0], gb.get(b) ?? [0, 0, 0])
    if (cmp < 0) return false
    if (cmp > 0) strict = true
  }
  return strict
}

/**
 * Notación O: términos no dominados, sin coeficientes.
 * Devuelve { text: 'n² + m', growth: [exp, grado, log] } con el crecimiento del término mayor.
 */
export function bigO(poly) {
  const monos = []
  const seen = new Set()
  for (const { c, f } of poly.terms.values()) {
    if (c.n <= 0 || f.length === 0) continue
    const key = keyOf(f)
    if (!seen.has(key)) { seen.add(key); monos.push(f) }
  }
  const growths = monos.map(growthBy)
  const kept = monos.filter((_, i) => !growths.some((g, j) => j !== i && dominates(g, growths[i])))
  if (kept.length === 0) return { text: '1', growth: [0, 0, 0] }
  kept.sort((a, b) => compareGrowth(growth1(b), growth1(a)))
  return { text: kept.map((f) => formatTerm(frac(1), f)).join(' + '), growth: growth1(kept[0]) }
}

/**
 * Orden para mostrar el coste de una función con varios parámetros: conserva la diferencia entre
 * variables del término dominante (30·der − 30·izq → der − izq) en lugar de quedarse solo con der.
 */
export function bigOWithDifferences(poly) {
  const plain = bigO(poly)
  const top = [...poly.terms.values()].filter(({ f }) => f.length && compareGrowth(growth1(f), plain.growth) === 0)
  if (!top.some(({ c }) => c.n < 0) || top.length > 4) return plain
  const lead = top.find(({ c }) => c.n > 0)
  if (!lead) return plain
  const scaled = new Poly()
  for (const { c, f } of top) scaled.addTerm(frac(c.n * lead.c.d, c.d * lead.c.n), f)
  return { text: scaled.toString(), growth: plain.growth }
}

const fmtNum = (x) => String(round3(x)).replace('.', ',')

/** Clase de complejidad para colores y leyendas. */
export function growthClass([x, p, l]) {
  if (x > EPS) return { id: 'exp', label: 'exponencial' }
  if (Math.abs(p) < EPS && Math.abs(l) < EPS) return { id: 'const', label: 'constante' }
  if (Math.abs(p) < EPS) return { id: 'log', label: 'logarítmica' }
  if (p < 1 - EPS) return { id: 'log', label: `sublineal (grado ${fmtNum(p)})` }
  if (Math.abs(p - 1) < EPS) return l > EPS ? { id: 'nlogn', label: 'casi lineal (n log n)' } : { id: 'linear', label: 'lineal' }
  if (p < 2 - EPS) return { id: 'nlogn', label: `polinómica (grado ${fmtNum(p)})` }
  if (Math.abs(p - 2) < EPS) return { id: 'quad', label: 'cuadrática' }
  if (p < 3 - EPS) return { id: 'quad', label: `polinómica (grado ${fmtNum(p)})` }
  if (Math.abs(p - 3) < EPS) return { id: 'cubic', label: 'cúbica' }
  return { id: 'poly', label: `polinómica (grado ${fmtNum(p)})` }
}

// ---------------------------------------------------------------------------
// Formato
// ---------------------------------------------------------------------------

const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' }
const SUB = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉', '.': '.' }
const sup = (e) => String(e).split('').map((ch) => SUP[ch] ?? ch).join('')
const sub = (e) => String(e).split('').map((ch) => SUB[ch] ?? ch).join('')

function varName(s) {
  return s.startsWith('len_') ? `|${s.slice(4)}|` : s
}

function withExp(name, e, wrap) {
  if (e === 1) return name
  const shown = wrap ? `(${name})` : name
  if (Number.isInteger(e) && e > 0) return `${shown}${sup(e)}`
  if (e === 0.5) return `√${wrap ? shown : name}`
  return `${shown}^${fmtNum(e)}`
}

export function formatSymbol(s, e = 1) {
  const log = parseLog(s)
  if (log) return withExp(`log${sub(log.base)} ${varName(log.arg)}`, e, true)
  const exp = parseExp(s)
  if (exp) {
    const base = fmtNum(exp.base)
    const name = exp.arg === 'n' ? `${base}ⁿ` : `${base}^${varName(exp.arg)}`
    return withExp(name, e, true)
  }
  return withExp(varName(s), e, false)
}

// Orden de lectura habitual: variables, después logaritmos y al final exponenciales (n·log n).
const factorRank = (s) => (parseExp(s) ? 2 : parseLog(s) ? 1 : 0)

function formatTerm(c, factors) {
  if (factors.length === 0) return c.d === 1 ? String(c.n) : `${c.n}/${c.d}`
  const ordered = [...factors].sort(([a], [b]) => factorRank(a) - factorRank(b) || (a < b ? -1 : a > b ? 1 : 0))
  const vars = ordered.map(([s, e]) => formatSymbol(s, e)).join('·')
  const sep = /^(log|\d|√|\()/.test(vars) ? '·' : ''
  const num = c.n === 1 ? vars : `${c.n}${sep}${vars}`
  return c.d === 1 ? num : `${num}/${c.d}`
}

// ---------------------------------------------------------------------------
// Sumatorios (fórmulas de Faulhaber)
// ---------------------------------------------------------------------------

// F_k(x) = Σ_{i=1..x} i^k, como coeficientes [x^0, x^1, ...].
const FAULHABER = [
  [frac(0), frac(1)],
  [frac(0), frac(1, 2), frac(1, 2)],
  [frac(0), frac(1, 6), frac(1, 2), frac(1, 3)],
  [frac(0), frac(0), frac(1, 4), frac(1, 2), frac(1, 4)],
  [frac(0), frac(-1, 30), frac(0), frac(1, 3), frac(1, 2), frac(1, 5)],
]

function faulhaber(k, x) {
  let out = new Poly()
  FAULHABER[k].forEach((c, e) => { out = out.add(x.pow(e).scale(c)) })
  return out
}

/**
 * Σ_{sym = from..to} body. Exacto para polinomios en `sym` de grado ≤ 4 sin log/exp de `sym`.
 * Si no es posible, devuelve una cota superior (nº de iteraciones × valor en el extremo) y exact = false.
 */
export function sumOver(body, sym, from, to) {
  const count = to.sub(from).add(Poly.const(1))
  if (!body.hasSymbol(sym)) return { poly: body.mul(count), exact: true }
  const special = [...body.symbols()].some((s) => s !== sym && baseVar(s) === sym)
  const coeffs = body.coeffsIn(sym)
  if (special || !coeffs || coeffs.length - 1 >= FAULHABER.length) {
    return { poly: body.substitute(sym, to).mul(count), exact: false }
  }
  let out = new Poly()
  const fromMinus1 = from.sub(Poly.const(1))
  coeffs.forEach((coef, k) => {
    if (coef.isZero()) return
    out = out.add(coef.mul(faulhaber(k, to).sub(faulhaber(k, fromMinus1))))
  })
  return { poly: out, exact: true }
}

/** Variable que domina un polinomio (la de mayor grado), o null si es constante. */
export function mainSymbol(poly) {
  let best = null
  let bestDeg = 0
  for (const { f } of poly.terms.values()) {
    for (const [s, e] of f) {
      if (parseLog(s) || parseExp(s)) continue
      if (e > bestDeg) { best = s; bestDeg = e }
    }
  }
  return best
}

/** Grado de `sym` en el término dominante (para log(c·n^k) = k·log n). */
export function degreeOf(poly, sym) {
  let d = 0
  for (const { f } of poly.terms.values()) for (const [s, e] of f) if (s === sym) d = Math.max(d, e)
  return d
}
