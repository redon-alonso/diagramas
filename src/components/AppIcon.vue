<script setup>
import { computed } from 'vue'

// Iconos de trazo propios (sin dependencias externas).
const props = defineProps({ name: { type: String, required: true } })

const PATHS = {
  save: 'M5 3h11l3 3v15H5z M8 3v6h8V3 M8 21v-7h8v7',
  library: 'M4 4h4v16H4z M10 4h4v16h-4z M16.5 4.5l3.8 1-4 15.4-3.8-1',
  compare: 'M4 20V10 M10 20V4 M16 20v-7 M3 20h18',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6 M12 17h.01',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z',
  auto: 'M12 21a9 9 0 1 0 0-18z M12 3a9 9 0 0 1 0 18',
  play: 'M7 4l13 8-13 8z',
  pause: 'M7 4h3v16H7z M14 4h3v16h-3z',
  step: 'M5 4l10 8-10 8z M18 4v16',
  fast: 'M3 5l8 7-8 7z M12 5l8 7-8 7z',
  reset: 'M4 12a8 8 0 1 0 2.3-5.7 M4 4v4h4',
  plus: 'M12 5v14 M5 12h14',
  copy: 'M9 9h11v11H9z M5 15H4V4h11v1',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13',
  download: 'M12 3v12 M7 10l5 5 5-5 M4 20h16',
  upload: 'M12 16V4 M7 9l5-5 5 5 M4 20h16',
  close: 'M6 6l12 12 M18 6L6 18',
  zoomIn: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M20 20l-4-4 M11 8v6 M8 11h6',
  zoomOut: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M20 20l-4-4 M8 11h6',
  fit: 'M4 9V4h5 M15 4h5v5 M20 15v5h-5 M9 20H4v-5',
  image: 'M4 5h16v14H4z M4 16l5-5 4 4 3-3 4 4 M15 9h.01',
  code: 'M9 7l-5 5 5 5 M15 7l5 5-5 5',
  flow: 'M8 3h8v4H8z M12 7v3 M12 10l5 4-5 4-5-4z M12 18v3',
  gauge: 'M4 18a8 8 0 1 1 16 0 M12 18l4-6',
  check: 'M5 12l5 5 9-10',
  alert: 'M12 3l10 18H2z M12 10v5 M12 18h.01',
  file: 'M6 3h9l4 4v14H6z M14 3v5h5',
  edit: 'M4 20h4L19 9l-4-4L4 16z M13.5 6.5l4 4',
  share: 'M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M8.6 13.5l6.8 4 M15.4 6.5l-6.8 4',
}

const d = computed(() => PATHS[props.name] ?? '')
</script>

<template>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    <path :d="d" />
  </svg>
</template>
