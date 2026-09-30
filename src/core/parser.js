// Analizador sintáctico: pseudocódigo -> árbol (AST) + diagnósticos.
// Nunca lanza excepciones hacia fuera: todos los problemas se devuelven como diagnósticos
// para que el editor pueda señalarlos y el usuario los corrija a mano.

import { LIMITS, WORDS, BUILTINS, tokenizeLine, keywordCaseHint, builtinCaseHint, isBuiltin } from './lexer.js'

const CLOSERS = new Set(['ELSE', 'END_IF', 'END_WHILE', 'END_FOR', 'UNTIL', 'END', 'END_FUNCTION'])
// Líneas que siempre cortan el bloque actual (empiezan otra sección del programa).
const SECTION_STARTS = new Set(['START', 'FUNCTION'])
const OPENER_OF = { END_IF: 'IF', ELSE: 'IF', END_WHILE: 'WHILE', END_FOR: 'FOR', UNTIL: 'REPEAT', END: 'START', END_FUNCTION: 'FUNCTION' }
const CLOSER_OF = { IF: 'END_IF', WHILE: 'END_WHILE', FOR: 'END_FOR', REPEAT: 'UNTIL' }
const CMP_OPS = new Set(['==', '!=', '>', '<', '>=', '<='])

class LineError extends Error {
  constructor(message, s, e) {
    super(message)
    this.s = s
    this.e = e
  }
}

const isOpTok = (tok, v) => tok?.t === 'op' && tok.v === v
const isKw = (tok, role) => tok?.t === 'kw' && tok.role === role

// ---------------------------------------------------------------------------
// Expresiones
// ---------------------------------------------------------------------------

/**
 * Analiza una expresión a partir de una lista de tokens de una línea.
 * Precedencia (de menor a mayor): O · Y · NO · comparación · + − · * / % · signo · sufijos [ ] · primarios
 */
export function parseExpression(tokens, text, emptyMessage = 'Falta una expresión') {
  if (tokens.length === 0) throw new LineError(emptyMessage, 0, text.length)
  let pos = 0
  let depth = 0
  const peek = () => tokens[pos]
  const isOp = (v) => isOpTok(tokens[pos], v)

  function node(k, props, s, e) {
    return { k, ...props, s, e, src: text.slice(s, e) }
  }

  function enter(tok) {
    if (++depth > LIMITS.maxExprDepth) throw new LineError('Expresión demasiado anidada.', tok.s, tok.e)
  }

  function orExpr() {
    let left = andExpr()
    while (isKw(peek(), 'OR')) {
      pos++
      const right = andExpr()
      left = node('bin', { op: 'or', l: left, r: right }, left.s, right.e)
    }
    return left
  }

  function andExpr() {
    let left = notExpr()
    while (isKw(peek(), 'AND')) {
      pos++
      const right = notExpr()
      left = node('bin', { op: 'and', l: left, r: right }, left.s, right.e)
    }
    return left
  }

  function notExpr() {
    const tok = peek()
    if (isKw(tok, 'NOT')) {
      pos++
      enter(tok)
      const x = notExpr()
      depth--
      return node('not', { x }, tok.s, x.e)
    }
    return comparison()
  }

  function comparison() {
    const left = additive()
    const tok = peek()
    if (tok?.t === 'op' && CMP_OPS.has(tok.v)) {
      pos++
      const right = additive()
      const next = peek()
      if (next?.t === 'op' && CMP_OPS.has(next.v)) {
        throw new LineError('No se pueden encadenar comparaciones (a < b < c). Usa Y: a < b Y b < c.', next.s, next.e)
      }
      return node('bin', { op: tok.v, l: left, r: right }, left.s, right.e)
    }
    if (isOpTok(tok, '=')) throw new LineError('Para comparar usa "==". Un solo "=" es una asignación.', tok.s, tok.e)
    return left
  }

  function additive() {
    let left = multiplicative()
    while (isOp('+') || isOp('-')) {
      const op = tokens[pos++].v
      const right = multiplicative()
      left = node('bin', { op, l: left, r: right }, left.s, right.e)
    }
    return left
  }

  function multiplicative() {
    let left = unary()
    while (isOp('*') || isOp('/') || isOp('%')) {
      const op = tokens[pos++].v
      const right = unary()
      left = node('bin', { op, l: left, r: right }, left.s, right.e)
    }
    return left
  }

  function unary() {
    if (isOp('-') || isOp('+')) {
      const tok = tokens[pos++]
      enter(tok)
      const operand = unary()
      depth--
      return tok.v === '-' ? node('neg', { x: operand }, tok.s, operand.e) : operand
    }
    return postfix()
  }

  function postfix() {
    let expr = primary()
    while (isOp('[')) {
      const open = tokens[pos++]
      enter(open)
      if (isOp(']')) throw new LineError('Falta el índice entre los corchetes.', open.s, tokens[pos].e)
      const index = orExpr()
      depth--
      const close = peek()
      if (!isOpTok(close, ']')) throw new LineError('Falta cerrar el corchete "]".', open.s, open.e)
      pos++
      expr = node('index', { target: expr, index }, expr.s, close.e)
    }
    return expr
  }

  function argList(open, closer) {
    const args = []
    if (isOp(closer)) { pos++; return { args, end: tokens[pos - 1].e } }
    for (;;) {
      args.push(orExpr())
      if (isOp(',')) { pos++; continue }
      if (isOp(closer)) { pos++; return { args, end: tokens[pos - 1].e } }
      throw new LineError(`Falta cerrar con "${closer}" o separar con comas.`, open.s, open.e)
    }
  }

  function primary() {
    const tok = peek()
    if (!tok) {
      const last = tokens[tokens.length - 1]
      throw new LineError('La expresión está incompleta.', last.e, last.e + 1)
    }
    pos++
    switch (tok.t) {
      case 'num':
        return node('num', { v: tok.v }, tok.s, tok.e)
      case 'str':
        if (tok.unterminated) throw new LineError('Texto sin cerrar: falta la comilla " final.', tok.s, tok.e)
        return node('str', { v: tok.v }, tok.s, tok.e)
      case 'id': {
        if (isOp('(')) {
          const open = tokens[pos++]
          enter(open)
          const { args, end } = argList(open, ')')
          depth--
          return node('call', { name: tok.v, args, builtin: isBuiltin(tok.v) ? BUILTINS[tok.v].id : null, nameS: tok.s, nameE: tok.e }, tok.s, end)
        }
        return node('var', { name: tok.v }, tok.s, tok.e)
      }
      case 'kw':
        if (tok.role === 'TRUE' || tok.role === 'FALSE') return node('bool', { v: tok.role === 'TRUE' }, tok.s, tok.e)
        if (tok.role === 'NULL') return node('null', {}, tok.s, tok.e)
        throw new LineError(`"${tok.v}" es una palabra clave y no puede ir aquí.`, tok.s, tok.e)
      case 'op':
        if (tok.v === '(') {
          enter(tok)
          const inner = orExpr()
          depth--
          const close = peek()
          if (!isOpTok(close, ')')) throw new LineError('Falta cerrar el paréntesis ")".', tok.s, tok.e)
          pos++
          return { ...inner, paren: true, s: tok.s, e: close.e, src: text.slice(tok.s, close.e) }
        }
        if (tok.v === '[') {
          enter(tok)
          const { args, end } = argList(tok, ']')
          depth--
          return node('list', { items: args }, tok.s, end)
        }
        throw new LineError(`Símbolo inesperado "${tok.v}".`, tok.s, tok.e)
      default:
        throw badTokenError(tok)
    }
  }

  const expr = orExpr()
  if (pos < tokens.length) {
    const tok = tokens[pos]
    if (isOpTok(tok, ')')) throw new LineError('Sobra un paréntesis ")".', tok.s, tok.e)
    if (isOpTok(tok, ']')) throw new LineError('Sobra un corchete "]".', tok.s, tok.e)
    throw new LineError(`No se esperaba "${tok.t === 'str' ? '"' + tok.v + '"' : tok.v}" aquí.`, tok.s, tok.e)
  }
  return expr
}

function badTokenError(tok) {
  if (tok.reason === 'ident-digit') {
    return new LineError(`"${tok.v}" no es válido: los nombres de variables deben empezar por una letra o "_".`, tok.s, tok.e)
  }
  return new LineError(
    `Carácter no permitido "${tok.v}". Los nombres solo admiten letras sin tilde, dígitos y "_".`,
    tok.s,
    tok.e,
  )
}

/** Convierte una expresión en destino de asignación: variable o elemento de lista (v[i], m[i][j]). */
function toTarget(expr, text) {
  const indexes = []
  let e = expr
  while (e.k === 'index') {
    indexes.unshift(e.index)
    e = e.target
  }
  if (e.k !== 'var') {
    throw new LineError('Solo se puede asignar a una variable o a un elemento de una lista, como v[i].', expr.s, expr.e)
  }
  return { name: e.name, indexes, src: text.slice(expr.s, expr.e) }
}

// ---------------------------------------------------------------------------
// Instrucciones (una por línea)
// ---------------------------------------------------------------------------

function splitAt(tokens, predicate) {
  const idx = tokens.findIndex(predicate)
  return idx < 0 ? [tokens, null, []] : [tokens.slice(0, idx), tokens[idx], tokens.slice(idx + 1)]
}

const isRole = (role) => (tok) => isKw(tok, role)

/** Parte por comas de primer nivel (fuera de paréntesis y corchetes). */
function splitArgs(tokens) {
  const parts = [[]]
  let depth = 0
  for (const tok of tokens) {
    if (isOpTok(tok, '(') || isOpTok(tok, '[')) depth++
    if (isOpTok(tok, ')') || isOpTok(tok, ']')) depth--
    if (isOpTok(tok, ',') && depth === 0) parts.push([])
    else parts.at(-1).push(tok)
  }
  return parts
}

/** Posición del primer "=" de asignación de primer nivel, o -1. */
function assignIndex(tokens) {
  let depth = 0
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]
    if (isOpTok(tok, '(') || isOpTok(tok, '[')) depth++
    else if (isOpTok(tok, ')') || isOpTok(tok, ']')) depth--
    else if (depth === 0 && isOpTok(tok, '=')) return i
  }
  return -1
}

function missingAtEnd(extraDiagnostics, line, text, word) {
  extraDiagnostics.push({
    severity: 'error',
    line,
    s: text.trimEnd().length,
    e: text.trimEnd().length + 1,
    message: `Falta ${word} al final de la línea.`,
    ghost: `← falta ${word}`,
  })
}

/** Analiza una línea no vacía y devuelve { role, stmt? }. Puede lanzar LineError. */
function parseLine(tokens, text, line, lang, extraDiagnostics) {
  const first = tokens[0]
  const bad = tokens.find((t) => t.t === 'bad')
  if (bad) throw badTokenError(bad)
  const id = `L${line}`

  if (first.t === 'kw') {
    const role = first.role
    const rest = tokens.slice(1)
    const w = WORDS[lang]
    switch (role) {
      case 'START':
      case 'END':
      case 'ELSE':
      case 'END_IF':
      case 'END_WHILE':
      case 'END_FOR':
      case 'END_FUNCTION':
      case 'REPEAT':
        if (rest.length) throw new LineError(`"${first.v}" debe ir solo en su línea.`, rest[0].s, text.length)
        return { role, kwLang: first.lang, stmt: role === 'REPEAT' ? { type: 'repeat', body: [], cond: null, line, id } : undefined }

      case 'UNTIL': {
        const cond = parseExpression(rest, text, `Falta la condición después de ${first.v}.`)
        return { role, kwLang: first.lang, cond }
      }

      case 'PRINT': {
        if (!rest.length) throw new LineError(`${first.v} necesita algo que mostrar, por ejemplo: ${first.v} "Hola"`, first.s, first.e)
        const args = splitArgs(rest).map((part) => parseExpression(part, text, `Falta un valor entre comas en ${first.v}.`))
        return { role, kwLang: first.lang, stmt: { type: 'print', args, line, id } }
      }

      case 'READ': {
        if (!rest.length) throw new LineError(`${first.v} necesita el nombre de una variable, por ejemplo: ${first.v} edad`, first.s, first.e)
        const targets = splitArgs(rest).map((part) => {
          if (!part.length) throw new LineError(`Falta una variable entre comas en ${first.v}.`, first.s, text.length)
          return toTarget(parseExpression(part, text), text)
        })
        return { role, kwLang: first.lang, stmt: { type: 'read', targets, line, id } }
      }

      case 'RETURN': {
        const expr = rest.length ? parseExpression(rest, text) : null
        return { role, kwLang: first.lang, stmt: { type: 'return', expr, line, id } }
      }

      case 'IF':
      case 'WHILE': {
        const closerRole = role === 'IF' ? 'THEN' : 'DO'
        const last = rest.at(-1)
        let condTokens = rest
        if (!isKw(last, closerRole)) {
          const misplaced = rest.findIndex(isRole(closerRole))
          if (misplaced >= 0) {
            throw new LineError(`"${rest[misplaced].v}" debe ir al final de la línea.`, rest[misplaced].s, rest[misplaced].e)
          }
          missingAtEnd(extraDiagnostics, line, text, w[closerRole])
        } else {
          condTokens = rest.slice(0, -1)
        }
        const cond = parseExpression(condTokens, text, `Falta la condición después de ${first.v}.`)
        const stmt = role === 'IF'
          ? { type: 'if', cond, then: [], else: null, line, id }
          : { type: 'while', cond, body: [], line, id }
        return { role, kwLang: first.lang, stmt }
      }

      case 'FOR': {
        const [varPart, fromKw, afterFrom] = splitAt(rest, isRole('FROM'))
        if (!fromKw) throw new LineError(`Falta ${w.FROM}. Formato: ${w.FOR} i ${w.FROM} 1 ${w.TO} n ${w.DO}`, first.s, text.length)
        if (varPart.length !== 1 || varPart[0].t !== 'id') {
          throw new LineError(`Después de ${first.v} va el nombre de la variable contadora.`, varPart[0]?.s ?? first.e, fromKw.s)
        }
        const [fromPart, toKw, afterTo] = splitAt(afterFrom, isRole('TO'))
        if (!toKw) throw new LineError(`Falta ${w.TO}. Formato: ${w.FOR} i ${w.FROM} 1 ${w.TO} n ${w.DO}`, fromKw.s, text.length)
        let toPart = afterTo
        if (isKw(afterTo.at(-1), 'DO')) toPart = afterTo.slice(0, -1)
        else missingAtEnd(extraDiagnostics, line, text, w.DO)
        const from = parseExpression(fromPart, text, `Falta el valor inicial después de ${fromKw.v}.`)
        const to = parseExpression(toPart, text, `Falta el valor final después de ${toKw.v}.`)
        return { role, kwLang: first.lang, stmt: { type: 'for', var: varPart[0].v, from, to, body: [], line, id } }
      }

      case 'FUNCTION': {
        const nameTok = rest[0]
        const format = `${first.v} nombre(a, b)`
        if (nameTok?.t !== 'id') throw new LineError(`Falta el nombre de la función. Formato: ${format}`, first.s, text.length)
        if (isBuiltin(nameTok.v)) throw new LineError(`"${nameTok.v}" ya es una función predefinida; elige otro nombre.`, nameTok.s, nameTok.e)
        if (!isOpTok(rest[1], '(') || !isOpTok(rest.at(-1), ')')) {
          throw new LineError(`Los parámetros van entre paréntesis. Formato: ${format}`, nameTok.s, text.length)
        }
        const inner = rest.slice(2, -1)
        const params = inner.length === 0 ? [] : splitArgs(inner).map((part) => {
          if (part.length !== 1 || part[0].t !== 'id') {
            const s = part[0]?.s ?? nameTok.e
            throw new LineError('Los parámetros deben ser nombres de variables separados por comas.', s, part.at(-1)?.e ?? s + 1)
          }
          return part[0].v
        })
        const dup = params.find((p, i) => params.indexOf(p) !== i)
        if (dup) throw new LineError(`El parámetro "${dup}" está repetido.`, nameTok.s, text.length)
        return { role, kwLang: first.lang, fn: { type: 'function', name: nameTok.v, params, body: [], line, id: `F${line}`, nameS: nameTok.s } }
      }

      default:
        throw new LineError(`"${first.v}" no puede ir al principio de una línea.`, first.s, first.e)
    }
  }

  if (first.t === 'id') {
    const eq = assignIndex(tokens)
    if (eq > 0) {
      const target = toTarget(parseExpression(tokens.slice(0, eq), text), text)
      const expr = parseExpression(tokens.slice(eq + 1), text, `Falta el valor que se asigna a "${target.src}".`)
      return { role: 'ASSIGN', stmt: { type: 'assign', target, expr, line, id } }
    }
    if (isOpTok(tokens[1], '(')) {
      const expr = parseExpression(tokens, text)
      if (expr.k !== 'call') throw new LineError('No se reconoce la instrucción.', first.s, text.length)
      return { role: 'CALL', stmt: { type: 'call', call: expr, line, id } }
    }
    const hint = keywordCaseHint(first.v)
    if (hint) throw new LineError(`Las palabras clave van en MAYÚSCULAS: escribe ${hint} en lugar de ${first.v}.`, first.s, first.e)
    if (tokens.some((t) => isOpTok(t, '=='))) {
      const t = tokens.find((tk) => isOpTok(tk, '=='))
      throw new LineError('Para asignar un valor usa un solo "=".', t.s, t.e)
    }
    throw new LineError(`No se reconoce la instrucción. ¿Querías asignar un valor? Ejemplo: ${first.v} = 10`, first.s, text.length)
  }

  throw new LineError('No se reconoce la instrucción.', first.s, text.length)
}

// ---------------------------------------------------------------------------
// Recorridos
// ---------------------------------------------------------------------------

/** Recorre todas las instrucciones del árbol (preorden). */
export function walk(stmts, visit, depth = 0) {
  for (const s of stmts) {
    visit(s, depth)
    if (s.type === 'if') {
      walk(s.then, visit, depth + 1)
      if (s.else) walk(s.else, visit, depth + 1)
    } else if (s.type === 'while' || s.type === 'for' || s.type === 'repeat') {
      walk(s.body, visit, depth + 1)
    }
  }
}

/** Recorre todas las subexpresiones de una expresión. */
export function walkExpr(e, visit) {
  if (!e) return
  visit(e)
  switch (e.k) {
    case 'bin': walkExpr(e.l, visit); walkExpr(e.r, visit); break
    case 'neg': case 'not': walkExpr(e.x, visit); break
    case 'index': walkExpr(e.target, visit); walkExpr(e.index, visit); break
    case 'list': e.items.forEach((x) => walkExpr(x, visit)); break
    case 'call': e.args.forEach((x) => walkExpr(x, visit)); break
    default: break
  }
}

/** Expresiones que aparecen directamente en una instrucción. */
export function stmtExprs(s) {
  switch (s.type) {
    case 'assign': return [...s.target.indexes, s.expr]
    case 'print': return s.args
    case 'read': return s.targets.flatMap((t) => t.indexes)
    case 'if': case 'while': case 'repeat': return [s.cond]
    case 'for': return [s.from, s.to]
    case 'return': return s.expr ? [s.expr] : []
    case 'call': return [s.call]
    default: return []
  }
}

// ---------------------------------------------------------------------------
// Estructura de bloques
// ---------------------------------------------------------------------------

/**
 * Analiza el programa completo.
 * @returns {{ ast: object|null, diagnostics: object[], lang: 'es'|'en', ok: boolean }}
 */
export function parseProgram(source) {
  const diagnostics = []
  if (typeof source !== 'string') source = ''
  if (source.length > LIMITS.maxChars) {
    diagnostics.push({ severity: 'error', line: 1, message: `El texto supera el máximo de ${LIMITS.maxChars} caracteres.` })
    return { ast: null, diagnostics, lang: 'es', ok: false }
  }
  const rawLines = source.split('\n')
  if (rawLines.length > LIMITS.maxLines) {
    diagnostics.push({ severity: 'error', line: 1, message: `El algoritmo supera el máximo de ${LIMITS.maxLines} líneas.` })
    return { ast: null, diagnostics, lang: 'es', ok: false }
  }

  // Idioma: el de la primera palabra INICIO/START o FUNCION/FUNCTION (español por defecto).
  let lang = 'es'
  for (const text of rawLines) {
    const tokens = tokenizeLine(text)
    if (tokens[0]?.t === 'kw' && SECTION_STARTS.has(tokens[0].role)) { lang = tokens[0].lang; break }
  }

  const infos = []
  const langsSeen = new Set()
  rawLines.forEach((text, idx) => {
    const line = idx + 1
    if (text.length > LIMITS.maxLineLength) {
      diagnostics.push({ severity: 'error', line, message: `La línea supera ${LIMITS.maxLineLength} caracteres.` })
      infos.push({ line, role: 'BAD' })
      return
    }
    const tokens = tokenizeLine(text).filter((t) => t.t !== 'comment')
    if (tokens.length === 0) return
    for (const t of tokens) if (t.t === 'kw') langsSeen.add(t.lang)
    try {
      infos.push({ line, text, ...parseLine(tokens, text, line, lang, diagnostics) })
    } catch (err) {
      if (!(err instanceof LineError)) throw err
      diagnostics.push({ severity: 'error', line, s: err.s, e: err.e, message: err.message })
      // Se conserva el papel estructural para que un error en la condición
      // no descuadre los bloques (un SI mal escrito sigue esperando su FIN_SI).
      const first = tokens[0]
      const role = first.t === 'kw' && ['IF', 'WHILE', 'FOR', 'REPEAT', 'UNTIL', 'FUNCTION'].includes(first.role) ? first.role : 'BAD'
      const placeholder = {
        IF: { type: 'if', cond: null, then: [], else: null },
        WHILE: { type: 'while', cond: null, body: [] },
        FOR: { type: 'for', var: '?', from: null, to: null, body: [] },
        REPEAT: { type: 'repeat', cond: null, body: [] },
      }[role]
      infos.push({
        line,
        role,
        stmt: placeholder ? { ...placeholder, line, id: `L${line}`, broken: true } : null,
        fn: role === 'FUNCTION' ? { type: 'function', name: `?${line}`, params: [], body: [], line, id: `F${line}`, broken: true } : null,
        cond: null,
      })
    }
  })

  if (langsSeen.size > 1) {
    diagnostics.push({
      severity: 'warning',
      line: infos[0]?.line ?? 1,
      message: 'Se mezclan palabras clave en español e inglés. Funciona, pero es más legible usar un solo idioma.',
    })
  }

  const w = WORDS[lang]
  let pos = 0
  let lastLine = infos[0]?.line ?? 1
  const peek = () => infos[pos]
  const take = () => {
    const info = infos[pos++]
    lastLine = info.line
    return info
  }

  function missing(closerRole, openerRole, openerLine) {
    diagnostics.push({
      severity: 'error',
      line: lastLine,
      message: `Falta ${w[closerRole]} para cerrar el ${w[openerRole]} de la línea ${openerLine}.`,
      ghost: `← aquí falta ${w[closerRole]}`,
      related: openerLine,
    })
  }

  function parseBlock(stops, open, depth) {
    const stmts = []
    while (pos < infos.length) {
      const info = peek()
      if (SECTION_STARTS.has(info.role)) return stmts
      if (CLOSERS.has(info.role)) {
        if (stops.includes(info.role) || open.includes(info.role)) return stmts
        take()
        diagnostics.push({
          severity: 'error',
          line: info.line,
          message: `${w[info.role]} sin un ${w[OPENER_OF[info.role]]} abierto que cerrar.`,
        })
        continue
      }
      if (info.role === 'BAD') { take(); continue }

      take()
      const stmt = info.stmt
      const closer = CLOSER_OF[info.role]
      if (closer) {
        if (depth + 1 > LIMITS.maxDepth) {
          diagnostics.push({ severity: 'error', line: info.line, message: `Demasiados bloques anidados (máximo ${LIMITS.maxDepth}).` })
        }
        if (info.role === 'IF') {
          stmt.then = parseBlock(['ELSE', 'END_IF'], [...open, 'END_IF'], depth + 1)
          if (peek()?.role === 'ELSE') {
            stmt.elseLine = take().line
            stmt.else = parseBlock(['END_IF'], [...open, 'END_IF'], depth + 1)
          }
        } else {
          stmt.body = parseBlock([closer], [...open, closer], depth + 1)
        }
        if (peek()?.role === closer) {
          const end = take()
          stmt.endLine = end.line
          if (info.role === 'REPEAT') stmt.cond = end.cond
        } else {
          missing(closer, info.role, info.line)
          stmt.endLine = lastLine
          if (info.role === 'REPEAT') stmt.broken = true
        }
      }
      if (stmt) stmts.push(stmt)
    }
    return stmts
  }

  const functions = []
  let main = null
  let reportedStray = false

  while (pos < infos.length) {
    const info = peek()
    if (info.role === 'FUNCTION') {
      take()
      const fn = info.fn
      fn.body = parseBlock(['END_FUNCTION'], ['END_FUNCTION'], 1)
      if (peek()?.role === 'END_FUNCTION') fn.endLine = take().line
      else {
        missing('END_FUNCTION', 'FUNCTION', info.line)
        fn.endLine = lastLine
      }
      functions.push(fn)
      continue
    }
    if (info.role === 'START' || !main) {
      if (info.role === 'START') {
        if (main) {
          diagnostics.push({ severity: 'error', line: info.line, message: `${w.START} repetido: solo puede haber un bloque principal.` })
        }
        take()
      } else if (!reportedStray) {
        diagnostics.push({
          severity: 'error',
          line: info.line,
          message: `El algoritmo debe empezar con ${w.START} (o ${lang === 'es' ? 'START' : 'INICIO'}). Las funciones van fuera, con ${w.FUNCTION}.`,
          ghost: `← falta ${w.START} antes de esta línea`,
        })
        reportedStray = true
      }
      const startLine = info.line
      const body = parseBlock(['END'], ['END'], 0)
      let endLine = lastLine
      if (peek()?.role === 'END') endLine = take().line
      else {
        diagnostics.push({ severity: 'error', line: lastLine, message: `Falta ${w.END} para cerrar el algoritmo.`, ghost: `← aquí falta ${w.END}` })
      }
      if (!main) main = { body, startLine, endLine }
      continue
    }
    take()
    if (info.role !== 'BAD') {
      diagnostics.push({
        severity: 'error',
        line: info.line,
        message: `Esta línea está fuera del bloque ${w.START}…${w.END} y de cualquier ${w.FUNCTION}.`,
      })
    }
  }

  if (!main) {
    diagnostics.push({ severity: 'error', line: infos.at(-1)?.line ?? 1, message: `Escribe tu algoritmo entre ${w.START} y ${w.END}.` })
    return { ast: null, diagnostics, lang, ok: false }
  }

  const ast = { type: 'program', body: main.body, startLine: main.startLine, endLine: main.endLine, lang, functions }
  checkSemantics(ast, diagnostics, w)

  diagnostics.sort((a, b) => a.line - b.line || (a.severity === 'error' ? -1 : 1))
  const ok = !diagnostics.some((d) => d.severity === 'error')
  return { ast, diagnostics, lang, ok }
}

// ---------------------------------------------------------------------------
// Comprobaciones de significado (llamadas, RETORNAR…)
// ---------------------------------------------------------------------------

function checkSemantics(ast, diagnostics, w) {
  const fnByName = new Map()
  for (const fn of ast.functions) {
    if (fn.broken) continue
    if (fnByName.has(fn.name)) {
      diagnostics.push({ severity: 'error', line: fn.line, message: `La función "${fn.name}" ya está definida en la línea ${fnByName.get(fn.name).line}.` })
    } else {
      fnByName.set(fn.name, fn)
    }
  }

  function checkExpr(e, line) {
    walkExpr(e, (x) => {
      if (x.k !== 'call') return
      if (x.builtin) {
        const spec = BUILTINS[x.name]
        if (x.args.length !== spec.arity) {
          diagnostics.push({ severity: 'error', line, s: x.s, e: x.e, message: `${x.name} necesita ${spec.arity} ${spec.arity === 1 ? 'valor' : 'valores'} entre paréntesis.` })
        }
        return
      }
      const fn = fnByName.get(x.name)
      if (!fn) {
        const hint = builtinCaseHint(x.name)
        diagnostics.push({
          severity: 'error',
          line,
          s: x.nameS,
          e: x.nameE,
          message: hint
            ? `Las funciones predefinidas van en MAYÚSCULAS: escribe ${hint} en lugar de ${x.name}.`
            : `La función "${x.name}" no está definida. Defínela con ${w.FUNCTION} ${x.name}(…) fuera del bloque principal.`,
        })
        return
      }
      if (fn.params.length !== x.args.length) {
        diagnostics.push({
          severity: 'error',
          line,
          s: x.s,
          e: x.e,
          message: `"${x.name}" espera ${fn.params.length} ${fn.params.length === 1 ? 'valor' : 'valores'} y recibe ${x.args.length}.`,
        })
      }
    })
  }

  function checkBlock(stmts, inFunction) {
    walk(stmts, (s) => {
      for (const e of stmtExprs(s)) checkExpr(e, s.line)
      if (s.type === 'return' && !inFunction) {
        diagnostics.push({ severity: 'error', line: s.line, message: `${w.RETURN} solo puede usarse dentro de una ${w.FUNCTION}.` })
      }
      if (s.type === 'repeat' && !s.cond && !s.broken) {
        diagnostics.push({ severity: 'error', line: s.line, message: `Falta la condición de ${w.UNTIL}.` })
      }
    })
  }

  checkBlock(ast.body, false)
  for (const fn of ast.functions) checkBlock(fn.body, true)
}
