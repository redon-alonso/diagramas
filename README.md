# Transcriptor

Herramienta educativa que convierte pseudocódigo (según `gramatica.md`) en diagramas de flujo
y calcula el coste del algoritmo para comparar enfoques y valorar su viabilidad.
Funciona solo en el navegador: sin servidor, sin base de datos y sin peticiones de red.

## Uso

Lo más sencillo en Windows: doble clic en **abrir.bat** (instala lo necesario la primera vez, compila y abre el navegador en http://127.0.0.1:4173).

No abras dist/index.html directamente con doble clic: el navegador bloquea los scripts desde file:// y la página sale en blanco.

```bash
npm install
npm run dev       # desarrollo en http://localhost:5173
npm run build     # genera dist/ (estático, se puede abrir desde cualquier hosting)
npm run preview   # sirve dist/ con la CSP de producción activa
npm start         # compila y sirve la versión final en http://127.0.0.1:4173
npm test          # pruebas del analizador y del cálculo de coste
```

## Lenguaje

Todo está en `gramatica.md`. Además de `INICIO/FIN`, asignaciones, `MOSTRAR/LEER`, `SI`, `MIENTRAS` y `PARA`:

- Lógica `Y / O / NO` (con cortocircuito), `VERDADERO / FALSO`, `NULO`.
- Listas: `[1, 2, 3]`, `v[i]`, `v[i] = x`, índices desde 1; `LEER` acepta `[5, 2, 9]`.
- Predefinidas: `LONGITUD`, `LISTA`, `ENTERO`, `ABS`, `RAIZ`, `MAX`, `MIN`, `ALEATORIO`.
- `REPETIR … HASTA_QUE`.
- `FUNCION … RETORNAR … FIN_FUNCION` con recursión.

## Qué hace

- **Taller**: un diagrama por función (pestañas), editor con resaltado, errores señalados en la línea (p. ej. «aquí falta FIN_PARA»),
  diagrama de flujo en vivo y nº de veces que se ejecuta cada línea.
- **Coste**: T(n) exacto cuando es posible (sumatorios de bucles anidados, bucles que multiplican
  o dividen → logaritmos, bucles con valores fijos → simulación), O / Ω / Θ, desglose por línea
  y estimación de tiempo con semáforo de viabilidad. Coste de cada función y resolución de
  recurrencias: restar el tamaño (lineal o exponencial, p. ej. Fibonacci 1,618ⁿ) o dividirlo
  (teorema maestro: log n, n log n…). Mejor caso con salidas tempranas (`RETORNAR`, `Y`).
- **Ejecutar**: intérprete paso a paso que resalta el nodo activo (y cambia al diagrama de la
  función en curso), muestra variables, listas en celdas, pila de llamadas y pantalla, y compara
  las operaciones medidas con la previsión.
- **Comparar**: hasta 6 algoritmos (guardados, el actual o ejemplos) en la misma gráfica, tabla y
  diagramas lado a lado.
- **Biblioteca**: guardado en `localStorage`, exportación/importación en JSON.

## Estructura

```
src/core/        lógica sin Vue (probada con node:test)
  lexer.js       tokens y palabras clave (ES/EN, solo MAYÚSCULAS)
  parser.js      árbol sintáctico + diagnósticos
  cost.js        análisis de coste simbólico
  poly.js        polinomios racionales, sumatorios de Faulhaber, O grande
  flow.js        maquetación del diagrama
  interpreter.js ejecución paso a paso (sin eval)
  storage.js     persistencia local validada
src/components/  interfaz Vue 3 (<script setup>)
src/composables/ estado compartido
```

## Seguridad

- Sin `eval`, `new Function` ni `v-html`: el pseudocódigo se interpreta con un analizador propio
  y todo el texto se pinta escapado por Vue.
- CSP estricta inyectada en la build (`script-src 'self'`, `connect-src 'none'`, Trusted Types…):
  la página no puede hacer peticiones de red ni ejecutar scripts ajenos.
- Todo lo leído de `localStorage` o de un fichero importado se valida (tamaño, tipos, límites,
  caracteres de control) antes de usarse.
- Límites contra bloqueos: tamaño del código, anidamiento, pasos de ejecución y vueltas simuladas.
- Tipografías servidas desde el propio sitio (sin CDNs) y dependencias mínimas (solo `vue`).
- `vercel.json` añade las cabeceras HTTP que una etiqueta `<meta>` no puede fijar (`frame-ancestors`, `nosniff`, `X-Frame-Options`…).
