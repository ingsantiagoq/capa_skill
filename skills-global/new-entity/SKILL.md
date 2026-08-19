---
name: new-entity
description: "This skill should be used when the user asks to 'create an entity', 'add a model', 'new table', 'add a database entity', or needs a new EF Core entity. Follows ADR-0002: rich domain entity in the Domain project (inherits Entity/SoftDeletableEntity, factory + invariants), EF config in Infrastructure, exposed via gRPC — NO REST controller, NO anemic model, NO DTOs."
version: 2.0.0
---

# New Entity Scaffolding (ADR-0002)

Creates an entity following **ADR-0002**: rich domain model in the `Domain` project, EF config in `Infrastructure`, exposed via the service's gRPC contract. **Reference: `ubp-membership-service`** (`TenantMembership`, `SecurityRole`).

> **Rewrites v1.** The old pattern (anemic `Models/` + DTOs + FluentValidation + REST Controller CRUD) is **derogado**. Entities are rich and reached via gRPC only.

## Required input

1. **Entity name** (PascalCase singular) → `{Entity}`
2. **Which service** owns it → `{Service}`
3. **Properties** + types; which are required
4. **Borrable?** (soft-delete) → hereda `SoftDeletableEntity`; si no, `Entity`
5. **Relationships** (FKs)
6. **Es aggregate root** (necesita repositorio en el UoW)?
7. **Expone operaciones por gRPC**? (casi siempre sí)

## 1. Entidad rica (en `Ubp.{Service}.Domain/`)

```csharp
using Ubp.BuildingBlocks;
using Ubp.{Service}.Domain.Enums;

namespace Ubp.{Service}.Domain;

/// <summary>...</summary>
public sealed class {Entity} : Entity            // o : SoftDeletableEntity si es borrable
{
    public string Name { get; private set; } = string.Empty;
    public {Status} Status { get; private set; } = {Status}.Active;
    // props con private set — NUNCA setters públicos

    private {Entity}() { }                        // para EF

    public static {Entity} Create(string name, ...)
    {
        if (string.IsNullOrWhiteSpace(name))
            throw new ArgumentException("Name is required.", nameof(name));
        // valida TODAS las invariantes acá
        return new {Entity} { Name = name.Trim(), ... };
    }

    public void Rename(string name) { /* mutadores con invariantes, no setters */ }
}
```

Reglas:
- Hereda `Entity` (Id, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy) o `SoftDeletableEntity` (+ IsDeleted, DeletedAt, DeletedBy). **No** redeclarar esos campos.
- **No** heredan `Entity` las entidades con PK compuesta o PK externa (ej. `sub` de Keycloak) — declaran su propia key.
- Estados con `enum` (en `Domain/Enums/`), no strings.
- Sin `[Key]`, sin DataAnnotations, sin setters públicos.

## 2. EF config (en `Ubp.{Service}.Infrastructure/`)

```csharp
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Ubp.{Service}.Domain;

namespace Ubp.{Service}.Infrastructure;

public sealed class {Entity}Configuration : IEntityTypeConfiguration<{Entity}>
{
    public void Configure(EntityTypeBuilder<{Entity}> b)
    {
        b.ToTable("{entities_snake}");
        b.HasKey(e => e.Id);
        b.Property(e => e.Name).HasColumnName("name").HasMaxLength(150).IsRequired();
        b.Property(e => e.Status).HasColumnName("status").HasMaxLength(20)
            .HasConversion(v => v.ToString().ToLowerInvariant(), v => Enum.Parse<{Status}>(v, true))
            .IsRequired();
        b.Property(e => e.CreatedAt).HasColumnName("created_at");

        // soft-delete (sólo si SoftDeletableEntity):
        b.HasQueryFilter(e => !e.IsDeleted);

        // índices · únicos parciales para historial:
        // b.HasIndex(e => new { e.TenantId, e.Code }).IsUnique().HasFilter("is_deleted = false");
        // FKs: b.HasOne<Other>().WithMany().HasForeignKey(e => e.OtherId).OnDelete(DeleteBehavior.Restrict);
    }
}
```

> **Las columnas de auditoría/soft-delete (`created_by`, `updated_at`, `updated_by`, `is_deleted`, `deleted_at`, `deleted_by`) NO se mapean acá** — el `DbContext` las mapea en un loop central de `OnModelCreating` para todas las entidades que heredan `Entity`/`SoftDeletableEntity`.

> **Trampa del enum default:** NO uses `.HasDefaultValue(MiEnum.X)` si `X` no es el valor 0 del enum (CLR default). EF trataría el valor 0 como "sin asignar" y escribiría el default. Reordená el enum o no pongas default (el dominio siempre lo setea).

## 3. DbSet (en `{Service}DbContext`)

```csharp
public DbSet<{Entity}> {Entities} => Set<{Entity}>();
```

## 4. Repositorio (si es aggregate root)

En `IUnitOfWork` (Application) + `{Service}UnitOfWork` (Infrastructure):
```csharp
IRepository<{Entity}> {Entities} { get; }                       // interfaz
{Entities} = new EfRepository<{Entity}>(db);                    // impl
```

## 5. Migración

```
dotnet ef migrations add Add{Entity} \
  --project src/Ubp.{Service}.Infrastructure --startup-project src/Ubp.{Service}.Api
```

## 6. Exposición gRPC (en `ubp-protos/{service}.proto` + servicio en Api)

```protobuf
rpc Create{Entity} (Create{Entity}Request) returns ({Entity}Response);
message Create{Entity}Request { string name = 1; /* el actor va en metadata x-actor-sub */ }
message {Entity}Response { string id = 1; string name = 2; }
```
Implementar en `{Service}GrpcService` (Api): autoriza por `ICurrentActor`, opera por `IUnitOfWork`, mapea dominio↔mensaje gRPC.

## Convenciones de nombres

| Item | Convención | Ejemplo |
|---|---|---|
| Entidad | PascalCase singular | `SecurityRole` |
| Tabla | snake_case plural | `security_roles` |
| DbSet | PascalCase plural | `SecurityRoles` |
| Columna | snake_case | `tenant_id` |
| rpc gRPC | PascalCase | `AssignRole` |

## Qué NO se crea (vs v1 derogado)

❌ DTOs (Create/Update/Response) · ❌ FluentValidation validators · ❌ Controller REST CRUD · ❌ Mappings a DTO · ❌ `Models/` anémico. Todo eso era del patrón viejo.

## Checklist

- [ ] Entidad rica en `Domain/` (hereda Entity/SoftDeletableEntity, factory + invariantes, private setters)
- [ ] Enums en `Domain/Enums/`
- [ ] EF config en `Infrastructure/` (snake_case, HasConversion enums, índices, query filter si soft-delete)
- [ ] Columnas de auditoría/soft-delete NO mapeadas en el config (las hace el DbContext)
- [ ] DbSet en el DbContext
- [ ] `IRepository<{Entity}>` en el UoW (si aggregate root)
- [ ] Migración `Add{Entity}` en Infrastructure
- [ ] rpc + mensajes en el `.proto` + implementación en el servicio gRPC (si se expone)
- [ ] Test gRPC-directo del nuevo flujo
