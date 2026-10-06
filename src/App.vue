<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import AppIcon from './components/AppIcon.vue'
import CodeEditor from './components/CodeEditor.vue'
import FlowChart from './components/FlowChart.vue'
import CostPanel from './components/CostPanel.vue'
import RunPanel from './components/RunPanel.vue'
import CompareView from './components/CompareView.vue'
import LibraryDrawer from './components/LibraryDrawer.vue'
import HelpDialog from './components/HelpDialog.vue'
import ShareDialog from './components/ShareDialog.vue'
import { useWorkspace } from './composables/useWorkspace.js'
import { useLibrary } from './composables/useLibrary.js'
import { useRunner } from './composables/useRunner.js'
import { loadPrefs, savePrefs } from './core/storage.js'
import { classOf } from './core/format.js'
import { encodeShare, decodeShare, shareSupported } from './core/share.js'
import { DEFAULT_CODE } from './core/samples.js'

const ws = useWorkspace()
const library = useLibrary()
const { code, name, analysis, lastValid, hoverLine, focusRequest, dirty, savedItem } = ws

const prefs = ref(loadPrefs())
const speed = computed({
  get: () => prefs.value.speed,
  set: (v) => { prefs.value = { ...prefs.value, speed: v } },
})
watch(prefs, savePrefs, { deep: true })

const view = ref('workshop')
const sideTab = ref('cost')
const mobileTab = ref('editor')
const libraryOpen = ref(false)
const helpOpen = ref(false)
const cursorLine = ref(null)
const toast = ref(null)

const runner = useRunner(speed)
const snap = runner.snapshot

// ---------------------------------------------------------------------------
// Tema
// ---------------------------------------------------------------------------
const THEMES = ['auto', 'light', 'dark']
const themeLabel = { auto: 'Tema: automático', light: 'Tema: claro', dark: 'Tema: oscuro' }
const themeIcon = { auto: 'auto', light: 'sun', dark: 'moon' }
function applyTheme(t) {
  const root = document.documentElement
  if (t === 'auto') delete root.dataset.theme
  else root.dataset.theme = t
}
function cycleTheme() {
  const next = THEMES[(THEMES.indexOf(prefs.value.theme) + 1) % THEMES.length]
  prefs.value = { ...prefs.value, theme: next }
}
watch(() => prefs.value.theme, applyTheme, { immediate: true })

// ---------------------------------------------------------------------------
// Datos derivados del análisis
// ---------------------------------------------------------------------------
const stale = computed(() => !analysis.value.ok)
const shown = computed(() => (analysis.value.ok ? analysis.value : lastValid.value))
const lang = computed(() => analysis.value.parse.lang)

/** Veces que se ejecuta cada línea: programa principal y, dentro de las funciones, por llamada. */
function countsByLine(cost, skipOnes) {
  const out = new Map()
  if (!cost) return out
  const all = [cost.lines, ...cost.fnLines.map((fn) => fn.lines)]
  for (const lines of all) {
    for (const [line, info] of lines) {
      const count = info.count.toString()
      if (skipOnes && count === '1') continue
      out.set(line, { count, cls: classOf(info.count).id })
    }
  }
  return out
}

const lineInfo = computed(() => countsByLine(analysis.value.ok ? analysis.value.cost : null, false))
const nodeCounts = computed(() => countsByLine(shown.value?.cost, true))

const running = computed(() => snap.value.status !== 'ready')
const activeId = computed(() => (running.value ? snap.value.current : null))
const nodeLines = computed(() => {
  const out = new Map()
  for (const d of analysis.value.flow ?? []) for (const n of d.nodes) out.set(n.id, n.line)
  return out
})
const activeLine = computed(() => (activeId.value ? nodeLines.value.get(activeId.value) ?? null : null))
const followKey = computed(() => (running.value ? (snap.value.currentFn ? `fn:${snap.value.currentFn}` : 'main') : null))

// ---------------------------------------------------------------------------
// Acciones
// ---------------------------------------------------------------------------
function showToast(text, kind = 'ok') {
  toast.value = { text, kind, at: Date.now() }
  const mine = toast.value
  setTimeout(() => { if (toast.value === mine) toast.value = null }, 3500)
}

function save() {
  try {
    const existed = !!savedItem.value
    ws.save()
    showToast(existed ? 'Cambios guardados.' : 'Guardado en la biblioteca.')
  } catch (err) {
    showToast(err.message, 'error')
  }
}

function saveCopy() {
  try {
    ws.saveAsNew()
    showToast('Copia guardada en la biblioteca.')
  } catch (err) {
    showToast(err.message, 'error')
  }
}

function onKeydown(event) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    save()
  }
}

function onNodeClick(line) {
  mobileTab.value = 'editor'
  ws.focusLine(line)
}

const pendingOpen = ref(null)

function openFromCompare(candidate) {
  const target = { code: candidate.code, name: candidate.name, id: candidate.key.startsWith('lib:') ? candidate.key.slice(4) : null }
  if (dirty.value && code.value.trim()) pendingOpen.value = target
  else doOpen(target)
}

function doOpen(target) {
  ws.open(target)
  pendingOpen.value = null
  view.value = 'workshop'
}

function saveAndOpen() {
  try {
    ws.save()
    doOpen(pendingOpen.value)
  } catch (err) {
    showToast(err.message, 'error')
  }
}

// ---------------------------------------------------------------------------
// Compartir por enlace (el código va comprimido en el fragmento #c=… de la URL)
// ---------------------------------------------------------------------------
const canShare = shareSupported()
const shareLink = ref(null)

async function share() {
  if (!code.value.trim()) {
    showToast('Escribe algo de código antes de compartirlo.', 'error')
    return
  }
  try {
    const hash = await encodeShare({ code: code.value, name: name.value.trim() })
    shareLink.value = `${location.origin}${location.pathname}#${hash}`
  } catch (err) {
    console.error(err)
    showToast('No se ha podido crear el enlace en este navegador.', 'error')
  }
}

async function openFromLink() {
  let shared
  try {
    shared = await decodeShare(location.hash)
  } catch (err) {
    showToast(err.message, 'error')
  }
  if (shared === null) return
  // Se quita del navegador para que recargar no vuelva a abrirlo encima de lo que escribas después.
  history.replaceState(null, '', location.pathname + location.search)
  if (!shared || shared.code === code.value) return
  const target = { code: shared.code, name: shared.name || 'Algoritmo compartido', id: null }
  // Si solo está el ejemplo de bienvenida no hay nada que perder: se abre directamente.
  if (dirty.value && code.value.trim() && code.value !== DEFAULT_CODE) pendingOpen.value = target
  else doOpen(target)
}

function beforeUnload(event) {
  if (dirty.value && savedItem.value) event.preventDefault()
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('beforeunload', beforeUnload)
  window.addEventListener('hashchange', openFromLink)
  if (canShare) openFromLink()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('beforeunload', beforeUnload)
  window.removeEventListener('hashchange', openFromLink)
})

watch(() => snap.value.status, (s, prev) => {
  if (prev === 'ready' && s !== 'ready') sideTab.value = 'run'
})
</script>

<template>
  <div class="app" :class="`view-${view}`">
    <header class="topbar">
      <div class="brand">
        <svg class="logo" viewBox="0 0 32 32" aria-hidden="true">
          <rect x="9" y="3" width="14" height="7" rx="3.5" class="l-term" />
          <path d="M16 10v4" class="l-line" />
          <path d="M16 14l8 5-8 5-8-5z" class="l-dec" />
          <path d="M16 24v5" class="l-line" />
        </svg>
        <span class="wordmark">Transcriptor</span>
      </div>

      <nav class="views" aria-label="Vistas">
        <button type="button" :aria-current="view === 'workshop' ? 'page' : null" @click="view = 'workshop'"><AppIcon name="edit" />Taller</button>
        <button type="button" :aria-current="view === 'compare' ? 'page' : null" @click="view = 'compare'"><AppIcon name="compare" />Comparar</button>
      </nav>

      <div v-if="view === 'workshop'" class="doc">
        <label class="visually-hidden" for="doc-name">Nombre del algoritmo</label>
        <input id="doc-name" v-model="name" class="field name" type="text" maxlength="80" placeholder="Pon nombre a tu algoritmo" autocomplete="off" />
        <button type="button" class="btn primary" :disabled="!dirty" :title="dirty ? 'Guardar (Ctrl+S)' : 'No hay cambios'" @click="save">
          <AppIcon :name="dirty ? 'save' : 'check'" />{{ dirty ? 'Guardar' : 'Guardado' }}
        </button>
        <button v-if="savedItem" type="button" class="btn ghost" title="Guardar como un algoritmo nuevo" @click="saveCopy"><AppIcon name="copy" /><span class="hide-sm">Guardar copia</span></button>
      </div>

      <div class="tools">
        <button type="button" class="btn ghost" @click="libraryOpen = true"><AppIcon name="library" /><span class="hide-sm">Biblioteca</span><span class="badge-num">{{ library.items.value.length }}</span></button>
        <button v-if="canShare && view === 'workshop'" type="button" class="btn ghost" title="Crear un enlace con este algoritmo" @click="share"><AppIcon name="share" /><span class="hide-sm">Compartir</span></button>
        <button type="button" class="btn ghost icon" aria-label="Ayuda" title="Ayuda" @click="helpOpen = true"><AppIcon name="help" /></button>
        <button type="button" class="btn ghost icon" :aria-label="themeLabel[prefs.theme]" :title="themeLabel[prefs.theme]" @click="cycleTheme"><AppIcon :name="themeIcon[prefs.theme]" /></button>
      </div>
    </header>

    <main v-if="view === 'workshop'" class="workshop" :class="`m-${mobileTab}`">
      <nav class="mobile-tabs" aria-label="Paneles">
        <button type="button" :aria-current="mobileTab === 'editor' ? 'true' : null" @click="mobileTab = 'editor'"><AppIcon name="code" />Código</button>
        <button type="button" :aria-current="mobileTab === 'diagram' ? 'true' : null" @click="mobileTab = 'diagram'"><AppIcon name="flow" />Diagrama</button>
        <button type="button" :aria-current="mobileTab === 'side' ? 'true' : null" @click="mobileTab = 'side'"><AppIcon name="gauge" />Análisis</button>
      </nav>

      <section class="pane editor-pane" aria-label="Editor">
        <CodeEditor
          v-model="code"
          :diagnostics="analysis.diagnostics"
          :line-info="lineInfo"
          :active-line="activeLine"
          :hover-line="hoverLine"
          :lang="lang"
          :focus-request="focusRequest"
          @cursor-line="cursorLine = $event"
        />
      </section>

      <section class="pane diagram-pane" aria-label="Diagrama de flujo">
        <FlowChart
          :diagrams="shown?.flow ?? []"
          :follow-key="followKey"
          :stale="stale"
          :active-id="activeId"
          :last-branch="snap.lastBranch"
          :visits="running ? snap.visits : null"
          :counts="nodeCounts"
          :focus-line="hoverLine ?? cursorLine"
          :name="name"
          @node-click="onNodeClick"
          @node-hover="hoverLine = $event"
        />
      </section>

      <aside class="pane side-pane" aria-label="Análisis">
        <div class="side-tabs" role="tablist">
          <button id="tab-cost" type="button" role="tab" :aria-selected="sideTab === 'cost'" aria-controls="panel-cost" @click="sideTab = 'cost'"><AppIcon name="gauge" />Coste</button>
          <button id="tab-run" type="button" role="tab" :aria-selected="sideTab === 'run'" aria-controls="panel-run" @click="sideTab = 'run'"><AppIcon name="play" />Ejecutar</button>
        </div>
        <div v-show="sideTab === 'cost'" id="panel-cost" class="side-body" role="tabpanel" aria-labelledby="tab-cost">
          <CostPanel
            :cost="shown?.cost ?? null"
            :error="shown?.costError ?? null"
            :code="shown?.source ?? ''"
            :stale="stale"
            :hover-line="hoverLine"
            @hover-line="hoverLine = $event"
            @focus-line="onNodeClick"
          />
        </div>
        <div v-show="sideTab === 'run'" id="panel-run" class="side-body" role="tabpanel" aria-labelledby="tab-run">
          <RunPanel v-model:speed="speed" :runner="runner" :cost="analysis.ok ? analysis.cost : null" @focus-line="onNodeClick" />
        </div>
      </aside>
    </main>

    <CompareView v-else class="compare-main" @edit="openFromCompare" />

    <LibraryDrawer v-if="libraryOpen" @close="libraryOpen = false" @opened="view = 'workshop'" />
    <HelpDialog v-if="helpOpen" @close="helpOpen = false" />
    <ShareDialog v-if="shareLink" :link="shareLink" :name="name.trim()" @close="shareLink = null" />

    <div v-if="pendingOpen" class="confirm-bar" role="alertdialog" aria-labelledby="confirm-text">
      <p id="confirm-text">Tienes cambios sin guardar en <strong>{{ name || 'el algoritmo actual' }}</strong>. ¿Qué quieres hacer antes de abrir <strong>{{ pendingOpen.name }}</strong>?</p>
      <button type="button" class="btn primary" @click="saveAndOpen">Guardar y abrir</button>
      <button type="button" class="btn danger" @click="doOpen(pendingOpen)">Descartar cambios</button>
      <button type="button" class="btn ghost" @click="pendingOpen = null">Cancelar</button>
    </div>

    <div v-if="toast" class="toast" :class="toast.kind" role="status">{{ toast.text }}</div>
  </div>
</template>

<style scoped>
.app {
  display: grid;
  grid-template-rows: auto 1fr;
  height: 100dvh;
  min-height: 0;
}

.topbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--rule);
  background: var(--panel);
}

.brand {
  display: flex;
  align-items: center;
  gap: 8px;
}

.logo {
  width: 28px;
  height: 28px;
}

.l-term { fill: var(--mark); stroke: var(--ink); stroke-width: 1.5; }
.l-dec { fill: var(--s-decision); stroke: var(--ink); stroke-width: 1.5; }
.l-line { stroke: var(--ink); stroke-width: 1.5; }

.wordmark {
  font-size: 19px;
  font-weight: 800;
  letter-spacing: -0.01em;
}

.views {
  display: flex;
  gap: 2px;
  padding: 3px;
  border-radius: var(--radius-m);
  background: var(--panel-2);
}

.views button,
.mobile-tabs button,
.side-tabs button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border: 0;
  border-radius: var(--radius-s);
  background: transparent;
  color: var(--ink-soft);
  font-weight: 600;
  cursor: pointer;
}

.views button svg,
.mobile-tabs button svg,
.side-tabs button svg {
  width: 16px;
  height: 16px;
}

.views button[aria-current] {
  background: var(--panel);
  color: var(--ink);
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.12);
}

.doc {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
}

.name {
  flex: 1;
  min-width: 80px;
  max-width: 340px;
  font-weight: 700;
}

.tools {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: auto;
}

.badge-num {
  min-width: 20px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--panel-2);
  font-size: 12px;
  text-align: center;
}

.workshop {
  display: grid;
  grid-template-columns: minmax(320px, 30%) 1fr minmax(320px, 26%);
  min-height: 0;
}

.pane {
  min-height: 0;
  min-width: 0;
}

.editor-pane {
  border-right: 1px solid var(--rule);
}

.diagram-pane {
  position: relative;
}

.side-pane {
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--rule);
  background: var(--panel);
}

.side-tabs {
  display: flex;
  gap: 2px;
  padding: 6px 8px 0;
  border-bottom: 1px solid var(--rule);
}

.side-tabs button {
  border-radius: var(--radius-s) var(--radius-s) 0 0;
  padding: 7px 14px;
  border-bottom: 3px solid transparent;
}

.side-tabs button[aria-selected='true'] {
  color: var(--ink);
  border-bottom-color: var(--mark);
}

.side-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.mobile-tabs {
  display: none;
}

.compare-main {
  min-height: 0;
}

.toast {
  position: fixed;
  left: 50%;
  bottom: 20px;
  translate: -50% 0;
  z-index: 50;
  padding: 8px 16px;
  border-radius: var(--radius-m);
  background: var(--ink);
  color: var(--paper);
  font-weight: 600;
  box-shadow: var(--shadow-pop);
  animation: toast-in 0.18s ease-out;
}

.confirm-bar {
  position: fixed;
  left: 50%;
  bottom: 20px;
  translate: -50% 0;
  z-index: 60;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  width: min(720px, calc(100vw - 24px));
  padding: 12px 14px;
  border: 2px solid var(--amber);
  border-radius: var(--radius-m);
  background: var(--panel);
  box-shadow: var(--shadow-pop);
}

.confirm-bar p {
  flex-basis: 100%;
  margin: 0;
}

.toast.error {
  background: var(--red);
}

@keyframes toast-in {
  from { translate: -50% 10px; opacity: 0; }
}

@media (max-width: 1200px) {
  .workshop {
    grid-template-columns: minmax(300px, 40%) 1fr;
    grid-template-rows: 1fr minmax(260px, 40%);
  }

  .editor-pane {
    grid-row: 1 / span 2;
  }

  .side-pane {
    border-left: 0;
    border-top: 1px solid var(--rule);
  }
}

@media (max-width: 760px) {
  .topbar {
    flex-wrap: wrap;
    gap: 8px;
    padding: 8px 10px;
  }

  .doc {
    order: 3;
    flex-basis: 100%;
  }

  .name {
    max-width: none;
  }

  .hide-sm {
    display: none;
  }

  .views button {
    padding: 4px 8px;
  }

  .workshop {
    display: flex;
    flex-direction: column;
  }

  .mobile-tabs {
    display: flex;
    gap: 2px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--rule);
    background: var(--panel);
  }

  .mobile-tabs button {
    flex: 1;
    justify-content: center;
  }

  .mobile-tabs button[aria-current] {
    background: var(--panel-2);
    color: var(--ink);
  }

  .pane {
    display: none;
    flex: 1;
  }

  .m-editor .editor-pane,
  .m-diagram .diagram-pane {
    display: block;
  }

  .m-side .side-pane {
    display: flex;
  }

  .editor-pane {
    border-right: 0;
  }
}
</style>
