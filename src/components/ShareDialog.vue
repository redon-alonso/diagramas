<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  link: { type: String, required: true },
  name: { type: String, default: '' },
})
const emit = defineEmits(['close'])
const dialog = ref(null)
const field = ref(null)
const status = ref('')

// Algunas aplicaciones de mensajería cortan los enlaces muy largos.
const isLong = computed(() => props.link.length > 2000)

onMounted(() => {
  dialog.value.showModal()
  nextTick(() => field.value?.select())
})

async function copy() {
  try {
    await navigator.clipboard.writeText(props.link)
    status.value = 'Enlace copiado. Ya puedes pegarlo donde quieras.'
  } catch {
    field.value?.select()
    status.value = 'Tu navegador no deja copiar automáticamente: el enlace está seleccionado, pulsa Ctrl + C.'
  }
}
</script>

<template>
  <dialog ref="dialog" class="share" aria-labelledby="share-title" @close="emit('close')" @click.self="dialog.close()">
    <div class="inner">
      <header>
        <h2 id="share-title">Compartir {{ name ? `«${name}»` : 'este algoritmo' }}</h2>
        <button type="button" class="btn ghost icon" aria-label="Cerrar" @click="dialog.close()"><AppIcon name="close" /></button>
      </header>

      <p>
        Quien abra el enlace verá una copia de tu código y podrá modificarla sin cambiar la tuya.
        El código va dentro del propio enlace: no se sube a ningún servidor.
      </p>

      <label class="lbl" for="share-link">Enlace</label>
      <div class="row">
        <input id="share-link" ref="field" class="field mono" type="text" readonly :value="link" @focus="$event.target.select()" />
        <button type="button" class="btn primary" @click="copy"><AppIcon name="copy" />Copiar enlace</button>
      </div>
      <p class="status" role="status">{{ status }}</p>
      <p v-if="isLong" class="warn">
        El enlace es largo porque el algoritmo también lo es. Algunas aplicaciones de mensajería podrían cortarlo;
        si falla, exporta el algoritmo desde la biblioteca y envía el fichero.
      </p>
    </div>
  </dialog>
</template>

<style scoped>
.share {
  width: min(620px, calc(100vw - 32px));
  max-height: calc(100dvh - 48px);
  padding: 0;
  border: 1px solid var(--rule);
  border-radius: var(--radius-m);
  background: var(--panel);
  color: var(--ink);
  box-shadow: var(--shadow-pop);
}

.share::backdrop {
  background: rgb(10 15 30 / 0.35);
}

.inner {
  padding: 18px 22px 22px;
}

header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}

h2 {
  margin: 0;
  font-size: 22px;
  overflow-wrap: anywhere;
}

p {
  margin: 0;
  max-width: 70ch;
}

.lbl {
  display: block;
  margin: 16px 0 4px;
  color: var(--ink-soft);
  font-size: 13.5px;
}

.row {
  display: flex;
  gap: 8px;
}

.row .field {
  flex: 1;
  min-width: 0;
}

.status {
  min-height: 1.5em;
  margin-top: 8px;
  color: var(--ink-soft);
  font-size: 14px;
}

.warn {
  padding: 8px 10px;
  border-radius: var(--radius-s);
  background: var(--amber-soft);
  color: var(--ink);
  font-size: 14px;
}

@media (max-width: 760px) {
  .row {
    flex-direction: column;
  }
}
</style>
