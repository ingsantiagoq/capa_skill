---
name: new-proto
description: "This skill should be used when the user asks to 'create a proto', 'add a proto file', 'define gRPC service', 'add gRPC method', 'create proto definition', 'new proto', or needs to create or modify .proto files for gRPC inter-service communication in UBP. Ensures the UBP proto mold: proto3, versioned package, canonical csharp_namespace, by-path Protobuf Include, and passing tools/check-protos.sh."
version: 2.0.0
---

# New Proto — molde UBP (ADR-0001)

Crea/edita contratos `.proto` para la comunicación gRPC interna de UBP. La única cara REST es el BFF;
los servicios internos son gRPC-only (ADR-0002). Este skill emite EXACTAMENTE lo que `tools/check-protos.sh`
acepta y lo que `Grpc.Tools` compila por-ruta.

## Reglas inviolables del molde de proto UBP

1. **Ubicación:** los `.proto` viven en el repo hermano **`ubp-protos/`** (flat, no `protos/{project}/`),
   junto a `btw-ubp-backend/`. Nombre: `<svc>-tenant.proto` para servicios de tenant, o `<svc>.proto`.
2. **Header canónico:**
   - `syntax = "proto3";`
   - `package ubp.<svc>.v1;` — **versionado explícito** (`.v1`).
   - `option csharp_namespace = "Ubp.<Seg>.Grpc.V1";` — casing canónico: **`Ubp`** (no `UBP`), **`Grpc`** (no `gRPC`), termina en **`.V1`**.
3. **El tenant NO va en el body.** Viaja en la metadata `x-actor-tenant` (la fija el BFF; el servicio la lee
   con el interceptor del kernel). **Nunca** generes un campo `tenant_id` en los mensajes.
4. **Montos:** `string` decimal en cultura invariante (p.ej. `"1234.56"`), o el tipo compartido
   `ubp.common.v1.Money` (`import "common.proto";`). **Nunca** `double` ni `int64 cents`.
5. **Fechas:** `string` ISO-8601 UTC (p.ej. `"2026-07-05T00:00:00Z"`). **NO** `google.protobuf.Timestamp`.
6. **Consumo por-ruta:** cada servicio añade el `.proto` a su `.csproj` con `<Protobuf Include>` relativo.

## Template

```protobuf
syntax = "proto3";

package ubp.<svc>.v1;

option csharp_namespace = "Ubp.<Seg>.Grpc.V1";

// import "common.proto";   // solo si usás ubp.common.v1.Money

// Contrato del ubp-<svc>-service (ADR-00XX) — <descripción>. Consumido SOLO por el BFF.
// El tenant_id lo fija el BFF y viaja en la metadata x-actor-tenant — el servicio NO lo recibe por body.
// Montos como string decimal (cultura invariante). Fechas como string ISO-8601 UTC.

service <Seg>TenantService {
  rpc Create<Entity> (Create<Entity>Request) returns (<Entity>Response);
  rpc Get<Entity>    (Get<Entity>Request)    returns (<Entity>Response);
  rpc List<Entities> (List<Entities>Request) returns (List<Entities>Response);
}

message Create<Entity>Request {
  string code   = 1;
  string amount = 2;   // decimal cultura-invariante
  // o: ubp.common.v1.Money amount = 2;
}

message Get<Entity>Request  { string id = 1; }
message List<Entities>Request { int32 page = 1; int32 page_size = 2; }

message <Entity>Response {
  string id         = 1;
  string code       = 2;
  string amount     = 3;   // decimal string
  string created_at = 4;   // ISO-8601 UTC
}

message List<Entities>Response { repeated <Entity>Response items = 1; int32 total = 2; }
```

## Numeración de campos

1. Empezar en 1, incrementar; reservar 1–15 para los frecuentes (encoding de 1 byte).
2. **NUNCA reusar un número** (aunque el campo se elimine) — rompe compat de wire (`check-protos.sh` G4 lo bloquea).
3. Deprecar con `reserved`:
   ```protobuf
   reserved 5, 8;
   reserved "old_field_name";
   ```

## Mapeo de tipos (C# ↔ Protobuf) en UBP

| C# | Proto UBP |
|---|---|
| Guid | `string` (UUID como string) |
| DateTime | `string` ISO-8601 UTC (NO Timestamp) |
| decimal (dinero) | `string` decimal, o `ubp.common.v1.Money` |
| int | `int32` · long | `int64` · bool | `bool` · string | `string` · byte[] | `bytes` |
| enum | `enum` (con `UNSPECIFIED = 0`) · List<T> | `repeated T` |

## Registro en el `.csproj` del servicio

En `ubp-<svc>-service/src/Ubp.<Seg>.Api/Ubp.<Seg>.Api.csproj` (server) — o `.Infrastructure` para el client
de otro servicio:

```xml
<ItemGroup>
  <Protobuf Include="../../../../ubp-protos/<svc>-tenant.proto"
            GrpcServices="Server" Link="Protos/<svc>-tenant.proto" />
  <!-- Si usás tipos compartidos: -->
  <Protobuf Include="../../../../ubp-protos/common.proto"
            GrpcServices="None" Link="Protos/common.proto" />
</ItemGroup>
```

`GrpcServices`: `Server` (implemento el servicio) · `Client` (lo consumo desde otro servicio, típicamente en
`.Infrastructure`) · `None` (solo mensajes, p.ej. `common.proto`). El paquete `Grpc.Tools` ya está en el molde
del servicio (ver `new-microservice`); el cliente gRPC se registra con `AddUbpGrpcClient<T>` del kernel, no a mano.

## Después de crear/editar (obligatorio)

1. **Gate de protos:** `bash tools/check-protos.sh` (G1 proto3 · G2 package versionado · G3 csharp_namespace
   único · G4 sin field-number duplicado). Debe salir 0.
2. **Compilar:** `dotnet build ubp-<svc>-service/src/Ubp.<Seg>.Api/Ubp.<Seg>.Api.csproj -tl:off` — Grpc.Tools
   genera `Ubp.<Seg>.Grpc.V1.*` en `obj/`. Verde = el contrato compila.
3. Implementá la fachada `Ubp.<Seg>.Api.Services.<Seg>GrpcService : <Proto>.<Proto>Base` (ver `new-microservice`).

## Anti-patrones (NO hacer)

- ❌ `protos/{project}/` centralizado, `package {project}.{service}`, `ProtoRoot`, `import "google/protobuf/timestamp.proto"`,
  `csharp_namespace "{Prefix}.{ServiceName}.Grpc"`, Pagination/UuidValue compartidos, env-vars de docker-compose —
  todo eso era el molde de OTRO proyecto (RIDETOGETHER), **derogado**.
- ❌ `tenant_id` como campo del mensaje (va en metadata).
- ❌ `double`/`int64 cents` para dinero (pérdida de precisión / rompe la convención decimal-string).
- ❌ `google.protobuf.Timestamp` para fechas (UBP usa string ISO-8601).
- ❌ Reusar un número de campo (rompe compat de wire — `check-protos.sh` G4 lo bloquea).
