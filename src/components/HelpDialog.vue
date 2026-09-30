<script setup>
import { ref, onMounted } from 'vue'
import AppIcon from './AppIcon.vue'

const emit = defineEmits(['close'])
const dialog = ref(null)
onMounted(() => dialog.value.showModal())

const RULES = [
  { what: 'Bloque principal', es: 'INICIO … FIN', en: 'START … END', shape: 'Óvalo' },
  { what: 'Asignación', es: 'total = (base * altura) / 2', en: 'total = (base * height) / 2', shape: 'Rectángulo' },
  { what: 'Mostrar', es: 'MOSTRAR "Hola", nombre', en: 'PRINT "Hello", name', shape: 'Paralelogramo' },
  { what: 'Leer', es: 'LEER edad', en: 'INPUT age', shape: 'Paralelogramo' },
  { what: 'Condición', es: 'SI x > 0 ENTONCES … SINO … FIN_SI', en: 'IF x > 0 THEN … ELSE … END_IF', shape: 'Rombo' },
  { what: 'Mientras', es: 'MIENTRAS i < n HACER … FIN_MIENTRAS', en: 'WHILE i < n DO … END_WHILE', shape: 'Rombo con retorno' },
  { what: 'Para', es: 'PARA i DESDE 1 HASTA n HACER … FIN_PARA', en: 'FOR i FROM 1 TO n DO … END_FOR', shape: 'Hexágono con retorno' },
  { what: 'Repetir', es: 'REPETIR … HASTA_QUE i >= n', en: 'REPEAT … UNTIL i >= n', shape: 'Rombo al final con retorno' },
  { what: 'Lógica', es: 'SI x > 0 Y NO fin O x == 5', en: 'IF x > 0 AND NOT done OR x == 5', shape: '(dentro del rombo)' },
  { what: 'Valores', es: 'VERDADERO, FALSO, NULO', en: 'TRUE, FALSE, NULL', shape: '—' },
  { what: 'Listas', es: 'v = [4, 7, 1] · v[2] = 9 · LONGITUD(v)', en: 'v = [4, 7, 1] · v[2] = 9 · LENGTH(v)', shape: 'Rectángulo' },
  { what: 'Función', es: 'FUNCION doble(x) … RETORNAR x * 2 … FIN_FUNCION', en: 'FUNCTION double(x) … RETURN x * 2 … END_FUNCTION', shape: 'Diagrama propio; Devolver es un óvalo' },
  { what: 'Llamada', es: 'y = doble(3) · ordenar(v)', en: 'y = double(3) · sort(v)', shape: 'Rectángulo con barras laterales' },
]

const BUILTINS = [
  ['LONGITUD(v)', 'LENGTH(v)', 'número de elementos de una lista o letras de un texto'],
  ['LISTA(n, x)', 'LIST(n, x)', 'crea una lista de n elementos que valen x'],
  ['ENTERO(x)', 'INT(x)', 'quita los decimales (sirve para la división entera)'],
  ['ABS(x) · RAIZ(x)', 'ABS(x) · SQRT(x)', 'valor absoluto y raíz cuadrada'],
  ['MAX(a, b) · MIN(a, b)', 'MAX(a, b) · MIN(a, b)', 'el mayor y el menor de dos números'],
  ['ALEATORIO(a, b)', 'RANDOM(a, b)', 'número entero al azar entre a y b'],
]
</script>

<template>
  <dialog ref="dialog" class="help" aria-labelledby="help-title" @close="emit('close')" @click.self="dialog.close()">
    <div class="inner">
      <header>
        <h2 id="help-title">Cómo escribir el pseudocódigo</h2>
        <button type="button" class="btn ghost icon" aria-label="Cerrar" @click="dialog.close()"><AppIcon name="close" /></button>
      </header>

      <ul class="rules-list">
        <li>Las palabras clave van siempre en <strong>MAYÚSCULAS</strong>. Puedes escribir en español o en inglés.</li>
        <li>Los nombres de variables empiezan por una letra o <code>_</code> y solo llevan letras sin tilde, números y <code>_</code>.</li>
        <li>No hace falta declarar variables: se crean al darles un valor.</li>
        <li>Las líneas que empiezan por <code>//</code> son comentarios y no aparecen en el diagrama.</li>
        <li>Operadores: <code>+ - * / %</code>, para comparar <code>== != &gt; &lt; &gt;= &lt;=</code> y lógicos <code>Y O NO</code> (<code>AND OR NOT</code>). <code>Y</code> y <code>O</code> no evalúan la segunda parte si no hace falta.</li>
        <li>Las listas empiezan en la posición <strong>1</strong>: en <code>v = [4, 7, 1]</code>, <code>v[1]</code> vale 4. Al pasar una lista a una función se comparte, no se copia.</li>
        <li>Las funciones se escriben fuera de <code>INICIO … FIN</code>, antes o después. Pueden llamarse a sí mismas (recursión).</li>
      </ul>

      <div class="table-wrap">
        <table>
          <thead>
            <tr><th scope="col">Estructura</th><th scope="col">Español</th><th scope="col">Inglés</th><th scope="col">En el diagrama</th></tr>
          </thead>
          <tbody>
            <tr v-for="r in RULES" :key="r.what">
              <th scope="row">{{ r.what }}</th>
              <td><code>{{ r.es }}</code></td>
              <td><code>{{ r.en }}</code></td>
              <td>{{ r.shape }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>Funciones predefinidas</h3>
      <div class="table-wrap">
        <table>
          <tbody>
            <tr v-for="b in BUILTINS" :key="b[0]">
              <th scope="row"><code>{{ b[0] }}</code></th>
              <td><code>{{ b[1] }}</code></td>
              <td>{{ b[2] }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>Qué hace cada parte</h3>
      <ul class="rules-list">
        <li><strong>Taller:</strong> escribe a la izquierda y el diagrama se dibuja solo. Pasa el ratón por un nodo para ver su línea; haz clic para ir a ella.</li>
        <li><strong>Coste:</strong> calcula cuántas operaciones hace el algoritmo según el tamaño de la entrada (T(n)) y su orden (O grande). En el margen del editor verás cuántas veces se ejecuta cada línea.</li>
        <li><strong>Ejecutar:</strong> recorre el diagrama paso a paso, resaltando el nodo activo, las variables, las listas y la pila de llamadas. Para <code>LEER</code> una lista escribe <code>[5, 2, 9]</code>.</li>
        <li><strong>Comparar:</strong> pon varios algoritmos en la misma gráfica para ver cuál escala mejor y si es viable para un tamaño dado.</li>
      </ul>

      <h3>Tus datos</h3>
      <p>
        Todo funciona dentro de tu navegador: no hay servidor ni cuentas, y el código nunca sale de tu equipo.
        Los algoritmos guardados se quedan en el almacenamiento local de este navegador; si borras sus datos, se pierden.
        Usa <em>Exportar todo</em> en la biblioteca para hacer una copia en un fichero.
      </p>

      <h3>Atajos</h3>
      <ul class="rules-list">
        <li><kbd>Ctrl</kbd> + <kbd>S</kbd>: guardar el algoritmo.</li>
        <li><kbd>Tab</kbd> / <kbd>Mayús</kbd> + <kbd>Tab</kbd> en el editor: añadir o quitar sangría. <kbd>Esc</kbd> y luego <kbd>Tab</kbd> para salir del editor.</li>
        <li>En el diagrama: flechas para moverlo, <kbd>+</kbd> y <kbd>−</kbd> para ampliar, <kbd>0</kbd> para ajustarlo.</li>
      </ul>
    </div>
  </dialog>
</template>

<style scoped>
.help {
  width: min(820px, calc(100vw - 32px));
  max-height: calc(100dvh - 48px);
  padding: 0;
  border: 1px solid var(--rule);
  border-radius: var(--radius-m);
  background: var(--panel);
  color: var(--ink);
  box-shadow: var(--shadow-pop);
}

.help::backdrop {
  background: rgb(10 15 30 / 0.35);
}

.inner {
  padding: 18px 22px 24px;
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
  margin: 20px 0 6px;
  font-size: 16px;
}

p {
  margin: 0;
  max-width: 70ch;
}

.rules-list {
  margin: 10px 0;
  padding-left: 20px;
  max-width: 75ch;
}

.rules-list li + li {
  margin-top: 4px;
}

.table-wrap {
  overflow-x: auto;
  margin-top: 12px;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13.5px;
}

th,
td {
  padding: 6px 8px;
  border-bottom: 1px solid var(--rule);
  text-align: left;
  vertical-align: top;
}

thead th {
  color: var(--ink-soft);
}

kbd {
  padding: 0 5px;
  border: 1px solid var(--rule);
  border-bottom-width: 2px;
  border-radius: 4px;
  font-size: 12.5px;
}
</style>
