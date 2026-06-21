# ASEGURAMIENTO — {{ADR}} · {{TITLE}}

> **CAPA · Aseguramiento.** Invariantes del dominio probados, matriz de tests, coverage-by-path,
> budgets y seguridad. Aquí vive el header de 2 ejes (Decisión ⟂ Implementación · ADR-0017).

## Estado (2 ejes)

| Eje | Valor | Evidencia |
|---|---|---|
| **Decisión** | _PROPUESTA \| ACEPTADA \| RECHAZADA_ | _quién firma_ |
| **Implementación** | _NONE \| PARTIAL \| E2E-VERIFIED_ | _contra qué: legacy \| WS-A_ |

## 1. Pruebas mínimas por modelo (8)

- [ ] validator OK/error
- [ ] handler OK/conflicto
- [ ] authZ 403
- [ ] query paginada
- [ ] mapper
- [ ] API smoke
- [ ] **+2 pruebas de invariantes** del dominio (de CONTEXTO §4)

## 2. Matriz de invariantes → test

| Invariante (CONTEXTO §4) | Test que lo prueba | Ancla graphify |
|---|---|---|

## 3. Coverage incremental por carpeta

`Application/<Modelo>`: 20% → 40% → 60% → 80%

## 4. Budgets & seguridad

- p95 < 300ms · payload < 200KB · límites de página
- inputs saneados · retry/timeout · secretos · catálogo de errores · RBAC · aislamiento por tenant

## 5. Contract-test de paridad (si migra WS-B → WS-A)

<!-- No basta HTTP 200: numeración gapless + posting contable cuadrado. -->
