# ASEGURAMIENTO — {{ADR}} · {{TITLE}}

> **CAPA · Aseguramiento (perfil BACKEND/KERNEL).** Invariantes de dominio, saga/outbox y conformance.
> Aquí vive el header de 2 ejes (Decisión ⟂ Implementación · ADR-0017).

## Estado (2 ejes)

| Eje | Valor | Evidencia |
|---|---|---|
| **Decisión** | _PROPUESTA \| ACEPTADA \| RECHAZADA_ | _quién firma_ |
| **Implementación** | _NONE \| PARTIAL \| E2E-VERIFIED_ | _contra qué: legacy \| WS-A_ |

## 1. Pruebas mínimas (backend/kernel)

- [ ] **invariantes de dominio** (de CONTEXTO §4) — el corazón, no opcional
- [ ] **gRPC facade** (el RPC hace lo que el contrato dice)
- [ ] si hay **saga/outbox**: idempotencia (mismo evento 2× = 1 efecto) · compensación (falla → revierte) · atomicidad (o todo o nada cross-servicio)
- [ ] **concurrencia** (row-lock / optimistic — dos posteos al mismo agregado)
- [ ] **conformance/ArchUnit** si es regla de kernel (toda entidad hereda/cumple X)
- [ ] **negativos** (el caso que debe fallar, falla en el dominio no en la UI)

## 2. Matriz de invariantes → test

| Invariante (CONTEXTO §4) | Test que lo prueba | Ancla graphify |
|---|---|---|

## 3. Coverage incremental por carpeta

`Domain/` + `Application/<Modelo>`: 20% → 40% → 60% → 80%

## 4. Budgets & seguridad (backend)

- **Consistencia:** outbox at-least-once + idempotencia · orden de eventos donde importa · sin doble-posteo
- **Aislamiento:** por tenant (y por entidad-legal si aplica) en TODO path, incl. consumers de evento
- inputs saneados · retry/timeout · secretos vía sidecar · catálogo de errores de negocio

## 5. Conformance / paridad

<!-- Kernel: ArchUnit "toda entidad hereda SoftDeletableEntity/ITenantOwned". Saga: "posteo espejo
     atómico o compensa". Motor: cuadre contable (Σ débitos = Σ créditos) por construcción. -->
