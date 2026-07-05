# Perfil BACKEND/KERNEL de la plantilla CAPA

Variante para CAPAs de **kernel, motor, saga/outbox o servicio gRPC-only sin front**.
Nace de una brecha real (panel de validación 2026-07-03, lente QuickBooks sobre ADR-0001): el DoD
por-defecto (`../dossier/`) es frontend-biased (Swagger/OpenAPI/API smoke) y produce CAPAs teatrales
cuando el trabajo es de kernel/backend.

- **ALCANCE.md / ASEGURAMIENTO.md** (aquí): perfil backend — contrato proto/gRPC + evento, DoD de
  invariantes/saga/conformance.
- **CONTEXTO.md / PODER.md / PROGRESO.md**: son agnósticos de perfil → reusar los de `../dossier/`.

Usar al detallar CAPAs de Ola 0 (outbox-saga 0045, kernel-obliga 0001, integridad-posteo 0016).
