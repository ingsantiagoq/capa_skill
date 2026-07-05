# ALCANCE — {{ADR}} · {{TITLE}}

> **CAPA · Alcance (perfil BACKEND/KERNEL).** Para trabajo de kernel, motor, saga/outbox o servicio
> gRPC-only **sin superficie de front**. El contrato es **proto/gRPC + evento**, no OpenAPI.

## 1. Slices de la iteración (orden backend)

<!-- Por modelo: Domain/invariantes → EF/migración → proto/contrato gRPC → Handlers/servicio →
     Saga/outbox (si aplica) → Tests (dominio + conformance) → Notas. NO hay slice de Swagger/front. -->

| Slice | Estado | Ancla graphify |
|---|---|---|

## 2. Contrato interno (proto / gRPC / evento)

- **Mensajes proto + RPC** (fuente de verdad del contrato interno):
- **Idempotency-key / correlación** (si hay saga/outbox — clave que evita doble-efecto):
- **Evento de dominio** (nombre + payload canónico versionado, si emite al outbox):
- **Compatibilidad:** ¿breaking-change de proto? ¿quién lo consume (grep de clientes)?

## 3. Exclusiones explícitas (fuera del sprint)

-

## 4. Definition of Done (backend/kernel)

- [ ] Invariantes de dominio verdes (de CONTEXTO §4)
- [ ] Contrato proto/gRPC sin breaking-change no declarado
- [ ] Si hay saga/outbox: **idempotente + compensable** probado (no solo happy-path)
- [ ] Conformance/ArchUnit si es regla de kernel (toda entidad cumple X)
- [ ] PROGRESO con evidencia (comando reproducible)
