---
name: new-microservice
description: "This skill should be used when the user asks to 'create a microservice', 'add a new service', 'scaffold a service', 'new .NET service', or needs a new .NET 10 backend service. MUST be used for any new backend service to ensure it follows ADR-0002 (Clean Architecture by projects, gRPC-only, BuildingBlocks kernel). The ONLY REST surface is the BFF — internal services are gRPC-only."
version: 2.1.0
---

# New Microservice Scaffolding (ADR-0002 · molde canónico)

Creates a .NET 10 microservice following **ADR-0002**: Clean Architecture as separate projects, gRPC-only, shared kernel. **Canonical mold + golden reference: [`docs/MOLDE-CANONICO.md`](../../../Proyectos/BTW/BTW%20UBP/btw-ubp-backend/docs/MOLDE-CANONICO.md)** — golden reference `ubp-parties-service` (any conformant archetype-A service, e.g. `ubp-membership-service`, also works). Mirror it exactly.

> **Gate obligatorio al terminar (ADR-0001 · scaffolders-emiten-molde-enforced).** El servicio nuevo NO está en el inventario de `audit-molde.sh`/conformance tests todavía, así que corré el verificador scoped ANTES de declararlo:
> ```
> ./tools/verify-service.sh <dir> <Seg> <A|B>   # 0=conforme · 1=desvío · 2=mal-uso
> ```
> Solo cuando sale 0: declarar el servicio en `tools/audit-molde.sh`, `Ubp.sln` y el inventario `Services[]` de los conformance tests, y correr `dotnet build Ubp.sln`.

> **This rewrites the old v1 skill.** The old pattern (REST Controllers in every service, `DbContext` injected into services, anemic `Models/`, Swagger per service) is **derogado**. See "What changed" below.

## Reglas inviolables (ADR-0002)

1. **Todo es gRPC. La única cara REST es el BFF.** Ningún servicio expone REST/Swagger/Controllers.
2. **Capas como proyectos separados** (el compilador impone los límites), no carpetas.
3. **Siempre interfaces** en los bordes (`IUnitOfWork`, `IRepository<T>`, puertos).
4. **Dominio rico** (factories + invariantes), no modelos anémicos.
5. **Cero duplicidad** → los primitivos transversales viven en el kernel `Ubp.BuildingBlocks`.
6. **Auth:** el servicio NO valida JWT. El BFF valida y pasa el actor por metadata `x-actor-sub`.

## Required input

1. **Service name** (e.g., `Membership`, `Inventory`) → `{Service}`
2. **kebab name** (e.g., `ubp-inventory-service`) → `{service}`
3. **gRPC port** (e.g., 8081)
4. **Database name** (e.g., `ubp_inventory`)
5. Initial entities (optional, via `/new-entity`)
6. Outbound gRPC clients it consumes (optional)

## Project structure (4 capas + tests)

```
{service}/
  src/
    Ubp.{Service}.Domain/          → entidades, enums, lógica de dominio
    Ubp.{Service}.Application/      → IUnitOfWork, servicios, puertos (interfaces)
    Ubp.{Service}.Infrastructure/   → DbContext, EF configs, UoW impl, jobs, Migrations, adapters salientes
    Ubp.{Service}.Api/              → servicio(s) gRPC + Program + Config
  tests/
    Ubp.{Service}.Tests/
```

**Dependencias (hacia adentro):** `Api → Infrastructure → Application → Domain`. La `Application` define los puertos; la `Infrastructure` los implementa; el `Domain` no conoce a nadie.

## Kernel compartido (ya existe en `btw-ubp-backend/building-blocks/`)

| Proyecto | Provee |
|---|---|
| `Ubp.BuildingBlocks` (puro) | `Entity`, `SoftDeletableEntity`, `IRepository<T>`, `ICurrentActor` |
| `Ubp.BuildingBlocks.Persistence` | `EfRepository<T>`, `AuditStampInterceptor`, `HttpCurrentActor` |

El `Domain` referencia SÓLO `Ubp.BuildingBlocks`. La `Infrastructure` referencia `Ubp.BuildingBlocks.Persistence`.

## .csproj por capa

**Domain** (`Microsoft.NET.Sdk`):
```xml
<ItemGroup>
  <ProjectReference Include="../../../building-blocks/Ubp.BuildingBlocks/Ubp.BuildingBlocks.csproj" />
</ItemGroup>
```

**Application** (`Microsoft.NET.Sdk`): refs Domain + `Ubp.BuildingBlocks`.

**Infrastructure** (`Microsoft.NET.Sdk`):
```xml
<ItemGroup>
  <PackageReference Include="Npgsql.EntityFrameworkCore.PostgreSQL" />
  <PackageReference Include="Microsoft.EntityFrameworkCore.Design">
    <PrivateAssets>all</PrivateAssets>
  </PackageReference>
</ItemGroup>
<ItemGroup><FrameworkReference Include="Microsoft.AspNetCore.App" /></ItemGroup>
<ItemGroup>
  <ProjectReference Include="../Ubp.{Service}.Domain/..." />
  <ProjectReference Include="../Ubp.{Service}.Application/..." />
  <ProjectReference Include="../../../building-blocks/Ubp.BuildingBlocks/..." />
  <ProjectReference Include="../../../building-blocks/Ubp.BuildingBlocks.Persistence/..." />
</ItemGroup>
```
> Infrastructure es classlib (no Web SDK): los `using` de Hosting/DI NO son implícitos — agrégalos explícitos en jobs (`using Microsoft.Extensions.Hosting;`, `using Microsoft.Extensions.DependencyInjection;`).

**Api** (`Microsoft.NET.Sdk.Web`): refs Domain + Application + Infrastructure + kernel(x2) + Grpc.AspNetCore + el `.proto` (Server) desde `ubp-protos`. **Sin** JwtBearer, **sin** Swashbuckle.

### Versiones y TFM — centralizados, NUNCA por proyecto

- **`net10.0`** + `Nullable`/`ImplicitUsings` salen de `btw-ubp-backend/Directory.Build.props`. Los csproj **no** declaran `<TargetFramework>`.
- **Versiones de paquetes** salen de `btw-ubp-backend/Directory.Packages.props` (Central Package Management). Los `<PackageReference>` van **sin** `Version=`. Para agregar un paquete: primero `<PackageVersion Include=... Version=.../>` en `Directory.Packages.props`, luego `<PackageReference Include=.../>` en el csproj.

## Program.cs (composition root — limpio)

```csharp
using Ubp.{Service}.Api.Config;
using Ubp.{Service}.Api.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Add{Service}Database();   // DbContext + UoW + repos + actor + interceptor (Config/)
builder.AddBackgroundJobs();      // si hay jobs
builder.AddGrpcServer();          // AddGrpc()

var app = builder.Build();

app.MigrateDatabase();
app.MapGrpcService<{Service}GrpcService>();
app.Run();

public partial class Program;
```

`DatabaseConfig` (Api/Config) registra el kernel:
```csharp
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ICurrentActor, HttpCurrentActor>();
builder.Services.AddScoped<AuditStampInterceptor>();
builder.Services.AddDbContext<{Service}DbContext>((sp, o) =>
    o.UseNpgsql(builder.Configuration.GetConnectionString("{Service}Db"))
     .AddInterceptors(sp.GetRequiredService<AuditStampInterceptor>()));
builder.Services.AddScoped(typeof(IRepository<>), typeof(EfRepository<>));
builder.Services.AddScoped<IUnitOfWork, {Service}UnitOfWork>();
// + app services (IRoleService, etc.)
```

## Kestrel (appsettings.json) — un solo puerto Http2

```json
"Kestrel": { "Endpoints": { "grpc": { "Url": "http://+:{grpc_port}", "Protocols": "Http2" } } }
```
Sin sección `Keycloak` (el servicio no valida JWT). `ConnectionStrings:{Service}Db` apunta a `ubp_{service}`.

## El servicio gRPC (Api/Services)

- Hereda `{Service}Service.{Service}ServiceBase` (generado del `.proto`).
- Inyecta `IUnitOfWork`, `ICurrentActor`, puertos de Application. **Nunca el DbContext crudo.**
- El actor se obtiene de `ICurrentActor.Sub` (viene de `x-actor-sub`); si falta → `RpcException(Unauthenticated)`.
- Autorización dentro de cada método (ej. miembro activo del tenant) → `RpcException(PermissionDenied)`.

## Tests

Prueban el servicio gRPC **directo** (instanciándolo con `{Service}UnitOfWork` sobre EF InMemory + un `ICurrentActor` fake + un `FakeServerCallContext`). No levantan host HTTP/2. Ver `MembershipGrpcTests` como referencia.

## Qué cambió vs. la skill v1 (derogado)

| v1 (viejo) | v2 (ADR-0002) |
|---|---|
| `Controllers/` REST + Swagger | servicio gRPC, sin REST |
| `Services/` con `DbContext` | `Application` con `IUnitOfWork`/`IRepository` |
| `Models/` anémicos `[Key]` | `Domain` rico (factory + invariantes) |
| 1 proyecto, carpetas | 4 proyectos por capa |
| FluentValidation REST · `[ProducesResponseType]` | validación en el dominio |
| JWT por servicio | actor por `x-actor-sub`, sin JWT |

## SonarQube (gRPC-only)

- `OnModelCreating(ModelBuilder modelBuilder)` — nunca abreviar (S927)
- Complejidad ≤ 15 (S3776); extraer a métodos privados
- CancellationToken último parámetro (CA1068)
- `_logger.LogError(ex, "msg")` excepción primero (S6667)
- Sin ternarios anidados (S3358), sin inyecciones sin usar (S4487)
- Dockerfile con usuario no-root

## Checklist

- [ ] 4 proyectos (Domain/Application/Infrastructure/Api) + refs hacia adentro
- [ ] Refs al kernel `Ubp.BuildingBlocks(.Persistence)`
- [ ] gRPC-only: sin Controllers, sin Swagger, sin JwtBearer
- [ ] `Program.cs` limpio (composition root); Config/ por naturaleza
- [ ] Kestrel un solo puerto Http2
- [ ] Entidades heredan `Entity`/`SoftDeletableEntity`; acceso a datos por `IUnitOfWork`
- [ ] `AuditStampInterceptor` + `HttpCurrentActor` registrados
- [ ] Migración `InitialCreate` en Infrastructure
- [ ] Tests gRPC-directo verdes
- [ ] DB `ubp_{service}` (sólo esa base; nada de bases por entidad)
- [ ] Dockerfile multi-stage, usuario no-root
- [ ] Entrada en docker-compose + ruta en el BFF
