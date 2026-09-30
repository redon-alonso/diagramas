# Especificación de Gramática y Sintaxis (Español / Inglés)

Este documento define las reglas sintácticas, palabras clave y estructuras lógicas permitidas en el Transcriptor Gráfico. Sirve como fuente única de verdad para el analizador sintáctico (Parser) y la IA.

## 1. Reglas Generales de Estilo
* **Filtro de Caja:** Todas las palabras clave deben escribirse estrictamente en MAYÚSCULAS (`SI`, `IF`, `MOSTRAR`, `PRINT`).
* **Identificadores:** Los nombres de variables deben comenzar con una letra o guion bajo (`_`). No se permiten espacios ni caracteres especiales.
* **Tipado:** El tipado es dinámico. Las variables se definen automáticamente al asignarles un valor.
* **Comentarios:** Cualquier línea que comience con doble barra `//` será ignorada por el parser y no generará nodos en el diagrama.

---

## 2. Bloque Estructural Principal

Todo algoritmo debe estar contenido obligatoriamente dentro de un bloque de inicio y fin.

### Sintaxis

| Idioma | Palabra de Inicio | Palabra de Cierre |
| :--- | :--- | :--- |
| **Español** | `INICIO` | `FIN` |
| **Inglés** | `START` | `END` |

### Representación en Diagrama de Flujo
* **Nodo de Inicio:** Óvalo/Terminador con el texto "Inicio" o "Start".
* **Nodo de Fin:** Óvalo/Terminador con el texto "Fin" o "End".
* Todos los demás bloques lógicos se posicionarán secuencialmente entre estos dos nodos.

---

## 3. Asignación y Operaciones (Procesos)

Se utiliza para guardar valores en variables o realizar cálculos matemáticos.

### Sintaxis
* **Español / Inglés:** `variable = expresion`
* **Operadores permitidos:** `+`, `-`, `*`, `/`, `%` (módulo).

### Ejemplos
```pseudo
// Español
total = 100
resultado = (base * altura) / 2

// Inglés
total = 100
result = (base * height) / 2
```

### Representación en Diagrama de Flujo
* **Bloque de Proceso:** Rectángulo estándar con la operación matemática o asignación en su interior.

---

## 4. Entrada y Salida de Datos

Define cómo el algoritmo interactúa con el usuario (leer datos del teclado o mostrar mensajes en pantalla).

### Sintaxis

| Función | Palabras Clave (ES) | Palabras Clave (EN) |
| :--- | :--- | :--- |
| **Salida (Pantalla)** | `MOSTRAR` | `PRINT` |
| **Entrada (Teclado)** | `LEER` | `INPUT` |

### Ejemplos
```pseudo
// Español
MOSTRAR "Introduce tu nombre:"
LEER usuario

// Inglés
PRINT "Enter your name:"
INPUT user
```

### Representación en Diagrama de Flujo
* **Entrada y Salida:** Paralelogramo. 
  * Para la salida, se puede incluir un icono o prefijo opcional (ej: `[Pantalla] "Hola"`).
  * Para la entrada, se especifica la variable (ej: `[Teclado] usuario`).

---

## 5. Estructura Condicional (SI / IF)

Permite bifurcar el flujo del programa evaluando una condición booleana (`True`/`False`).

### Sintaxis
```pseudo
// Español
SI condicion ENTONCES
    // instrucciones si verdadero
SINO
    // instrucciones si falso (opcional)
FIN_SI

// Inglés
IF condicion THEN
    // instrucciones si verdadero
ELSE
    // instrucciones si falso (opcional)
END_IF
```

### Operadores de Condición
* `==` (Igual a), `!=` (Diferente de), `>`, `<`, `>=`, `<=`

### Representación en Diagrama de Flujo
* **Nodo de Decisión:** Rombo con la condición en su interior.
* **Ramas de salida:** Dos flechas etiquetadas claramente como **"SÍ" / "YES"** (bifurcación verdadera) y **"NO"** (bifurcación falsa / `SINO`).
* **Nodo de convergencia:** Un punto de unión invisible donde ambas ramas vuelven a unirse antes de pasar a la siguiente instrucción del flujo principal (`FIN_SI` / `END_IF`).

---

## 6. Bucle Mientras (MIENTRAS / WHILE)

Bucle pre-test que repite un bloque de código mientras la condición sea verdadera.

### Sintaxis
```pseudo
// Español
MIENTRAS condicion HACER
    // instrucciones
FIN_MIENTRAS

// Inglés
WHILE condicion DO
    // instructions
END_WHILE
```

### Representación en Diagrama de Flujo
* **Nodo de Evaluación:** Rombo con la condición en la parte superior del ciclo.
* **Rama Verdadera ("SÍ"):** Entra al bloque de instrucciones. Al terminar la última instrucción, una flecha **retorna hacia la parte superior del rombo** para volver a evaluar.
* **Rama Falsa ("NO"):** Salta por completo el bloque y continúa con el flujo que esté debajo del `FIN_MIENTRAS`.

---

## 7. Bucle Para (PARA / FOR)

Bucle determinado que se repite un número exacto de veces utilizando una variable contadora. El incremento siempre es de `+1` de forma automática.

### Sintaxis
```pseudo
// Español
PARA variable DESDE valor_inicio HASTA valor_fin HACER
    // instrucciones
FIN_PARA

// Inglés
FOR variable FROM valor_inicio TO valor_fin DO
    // instructions
END_FOR
```

### Tratamiento de errores
```pseudo
PARA i DESDE 1 HASTA 5 HACER
    MOSTRAR i
 <- aquí faltaría el FIN_PARA, indicarlo para que arreglen manualmente el pseudocódigo>
```


### Ejemplo
```pseudo
PARA i DESDE 1 HASTA 5 HACER
    MOSTRAR i
FIN_PARA
```

### Representación en Diagrama de Flujo
* **Nodo de Control:** Hexágono alargado (o un rombo tradicional) que contiene la inicialización y el límite (ej: `i = 1 hasta 5`).
* **Lazo de retorno:** Al igual que el `MIENTRAS`, una flecha vuelve al nodo de control incrementando la variable automáticamente en cada ciclo hasta que supera el `valor_fin`.



---

## 8. Operadores lógicos (Y / O / NO)

Permiten combinar condiciones en `SI`, `MIENTRAS` y `HASTA_QUE`.

| Operador | Español | Inglés | Significado |
| :--- | :--- | :--- | :--- |
| Conjunción | `Y` | `AND` | Verdadero si las dos partes lo son |
| Disyunción | `O` | `OR` | Verdadero si alguna parte lo es |
| Negación | `NO` | `NOT` | Invierte el valor |

* **Precedencia** (de menor a mayor): `O` → `Y` → `NO` → comparaciones → `+ -` → `* / %` → signo → `v[i]`.
* **Evaluación en cortocircuito:** `a Y b` no evalúa `b` si `a` es falso; `a O b` no evalúa `b` si `a` es verdadero. Así `i <= LONGITUD(v) Y v[i] != x` nunca se sale de la lista.
* No se pueden encadenar comparaciones (`a < b < c`): se escribe `a < b Y b < c`.

```pseudo
SI edad >= 18 Y NO bloqueado ENTONCES
    MOSTRAR "Acceso permitido"
FIN_SI
```

---

## 9. Valores literales

| Valor | Español | Inglés |
| :--- | :--- | :--- |
| Lógicos | `VERDADERO`, `FALSO` | `TRUE`, `FALSE` |
| Ausencia de valor | `NULO` | `NULL` |
| Texto | `"entre comillas"` | `"between quotes"` |

* `NULO` solo se puede comparar con `==` y `!=`; cualquier operación aritmética con él es un error.
* `+` entre un texto y otro valor concatena.

---

## 10. Listas

* **Crear:** `v = [3, 8, 1]` o `v = LISTA(n, 0)` (n elementos con el valor 0).
* **Leer y escribir:** `x = v[i]`, `v[i] = x`. Las posiciones empiezan en **1** y llegan a `LONGITUD(v)`; salirse es un error.
* **Listas de listas:** `m[i][j]`.
* **LEER** acepta una lista escrita entre corchetes: `[5, 2, 9]`.
* Asignar o pasar una lista a una función **no la copia**: las dos variables comparten la misma lista.

---

## 11. Funciones predefinidas

| Español | Inglés | Resultado |
| :--- | :--- | :--- |
| `LONGITUD(v)` | `LENGTH(v)` | Número de elementos de una lista o de caracteres de un texto |
| `LISTA(n, x)` | `LIST(n, x)` | Lista de `n` elementos con valor `x` |
| `ENTERO(x)` | `INT(x)` | `x` sin decimales (división entera: `ENTERO(a / b)`) |
| `ABS(x)` | `ABS(x)` | Valor absoluto |
| `RAIZ(x)` | `SQRT(x)` | Raíz cuadrada |
| `MAX(a, b)`, `MIN(a, b)` | igual | Mayor / menor de dos números |
| `ALEATORIO(a, b)` | `RANDOM(a, b)` | Entero al azar entre `a` y `b` (ambos incluidos) |

Van siempre en MAYÚSCULAS; no se pueden usar como nombre de una función propia.

---

## 12. Bucle Repetir (REPETIR / REPEAT)

Bucle post-test: el cuerpo se ejecuta **al menos una vez** y se repite hasta que la condición sea verdadera.

```pseudo
// Español
REPETIR
    // instrucciones
HASTA_QUE condicion

// Inglés
REPEAT
    // instructions
UNTIL condition
```

### Representación en Diagrama de Flujo
* El bloque de instrucciones va primero y el **rombo con la condición al final**.
* **"SÍ"**: la condición se cumple y el flujo sale del bucle.
* **"NO"**: una flecha vuelve al principio del bloque.

---

## 13. Funciones (FUNCION / FUNCTION) y recursión

Se definen **fuera** del bloque `INICIO … FIN` (antes o después). Pueden devolver un valor con `RETORNAR` y llamarse a sí mismas.

```pseudo
// Español
FUNCION factorial(n)
    SI n <= 1 ENTONCES
        RETORNAR 1
    FIN_SI
    RETORNAR n * factorial(n - 1)
FIN_FUNCION

INICIO
    LEER n
    MOSTRAR factorial(n)
FIN

// Inglés
FUNCTION square(x)
    RETURN x * x
END_FUNCTION
```

* **Parámetros:** entre paréntesis, separados por comas. Los números y textos se copian; las listas se comparten.
* **Llamadas:** dentro de una expresión (`y = doble(3)`) o como instrucción suelta (`ordenar(v)`).
* **RETORNAR** termina la función; sin valor devuelve `NULO`. Solo puede usarse dentro de una función.
* Una función sin `RETORNAR` termina al llegar a `FIN_FUNCION`.

### Representación en Diagrama de Flujo
* Cada función tiene **su propio diagrama**, que empieza con un óvalo con su nombre y parámetros.
* **Llamada a función:** rectángulo con dos barras verticales en los lados (subproceso).
* **RETORNAR:** óvalo con el texto "Devolver x"; ahí termina ese camino.

### Tratamiento de errores
* Llamar a una función que no existe o con un número de valores distinto al de sus parámetros.
* Falta `FIN_FUNCION`.
* `RETORNAR` fuera de una función.
* Recursión sin caso base: la ejecución se detiene al superar el límite de llamadas anidadas.

---

## 14. Coste de los algoritmos

Cada operación elemental cuesta 1: asignación, operación aritmética, comparación, `Y`/`O`/`NO`, acceso `v[i]`, cada valor mostrado o leído, llamada a función y `RETORNAR`. `LISTA(n, x)` cuesta además `n`. Los bucles suman el coste de su cuerpo en cada vuelta y las funciones recursivas se resuelven a partir de su recurrencia (reducir el tamaño restando da coste lineal o exponencial; dividiéndolo, logarítmico o `n log n`).

---

## 15. Control de bucles y recursiones infinitas

* **Antes de ejecutar**, el análisis avisa si ninguna variable de la condición cambia dentro del bucle, si la condición es constante (`MIENTRAS VERDADERO`) o si la variable avanza en sentido contrario al que necesita la condición.
* **Al ejecutar**, el bucle se detiene con el aviso *Bucle infinito* en cuanto las variables de las que depende su condición vuelven a tener los mismos valores que en una vuelta anterior: a partir de ahí se repetiría siempre igual. Con `LEER` o `ALEATORIO` dentro del bucle esta comprobación no se aplica, porque el resultado puede cambiar.
* Una función que se llama a sí misma **con los mismos valores** antes de terminar se detiene con el aviso *Recursión infinita*. También hay un máximo de 400 llamadas anidadas.
* Siempre hay un **límite de pasos** (100 mil, 1 millón o 10 millones) y la ejecución se puede **detener** en cualquier momento.
