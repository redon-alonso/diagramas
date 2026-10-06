// Informes de errores: se construye un enlace a un issue de GitHub ya rellenado.
// No se envía nada desde la aplicación: el usuario ve el informe en GitHub y decide si lo publica.

export const ISSUES_URL = 'https://github.com/redon-alonso/diagramas/issues/new'

// GitHub rechaza URLs muy largas; se deja margen.
const MAX_URL = 7500

function body({ message, detail, code, version, userAgent }, codeShown) {
  const lines = [
    '### ¿Qué ha pasado?',
    '<!-- Cuenta qué estabas haciendo y qué esperabas que pasara. -->',
    '',
    '',
  ]
  if (message) lines.push('### Mensaje que ha aparecido', message, '')
  if (detail) lines.push('### Detalle técnico', '```', detail, '```', '')
  if (code != null) {
    lines.push('### Código', '```', codeShown, '```')
    if (codeShown.length < code.length) lines.push(`_(Código recortado: faltan ${code.length - codeShown.length} caracteres. Si puedes, pégalo completo o adjunta la exportación de la biblioteca.)_`)
    lines.push('')
  }
  lines.push('### Datos', `- Versión: ${version || 'desconocida'}`, `- Navegador: ${userAgent || 'desconocido'}`)
  return lines.join('\n')
}

/**
 * URL de un issue nuevo con título y cuerpo rellenados.
 * `code` es opcional; si no cabe entero en la URL se recorta por el final.
 */
export function buildIssueUrl({ title = 'Informe de error', message = '', detail = '', code = null, version = '', userAgent = '' } = {}) {
  const make = (codeShown) => `${ISSUES_URL}?${new URLSearchParams({ title, body: body({ message, detail, code, version, userAgent }, codeShown) })}`
  if (code == null) return make('')
  let shown = code
  let url = make(shown)
  while (url.length > MAX_URL && shown.length > 0) {
    shown = shown.slice(0, Math.floor(shown.length * 0.8))
    url = make(shown)
  }
  return url
}
