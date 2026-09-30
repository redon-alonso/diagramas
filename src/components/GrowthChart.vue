<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { formatBig } from '../core/format.js'

const props = defineProps({
  // [{ id, name, color, fn: (n) => operaciones }]
  series: { type: Array, required: true },
  maxN: { type: Number, default: 1000 },
  markN: { type: Number, default: null },
  logY: { type: Boolean, default: true },
  references: { type: Boolean, default: true },
  height: { type: Number, default: 260 },
  label: { type: String, default: 'Operaciones según el tamaño de la entrada' },
})

const box = ref(null)
const width = ref(600)
const hover = ref(null)
let ro = null
onMounted(() => {
  ro = new ResizeObserver(([entry]) => { width.value = Math.max(260, Math.floor(entry.contentRect.width)) })
  ro.observe(box.value)
})
onBeforeUnmount(() => ro?.disconnect())

const M = { t: 14, r: 64, b: 34, l: 58 }
const SAMPLES = 90
const REFS = [
  { id: 'r1', name: '1', fn: () => 1 },
  { id: 'rlog', name: 'log n', fn: (n) => Math.log2(Math.max(n, 1)) },
  { id: 'rn', name: 'n', fn: (n) => n },
  { id: 'rnlog', name: 'n log n', fn: (n) => n * Math.log2(Math.max(n, 1)) },
  { id: 'rn2', name: 'n²', fn: (n) => n * n },
  { id: 'r2n', name: '2ⁿ', fn: (n) => 2 ** Math.min(n, 1000) },
]

const xLog = computed(() => props.maxN >= 200)
const plotW = computed(() => width.value - M.l - M.r)
const plotH = computed(() => props.height - M.t - M.b)

const ns = computed(() => {
  const out = []
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES
    out.push(xLog.value ? props.maxN ** t : 1 + (props.maxN - 1) * t)
  }
  return out
})

const safe = (v) => (Number.isFinite(v) && v > 0 ? v : v === Infinity ? Infinity : 0)

const data = computed(() => props.series.map((s) => ({ ...s, values: ns.value.map((n) => safe(s.fn(n))) })))

const yMax = computed(() => {
  let m = 10
  for (const s of data.value) for (const v of s.values) if (Number.isFinite(v)) m = Math.max(m, v)
  return m * 1.15
})

const x = (n) => {
  const t = xLog.value ? Math.log(n) / Math.log(props.maxN) : (n - 1) / (props.maxN - 1 || 1)
  return M.l + t * plotW.value
}
const y = (v) => {
  const top = yMax.value
  const t = props.logY ? Math.log10(Math.max(v, 1)) / Math.log10(top) : v / top
  return M.t + plotH.value - Math.min(1.02, Math.max(0, t)) * plotH.value
}

function linePath(values) {
  let d = ''
  let open = false
  values.forEach((v, i) => {
    if (!Number.isFinite(v)) { open = false; return }
    const clipped = Math.min(v, yMax.value * 1.02)
    d += `${open ? 'L' : 'M'}${x(ns.value[i]).toFixed(1)},${y(clipped).toFixed(1)}`
    open = v <= yMax.value * 1.02
  })
  return d
}

const refLines = computed(() =>
  props.references
    ? REFS.map((r) => {
      const values = ns.value.map((n) => r.fn(n))
      const lastIdx = values.findLastIndex((v) => v <= yMax.value)
      const endN = ns.value[Math.max(lastIdx, 0)]
      return { ...r, d: linePath(values), lx: x(endN), ly: y(values[Math.max(lastIdx, 0)]) }
    })
    : [],
)

const lines = computed(() =>
  data.value.map((s) => {
    const last = s.values.at(-1)
    return { ...s, d: linePath(s.values), endY: y(Math.min(last, yMax.value)) }
  }),
)

// Etiquetas directas (≤ 4 series), separadas para no solaparse.
const endLabels = computed(() => {
  if (lines.value.length > 4 || lines.value.length < 2) return []
  const items = lines.value.map((l) => ({ id: l.id, name: l.name, color: l.color, y: l.endY })).sort((a, b) => a.y - b.y)
  for (let i = 1; i < items.length; i++) if (items[i].y - items[i - 1].y < 14) items[i].y = items[i - 1].y + 14
  return items
})

const yTicks = computed(() => {
  const top = yMax.value
  if (props.logY) {
    const out = []
    const maxExp = Math.floor(Math.log10(top))
    const step = Math.max(1, Math.ceil(maxExp / 5))
    for (let e = 0; e <= maxExp; e += step) out.push(10 ** e)
    return out
  }
  const rough = top / 4
  const mag = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= rough)
  const out = []
  for (let v = 0; v <= top; v += step) out.push(v)
  return out
})

const xTicks = computed(() => {
  if (xLog.value) {
    const out = []
    for (let e = 0; 10 ** e <= props.maxN; e++) out.push(10 ** e)
    return out
  }
  const rough = props.maxN / 5
  const mag = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= rough)
  const out = [1]
  for (let v = step; v <= props.maxN; v += step) out.push(v)
  return out
})

function onMove(event) {
  const rect = event.currentTarget.getBoundingClientRect()
  const px = event.clientX - rect.left
  if (px < M.l || px > M.l + plotW.value) { hover.value = null; return }
  const t = (px - M.l) / plotW.value
  const n = xLog.value ? props.maxN ** t : 1 + (props.maxN - 1) * t
  const rounded = Math.max(1, Math.round(n))
  const rows = props.series
    .map((s) => ({ id: s.id, name: s.name, color: s.color, v: safe(s.fn(rounded)) }))
    .sort((a, b) => b.v - a.v)
  hover.value = { px: x(rounded), n: rounded, rows }
}
</script>

<template>
  <figure class="growth">
    <div v-if="series.length > 1" class="legend">
      <span v-for="s in series" :key="s.id" class="key"><i :style="{ background: s.color }" />{{ s.name }}</span>
    </div>
    <div ref="box" class="box">
      <svg
        :width="width"
        :height="height"
        role="img"
        :aria-label="label"
        @pointermove="onMove"
        @pointerleave="hover = null"
      >
        <g class="grid">
          <line v-for="t in yTicks" :key="`y${t}`" :x1="M.l" :x2="M.l + plotW" :y1="y(t)" :y2="y(t)" />
        </g>
        <g class="axis">
          <text v-for="t in yTicks" :key="`yl${t}`" :x="M.l - 8" :y="y(t)" text-anchor="end" dominant-baseline="central">{{ formatBig(t) }}</text>
          <text v-for="t in xTicks" :key="`xl${t}`" :x="x(t)" :y="M.t + plotH + 18" text-anchor="middle">{{ formatBig(t) }}</text>
          <line :x1="M.l" :x2="M.l + plotW" :y1="M.t + plotH" :y2="M.t + plotH" class="base" />
          <text :x="M.l + plotW" :y="height - 2" text-anchor="end" class="title">n (tamaño de la entrada)</text>
        </g>
        <g class="refs">
          <template v-for="r in refLines" :key="r.id">
            <path :d="r.d" />
            <text :x="r.lx - 4" :y="r.ly - 7" text-anchor="end">{{ r.name }}</text>
          </template>
        </g>
        <line v-if="markN" class="mark" :x1="x(markN)" :x2="x(markN)" :y1="M.t" :y2="M.t + plotH" />
        <g class="series">
          <path v-for="l in lines" :key="l.id" :d="l.d" :style="{ stroke: l.color }" />
        </g>
        <g class="end-labels">
          <text v-for="l in endLabels" :key="l.id" :x="M.l + plotW + 6" :y="l.y" dominant-baseline="central">{{ l.name.length > 9 ? l.name.slice(0, 8) + '…' : l.name }}</text>
        </g>
        <g v-if="hover">
          <line class="cross" :x1="hover.px" :x2="hover.px" :y1="M.t" :y2="M.t + plotH" />
          <circle
            v-for="r in hover.rows"
            :key="r.id"
            class="dot"
            :cx="hover.px"
            :cy="y(Math.min(r.v, yMax))"
            r="4.5"
            :style="{ fill: r.color }"
          />
        </g>
      </svg>
      <div
        v-if="hover"
        class="tip"
        :style="{ left: `${Math.min(hover.px + 12, width - 190)}px` }"
      >
        <strong>n = {{ formatBig(hover.n) }}</strong>
        <div v-for="r in hover.rows" :key="r.id" class="row">
          <i :style="{ background: r.color }" /><span class="nm">{{ r.name }}</span><span class="v">{{ formatBig(r.v) }}</span>
        </div>
      </div>
    </div>
  </figure>
</template>

<style scoped>
.growth {
  margin: 0;
  min-width: 0;
}

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  margin-bottom: 6px;
  font-size: 13px;
  color: var(--ink-soft);
}

.key {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.key i,
.row i {
  display: inline-block;
  width: 14px;
  height: 3px;
  border-radius: 2px;
}

.box {
  position: relative;
  width: 100%;
  min-width: 0;
  overflow: hidden;
}

svg {
  display: block;
  overflow: visible;
}

.grid line {
  stroke: var(--rule);
  stroke-width: 1;
  opacity: 0.7;
}

.axis text {
  font-size: 11px;
  fill: var(--ink-soft);
}

.axis .title {
  font-size: 11.5px;
  fill: var(--ink-faint);
}

.axis .base {
  stroke: var(--ink-faint);
}

.refs path {
  fill: none;
  stroke: var(--ink-faint);
  stroke-width: 1;
  stroke-dasharray: 2 4;
  opacity: 0.8;
}

.refs text {
  font-size: 10.5px;
  font-family: var(--font-code);
  fill: var(--ink-faint);
}

.series path {
  fill: none;
  stroke-width: 2;
  stroke-linejoin: round;
  stroke-linecap: round;
}

.end-labels text {
  font-size: 11.5px;
  fill: var(--ink-soft);
}

.mark {
  stroke: var(--ink);
  stroke-width: 1;
  stroke-dasharray: 4 3;
}

.cross {
  stroke: var(--ink-soft);
  stroke-width: 1;
}

.dot {
  stroke: var(--panel);
  stroke-width: 2;
}

.tip {
  position: absolute;
  top: 6px;
  z-index: 3;
  min-width: 170px;
  padding: 8px 10px;
  border: 1px solid var(--rule);
  border-radius: var(--radius-m);
  background: var(--panel);
  box-shadow: var(--shadow-pop);
  font-size: 12.5px;
  pointer-events: none;
}

.row {
  display: grid;
  grid-template-columns: 14px 1fr auto;
  align-items: center;
  gap: 6px;
}

.nm {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ink-soft);
}

.v {
  font-family: var(--font-code);
}
</style>
