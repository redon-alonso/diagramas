// Analizador léxico del pseudocódigo definido en gramatica.md.
// Trabaja línea a línea: cada instrucción ocupa exactamente una línea.

export const LIMITS = Object.freeze({
  maxChars: 20000,
  maxLines: 1500,
  maxLineLength: 400,
  maxDepth: 40,
  maxExprDepth: 60,
})

// Palabras clave en MAYÚSCULAS estrictas (sección 1: "Filtro de Caja").
// `role` describe qué hace la palabra; `lang` el idioma en que está escrita.
export const KEYWORDS = Object.freeze({
  INICIO: { role: 'START', lang: 'es' },
  START: { role: 'START', lang: 'en' },
  FIN: { role: 'END', lang: 'es' },
  END: { role: 'END', lang: 'en' },
  MOSTRAR: { role: 'PRINT', lang: 'es' },
  PRINT: { role: 'PRINT', lang: 'en' },
  LEER: { role: 'READ', lang: 'es' },
  INPUT: { role: 'READ', lang: 'en' },
  SI: { role: 'IF', lang: 'es' },
  IF: { role: 'IF', lang: 'en' },
  ENTONCES: { role: 'THEN', lang: 'es' },
  THEN: { role: 'THEN', lang: 'en' },
  SINO: { role: 'ELSE', lang: 'es' },
  ELSE: { role: 'ELSE', lang: 'en' },
  FIN_SI: { role: 'END_IF', lang: 'es' },
  END_IF: { role: 'END_IF', lang: 'en' },
  MIENTRAS: { role: 'WHILE', lang: 'es' },
  WHILE: { role: 'WHILE', lang: 'en' },
  HACER: { role: 'DO', lang: 'es' },
  DO: { role: 'DO', lang: 'en' },
  FIN_MIENTRAS: { role: 'END_WHILE', lang: 'es' },
  END_WHILE: { role: 'END_WHILE', lang: 'en' },
  PARA: { role: 'FOR', lang: 'es' },
  FOR: { role: 'FOR', lang: 'en' },
  DESDE: { role: 'FROM', lang: 'es' },
  FROM: { role: 'FROM', lang: 'en' },
  HASTA: { role: 'TO', lang: 'es' },
  TO: { role: 'TO', lang: 'en' },
  FIN_PARA: { role: 'END_FOR', lang: 'es' },
  END_FOR: { role: 'END_FOR', lang: 'en' },
  REPETIR: { role: 'REPEAT', lang: 'es' },
  REPEAT: { role: 'REPEAT', lang: 'en' },
  HASTA_QUE: { role: 'UNTIL', lang: 'es' },
  UNTIL: { role: 'UNTIL', lang: 'en' },
  FUNCION: { role: 'FUNCTION', lang: 'es' },
  FUNCTION: { role: 'FUNCTION', lang: 'en' },
  FIN_FUNCION: { role: 'END_FUNCTION', lang: 'es' },
  END_FUNCTION: { role: 'END_FUNCTION', lang: 'en' },
  RETORNAR: { role: 'RETURN', lang: 'es' },
  RETURN: { role: 'RETURN', lang: 'en' },
  Y: { role: 'AND', lang: 'es' },
  AND: { role: 'AND', lang: 'en' },
  O: { role: 'OR', lang: 'es' },
  OR: { role: 'OR', lang: 'en' },
  NO: { role: 'NOT', lang: 'es' },
  NOT: { role: 'NOT', lang: 'en' },
  VERDADERO: { role: 'TRUE', lang: 'es' },
  TRUE: { role: 'TRUE', lang: 'en' },
  FALSO: { role: 'FALSE', lang: 'es' },
  FALSE: { role: 'FALSE', lang: 'en' },
  NULO: { role: 'NULL', lang: 'es' },
  NULL: { role: 'NULL', lang: 'en' },
})

// Funciones predefinidas (nombres en MAYÚSCULAS, en los dos idiomas).
export const BUILTINS = Object.freeze({
  LONGITUD: { id: 'len', arity: 1, lang: 'es' },
  LENGTH: { id: 'len', arity: 1, lang: 'en' },
  LISTA: { id: 'list', arity: 2, lang: 'es' },
  LIST: { id: 'list', arity: 2, lang: 'en' },
  ENTERO: { id: 'int', arity: 1, lang: 'es' },
  INT: { id: 'int', arity: 1, lang: 'en' },
  ABS: { id: 'abs', arity: 1, lang: 'both' },
  RAIZ: { id: 'sqrt', arity: 1, lang: 'es' },
  SQRT: { id: 'sqrt', arity: 1, lang: 'en' },
  MAX: { id: 'max', arity: 2, lang: 'both' },
  MIN: { id: 'min', arity: 2, lang: 'both' },
  ALEATORIO: { id: 'random', arity: 2, lang: 'es' },
  RANDOM: { id: 'random', arity: 2, lang: 'en' },
})

// Palabra clave de cada rol en cada idioma (para mensajes y etiquetas).
export const WORDS = Object.freeze({
  es: { START: 'INICIO', END: 'FIN', PRINT: 'MOSTRAR', READ: 'LEER', IF: 'SI', THEN: 'ENTONCES', ELSE: 'SINO', END_IF: 'FIN_SI', WHILE: 'MIENTRAS', DO: 'HACER', END_WHILE: 'FIN_MIENTRAS', FOR: 'PARA', FROM: 'DESDE', TO: 'HASTA', END_FOR: 'FIN_PARA', REPEAT: 'REPETIR', UNTIL: 'HASTA_QUE', FUNCTION: 'FUNCION', END_FUNCTION: 'FIN_FUNCION', RETURN: 'RETORNAR', AND: 'Y', OR: 'O', NOT: 'NO', TRUE: 'VERDADERO', FALSE: 'FALSO', NULL: 'NULO' },
  en: { START: 'START', END: 'END', PRINT: 'PRINT', READ: 'INPUT', IF: 'IF', THEN: 'THEN', ELSE: 'ELSE', END_IF: 'END_IF', WHILE: 'WHILE', DO: 'DO', END_WHILE: 'END_WHILE', FOR: 'FOR', FROM: 'FROM', TO: 'TO', END_FOR: 'END_FOR', REPEAT: 'REPEAT', UNTIL: 'UNTIL', FUNCTION: 'FUNCTION', END_FUNCTION: 'END_FUNCTION', RETURN: 'RETURN', AND: 'AND', OR: 'OR', NOT: 'NOT', TRUE: 'TRUE', FALSE: 'FALSE', NULL: 'NULL' },
})

const OPERATORS = ['==', '!=', '>=', '<=', '>', '<', '=', '+', '-', '*', '/', '%', '(', ')', '[', ']', ',']
const IDENT_START = /[A-Za-z_]/
const IDENT_PART = /[A-Za-z0-9_]/
const DIGIT = /[0-9]/

/**
 * Convierte una línea en tokens. Nunca lanza: los caracteres no válidos
 * se devuelven como tokens `bad` para que el parser informe y el editor los resalte.
 * Token: { t: 'kw'|'id'|'num'|'str'|'op'|'comment'|'bad', v, s (col inicio), e (col fin), role?, lang?, unterminated? }
 */
export function tokenizeLine(text) {
  const tokens = []
  let i = 0
  const n = text.length
  while (i < n) {
    const ch = text[i]
    if (ch === ' ' || ch === '\t' || ch === '\r') { i++; continue }
    if (ch === '/' && text[i + 1] === '/') {
      tokens.push({ t: 'comment', v: text.slice(i), s: i, e: n })
      break
    }
    if (ch === '"') {
      let j = i + 1
      while (j < n && text[j] !== '"') j++
      const closed = j < n
      tokens.push({ t: 'str', v: text.slice(i + 1, j), s: i, e: closed ? j + 1 : n, unterminated: !closed })
      i = closed ? j + 1 : n
      continue
    }
    if (DIGIT.test(ch) || (ch === '.' && DIGIT.test(text[i + 1] ?? ''))) {
      let j = i
      while (j < n && DIGIT.test(text[j])) j++
      if (text[j] === '.' && DIGIT.test(text[j + 1] ?? '')) {
        j++
        while (j < n && DIGIT.test(text[j])) j++
      }
      // "12abc" no es un identificador válido: se marca entero como erróneo.
      if (j < n && IDENT_PART.test(text[j])) {
        let k = j
        while (k < n && IDENT_PART.test(text[k])) k++
        tokens.push({ t: 'bad', v: text.slice(i, k), s: i, e: k, reason: 'ident-digit' })
        i = k
        continue
      }
      tokens.push({ t: 'num', v: Number(text.slice(i, j)), raw: text.slice(i, j), s: i, e: j })
      i = j
      continue
    }
    if (IDENT_START.test(ch)) {
      let j = i
      while (j < n && IDENT_PART.test(text[j])) j++
      const word = text.slice(i, j)
      const kw = Object.hasOwn(KEYWORDS, word) ? KEYWORDS[word] : null
      if (kw) tokens.push({ t: 'kw', v: word, s: i, e: j, role: kw.role, lang: kw.lang })
      else tokens.push({ t: 'id', v: word, s: i, e: j })
      i = j
      continue
    }
    const op = OPERATORS.find((o) => text.startsWith(o, i))
    if (op) {
      tokens.push({ t: 'op', v: op, s: i, e: i + op.length })
      i += op.length
      continue
    }
    tokens.push({ t: 'bad', v: ch, s: i, e: i + 1, reason: 'char' })
    i++
  }
  return tokens
}

/** Si una palabra coincide con una palabra clave salvo por mayúsculas, devuelve la forma correcta. */
export function keywordCaseHint(word) {
  const upper = word.toUpperCase()
  return upper !== word && Object.hasOwn(KEYWORDS, upper) ? upper : null
}

/** Igual que keywordCaseHint pero para funciones predefinidas (longitud → LONGITUD). */
export function builtinCaseHint(word) {
  const upper = word.toUpperCase()
  return upper !== word && Object.hasOwn(BUILTINS, upper) ? upper : null
}

export const isBuiltin = (name) => Object.hasOwn(BUILTINS, name)
