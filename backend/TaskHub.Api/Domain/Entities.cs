namespace TaskHub.Api.Domain;

/// <summary>Roles within an organisation.</summary>
public enum OrgRole { Member = 0, OrgAdmin = 1 }

public sealed record User(
    string Id,
    string Username,
    string PasswordHash,
    DateTime CreatedAt);

public sealed record Organisation(
    string Id,
    string Name,
    string CreatedByUserId,
    DateTime CreatedAt);

public sealed record Membership(
    string OrgId,
    string UserId,
    OrgRole Role,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public enum TodoStatus { Open = 0, Done = 1 }
public enum TodoPriority { Low = 0, Medium = 1, High = 2 }

public sealed record Todo(
    string Id,
    string OrgId,
    string Title,
    string Description,
    TodoStatus Status,
    TodoPriority Priority,
    List<string> Tags,
    DateTime? DueDate,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    int Version,
    bool IsDeleted,
    bool IsArchived,
    string? ClientProvidedId);

public sealed record Session(
    string Token,
    string UserId,
    string CsrfToken,
    DateTime CreatedAt,
    DateTime ExpiresAt);

public sealed record AuditEntry(
    string Id,
    DateTime Timestamp,
    string? ActorUserId,
    string OrgId,
    string Action,
    string EntityType,
    string EntityId,
    string CorrelationId);
