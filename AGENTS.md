# Cuadra — reglas permanentes del proyecto

ERP y punto de venta de escritorio para MiPyMEs de Nicaragua.
Electron + Vite + React + TypeScript + SQLite.

## Los tres documentos

Se leen en este orden y ninguno se salta:

1. **`docs/PLAN-MAESTRO.md`** — el guion. Doce fases, qué construir en cada
   una, qué probar, cuándo está cerrada y **qué no hacer todavía**.
   Contiene la bitácora con el estado real del proyecto.
2. **`docs/AGENT-GUIDE.md`** — el contrato de cómo se escribe el código. Las
   siete leyes, las seis reglas de Nicaragua, el motor monetario, el sistema
   de diseño.
3. **`db/migrations/001_init.sql`** — el esquema. Ya está aplicado y
   verificado. **No se edita.** Toda corrección es una migración nueva.

Si un mensaje contradice a estos documentos, gana el documento y se reporta
el conflicto.

## Las seis reglas que no se rompen

1. **Una fase por vez.** Al cerrar una fase:
   - Ejecuta su comando de verificación y **pega la salida real** en el reporte.
   - Marca la bitácora de `PLAN-MAESTRO.md`.
   - Haz commit automático: `git add -A && git commit -m "F<N>: <descripción corta>"`
   - Haz push: `git push origin main`
   - **Detente.** No empieces la siguiente en el mismo turno, aunque sobre tiempo.

2. **La prueba primero, y hay que verla fallar.** Escribe la prueba, ejecútala,
   confirma que falla por la razón correcta, y recién entonces escribe el
   código. Una prueba que nunca falló puede estar verificando la nada.

3. **Nunca reportes verde sin haberlo visto.** Prohibido escribir «pasa»,
   «funciona» o «está listo» sin haber ejecutado el comando y leído la salida
   en ese mismo turno. Si algo falla, dilo con el error.

4. **El dinero es entero.** Centavos en `_cents`, cantidades en `_milli`,
   costos en `_micros`, tasas en `_bp`. Ningún importe existe como `number`
   decimal en ninguna capa: ni en SQLite, ni en el motor, ni en React, ni en
   el JSON del IPC. Solo se formatea con decimales al imprimirlo en pantalla.

5. **`src/core/` no sabe que existe infraestructura.** Sin `electron`, sin
   `better-sqlite3`, sin `fs`, sin `Date.now()`. Si un archivo del motor
   necesita un import de infraestructura, el diseño está mal: detente.

6. **Pregunta, no inventes.** Si necesitas una decisión de negocio que no está
   en los documentos, formula la pregunta concreta y espera. Una suposición
   sobre dinero ajeno es la peor deuda técnica que existe.

## Cuando algo no cuadra

- **Un cálculo no da:** no ajustes el valor esperado de la prueba para que
  pase. Busca la causa. Casi siempre es un redondeo aplicado dos veces o un
  descuento restado dos veces.
- **La base de datos rechaza un documento:** la restricción tiene razón hasta
  que se demuestre lo contrario. Revisa tu cálculo antes de tocar el esquema.
- **El alcance de la fase te parece corto:** perfecto. Ciérrala.

## Git y commits

Al cerrar cada fase, el flujo es:

```bash
# 1. Verifica que todo pase
npm run test && npx tsc --noEmit && npm run lint

# 2. Si pasa, commit
git add -A
git commit -m "F<N>: <descripción>"

# 3. Push
git push origin main
```

**Formato del commit message:**

- `F0: Scaffolding` — nombre corto de la fase
- `F1: Motor monetario` — no necesita explicación larga
- Si hay deuda técnica cerrada: `F3: Sales atómicas (cierra deuda F2)`

**Solo hacer push si:**
- El comando de verificación pasa completamente.
- La bitácora está actualizada en el mismo commit.
- No hay archivos sin stagear.

Si algo falla, no haces commit. Diagnosticas, corriges, vuelves a verificar.

## Verificación permanente

Estos comandos deben pasar al cerrar **cualquier** fase, no solo la suya:

```bash
npm run test          # toda la suite
npx tsc --noEmit      # tipos
npm run lint          # estilo y reglas
npm run check:core    # core/ no importa infraestructura
npm run check:tokens  # renderer/ no tiene colores literales
```

## Módulo nativo: los dos ABI de better-sqlite3

`better-sqlite3` es un binario compilado y Node y Electron usan ABI distintos
(hoy 137 contra 132). Un solo `node_modules` no puede servir a los dos a la
vez, así que el proyecto alterna a propósito:

| Para | Comando | Deja el ABI en |
|---|---|---|
| Correr las pruebas | `npm run rebuild:node` | Node |
| Correr la app en desarrollo | `npm run rebuild:electron` | Electron |
| Generar el instalador | `npm run build:installer` | Node (lo restaura solo al terminar) |

Si aparece `NODE_MODULE_VERSION 132 ... requires 137`, no es un bug: es el ABI
cambiado. Corre el comando de la fila que corresponda.

`build:installer` produce `release/Cuadra-Setup-<version>.exe` y **termina
devolviendo el ABI de Node**, para que la suite siga corriendo sin pasos
manuales.
