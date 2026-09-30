// Ejemplos de partida, agrupados por el problema que resuelven para poder comparar enfoques.

export const SAMPLES = [
  {
    group: 'Sumar de 1 a n',
    name: 'Suma con bucle',
    code: `INICIO
    // Suma los números del 1 al n uno a uno
    LEER n
    suma = 0
    PARA i DESDE 1 HASTA n HACER
        suma = suma + i
    FIN_PARA
    MOSTRAR "La suma es", suma
FIN`,
  },
  {
    group: 'Sumar de 1 a n',
    name: 'Suma con fórmula de Gauss',
    code: `INICIO
    // Misma suma, sin bucle: n(n+1)/2
    LEER n
    suma = n * (n + 1) / 2
    MOSTRAR "La suma es", suma
FIN`,
  },
  {
    group: 'Contar parejas',
    name: 'Todas las parejas (i, j)',
    code: `INICIO
    LEER n
    parejas = 0
    PARA i DESDE 1 HASTA n HACER
        PARA j DESDE 1 HASTA n HACER
            parejas = parejas + 1
        FIN_PARA
    FIN_PARA
    MOSTRAR parejas
FIN`,
  },
  {
    group: 'Contar parejas',
    name: 'Parejas sin repetir (j > i)',
    code: `INICIO
    LEER n
    parejas = 0
    PARA i DESDE 1 HASTA n HACER
        PARA j DESDE i + 1 HASTA n HACER
            parejas = parejas + 1
        FIN_PARA
    FIN_PARA
    MOSTRAR parejas
FIN`,
  },
  {
    group: 'Buscar en una lista',
    name: 'Búsqueda lineal',
    code: `FUNCION buscar(v, x)
    i = 1
    MIENTRAS i <= LONGITUD(v) Y v[i] != x HACER
        i = i + 1
    FIN_MIENTRAS
    SI i <= LONGITUD(v) ENTONCES
        RETORNAR i
    FIN_SI
    RETORNAR NULO
FIN_FUNCION

INICIO
    // Escribe una lista entre corchetes, por ejemplo [3, 8, 15, 21]
    LEER v
    LEER x
    MOSTRAR "Posición:", buscar(v, x)
FIN`,
  },
  {
    group: 'Buscar en una lista',
    name: 'Búsqueda binaria (recursiva)',
    code: `FUNCION buscar(v, x, izq, der)
    SI izq > der ENTONCES
        RETORNAR NULO
    FIN_SI
    medio = ENTERO((izq + der) / 2)
    SI v[medio] == x ENTONCES
        RETORNAR medio
    FIN_SI
    SI v[medio] < x ENTONCES
        RETORNAR buscar(v, x, medio + 1, der)
    SINO
        RETORNAR buscar(v, x, izq, medio - 1)
    FIN_SI
FIN_FUNCION

INICIO
    // La lista tiene que estar ordenada, por ejemplo [2, 5, 8, 13, 21]
    LEER v
    LEER x
    MOSTRAR "Posición:", buscar(v, x, 1, LONGITUD(v))
FIN`,
  },
  {
    group: 'Ordenar una lista',
    name: 'Ordenación burbuja',
    code: `FUNCION burbuja(v)
    n = LONGITUD(v)
    PARA i DESDE 1 HASTA n - 1 HACER
        PARA j DESDE 1 HASTA n - i HACER
            SI v[j] > v[j + 1] ENTONCES
                aux = v[j]
                v[j] = v[j + 1]
                v[j + 1] = aux
            FIN_SI
        FIN_PARA
    FIN_PARA
FIN_FUNCION

INICIO
    // Escribe una lista entre corchetes, por ejemplo [5, 2, 9, 1, 7]
    LEER v
    burbuja(v)
    MOSTRAR v
FIN`,
  },
  {
    group: 'Ordenar una lista',
    name: 'Ordenación por mezcla (merge sort)',
    code: `FUNCION mezclar(v, izq, medio, der)
    aux = LISTA(der - izq + 1, 0)
    i = izq
    j = medio + 1
    k = 1
    MIENTRAS i <= medio Y j <= der HACER
        SI v[i] <= v[j] ENTONCES
            aux[k] = v[i]
            i = i + 1
        SINO
            aux[k] = v[j]
            j = j + 1
        FIN_SI
        k = k + 1
    FIN_MIENTRAS
    MIENTRAS i <= medio HACER
        aux[k] = v[i]
        i = i + 1
        k = k + 1
    FIN_MIENTRAS
    MIENTRAS j <= der HACER
        aux[k] = v[j]
        j = j + 1
        k = k + 1
    FIN_MIENTRAS
    PARA t DESDE 1 HASTA der - izq + 1 HACER
        v[izq + t - 1] = aux[t]
    FIN_PARA
FIN_FUNCION

FUNCION ordenar(v, izq, der)
    SI izq < der ENTONCES
        medio = ENTERO((izq + der) / 2)
        ordenar(v, izq, medio)
        ordenar(v, medio + 1, der)
        mezclar(v, izq, medio, der)
    FIN_SI
FIN_FUNCION

INICIO
    // Escribe una lista entre corchetes, por ejemplo [5, 2, 9, 1, 7]
    LEER v
    ordenar(v, 1, LONGITUD(v))
    MOSTRAR v
FIN`,
  },
  {
    group: 'Fibonacci',
    name: 'Fibonacci recursivo',
    code: `FUNCION fib(n)
    SI n <= 1 ENTONCES
        RETORNAR n
    FIN_SI
    RETORNAR fib(n - 1) + fib(n - 2)
FIN_FUNCION

INICIO
    LEER n
    MOSTRAR "fib(", n, ") =", fib(n)
FIN`,
  },
  {
    group: 'Fibonacci',
    name: 'Fibonacci iterativo',
    code: `INICIO
    LEER n
    a = 0
    b = 1
    PARA i DESDE 1 HASTA n HACER
        siguiente = a + b
        a = b
        b = siguiente
    FIN_PARA
    MOSTRAR "fib(", n, ") =", a
FIN`,
  },
  {
    group: 'Potencia a^n',
    name: 'Multiplicar n veces',
    code: `INICIO
    LEER a
    LEER n
    resultado = 1
    PARA i DESDE 1 HASTA n HACER
        resultado = resultado * a
    FIN_PARA
    MOSTRAR resultado
FIN`,
  },
  {
    group: 'Potencia a^n',
    name: 'Potencia rápida (recursiva)',
    code: `FUNCION potencia(a, n)
    SI n == 0 ENTONCES
        RETORNAR 1
    FIN_SI
    mitad = potencia(a, ENTERO(n / 2))
    SI n % 2 == 0 ENTONCES
        RETORNAR mitad * mitad
    SINO
        RETORNAR mitad * mitad * a
    FIN_SI
FIN_FUNCION

INICIO
    LEER a
    LEER n
    MOSTRAR potencia(a, n)
FIN`,
  },
  {
    group: 'Contar dígitos',
    name: 'Dividiendo entre 10',
    code: `INICIO
    LEER n
    digitos = 0
    REPETIR
        // Quita la última cifra
        n = ENTERO(n / 10)
        digitos = digitos + 1
    HASTA_QUE n == 0
    MOSTRAR "Cifras:", digitos
FIN`,
  },
  {
    group: 'Es primo',
    name: 'Probar todos los divisores',
    code: `INICIO
    LEER n
    divisores = 0
    PARA d DESDE 2 HASTA n - 1 HACER
        SI n % d == 0 ENTONCES
            divisores = divisores + 1
        FIN_SI
    FIN_PARA
    SI divisores == 0 Y n > 1 ENTONCES
        MOSTRAR n, "es primo"
    SINO
        MOSTRAR n, "no es primo"
    FIN_SI
FIN`,
  },
  {
    group: 'Máximo común divisor',
    name: 'Algoritmo de Euclides',
    code: `INICIO
    LEER a
    LEER b
    MIENTRAS b != 0 HACER
        resto = a % b
        a = b
        b = resto
    FIN_MIENTRAS
    MOSTRAR "MCD:", a
FIN`,
  },
]

export const DEFAULT_CODE = SAMPLES[0].code
