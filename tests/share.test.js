import { test } from 'node:test'
import assert from 'node:assert/strict'
import { encodeShare, decodeShare } from '../src/core/share.js'

const CODE = 'INICIO\n  LEER n\n  // ñandú, «comillas» y acentos\n  MOSTRAR "Hola", n\nFIN'

test('compartir: ida y vuelta conserva código y nombre', async () => {
  const hash = await encodeShare({ code: CODE, name: 'Búsqueda lineal' })
  assert.match(hash, /^c=[A-Za-z0-9_-]+$/)
  assert.deepEqual(await decodeShare(`#${hash}`), { code: CODE, name: 'Búsqueda lineal' })
})

test('compartir: un fragmento que no es un enlace compartido se ignora', async () => {
  assert.equal(await decodeShare(''), null)
  assert.equal(await decodeShare('#seccion'), null)
})

test('compartir: enlaces dañados dan un error legible', async () => {
  const hash = await encodeShare({ code: CODE })
  await assert.rejects(decodeShare(`#${hash.slice(0, -6)}`), /dañado/)
  await assert.rejects(decodeShare('#c=<script>'), /dañado/)
  await assert.rejects(decodeShare(`#c=${'A'.repeat(70_000)}`), /demasiado largo/)
})

test('compartir: se limpian caracteres de control y se rechaza el código vacío', async () => {
  const dirty = await encodeShare({ code: 'INICIO\u0007\n‮MOSTRAR 1\nFIN', name: 'x\u0000y' })
  assert.deepEqual(await decodeShare(dirty), { code: 'INICIO\nMOSTRAR 1\nFIN', name: 'xy' })
  await assert.rejects(decodeShare(await encodeShare({ code: '   ' })), /dañado/)
})
