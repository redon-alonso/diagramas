import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildIssueUrl, ISSUES_URL } from '../src/core/report.js'

const read = (url) => {
  const u = new URL(url)
  return { base: `${u.origin}${u.pathname}`, title: u.searchParams.get('title'), body: u.searchParams.get('body') }
}

test('informe: título, mensaje, código y datos en el cuerpo del issue', () => {
  const r = read(buildIssueUrl({ title: 'Fallo en el coste', message: 'No se ha podido calcular', detail: 'TypeError: x', code: 'INICIO\n MOSTRAR "ñ"\nFIN', version: '0.1.0', userAgent: 'Prueba/1.0' }))
  assert.equal(r.base, ISSUES_URL)
  assert.equal(r.title, 'Fallo en el coste')
  for (const part of ['No se ha podido calcular', 'TypeError: x', 'MOSTRAR "ñ"', 'Versión: 0.1.0', 'Navegador: Prueba/1.0']) assert.ok(r.body.includes(part), part)
})

test('informe: sin código no aparece la sección de código', () => {
  assert.ok(!read(buildIssueUrl({ message: 'x' })).body.includes('### Código'))
})

test('informe: un código enorme se recorta para que la URL no supere el límite', () => {
  const url = buildIssueUrl({ code: 'MOSTRAR 1\n'.repeat(3000) })
  assert.ok(url.length <= 7500, String(url.length))
  assert.match(read(url).body, /Código recortado: faltan \d+ caracteres/)
})
