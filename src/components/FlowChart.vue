<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount, useId, nextTick } from 'vue'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  // Lista de diagramas: el principal y uno por función ({ key, title, nodes, edges, width, height }).
  diagrams: { type: Array, default: () => [] },
  // Función que se está ejecutando: el diagrama cambia solo para seguirla.
  followKey: { type: String, default: null },
  stale: { type: Boolean, default: false },
  activeId: { type: String, default: null },
  lastBranch: { type: String, default: null },
  visits: { type: Object, default: null },
  counts: { type: Map, default: () => new Map() },
  focusLine: { type: Number, default: null },
  name: { type: String, default: 'diagrama' },
  compact: { type: Boolean, default: false },
})
const emit = defineEmits(['node-click', 'node-hover'])

const uid = useId()
const arrowId = `arrow-${uid}`
const arrowHotId = `arrow-hot-${uid}`
const viewport = ref(null)
const svgEl = ref(null)
const view = ref({ x: 0, y: 0, k: 1 })
const autoFit = ref(true)
const showLegend = ref(false)

const selectedKey = ref('main')
const flow = computed(() => props.diagrams.find((d) => d.key === selectedKey.value) ?? props.diagrams[0] ?? null)
watch(() => props.diagrams, (list) => {
  if (!list.some((d) => d.key === selectedKey.value)) selectedKey.value = 'main'
})
watch(() => props.followKey, (key) => {
  if (key && props.diagrams.some((d) => d.key === key)) selectedKey.value = key
})

const nodes = computed(() => flow.value?.nodes ?? [])
const edges = computed(() => flow.value?.edges ?? [])
const hotEdge = computed(() => (props.activeId && props.lastBranch ? `${props.activeId}:${props.lastBranch}` : null))

function shapePoints(n) {
  const { x, y, w, h } = n
  if (n.kind === 'io') return `${x + 12},${y} ${x + w},${y} ${x + w - 12},${y + h} ${x},${y + h}`
  if (n.kind === 'decision') return `${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}`
  if (n.kind === 'loop') return `${x + 14},${y} ${x + w - 14},${y} ${x + w},${y + h / 2} ${x + w - 14},${y + h} ${x + 14},${y + h} ${x},${y + h / 2}`
  return null
}

const pathOf = (points) => points.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join(' ')

function badgeFor(n) {
  if (props.visits) {
    const v = props.visits[n.id]
    return v ? { text: `×${v}`, cls: 'run' } : null
  }
  if (n.kind === 'terminator') return null
  const c = props.counts.get(n.line)
  return c ? { text: `×${c.count}`, cls: `g-${c.cls}` } : null
}

const kindName = { terminator: 'Inicio o fin', process: 'Proceso', io: 'Entrada o salida', decision: 'Decisión', loop: 'Bucle PARA', call: 'Llamada a una función' }

function nodeTitle(n) {
  const where = n.line ? ` · línea ${n.line}` : ''
  const kind = n.sub === 'return' ? 'Devolver resultado' : n.sub === 'fn' ? 'Función' : kindName[n.kind]
  return `${kind}${where}\n${n.full}`
}

// ---------------------------------------------------------------------------
// Zoom y desplazamiento
// ---------------------------------------------------------------------------

function fit() {
  const el = viewport.value
  if (!el || !flow.value) return
  const pad = 16
  const top = props.diagrams.length > 1 ? 44 : pad
  const W = el.clientWidth - pad * 2
  const H = el.clientHeight - pad - top
  if (W <= 0 || H <= 0) return
  const k = Math.min(1.25, W / flow.value.width, H / flow.value.height)
  view.value = {
    k,
    x: pad + (W - flow.value.width * k) / 2,
    y: top + Math.max(0, (H - flow.value.height * k) / 2 * 0.3),
  }
  autoFit.value = true
}

function zoomAt(factor, cx, cy) {
  const { x, y, k } = view.value
  const nk = Math.min(3, Math.max(0.2, k * factor))
  const f = nk / k
  view.value = { k: nk, x: cx - (cx - x) * f, y: cy - (cy - y) * f }
  autoFit.value = false
}

function zoomButton(factor) {
  const el = viewport.value
  zoomAt(factor, el.clientWidth / 2, el.clientHeight / 2)
}

function onWheel(event) {
  event.preventDefault()
  const rect = viewport.value.getBoundingClientRect()
  if (event.ctrlKey || Math.abs(event.deltaY) > Math.abs(event.deltaX) * 2 && !event.shiftKey) {
    zoomAt(Math.exp(-event.deltaY * 0.0015), event.clientX - rect.left, event.clientY - rect.top)
  } else {
    view.value = { ...view.value, x: view.value.x - event.deltaX, y: view.value.y - event.deltaY }
    autoFit.value = false
  }
}

let drag = null
function onPointerDown(event) {
  if (event.button !== 0 || event.target.closest('.node')) return
  drag = { id: event.pointerId, sx: event.clientX, sy: event.clientY, x: view.value.x, y: view.value.y }
  viewport.value.setPointerCapture(event.pointerId)
}
function onPointerMove(event) {
  if (!drag || drag.id !== event.pointerId) return
  view.value = { ...view.value, x: drag.x + event.clientX - drag.sx, y: drag.y + event.clientY - drag.sy }
  autoFit.value = false
}
function onPointerUp(event) {
  if (drag?.id === event.pointerId) drag = null
}

function onKey(event) {
  const step = 40
  const moves = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }
  if (moves[event.key]) {
    event.preventDefault()
    view.value = { ...view.value, x: view.value.x + moves[event.key][0], y: view.value.y + moves[event.key][1] }
    autoFit.value = false
  } else if (event.key === '+' || event.key === '=') zoomButton(1.2)
  else if (event.key === '-') zoomButton(1 / 1.2)
  else if (event.key === '0') fit()
}

let resizeObserver = null
onMounted(() => {
  viewport.value.addEventListener('wheel', onWheel, { passive: false })
  resizeObserver = new ResizeObserver(() => { if (autoFit.value) fit() })
  resizeObserver.observe(viewport.value)
  fit()
})
onBeforeUnmount(() => {
  viewport.value?.removeEventListener('wheel', onWheel)
  resizeObserver?.disconnect()
})

watch(flow, (next, prev) => {
  if (autoFit.value || next?.key !== prev?.key) nextTick(fit)
})

// Durante la ejecución, el nodo activo se mantiene a la vista.
watch(() => props.activeId, (id) => {
  if (!id || !viewport.value) return
  const n = nodes.value.find((node) => node.id === id)
  if (!n) return
  const { x, y, k } = view.value
  const el = viewport.value
  const sx = x + (n.x + n.w / 2) * k
  const sy = y + (n.y + n.h / 2) * k
  const margin = 60
  if (sx < margin || sx > el.clientWidth - margin || sy < margin || sy > el.clientHeight - margin) {
    view.value = { k, x: el.clientWidth / 2 - (n.x + n.w / 2) * k, y: el.clientHeight / 2 - (n.y + n.h / 2) * k }
  }
})

const gridStyle = computed(() => {
  const s = 24 * view.value.k
  return {
    backgroundSize: `${s}px ${s}px, ${s}px ${s}px, ${s * 5}px ${s * 5}px, ${s * 5}px ${s * 5}px`,
    backgroundPosition: `${view.value.x}px ${view.value.y}px`,
  }
})

// ---------------------------------------------------------------------------
// Exportación
// ---------------------------------------------------------------------------

const STYLE_PROPS = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'font-family', 'font-size', 'font-weight', 'opacity', 'text-anchor', 'dominant-baseline', 'paint-order', 'stroke-linejoin']

function buildExportSvg() {
  const src = svgEl.value
  const clone = src.cloneNode(true)
  const srcEls = src.querySelectorAll('*')
  const dstEls = clone.querySelectorAll('*')
  srcEls.forEach((el, i) => {
    const cs = getComputedStyle(el)
    const decl = STYLE_PROPS.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(';')
    dstEls[i].setAttribute('style', decl)
    dstEls[i].removeAttribute('class')
  })
  const root = clone.querySelector('g.world')
  root.removeAttribute('transform')
  clone.querySelectorAll('.badge, .hot-under').forEach((el) => el.remove())
  const { width, height } = flow.value
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('viewBox', `0 0 ${width} ${height}`)
  clone.setAttribute('width', width)
  clone.setAttribute('height', height)
  clone.removeAttribute('class')
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  bg.setAttribute('width', width)
  bg.setAttribute('height', height)
  bg.setAttribute('fill', getComputedStyle(viewport.value).getPropertyValue('--paper').trim() || '#ffffff')
  clone.insertBefore(bg, clone.firstChild)
  return { text: new XMLSerializer().serializeToString(clone), width, height }
}

function fileBase() {
  const safe = (props.name || 'diagrama').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
  return safe || 'diagrama'
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function exportSvg() {
  if (!flow.value) return
  const { text } = buildExportSvg()
  download(new Blob([text], { type: 'image/svg+xml' }), `${fileBase()}.svg`)
}

function exportPng() {
  if (!flow.value) return
  const { text, width, height } = buildExportSvg()
  const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }))
  const img = new Image()
  img.onload = () => {
    const scale = Math.min(2, 8000 / Math.max(width, height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(width * scale)
    canvas.height = Math.round(height * scale)
    const ctx = canvas.getContext('2d')
    ctx.scale(scale, scale)
    ctx.drawImage(img, 0, 0)
    URL.revokeObjectURL(url)
    canvas.toBlob((blob) => blob && download(blob, `${fileBase()}.png`), 'image/png')
  }
  img.onerror = () => URL.revokeObjectURL(url)
  img.src = url
}
</script>

<template>
  <div class="chart">
    <div v-if="diagrams.length > 1" class="tabs" role="tablist" aria-label="Diagramas">
      <button
        v-for="d in diagrams"
        :key="d.key"
        type="button"
        role="tab"
        :aria-selected="d.key === selectedKey"
        :class="{ running: d.key === followKey }"
        @click="selectedKey = d.key"
      >{{ d.title }}</button>
    </div>
    <div
      ref="viewport"
      class="viewport"
      :style="gridStyle"
      tabindex="0"
      role="region"
      :aria-label="flow ? `Diagrama de flujo con ${nodes.length} nodos. Usa las flechas para desplazarte y + o − para ampliar.` : 'Diagrama vacío'"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @keydown="onKey"
    >
      <svg v-if="flow" ref="svgEl" class="svg" :class="{ stale }" width="100%" height="100%">
        <defs>
          <marker :id="arrowId" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" class="arrow-head" />
          </marker>
          <marker :id="arrowHotId" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" class="arrow-head hot" />
          </marker>
        </defs>
        <g class="world" :transform="`translate(${view.x} ${view.y}) scale(${view.k})`">
          <g class="edges">
            <template v-for="e in edges" :key="e.id">
              <path v-if="e.id === hotEdge" class="hot-under" :d="pathOf(e.points)" />
              <path
                class="edge"
                :class="[e.kind, { hot: e.id === hotEdge }]"
                :d="pathOf(e.points)"
                :marker-end="e.arrow ? `url(#${e.id === hotEdge ? arrowHotId : arrowId})` : null"
              />
              <text
                v-if="e.label"
                class="edge-label"
                :class="e.kind"
                :x="e.labelAt[0]"
                :y="e.labelAt[1]"
                :text-anchor="e.labelAnchor"
              >{{ e.label }}</text>
            </template>
          </g>
          <g
            v-for="n in nodes"
            :key="n.id"
            class="node"
            :class="[n.kind, n.sub, { active: n.id === activeId, focused: n.line === focusLine && n.id !== activeId }]"
            @click="n.line && emit('node-click', n.line)"
            @pointerenter="emit('node-hover', n.line)"
            @pointerleave="emit('node-hover', null)"
          >
            <title>{{ nodeTitle(n) }}</title>
            <template v-if="n.id === activeId">
              <rect v-if="!shapePoints(n)" class="glow" :x="n.x - 5" :y="n.y - 5" :width="n.w + 10" :height="n.h + 10" :rx="n.kind === 'terminator' ? (n.h + 10) / 2 : 8" />
              <polygon v-else class="glow" :points="shapePoints(n)" />
            </template>
            <rect v-if="!shapePoints(n)" class="shape" :x="n.x" :y="n.y" :width="n.w" :height="n.h" :rx="n.kind === 'terminator' ? n.h / 2 : 3" />
            <polygon v-else class="shape" :points="shapePoints(n)" />
            <path v-if="n.kind === 'call'" class="call-bars" :d="`M${n.x + 10},${n.y} v${n.h} M${n.x + n.w - 10},${n.y} v${n.h}`" />
            <g v-if="n.kind === 'io'" class="io-icon" :transform="`translate(${n.x + 20} ${n.y + n.h / 2 - 7})`">
              <template v-if="n.sub === 'out'">
                <rect x="0" y="0" width="16" height="11" rx="1.5" />
                <path d="M5 14h6 M8 11v3" />
              </template>
              <template v-else>
                <rect x="0" y="2" width="16" height="10" rx="1.5" />
                <path d="M3 5h1 M6 5h1 M9 5h1 M12 5h1 M4 9h8" />
              </template>
            </g>
            <text
              class="label"
              :x="n.kind === 'io' ? n.x + n.w / 2 + 12 : n.x + n.w / 2"
              :y="n.y + n.h / 2"
            >{{ n.label }}</text>
            <g v-if="badgeFor(n)" class="badge" :class="badgeFor(n).cls">
              <rect :x="n.x + n.w - 10" :y="n.y - 10" :width="badgeFor(n).text.length * 7 + 10" height="18" rx="9" />
              <text :x="n.x + n.w - 5" :y="n.y">{{ badgeFor(n).text }}</text>
            </g>
          </g>
        </g>
      </svg>
      <div v-else class="empty">
        <p>Escribe un algoritmo entre <code>INICIO</code> y <code>FIN</code> para ver aquí su diagrama.</p>
      </div>
    </div>

    <div v-if="stale && flow" class="stale-note" role="status">
      Hay errores en el código: se muestra el último diagrama válido.
    </div>

    <div v-if="!compact" class="controls" role="toolbar" aria-label="Controles del diagrama">
      <button type="button" class="btn icon" title="Acercar (+)" aria-label="Acercar" @click="zoomButton(1.2)"><AppIcon name="zoomIn" /></button>
      <button type="button" class="btn icon" title="Alejar (−)" aria-label="Alejar" @click="zoomButton(1 / 1.2)"><AppIcon name="zoomOut" /></button>
      <button type="button" class="btn icon" title="Ajustar a la vista (0)" aria-label="Ajustar a la vista" @click="fit"><AppIcon name="fit" /></button>
      <span class="sep" />
      <button type="button" class="btn" :disabled="!flow" title="Descargar como SVG" @click="exportSvg"><AppIcon name="download" />SVG</button>
      <button type="button" class="btn" :disabled="!flow" title="Descargar como imagen PNG" @click="exportPng"><AppIcon name="image" />PNG</button>
      <span class="sep" />
      <button type="button" class="btn ghost" :aria-expanded="showLegend" @click="showLegend = !showLegend">Leyenda</button>
    </div>

    <div v-if="showLegend" class="legend">
      <svg viewBox="0 0 440 176" role="img" aria-label="Leyenda de formas">
        <g class="node terminator"><rect class="shape" x="6" y="8" width="90" height="30" rx="15" /><text class="label" x="51" y="23">Inicio / Fin</text></g>
        <g class="node process"><rect class="shape" x="112" y="8" width="96" height="30" rx="3" /><text class="label" x="160" y="23">Proceso</text></g>
        <g class="node io"><polygon class="shape" points="236,8 334,8 324,38 226,38" /><text class="label" x="280" y="23">Entrada/Salida</text></g>
        <g class="node decision"><polygon class="shape" points="60,58 114,82 60,106 6,82" /><text class="label" x="60" y="82">SI / MIENTRAS</text></g>
        <g class="node loop"><polygon class="shape" points="140,66 222,66 234,82 222,98 140,98 128,82" /><text class="label" x="181" y="82">PARA</text></g>
        <g class="badge g-linear"><rect x="256" y="72" width="26" height="18" rx="9" /><text x="261" y="81">×n</text></g>
        <text class="legend-text" x="290" y="85">veces que se repite</text>
        <g class="node call"><rect class="shape" x="6" y="126" width="120" height="30" rx="3" /><path class="call-bars" d="M16,126 v30 M116,126 v30" /><text class="label" x="66" y="141">Llamada</text></g>
        <g class="node terminator return"><rect class="shape" x="142" y="126" width="110" height="30" rx="15" /><text class="label" x="197" y="141">Devolver</text></g>
      </svg>
    </div>
  </div>
</template>

<style scoped>
.chart {
  position: relative;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.viewport {
  position: absolute;
  inset: 0;
  cursor: grab;
  touch-action: none;
  background-color: var(--paper);
  background-image:
    linear-gradient(var(--paper-grid) 1px, transparent 1px),
    linear-gradient(90deg, var(--paper-grid) 1px, transparent 1px),
    linear-gradient(color-mix(in srgb, var(--paper-grid) 100%, var(--ink) 8%) 1px, transparent 1px),
    linear-gradient(90deg, color-mix(in srgb, var(--paper-grid) 100%, var(--ink) 8%) 1px, transparent 1px);
}

.viewport:active {
  cursor: grabbing;
}

.viewport:focus-visible {
  outline-offset: -3px;
}

.svg {
  display: block;
  transition: opacity 0.2s, filter 0.2s;
}

.svg.stale {
  opacity: 0.4;
  filter: grayscale(1);
}

.empty {
  display: grid;
  place-items: center;
  height: 100%;
  padding: 24px;
  color: var(--ink-soft);
  text-align: center;
}

.edge {
  fill: none;
  stroke: var(--ink-soft);
  stroke-width: 1.6;
  stroke-linejoin: round;
}

.edge.back {
  stroke-dasharray: 5 4;
}

.edge.hot {
  stroke: var(--ink);
  stroke-width: 2.4;
}

.hot-under {
  fill: none;
  stroke: var(--mark);
  stroke-width: 12;
  stroke-linejoin: round;
  stroke-linecap: round;
  opacity: 0.85;
}

.arrow-head {
  fill: var(--ink-soft);
}

.arrow-head.hot {
  fill: var(--ink);
}

.edge-label {
  font-family: var(--font-ui);
  font-size: 12px;
  font-weight: 700;
  fill: var(--ink-soft);
  paint-order: stroke;
  stroke: var(--paper);
  stroke-width: 4;
  stroke-linejoin: round;
}

.edge-label.yes {
  fill: var(--green);
}

.edge-label.no {
  fill: var(--red);
}

.edge-label.back {
  font-family: var(--font-code);
  font-weight: 400;
  font-style: italic;
}

.node {
  cursor: pointer;
}

.shape {
  stroke: var(--ink);
  stroke-width: 1.5;
}

.terminator .shape { fill: var(--s-term); }
.process .shape { fill: var(--s-process); }
.io .shape { fill: var(--s-io); }
.decision .shape { fill: var(--s-decision); }
.loop .shape { fill: var(--s-loop); }
.call .shape { fill: var(--s-call); }
.terminator.return .shape { fill: var(--s-return); stroke-width: 2.2; }
.terminator.return .label { fill: var(--ink); font-family: var(--font-code); font-weight: 400; }

.call-bars {
  fill: none;
  stroke: var(--ink);
  stroke-width: 1.3;
  pointer-events: none;
}

.tabs {
  position: absolute;
  top: 10px;
  left: 12px;
  right: 12px;
  z-index: 2;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  pointer-events: none;
}

.tabs button {
  pointer-events: auto;
  padding: 3px 10px;
  border: 1px solid var(--rule);
  border-radius: 999px;
  background: var(--panel);
  color: var(--ink-soft);
  font-family: var(--font-code);
  font-size: 12.5px;
  cursor: pointer;
}

.tabs button[aria-selected='true'] {
  border-color: var(--ink);
  color: var(--ink);
  font-weight: 700;
}

.tabs button.running {
  box-shadow: inset 0 -3px 0 var(--mark);
}

.label {
  font-family: var(--font-code);
  font-size: 13px;
  fill: var(--ink);
  text-anchor: middle;
  dominant-baseline: central;
  pointer-events: none;
}

.terminator .label {
  fill: var(--s-term-ink);
  font-family: var(--font-ui);
  font-weight: 700;
}

.io-icon {
  fill: none;
  stroke: var(--ink);
  stroke-width: 1.3;
  stroke-linecap: round;
  pointer-events: none;
}

.node:hover .shape {
  stroke-width: 2.5;
}

.node.focused .shape {
  stroke-width: 2.5;
  stroke-dasharray: 4 3;
}

.glow {
  fill: none;
  stroke: var(--mark);
  stroke-width: 14;
  stroke-linejoin: round;
  opacity: 0.9;
}

.node.active .shape {
  fill: var(--mark);
  stroke-width: 2.4;
}

.node.active .label,
.node.active.terminator .label {
  fill: var(--mark-ink);
}

.badge rect {
  fill: var(--panel);
  stroke: var(--g, var(--ink-soft));
  stroke-width: 1.2;
}

.badge text {
  font-family: var(--font-code);
  font-size: 11px;
  fill: var(--g, var(--ink));
  dominant-baseline: central;
  font-weight: 700;
}

.badge.run rect {
  fill: var(--ink);
  stroke: var(--ink);
}

.badge.run text {
  fill: var(--paper);
}

.stale-note {
  position: absolute;
  bottom: 70px;
  left: 50%;
  translate: -50% 0;
  max-width: calc(100% - 24px);
  padding: 6px 12px;
  border: 1.5px solid var(--red);
  border-radius: var(--radius-s);
  background: var(--panel);
  color: var(--red);
  font-size: 13.5px;
  font-weight: 700;
}

.controls {
  position: absolute;
  right: 12px;
  bottom: 12px;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  gap: 4px;
  max-width: calc(100% - 24px);
  padding: 4px;
  border: 1px solid var(--rule);
  border-radius: var(--radius-m);
  background: var(--panel);
}

.sep {
  width: 1px;
  height: 20px;
  background: var(--rule);
}

.legend {
  position: absolute;
  left: 12px;
  bottom: 60px;
  width: min(440px, calc(100% - 24px));
  padding: 6px;
  border: 1px solid var(--rule);
  border-radius: var(--radius-m);
  background: var(--panel);
}

.legend svg {
  display: block;
  width: 100%;
}

.legend .label {
  font-size: 11px;
}

.legend .node {
  cursor: default;
}

.legend-text {
  font-size: 12px;
  fill: var(--ink-soft);
  dominant-baseline: central;
}
</style>
