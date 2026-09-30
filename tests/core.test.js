import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseProgram } from '../src/core/parser.js'
import { analyzeCost } from '../src/core/cost.js'

const cost = (src) => {
  const r = parseProgram(src)
  assert.ok(r.ok, JSON.stringify(r.diagnostics))
  return analyzeCost(r.ast)
}

test('secuencia simple es O(1)', () => {
  const c = cost('INICIO\n total = 100\n MOSTRAR total\nFIN')
  assert.equal(c.bigO, '1')
  assert.equal(c.worst.toString(), '2')
})

test('PARA de 1 a n es lineal', () => {
  const c = cost('INICIO\nLEER n\nPARA i DESDE 1 HASTA n HACER\n  MOSTRAR i\nFIN_PARA\nFIN')
  assert.equal(c.bigO, 'n')
  assert.equal(c.worst.toString(), '4n + 3')
})

test('PARA anidado triangular', () => {
  const c = cost('START\nINPUT n\nFOR i FROM 1 TO n DO\n FOR j FROM i TO n DO\n  x = x + 1\n END_FOR\nEND_FOR\nEND')
  assert.equal(c.bigO, 'n²')
  assert.equal(c.lines.get(5).count.toString(), 'n²/2 + n/2')
})

test('MIENTRAS lineal y logarítmico', () => {
  const lin = cost('INICIO\nLEER n\ni = 0\nMIENTRAS i < n HACER\n i = i + 1\nFIN_MIENTRAS\nFIN')
  assert.equal(lin.bigO, 'n')
  const log = cost('INICIO\nLEER n\ni = 1\nMIENTRAS i < n HACER\n i = i * 2\nFIN_MIENTRAS\nFIN')
  assert.equal(log.bigO, 'log₂ n')
  const dig = cost('INICIO\nLEER n\nc = 0\nMIENTRAS n > 0 HACER\n n = (n - n % 10) / 10\n c = c + 1\nFIN_MIENTRAS\nFIN')
  assert.equal(dig.bigO, 'log₁₀ n')
})

test('MIENTRAS numérico se simula', () => {
  const c = cost('INICIO\ni = 0\nMIENTRAS i < 10 HACER\n i = i + 3\nFIN_MIENTRAS\nFIN')
  assert.equal(c.lines.get(3).count.toString(), '5')
})

test('SI toma el peor caso', () => {
  const c = cost('INICIO\nLEER n\nSI n > 5 ENTONCES\n PARA i DESDE 1 HASTA n HACER\n  MOSTRAR i\n FIN_PARA\nSINO\n MOSTRAR "poco"\nFIN_SI\nFIN')
  assert.equal(c.bigO, 'n')
  assert.equal(c.bigOmega, '1')
})

test('errores: falta FIN_PARA', () => {
  const r = parseProgram('PARA i DESDE 1 HASTA 5 HACER\n    MOSTRAR i\n')
  assert.equal(r.ok, false)
  const msgs = r.diagnostics.map((d) => d.message).join('\n')
  assert.match(msgs, /Falta FIN_PARA para cerrar el PARA de la línea 1/)
  assert.match(msgs, /debe empezar con INICIO/)
})

test('errores: minúsculas y ENTONCES', () => {
  const r = parseProgram('INICIO\nsi x > 1 ENTONCES\nFIN_SI\nSI x > 2\nFIN_SI\nFIN')
  const msgs = r.diagnostics.map((d) => d.message).join('\n')
  assert.match(msgs, /escribe SI en lugar de si/)
  assert.match(msgs, /Falta ENTONCES/)
})

test('bucle infinito detectado', () => {
  const c = cost('INICIO\nx = 1\nMIENTRAS x > 0 HACER\n MOSTRAR x\nFIN_MIENTRAS\nFIN')
  assert.ok(c.warnings.some((w) => /no termina nunca/.test(w.message)))
})

// ---------------------------------------------------------------------------
// Lógica, listas, funciones y recursión
// ---------------------------------------------------------------------------
import { createRun } from '../src/core/interpreter.js'
import { SAMPLES } from '../src/core/samples.js'

function run(src, inputs = []) {
  const r = parseProgram(src)
  assert.ok(r.ok, JSON.stringify(r.diagnostics))
  const exec = createRun(r.ast, { maxSteps: 1e6 })
  let res = exec.iterator.next()
  while (!res.done) res = exec.iterator.next(res.value?.awaiting ? inputs.shift() : undefined)
  return exec.state
}

test('Y / O / NO con cortocircuito, VERDADERO/FALSO y NULO', () => {
  const st = run(`INICIO
    v = [1, 2, 3]
    i = 4
    SI i <= LONGITUD(v) Y v[i] == 2 ENTONCES
        MOSTRAR "no"
    SINO
        MOSTRAR "cortocircuito"
    FIN_SI
    x = NULO
    MOSTRAR x == NULO, NO VERDADERO, FALSO O VERDADERO
FIN`)
  assert.equal(st.status, 'done')
  assert.deepEqual(st.output, ['cortocircuito', 'VERDADERO FALSO VERDADERO'])
})

test('listas: índices desde 1 y error fuera de rango', () => {
  const ok = run('INICIO\n v = LISTA(3, 0)\n v[2] = 5\n MOSTRAR v, LONGITUD(v)\nFIN')
  assert.deepEqual(ok.output, ['[0, 5, 0] 3'])
  const bad = run('INICIO\n v = [1, 2]\n MOSTRAR v[0]\nFIN')
  assert.equal(bad.status, 'error')
  assert.match(bad.error.message, /los índices van de 1 a 2/)
})

test('LEER acepta listas', () => {
  const st = run('INICIO\n LEER v\n MOSTRAR LONGITUD(v), v[3]\nFIN', ['[4, 5, 6]'])
  assert.deepEqual(st.output, ['3 6'])
})

test('REPETIR … HASTA_QUE', () => {
  const st = run('INICIO\n i = 0\n REPETIR\n  i = i + 1\n HASTA_QUE i >= 3\n MOSTRAR i\nFIN')
  assert.deepEqual(st.output, ['3'])
  const c = cost('INICIO\n LEER n\n i = 0\n REPETIR\n  i = i + 1\n HASTA_QUE i >= n\nFIN')
  assert.equal(c.bigO, 'n')
})

test('funciones: errores de llamada', () => {
  const r = parseProgram('FUNCION f(a)\n RETORNAR a\nFIN_FUNCION\nINICIO\n x = f(1, 2)\n y = g(1)\n z = longitud(x)\n RETORNAR 3\nFIN')
  const msgs = r.diagnostics.map((d) => d.message).join('\n')
  assert.match(msgs, /espera 1 valor y recibe 2/)
  assert.match(msgs, /"g" no está definida/)
  assert.match(msgs, /escribe LONGITUD en lugar de longitud/)
  assert.match(msgs, /RETORNAR solo puede usarse dentro de una FUNCION/)
})

test('falta FIN_FUNCION', () => {
  const r = parseProgram('FUNCION f(a)\n RETORNAR a\nINICIO\n MOSTRAR f(1)\nFIN')
  assert.match(r.diagnostics.map((d) => d.message).join('\n'), /Falta FIN_FUNCION para cerrar el FUNCION de la línea 1/)
})

test('recursión: órdenes de los ejemplos', () => {
  const byName = Object.fromEntries(SAMPLES.map((s) => [s.name, s.code]))
  assert.equal(cost(byName['Fibonacci recursivo']).bigO, '1,618ⁿ')
  assert.equal(cost(byName['Potencia rápida (recursiva)']).bigO, 'log₂ n')
  assert.equal(cost(byName['Ordenación por mezcla (merge sort)']).bigO, '|v|·log₂ |v|')
  const bin = cost(byName['Búsqueda binaria (recursiva)'])
  assert.equal(bin.bigO, 'log₂ |v|')
  assert.equal(bin.bigOmega, '1')
  assert.equal(cost(byName['Ordenación burbuja']).bigO, '|v|²')
})

test('recursión lineal (factorial) y ejecución', () => {
  const src = 'FUNCION fact(n)\n SI n <= 1 ENTONCES\n  RETORNAR 1\n FIN_SI\n RETORNAR n * fact(n - 1)\nFIN_FUNCION\nINICIO\n LEER n\n MOSTRAR fact(n)\nFIN'
  assert.equal(cost(src).bigO, 'n')
  assert.deepEqual(run(src, ['5']).output, ['120'])
})

test('recursión sin caso base se detiene con un error claro', () => {
  const st = run('FUNCION f(n)\n RETORNAR f(n - 1)\nFIN_FUNCION\nINICIO\n MOSTRAR f(3)\nFIN')
  assert.equal(st.status, 'error')
  assert.match(st.error.message, /caso base/)
})

test('todos los ejemplos se ejecutan sin error', () => {
  for (const s of SAMPLES) {
    const inputs = s.code.includes('LEER v') ? ['[5, 3, 8, 1, 9, 2]', '8'] : ['12', '8']
    const st = run(s.code, inputs)
    assert.equal(st.status, 'done', `${s.name}: ${st.error?.message}`)
  }
})

// ---------------------------------------------------------------------------
// Control de bucles infinitos
// ---------------------------------------------------------------------------

test('bucle infinito detectado al repetirse el estado', () => {
  const st = run('INICIO\n x = 1\n MIENTRAS x > 0 HACER\n  MOSTRAR x\n FIN_MIENTRAS\nFIN')
  assert.equal(st.status, 'error')
  assert.equal(st.error.kind, 'loop')
  assert.equal(st.error.line, 3)
  assert.match(st.error.message, /x = 1/)
  assert.ok(st.steps < 20)
})

test('ciclo de periodo mayor que 1 también se detecta', () => {
  const st = run('INICIO\n x = 0\n MIENTRAS x < 10 HACER\n  x = 1 - x\n FIN_MIENTRAS\nFIN')
  assert.equal(st.error?.kind, 'loop')
})

test('PARA con el contador reiniciado en el cuerpo', () => {
  const st = run('INICIO\n PARA i DESDE 1 HASTA 3 HACER\n  i = 1\n FIN_PARA\nFIN')
  assert.equal(st.error?.kind, 'loop')
})

test('REPETIR sin avance', () => {
  const st = run('INICIO\n n = 5\n REPETIR\n  MOSTRAR n\n HASTA_QUE n == 0\nFIN')
  assert.equal(st.error?.kind, 'loop')
  assert.equal(st.error.line, 5)
})

test('recursión con los mismos argumentos', () => {
  const st = run('FUNCION f(n)\n SI n == 0 ENTONCES\n  RETORNAR 0\n FIN_SI\n RETORNAR f(n)\nFIN_FUNCION\nINICIO\n MOSTRAR f(3)\nFIN')
  assert.equal(st.error?.kind, 'recursion')
  assert.match(st.error.message, /f\(3\)/)
})

test('bucles normales largos no dan falsos positivos', () => {
  const st = run('INICIO\n s = 0\n i = 0\n MIENTRAS i < 30000 HACER\n  i = i + 1\n  s = s + i % 3\n FIN_MIENTRAS\n MOSTRAR s\nFIN')
  assert.equal(st.status, 'done')
})

test('con ALEATORIO no se aplica la detección (no es determinista)', () => {
  const st = run('INICIO\n x = 0\n MIENTRAS x != 3 HACER\n  x = ALEATORIO(1, 3)\n FIN_MIENTRAS\n MOSTRAR x\nFIN')
  assert.equal(st.status, 'done')
})

test('condición constante en el análisis', () => {
  const c = cost('INICIO\n MIENTRAS VERDADERO HACER\n  MOSTRAR 1\n FIN_MIENTRAS\nFIN')
  assert.ok(c.warnings.some((w) => /siempre se cumple/.test(w.message)))
  const d = cost('INICIO\n MIENTRAS 2 < 1 HACER\n  MOSTRAR 1\n FIN_MIENTRAS\nFIN')
  assert.equal(d.bigO, '1')
})

test('olvidar el incremento se detecta aunque cambien otras variables', () => {
  const st = run('INICIO\n LEER n\n i = 1\n suma = 0\n MIENTRAS i <= n HACER\n  suma = suma + i\n FIN_MIENTRAS\nFIN', ['10'])
  assert.equal(st.error?.kind, 'loop')
  assert.match(st.error.message, /i = 1/)
  assert.ok(st.steps < 20)
})

test('dependencias indirectas: no hay falso positivo', () => {
  // La condición depende de i, que depende de paso, que cambia: el bucle termina.
  const st = run('INICIO\n i = 0\n paso = 0\n MIENTRAS i < 50 HACER\n  paso = paso + 1\n  i = i + paso\n FIN_MIENTRAS\n MOSTRAR i\nFIN')
  assert.equal(st.status, 'done')
})

test('asignación controlada por un SI también cuenta', () => {
  const st = run('INICIO\n i = 0\n t = 0\n MIENTRAS i < 5 HACER\n  t = t + 1\n  SI t % 2 == 0 ENTONCES\n   i = i + 1\n  FIN_SI\n FIN_MIENTRAS\n MOSTRAR i\nFIN')
  assert.equal(st.status, 'done')
})
