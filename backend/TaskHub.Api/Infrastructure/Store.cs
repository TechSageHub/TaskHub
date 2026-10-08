using System.Text.Json;
using System.Text.Json.Nodes;
using TaskHub.Api.Domain;

namespace TaskHub.Api.Infrastructure;

/// <summary>Mutable snapshot of all persisted state. Serialized for file storage.</summary>
public sealed class StoreSnapshot
{
    public int SchemaVersion { get; set; } = 2;
    public List<User> Users { get; set; } = [];
    public List<Organisation> Organisations { get; set; } = [];
    public List<Membership> Memberships { get; set; } = [];
    public List<Todo> Todos { get; set; } = [];
    public List<AuditEntry> AuditEntries { get; set; } = [];
    public List<Session> Sessions { get; set; } = [];
    public List<string> UsedIdempotencyKeys { get; set; } = [];
}

public interface IDataStore
{
    StoreSnapshot State { get; }
    Task SaveAsync(CancellationToken ct = default);
    Task ReloadAsync(CancellationToken ct = default);
}

/// <summary>In-memory provider. Concurrency/version semantics identical to file provider.</summary>
public sealed class InMemoryStore : IDataStore
{
    public StoreSnapshot State { get; } = new();
    public Task SaveAsync(CancellationToken ct = default) => Task.CompletedTask;
    public Task ReloadAsync(CancellationToken ct = default) => Task.CompletedTask;
}

/// <summary>
/// File provider: single JSON file, atomic writes (temp file + rename),
/// single-writer SemaphoreSlim, schemaVersion persisted, real v1→v2 migration.
/// Layout: {FileDirectory}/taskhub-store.json (+ .tmp during write, .bak backups).
/// </summary>
public sealed class FileStore : IDataStore
{
    public const int CurrentSchemaVersion = 2;
    private static readonly JsonSerializerOptions JsonOpts = new() { WriteIndented = true };
    private readonly string _filePath;
    private readonly string _tmpPath;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly ILogger<FileStore> _log;
    public StoreSnapshot State { get; private set; } = new();

    public FileStore(string directory, ILogger<FileStore> log)
    {
        Directory.CreateDirectory(directory);
        _filePath = Path.Combine(directory, "taskhub-store.json");
        _tmpPath = Path.Combine(directory, "taskhub-store.json.tmp");
        _log = log;
        LoadOrCreate();
    }

    private void LoadOrCreate()
    {
        if (!File.Exists(_filePath))
        {
            State = new StoreSnapshot { SchemaVersion = CurrentSchemaVersion };
            PersistUnsynchronized();
            return;
        }
        var json = File.ReadAllText(_filePath);
        var node = JsonNode.Parse(json) as JsonObject
            ?? throw new InvalidDataException("Store file is not a JSON object.");
        var version = Prop<int?>(node, "schemaVersion") ?? 1;
        if (version == 1)
        {
            State = MigrateV1ToV2(json);
            _log.LogInformation("Migrated file store from schema v1 to v2: {TodoCount} todos", State.Todos.Count);
            PersistUnsynchronized();
        }
        else
        {
            State = JsonSerializer.Deserialize<StoreSnapshot>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
                ?? throw new InvalidDataException("Store file could not be deserialized.");
            State.SchemaVersion = CurrentSchemaVersion;
        }
    }

    /// <summary>Case-insensitive property lookup (files may be camelCase or PascalCase).</summary>
    public static JsonNode? Prop(JsonObject node, string name)
    {
        if (node.TryGetPropertyValue(name, out var exact)) return exact;
        foreach (var kv in node)
            if (kv.Key.Equals(name, StringComparison.OrdinalIgnoreCase))
                return kv.Value;
        return null;
    }

    public static T? Prop<T>(JsonObject node, string name)
    {
        var n = Prop(node, name);
        if (n is null) return default;
        try { return n.Deserialize<T>(); } catch { return default; }
    }

    /// <summary>
    /// v1 format: todos lack priority/tags/isArchived/clientProvidedId and use lowercase keys.
    /// Migration assigns Priority=Medium, Tags=[], IsArchived=false, preserves everything else.
    /// </summary>
    public static StoreSnapshot MigrateV1ToV2(string v1Json)
    {
        var snap = new StoreSnapshot { SchemaVersion = 2 };
        var root = JsonNode.Parse(v1Json) as JsonObject ?? new JsonObject();
        snap.Users = Prop<List<User>>(root, "users") ?? snap.Users;
        snap.Organisations = Prop<List<Organisation>>(root, "organisations") ?? Prop<List<Organisation>>(root, "orgs") ?? snap.Organisations;
        snap.Memberships = Prop<List<Membership>>(root, "memberships") ?? snap.Memberships;
        snap.AuditEntries = Prop<List<AuditEntry>>(root, "auditEntries") ?? Prop<List<AuditEntry>>(root, "audit") ?? snap.AuditEntries;
        snap.Sessions = Prop<List<Session>>(root, "sessions") ?? snap.Sessions;
        var todosNode = Prop(root, "todos") as JsonArray ?? [];
        foreach (var t in todosNode.OfType<JsonObject>())
        {
            static string? S(JsonObject o, params string[] names)
            {
                foreach (var n in names) { var v = Prop(o, n)?.GetValue<string>(); if (v is not null) return v; }
                return null;
            }
            snap.Todos.Add(new Todo(
                Id: S(t, "id") ?? Guid.NewGuid().ToString("N"),
                OrgId: S(t, "orgId", "org_id") ?? "",
                Title: S(t, "title") ?? "(untitled)",
                Description: S(t, "description") ?? "",
                Status: Enum.TryParse<TodoStatus>(S(t, "status"), true, out var s) ? s : TodoStatus.Open,
                Priority: Enum.TryParse<TodoPriority>(S(t, "priority"), true, out var p) ? p : TodoPriority.Medium,
                Tags: Prop<List<string>>(t, "tags") ?? [],
                DueDate: Prop<DateTime?>(t, "dueDate"),
                CreatedAt: Prop<DateTime?>(t, "createdAt") ?? DateTime.UtcNow,
                UpdatedAt: Prop<DateTime?>(t, "updatedAt") ?? DateTime.UtcNow,
                Version: Prop<int?>(t, "version") ?? 1,
                IsDeleted: Prop<bool?>(t, "isDeleted") ?? false,
                IsArchived: Prop<bool?>(t, "isArchived") ?? false,
                ClientProvidedId: S(t, "clientProvidedId")));
        }
        snap.UsedIdempotencyKeys = Prop<List<string>>(root, "usedIdempotencyKeys") ?? snap.UsedIdempotencyKeys;
        return snap;
    }

    private void PersistUnsynchronized()
    {
        State.SchemaVersion = CurrentSchemaVersion;
        var json = JsonSerializer.Serialize(State, JsonOpts);
        File.WriteAllText(_tmpPath, json);
        File.Move(_tmpPath, _filePath, overwrite: true);
    }

    public async Task SaveAsync(CancellationToken ct = default)
    {
        await _gate.WaitAsync(ct);
        try { await Task.Run(PersistUnsynchronized, ct); }
        finally { _gate.Release(); }
    }

    public async Task ReloadAsync(CancellationToken ct = default)
    {
        await _gate.WaitAsync(ct);
        try { await Task.Run(() => LoadOrCreate(), ct); }
        finally { _gate.Release(); }
    }
}
