// Enlaces para compartir: el algoritmo viaja comprimido en el fragmento de la URL (#c=…).
// El fragmento nunca se envía al servidor, así que no hace falta backend ni conexión.
// Lo que llega por un enlace es entrada no fiable: se valida igual que una importación.

import { LIMITS } from './lexer.js'
import { cleanText, STORAGE_LIMITS } from './storage.js'

const PREFIX = 'c='
const FORMAT = 1
// Límites contra enlaces manipulados: tamaño del fragmento y del texto ya descomprimido.
const MAX_HASH_CHARS = 64_000
const MAX_JSON_BYTES = LIMITS.maxChars * 4 + 1024

const BROKEN = 'El enlace está dañado o incompleto: no se ha podido abrir el algoritmo. Pide que te lo vuelvan a enviar.'

/** ¿Puede este navegador crear y abrir enlaces? (CompressionStream con deflate-raw) */
export function shareSupported() {
  try {
    new CompressionStream('deflate-raw')
    new DecompressionStream('deflate-raw')
    return true
  } catch {
    return false
  }
}

function toBase64Url(bytes) {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text) {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) throw new Error(BROKEN)
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0))
}

/** Pasa unos bytes por un flujo de (des)compresión, cortando si el resultado supera `limit`. */
async function transform(bytes, stream, limit = Infinity) {
  const reader = new Blob([bytes]).stream().pipeThrough(stream).getReader()
  const chunks = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > limit) {
      await reader.cancel()
      throw new Error(BROKEN)
    }
    chunks.push(value)
  }
  const out = new Uint8Array(size)
  let at = 0
  for (const c of chunks) {
    out.set(c, at)
    at += c.length
  }
  return out
}

/** Devuelve el fragmento (sin '#') que representa el algoritmo. */
export async function encodeShare({ code, name = '' }) {
  const json = JSON.stringify({ v: FORMAT, n: name, c: code })
  const packed = await transform(new TextEncoder().encode(json), new CompressionStream('deflate-raw'))
  return PREFIX + toBase64Url(packed)
}

/**
 * Lee un fragmento de URL. Devuelve null si no es un enlace compartido, { code, name } si es
 * válido, y lanza un Error con mensaje legible si está dañado.
 */
export async function decodeShare(hash) {
  const fragment = (hash ?? '').replace(/^#/, '')
  if (!fragment.startsWith(PREFIX)) return null
  if (fragment.length > MAX_HASH_CHARS) throw new Error('El enlace es demasiado largo para abrirlo.')
  let data
  try {
    const raw = await transform(fromBase64Url(fragment.slice(PREFIX.length)), new DecompressionStream('deflate-raw'), MAX_JSON_BYTES)
    data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw))
  } catch {
    throw new Error(BROKEN)
  }
  if (!data || typeof data !== 'object' || data.v !== FORMAT) throw new Error(BROKEN)
  const code = cleanText(data.c, LIMITS.maxChars, { multiline: true })
  if (!code.trim()) throw new Error(BROKEN)
  return { code, name: cleanText(data.n, STORAGE_LIMITS.maxName).trim() }
}
