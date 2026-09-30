<script setup>
import { computed, ref, watch, onMounted } from 'vue'
import AppIcon from './AppIcon.vue'
import { useLibrary } from '../composables/useLibrary.js'
import { useWorkspace, analyzeSource } from '../composables/useWorkspace.js'
import { SAMPLES } from '../core/samples.js'

const emit = defineEmits(['close', 'opened'])

const library = useLibrary()
const ws = useWorkspace()
const dialog = ref(null)
const fileInput = ref(null)
const query = ref('')
const confirmDelete = ref(null)
const pendingOpen = ref(null)
const message = ref(null)

onMounted(() => dialog.value.showModal())

function close() {
  dialog.value?.close()
}

const dateFmt = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

function summary(code) {
  const a = analyzeSource(code)
  if (!a.ok) return { text: 'con errores', cls: 'err' }
  return { text: `O(${a.cost.bigO})`, cls: `g-${a.cost.growthClass.id}` }
}

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  return library.sorted.value.filter((it) => !q || it.name.toLowerCase().includes(q))
})

const sampleGroups = computed(() => {
  const groups = new Map()
  for (const s of SAMPLES) {
    if (!groups.has(s.group)) groups.set(s.group, [])
    groups.get(s.group).push(s)
  }
  return [...groups.entries()]
})

function requestOpen(target) {
  if (ws.dirty.value && ws.code.value.trim() && !(ws.itemId.value === target.id)) {
    pendingOpen.value = target
    return
  }
  doOpen(target)
}

function doOpen(target) {
  ws.open(target)
  pendingOpen.value = null
  emit('opened')
  close()
}

function saveAndOpen() {
  try {
    ws.save()
    doOpen(pendingOpen.value)
  } catch (err) {
    message.value = { kind: 'error', text: err.message }
  }
}

function openItem(item) {
  requestOpen({ code: item.code, name: item.name, id: item.id })
}

function openSample(sample) {
  requestOpen({ code: sample.code, name: sample.name, id: null })
}

function newDoc(lang) {
  requestOpen({ code: lang === 'en' ? 'START\n    \nEND' : 'INICIO\n    \nFIN', name: '', id: null })
}

function remove(item) {
  library.remove(item.id)
  if (ws.itemId.value === item.id) ws.itemId.value = null
  confirmDelete.value = null
  message.value = { kind: 'ok', text: `"${item.name}" se ha eliminado.` }
}

function duplicate(item) {
  try {
    library.duplicate(item.id)
    message.value = { kind: 'ok', text: `Se ha creado una copia de "${item.name}".` }
  } catch (err) {
    message.value = { kind: 'error', text: err.message }
  }
}

async function onImport(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  try {
    const { added, skipped } = await library.importFile(file)
    message.value = { kind: 'ok', text: `Importados ${added} algoritmos${skipped ? ` (${skipped} no cabían en la biblioteca)` : ''}.` }
  } catch (err) {
    message.value = { kind: 'error', text: err.message }
  }
}

watch(message, (m) => { if (m) setTimeout(() => { if (message.value === m) message.value = null }, 5000) })
</script>

<template>
  <dialog ref="dialog" class="drawer" aria-labelledby="lib-title" @close="emit('close')" @click.self="close">
    <div class="inner">
      <header>
        <h2 id="lib-title">Biblioteca</h2>
        <button type="button" class="btn ghost icon" aria-label="Cerrar" @click="close"><AppIcon name="close" /></button>
      </header>

      <div class="actions">
        <button type="button" class="btn" @click="newDoc('es')"><AppIcon name="plus" />Nuevo (español)</button>
        <button type="button" class="btn" @click="newDoc('en')"><AppIcon name="plus" />New (English)</button>
        <button type="button" class="btn" @click="fileInput.click()"><AppIcon name="upload" />Importar</button>
        <button type="button" class="btn" :disabled="!library.items.value.length" @click="library.exportAll()"><AppIcon name="download" />Exportar todo</button>
        <input ref="fileInput" type="file" accept=".json,application/json" hidden @change="onImport" />
      </div>

      <p v-if="message" class="message" :class="message.kind" role="status">{{ message.text }}</p>
      <p v-if="library.storageError.value" class="message error" role="alert">
        El navegador no deja guardar más datos (almacenamiento lleno o bloqueado). Exporta la biblioteca para no perder nada.
      </p>

      <div v-if="pendingOpen" class="pending" role="alertdialog" aria-labelledby="pending-text">
        <p id="pending-text">Tienes cambios sin guardar en <strong>{{ ws.name.value || 'el algoritmo actual' }}</strong>.</p>
        <div class="row">
          <button type="button" class="btn primary" @click="saveAndOpen">Guardar y abrir</button>
          <button type="button" class="btn danger" @click="doOpen(pendingOpen)">Descartar cambios</button>
          <button type="button" class="btn ghost" @click="pendingOpen = null">Cancelar</button>
        </div>
      </div>

      <section>
        <div class="section-head">
          <h3>Tus algoritmos <span class="count">{{ library.items.value.length }}</span></h3>
          <input v-if="library.items.value.length > 4" v-model="query" class="field search" type="search" placeholder="Buscar por nombre" aria-label="Buscar algoritmos" />
        </div>
        <p v-if="!library.items.value.length" class="empty">
          Aún no has guardado ningún algoritmo. Escribe uno y pulsa <strong>Guardar</strong>: se queda en este navegador y podrás compararlo con otros.
        </p>
        <ul class="list">
          <li v-for="item in filtered" :key="item.id" :class="{ current: item.id === ws.itemId.value }">
            <button type="button" class="open" @click="openItem(item)">
              <span class="name">{{ item.name }}</span>
              <span class="sub">
                <span class="o" :class="summary(item.code).cls">{{ summary(item.code).text }}</span>
                <span class="date">{{ dateFmt.format(item.updatedAt) }}</span>
                <span v-if="item.id === ws.itemId.value" class="tag">abierto</span>
              </span>
            </button>
            <div v-if="confirmDelete === item.id" class="confirm">
              <span>¿Eliminar?</span>
              <button type="button" class="btn danger" @click="remove(item)">Eliminar</button>
              <button type="button" class="btn ghost" @click="confirmDelete = null">No</button>
            </div>
            <div v-else class="item-actions">
              <button type="button" class="btn ghost icon" :title="`Duplicar ${item.name}`" :aria-label="`Duplicar ${item.name}`" @click="duplicate(item)"><AppIcon name="copy" /></button>
              <button type="button" class="btn ghost icon danger" :title="`Eliminar ${item.name}`" :aria-label="`Eliminar ${item.name}`" @click="confirmDelete = item.id"><AppIcon name="trash" /></button>
            </div>
          </li>
        </ul>
      </section>

      <section>
        <h3>Ejemplos para comparar</h3>
        <p class="hint">Cada grupo resuelve el mismo problema de formas distintas.</p>
        <div v-for="[group, list] in sampleGroups" :key="group" class="group">
          <h4>{{ group }}</h4>
          <ul class="list samples">
            <li v-for="s in list" :key="s.name">
              <button type="button" class="open" @click="openSample(s)">
                <span class="name">{{ s.name }}</span>
                <span class="sub"><span class="o" :class="summary(s.code).cls">{{ summary(s.code).text }}</span></span>
              </button>
            </li>
          </ul>
        </div>
      </section>
    </div>
  </dialog>
</template>

<style scoped>
.drawer {
  margin: 0 0 0 auto;
  width: min(460px, 100vw);
  max-width: 100vw;
  height: 100dvh;
  max-height: 100dvh;
  padding: 0;
  border: 0;
  border-left: 1px solid var(--rule);
  background: var(--panel);
  color: var(--ink);
  box-shadow: var(--shadow-pop);
}

.drawer[open] {
  animation: slide-in 0.2s ease-out;
}

.drawer::backdrop {
  background: rgb(10 15 30 / 0.35);
}

@keyframes slide-in {
  from { translate: 40px 0; opacity: 0; }
}

.inner {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
}

header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

h2 {
  margin: 0;
  font-size: 22px;
}

h3 {
  margin: 0 0 8px;
  font-size: 16px;
}

h4 {
  margin: 10px 0 4px;
  font-size: 13.5px;
  color: var(--ink-soft);
}

.count {
  color: var(--ink-faint);
  font-weight: 400;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.message {
  margin: 0;
  padding: 6px 10px;
  border-radius: var(--radius-s);
  font-size: 14px;
}

.message.ok { background: var(--green-soft); color: var(--green); }
.message.error { background: var(--red-soft); color: var(--red); }

.pending {
  padding: 10px 12px;
  border: 2px solid var(--amber);
  border-radius: var(--radius-m);
  background: var(--amber-soft);
}

.pending p {
  margin: 0 0 8px;
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.search {
  width: 50%;
}

.empty,
.hint {
  margin: 0;
  color: var(--ink-soft);
  font-size: 14px;
}

.list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.list li {
  display: flex;
  align-items: center;
  gap: 4px;
  border-bottom: 1px solid color-mix(in srgb, var(--rule) 60%, transparent);
}

.list li.current {
  box-shadow: inset 3px 0 0 var(--mark);
}

.open {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 8px 10px;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.open:hover {
  background: var(--panel-2);
}

.name {
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sub {
  display: flex;
  gap: 10px;
  font-size: 12.5px;
  color: var(--ink-soft);
}

.o {
  font-family: var(--font-code);
  font-weight: 700;
  color: var(--g, var(--ink-soft));
}

.o.err {
  color: var(--red);
}

.tag {
  color: var(--ink);
  font-weight: 700;
}

.item-actions,
.confirm {
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: 13.5px;
}
</style>
