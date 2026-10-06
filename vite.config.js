import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Versión de package.json, disponible en el código como __APP_VERSION__ (se usa en los informes de errores).
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

// Política de seguridad de contenidos que se inyecta solo en la build de producción
// (en desarrollo Vite necesita estilos en línea y websockets para la recarga en caliente).
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "font-src 'self'",
  "img-src 'self' blob: data:",
  "connect-src 'none'",
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
  "require-trusted-types-for 'script'",
  'trusted-types vue',
].join('; ')

function contentSecurityPolicy() {
  return {
    name: 'transcriptor-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<!-- CSP -->',
        `<meta http-equiv="Content-Security-Policy" content="${CSP}">`,
      )
    },
  }
}

export default defineConfig({
  plugins: [vue(), contentSecurityPolicy()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  base: './',
  // Solo en este equipo (no en la red local), y en IPv4 para que funcionen tanto
  // http://localhost como http://127.0.0.1.
  server: { host: '127.0.0.1', port: 5173, open: true },
  preview: { host: '127.0.0.1', port: 4173, open: true },
  build: {
    // Sin recursos incrustados como data: ni mapas de código fuente publicados.
    assetsInlineLimit: 0,
    sourcemap: false,
  },
})
