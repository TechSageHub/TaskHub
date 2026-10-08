using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using TaskHub.Api.Application;
using TaskHub.Api.Infrastructure;

namespace TaskHub.Tests;

// ---------- Unit: validation ----------
public sealed class ValidationTests
{
    [Fact] public void Title_Required() =>
        Assert.True(TodoValidator.Validate("", "", null, null, null, null).ContainsKey("title"));
    [Fact] public void Title_Length() =>
        Assert.True(TodoValidator.Validate(new string('x', 201), "", null, null, null, null).ContainsKey("title"));
    [Fact] public void Description_Length() =>
        Assert.True(TodoValidator.Validate("ok", new string('x', 2001), null, null, null, null).ContainsKey("description"));
    [Theory, InlineData("bad tag!"), InlineData("waytoolongggggggggggggggggggggggg")]
    public void Tags_Rejected(string tag) =>
        Assert.NotEmpty(TodoValidator.Validate("ok", "", [tag], null, null, null));
    [Fact] public void Tags_Duplicates_Rejected() =>
        Assert.True(TodoValidator.Validate("ok", "", ["a", "A"], null, null, null).ContainsKey("tags"));
    [Fact] public void Status_Enum() =>
        Assert.True(TodoValidator.Validate("ok", "", null, "Nope", null, null).ContainsKey("status"));
    [Fact] public void Valid_Passes() =>
        Assert.Empty(TodoValidator.Validate("Do it", "desc", ["home"], "Open", "High", DateTime.UtcNow.AddDays(1)));
    [Fact] public void Password_Hash_Verifies() =>
        Assert.True(PasswordHasher.Verify("secret-pw-1", PasswordHasher.Hash("secret-pw-1")));
    [Fact] public void Password_Hash_Wrong_Fails() =>
        Assert.False(PasswordHasher.Verify("wrong", PasswordHasher.Hash("secret-pw-1")));
    [Fact] public void Migration_V1_To_V2_Assigns_Defaults()
    {
        var v1 = """{"schemaVersion":1,"users":[],"orgs":[],"memberships":[],"todos":[{"id":"t1","orgId":"o1","title":"Old","description":"d","status":"Done","createdAt":"2024-01-01T00:00:00Z","updatedAt":"2024-01-01T00:00:00Z","version":1}],"audit":[]}""";
        var snap = FileStore.MigrateV1ToV2(v1);
        Assert.Equal(2, snap.SchemaVersion);
        var t = Assert.Single(snap.Todos);
        Assert.Equal(TaskHub.Api.Domain.TodoPriority.Medium, t.Priority);
        Assert.Empty(t.Tags);
        Assert.False(t.IsArchived);
    }
    [Fact] public void V2_PascalCase_File_Is_Not_Remigrated_And_Data_Survives()
    {
        // Regression: persisted files use PascalCase keys; version detection and
        // migration lookups must be case-insensitive or restarts wipe all data.
        var snap = new StoreSnapshot
        {
            SchemaVersion = 2,
            Users = [new TaskHub.Api.Domain.User("u1", "alice", "h", DateTime.UtcNow)],
        };
        var json = System.Text.Json.JsonSerializer.Serialize(snap);
        var node = System.Text.Json.Nodes.JsonNode.Parse(json) as System.Text.Json.Nodes.JsonObject;
        Assert.NotNull(node);
        Assert.Equal(2, FileStore.Prop<int?>(node, "schemaVersion"));
        var v1Pascal = """{"SchemaVersion":1,"Users":[{"Id":"u1","Username":"bob","PasswordHash":"h","CreatedAt":"2024-01-01T00:00:00Z"}],"Organisations":[],"Memberships":[],"Todos":[{"Id":"t1","OrgId":"o1","Title":"Old","Description":"d","Status":"Done","CreatedAt":"2024-01-01T00:00:00Z","UpdatedAt":"2024-01-01T00:00:00Z","Version":1}],"AuditEntries":[]}""";
        var migrated = FileStore.MigrateV1ToV2(v1Pascal);
        Assert.Equal("bob", Assert.Single(migrated.Users).Username);
        Assert.Equal("Old", Assert.Single(migrated.Todos).Title);
    }
    [Fact] public void RateLimiter_Blocks_After_Max()
    {
        var r = new AuthRateLimiter { MaxAttempts = 3, WindowSeconds = 60, BlockSeconds = 60 };
        Assert.True(r.TryAcquire("k", out _)); Assert.True(r.TryAcquire("k", out _)); Assert.True(r.TryAcquire("k", out _));
        Assert.False(r.TryAcquire("k", out var ra));
        Assert.True(ra > 0);
    }
    [Fact] public void ETag_Match()
    {
        Assert.True(Security.MatchVersion("\"v3\"", 3));
        Assert.False(Security.MatchVersion("\"v2\"", 3));
        Assert.False(Security.MatchVersion(null, 3));
    }
}

// ---------- Integration ----------
public sealed class AuthFlowTests : IClassFixture<TestFactory>
{
    private readonly TestFactory _f;
    public AuthFlowTests(TestFactory f) => _f = f;

    [Fact] public async Task Register_Login_Logout_Me_Session_Behaviour()
    {
        var c = new ApiClient(_f.CreateClient());
        var user = "u_" + Guid.NewGuid().ToString("N")[..8];
        await c.RegisterAsync(user);
        var me = await c.Get("/api/v1/auth/me");
        Assert.Equal(HttpStatusCode.OK, me.StatusCode);
        var logout = await c.Post("/api/v1/auth/logout", new { });
        Assert.Equal(HttpStatusCode.OK, logout.StatusCode);
        var me2 = await c.Get("/api/v1/auth/me");
        Assert.Equal(HttpStatusCode.Unauthorized, me2.StatusCode);
        // login again
        await c.LoginAsync(user);
        Assert.Equal(HttpStatusCode.OK, (await c.Get("/api/v1/auth/me")).StatusCode);
    }

    [Fact] public async Task Login_Failure_Does_Not_Reveal_Existence()
    {
        var c1 = new ApiClient(_f.CreateClient());
        var r1 = await c1.SendAsync(HttpMethod.Post, "/api/v1/auth/login", new { username = "nobody-" + Guid.NewGuid().ToString("N")[..6], password = "Password123!" });
        var c2 = new ApiClient(_f.CreateClient());
        var existing = "e_" + Guid.NewGuid().ToString("N")[..8];
        await c2.RegisterAsync(existing);
        var c3 = new ApiClient(_f.CreateClient());
        var r2 = await c3.SendAsync(HttpMethod.Post, "/api/v1/auth/login", new { username = existing, password = "WrongPass999!" });
        Assert.Equal(r1.StatusCode, r2.StatusCode);
        var b1 = await r1.Content.ReadAsStringAsync();
        var b2 = await r2.Content.ReadAsStringAsync();
        Assert.Contains("invalid-credentials", b1);
        Assert.Contains("invalid-credentials", b2);
        Assert.DoesNotContain("exist", b1, StringComparison.OrdinalIgnoreCase);
    }

    [Fact] public async Task Rate_Limit_Returns_429_With_RetryAfter()
    {
        using var scopeFactory = _f.Services.CreateScope();
        var limiter = scopeFactory.ServiceProvider.GetRequiredService<AuthRateLimiter>();
        limiter.MaxAttempts = 2; limiter.BlockSeconds = 60;
        try
        {
            var c = new ApiClient(_f.CreateClient());
            Assert.True((await c.SendAsync(HttpMethod.Post, "/api/v1/auth/login", new { username = "x", password = "y" })).StatusCode != HttpStatusCode.NotFound);
            Assert.True((await c.SendAsync(HttpMethod.Post, "/api/v1/auth/login", new { username = "x", password = "y" })).StatusCode != HttpStatusCode.NotFound);
            var r = await c.SendAsync(HttpMethod.Post, "/api/v1/auth/login", new { username = "x", password = "y" });
            Assert.Equal((HttpStatusCode)429, r.StatusCode);
        }
        finally { limiter.MaxAttempts = 1000; limiter.Reset(); }
    }
}

public sealed class MultiTenantTests : IClassFixture<TestFactory>
{
    private readonly TestFactory _f;
    public MultiTenantTests(TestFactory f) => _f = f;

    private static async Task<string> CreateOrg(ApiClient c, string name)
    {
        var r = await c.Post("/api/v1/orgs", new { name });
        Assert.Equal(HttpStatusCode.Created, r.StatusCode);
        var doc = await r.Content.ReadFromJsonAsync<JsonElement>();
        return doc.GetProperty("id").GetString()!;
    }

    [Fact] public async Task Cross_Org_Access_Rejected()
    {
        var alice = new ApiClient(_f.CreateClient());
        var bob = new ApiClient(_f.CreateClient());
        await alice.RegisterAsync("a_" + Guid.NewGuid().ToString("N")[..8]);
        await bob.RegisterAsync("b_" + Guid.NewGuid().ToString("N")[..8]);
        var orgA = await CreateOrg(alice, "Org A");
        var create = await alice.Post($"/api/v1/orgs/{orgA}/todos", new { title = "secret" });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var todoId = (await create.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetString()!;
        // Bob guesses the IDs → must get 403 (not 404 leak, not data)
        Assert.Equal(HttpStatusCode.Forbidden, (await bob.Get($"/api/v1/orgs/{orgA}/todos")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await bob.Get($"/api/v1/orgs/{orgA}/todos/{todoId}")).StatusCode);
        // Audit gated too
        Assert.Equal(HttpStatusCode.Forbidden, (await bob.Get($"/api/v1/orgs/{orgA}/audit")).StatusCode);
    }

    [Fact] public async Task Concurrency_Stale_Update_Rejected_With_412()
    {
        var c = new ApiClient(_f.CreateClient());
        await c.RegisterAsync("cc_" + Guid.NewGuid().ToString("N")[..8]);
        var org = await CreateOrg(c, "Conc Org");
        var created = await c.Post($"/api/v1/orgs/{org}/todos", new { title = "v1" });
        var doc = await created.Content.ReadFromJsonAsync<JsonElement>();
        var id = doc.GetProperty("id").GetString()!;
        var etag = created.Headers.ETag?.Tag ?? "\"v1\"";
        var ok = await c.Put($"/api/v1/orgs/{org}/todos/{id}", new { title = "v2" }, etag);
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
        var stale = await c.Put($"/api/v1/orgs/{org}/todos/{id}", new { title = "stale-write" }, etag);
        Assert.Equal((HttpStatusCode)412, stale.StatusCode);
        var body = await stale.Content.ReadAsStringAsync();
        Assert.Contains("precondition-failed", body);
        Assert.Contains("correlationId", body);
    }

    [Fact] public async Task SoftDelete_Restore_HardDelete_Authorization()
    {
        var admin = new ApiClient(_f.CreateClient());
        var member = new ApiClient(_f.CreateClient());
        var au = "adm_" + Guid.NewGuid().ToString("N")[..8];
        var mu = "mem_" + Guid.NewGuid().ToString("N")[..8];
        await admin.RegisterAsync(au);
        await member.RegisterAsync(mu);
        var org = await CreateOrg(admin, "Del Org");
        // admin adds member
        var add = await admin.Post($"/api/v1/orgs/{org}/members", new { username = mu, role = "Member" });
        Assert.Equal(HttpStatusCode.Created, add.StatusCode);
        var created = await admin.Post($"/api/v1/orgs/{org}/todos", new { title = "doomed" });
        var doc = await created.Content.ReadFromJsonAsync<JsonElement>();
        var id = doc.GetProperty("id").GetString()!;
        var etag = created.Headers.ETag?.Tag ?? "\"v1\"";
        // member cannot hard delete
        Assert.Equal(HttpStatusCode.Forbidden, (await member.Delete($"/api/v1/orgs/{org}/todos/{id}/permanent", etag)).StatusCode);
        // soft delete ok
        var soft = await admin.Delete($"/api/v1/orgs/{org}/todos/{id}", etag);
        Assert.Equal(HttpStatusCode.OK, soft.StatusCode);
        var etag2 = soft.Headers.ETag?.Tag!;
        // default list hides it
        var list = await (await admin.Get($"/api/v1/orgs/{org}/todos")).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(0, list.GetProperty("total").GetInt32());
        // restore
        var restore = await admin.Post($"/api/v1/orgs/{org}/todos/{id}/restore", new { }, etag2);
        Assert.Equal(HttpStatusCode.OK, restore.StatusCode);
        // hard delete as admin
        var etag3 = restore.Headers.ETag?.Tag!;
        Assert.Equal(HttpStatusCode.OK, (await admin.Delete($"/api/v1/orgs/{org}/todos/{id}/permanent", etag3)).StatusCode);
        // audit visible to admin, forbidden to member
        Assert.Equal(HttpStatusCode.OK, (await admin.Get($"/api/v1/orgs/{org}/audit")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await member.Get($"/api/v1/orgs/{org}/audit")).StatusCode);
    }

    [Fact] public async Task Import_Validates_Reports_And_Is_Idempotent()
    {
        var c = new ApiClient(_f.CreateClient());
        await c.RegisterAsync("imp_" + Guid.NewGuid().ToString("N")[..8]);
        var org = await CreateOrg(c, "Imp Org");
        var key = Guid.NewGuid().ToString("N");
        var payload = new
        {
            idempotencyKey = key,
            items = new object[]
            {
                new { clientProvidedId = "ext-1", title = "Good one", status = "Open", priority = "High", tags = new[]{"home"}, dueDate = (DateTime?)null },
                new { clientProvidedId = "ext-bad", title = "", status = "Bogus", priority = "High", tags = new[]{"bad tag!"}, dueDate = (DateTime?)null },
            }
        };
        var r = await c.Post($"/api/v1/orgs/{org}/import", payload);
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        var report = await r.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(1, report.GetProperty("accepted").GetInt32());
        Assert.Equal(1, report.GetProperty("rejected").GetInt32());
        Assert.False(report.GetProperty("duplicateRequest").GetBoolean());
        // replay same clientProvidedId without key → skipped silently (idempotent)
        var r2 = await c.Post($"/api/v1/orgs/{org}/import", new { items = new object[] { new { clientProvidedId = "ext-1", title = "Good one" } } });
        var rep2 = await r2.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(0, rep2.GetProperty("accepted").GetInt32());
        // replay same idempotency key → duplicate suppressed
        var r3 = await c.Post($"/api/v1/orgs/{org}/import", payload);
        Assert.True((await r3.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("duplicateRequest").GetBoolean());
        // and the export contains the good row
        var exp = await (await c.Get($"/api/v1/orgs/{org}/export")).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(1, exp.GetProperty("items").GetArrayLength());
    }

    [Fact] public async Task Pagination_Sorting_Filtering_Work()
    {
        var c = new ApiClient(_f.CreateClient());
        await c.RegisterAsync("pg_" + Guid.NewGuid().ToString("N")[..8]);
        var org = await CreateOrg(c, "Page Org");
        foreach (var t in new[] { ("Alpha", "Low"), ("Beta", "High"), ("Gamma", "Medium") })
            Assert.Equal(HttpStatusCode.Created, (await c.Post($"/api/v1/orgs/{org}/todos", new { title = t.Item1, priority = t.Item2, tags = new[] { "t1" } })).StatusCode);
        var sorted = await (await c.Get($"/api/v1/orgs/{org}/todos?sort=priority&order=desc&page=1&pageSize=2")).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(3, sorted.GetProperty("total").GetInt32());
        Assert.Equal(2, sorted.GetProperty("items").GetArrayLength());
        Assert.Equal("Beta", sorted.GetProperty("items")[0].GetProperty("title").GetString());
        var tagged = await (await c.Get($"/api/v1/orgs/{org}/todos?tag=t1&pageSize=10")).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(3, tagged.GetProperty("total").GetInt32());
    }

    [Fact] public async Task Archive_Job_Hides_And_Restore_Brings_Back()
    {
        var c = new ApiClient(_f.CreateClient());
        await c.RegisterAsync("ar_" + Guid.NewGuid().ToString("N")[..8]);
        var org = await CreateOrg(c, "Arch Org");
        var created = await c.Post($"/api/v1/orgs/{org}/todos", new { title = "old done" });
        var doc = await created.Content.ReadFromJsonAsync<JsonElement>();
        var id = doc.GetProperty("id").GetString()!;
        var etag = created.Headers.ETag?.Tag!;
        var done = await c.Patch($"/api/v1/orgs/{org}/todos/{id}/status", new { status = "Done" }, etag);
        Assert.Equal(HttpStatusCode.OK, done.StatusCode);
        // force age it via store, then run job directly
        using (var scope = _f.Services.CreateScope())
        {
            var store = scope.ServiceProvider.GetRequiredService<IDataStore>();
            var t = store.State.Todos.First(x => x.Id == id);
            store.State.Todos.Remove(t);
            store.State.Todos.Add(t with { UpdatedAt = DateTime.UtcNow.AddDays(-60) });
            var job = scope.ServiceProvider.GetServices<Microsoft.Extensions.Hosting.IHostedService>().OfType<ArchiveJob>().First();
            var n = await job.RunOnceAsync();
            Assert.True(n >= 1);
        }
        var hidden = await (await c.Get($"/api/v1/orgs/{org}/todos")).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(0, hidden.GetProperty("total").GetInt32());
        var shown = await (await c.Get($"/api/v1/orgs/{org}/todos?includeArchived=true")).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(1, shown.GetProperty("total").GetInt32());
    }

    [Fact] public async Task Health_And_Correlation_And_ProblemShape()
    {
        var http = _f.CreateClient();
        Assert.Equal(HttpStatusCode.OK, (await http.GetAsync("/health/live")).StatusCode);
        var ready = await http.GetAsync("/health/ready");
        Assert.Equal(HttpStatusCode.OK, ready.StatusCode);
        var c = new ApiClient(http);
        var r = await c.Get("/api/v1/orgs/nonexistent/todos");
        Assert.Equal(HttpStatusCode.Unauthorized, r.StatusCode);
        Assert.True(r.Headers.Contains("X-Correlation-Id"));
        var body = await r.Content.ReadAsStringAsync();
        Assert.Contains("correlationId", body);
    }
}
