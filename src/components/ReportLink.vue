<script setup>
import AppIcon from './AppIcon.vue'

// Enlace a un issue de GitHub ya rellenado (ver core/report.js).
defineProps({
  url: { type: String, required: true },
  label: { type: String, default: 'Informar de este fallo' },
})
</script>

<template>
  <p class="report">
    <a :href="url" target="_blank" rel="noopener noreferrer"><AppIcon name="alert" />{{ label }}<span class="visually-hidden"> (se abre GitHub en una pestaña nueva)</span></a>
    <span class="hint">Se abrirá GitHub con un informe que incluye tu código. Revísalo antes de enviarlo: los informes son públicos.</span>
  </p>
</template>

<style scoped>
.report {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 10px 0 0;
}

a {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: fit-content;
  color: var(--ink);
  font-weight: 600;
}

a svg {
  width: 16px;
  height: 16px;
}

.hint {
  color: var(--ink-soft);
  font-size: 13px;
}
</style>
