using TaskHub.Api.Api;
using TaskHub.Api.Application;
using TaskHub.Api.Domain;
using TaskHub.Api.Infrastructure;

namespace TaskHub.Api.Api;

/// <summary>All /api/v1 endpoints. Controllers kept thin: validation + membership checks here, no duplicated rules.</summary>
public static class Endpoints
{
    public static TodoDto ToDto(Todo t) => new(t.Id, t.OrgId, t.Title, t.Description,
        t.Status.ToString(), t.Priority.ToString(), t.Tags, t.DueDate,
        t.CreatedAt, t.UpdatedAt, t.Version, t.IsDeleted, t.IsArchived);

    private static void Audit(IDataStore store, HttpContext ctx, string? actor, string orgId,
        string action, string entityType, string entityId)
        => store.State.AuditEntries.Add(new AuditEntry(Guid.NewGuid().ToString("N"), DateTime.UtcNow,
            actor, orgId, action, entityType, entityId, Security.CorrelationId(ctx)));

    private static Session? CurrentUser(HttpContext ctx, IDataStore store, out User? user)
    {
        user = null;
        var s = Security.GetSession(ctx, store);
        if (s is null) return null;
        user = store.State.Users.FirstOrDefault(u => u.Id == s.UserId);
        return user is null ? null : s;
    }

    public static void Map(RouteGroupBuilder api, bool cookieSecure)
    {
        // ---------- Auth ----------
        api.MapPost("/auth/register", async (HttpContext ctx, IDataStore store, AuthRateLimiter limiter, RegisterRequest req, ILogger<Program> log) =>
        {
            if (!limiter.TryAcquire("auth:" + ctx.Connection.RemoteIpAddress, out var ra))
            { ctx.Response.Headers.RetryAfter = ra.ToString(); return Problems.TooMany(ctx, ra); }
            var errs = TodoValidator.ValidateCredentials(req.Username, req.Password);
            if (errs.Count > 0) return Problems.Validation(ctx, errs);
            if (store.State.Users.Any(u => u.Username.Equals(req.Username, StringComparison.OrdinalIgnoreCase)))
                return Problems.Conflict(ctx, "username-taken", "That username is already taken.");
            var user = new User(Guid.NewGuid().ToString("N"), req.Username, PasswordHasher.Hash(req.Password), DateTime.UtcNow);
            store.State.Users.Add(user);
            var session = new Session(Security.NewToken(), user.Id, Security.NewToken(16), DateTime.UtcNow, DateTime.UtcNow.AddHours(24));
            store.State.Sessions.Add(session);
            Audit(store, ctx, user.Id, "-", "auth.register", "User", user.Id);
            await store.SaveAsync();
            Security.SetSessionCookies(ctx, session, cookieSecure);
            log.LogInformation("User registered {Username} correlation {Cid}", user.Username, Security.CorrelationId(ctx));
            return Results.Created("/api/v1/auth/me", new UserDto(user.Id, user.Username));
        }).WithName("Register").WithSummary("Register a new user (also logs in).");

        api.MapPost("/auth/login", async (HttpContext ctx, IDataStore store, AuthRateLimiter limiter, LoginRequest req, ILogger<Program> log) =>
        {
            if (!limiter.TryAcquire("auth:" + ctx.Connection.RemoteIpAddress, out var ra))
            { ctx.Response.Headers.RetryAfter = ra.ToString(); return Problems.TooMany(ctx, ra); }
            // Generic failure: never reveal whether the username exists.
            var candidate = store.State.Users.FirstOrDefault(u => u.Username.Equals(req.Username, StringComparison.OrdinalIgnoreCase));
            var ok = candidate is not null && PasswordHasher.Verify(req.Password, candidate.PasswordHash);
            // Burn equal time on unknown-user path to reduce timing oracle.
            if (candidate is null) PasswordHasher.Verify("dummy-password-for-timing", PasswordHasher.Hash("dummy-password-for-timing"));
            if (!ok)
            {
                Audit(store, ctx, candidate?.Id, "-", "auth.login_failure", "User", req.Username);
                await store.SaveAsync();
                log.LogWarning("Failed login attempt correlation {Cid}", Security.CorrelationId(ctx));
                await Task.Delay(300); // blunt timing uniformity
                return Problems.Problem(ctx, 401, "invalid-credentials", "Invalid credentials.", "Username or password is incorrect.");
            }
            var session = new Session(Security.NewToken(), candidate!.Id, Security.NewToken(16), DateTime.UtcNow, DateTime.UtcNow.AddHours(24));
            store.State.Sessions.Add(session);
            Audit(store, ctx, candidate.Id, "-", "auth.login_success", "User", candidate.Id);
            await store.SaveAsync();
            Security.SetSessionCookies(ctx, session, cookieSecure);
            log.LogInformation("User login {Username} correlation {Cid}", candidate.Username, Security.CorrelationId(ctx));
            return Results.Ok(new UserDto(candidate.Id, candidate.Username));
        }).WithName("Login").WithSummary("Log in with username + password.");

        api.MapPost("/auth/logout", async (HttpContext ctx, IDataStore store) =>
        {
            var s = Security.GetSession(ctx, store);
            if (s is not null)
            {
                store.State.Sessions.Remove(s);
                Audit(store, ctx, s.UserId, "-", "auth.logout", "User", s.UserId);
                await store.SaveAsync();
            }
            Security.ClearSessionCookies(ctx, cookieSecure);
            return Results.Ok(new { ok = true });
        }).WithName("Logout");

        api.MapGet("/auth/csrf", (HttpContext ctx, IDataStore store) =>
        {
            var s = Security.GetSession(ctx, store);
            if (s is null) return Problems.Unauthorized(ctx);
            return Results.Ok(new { csrfToken = s.CsrfToken });
        }).WithName("Csrf");

        api.MapGet("/auth/me", (HttpContext ctx, IDataStore store) =>
        {
            var s = CurrentUser(ctx, store, out var user);
            if (s is null || user is null) return Problems.Unauthorized(ctx);
            var orgs = store.State.Memberships.Where(m => m.UserId == user.Id)
                .Join(store.State.Organisations, m => m.OrgId, o => o.Id, (m, o) => new { o.Id, o.Name, Role = m.Role.ToString() }).ToList();
            return Results.Ok(new { user = new UserDto(user.Id, user.Username), organisations = orgs });
        }).WithName("Me");

        // ---------- Organisations ----------
        api.MapPost("/orgs", async (HttpContext ctx, IDataStore store, CreateOrgRequest req) =>
        {
            var s = CurrentUser(ctx, store, out var user);
            if (s is null || user is null) return Problems.Unauthorized(ctx);
            if (!Security.CheckCsrf(ctx, s)) return Problems.Forbidden(ctx, "CSRF validation failed.");
            if (string.IsNullOrWhiteSpace(req.Name) || req.Name.Length > 100)
                return Problems.Validation(ctx, new() { ["name"] = ["Organisation name is required (max 100 chars)."] });
            var org = new Organisation(Guid.NewGuid().ToString("N"), req.Name.Trim(), user.Id, DateTime.UtcNow);
            store.State.Organisations.Add(org);
            store.State.Memberships.Add(new Membership(org.Id, user.Id, OrgRole.OrgAdmin, DateTime.UtcNow, DateTime.UtcNow));
            Audit(store, ctx, user.Id, org.Id, "org.created", "Organisation", org.Id);
            await store.SaveAsync();
            return Results.Created($"/api/v1/orgs/{org.Id}", new OrgDto(org.Id, org.Name));
        }).WithName("CreateOrg");

        api.MapGet("/orgs", (HttpContext ctx, IDataStore store) =>
        {
            var s = CurrentUser(ctx, store, out var user);
            if (s is null || user is null) return Problems.Unauthorized(ctx);
            var orgs = store.State.Memberships.Where(m => m.UserId == user.Id)
                .Join(store.State.Organisations, m => m.OrgId, o => o.Id, (m, o) => new OrgDto(o.Id, o.Name)).ToList();
            return Results.Ok(orgs);
        }).WithName("ListOrgs");

        api.MapGet("/orgs/{orgId}/members", (HttpContext ctx, IDataStore store, string orgId) =>
        {
            var s = CurrentUser(ctx, store, out var user);
            if (s is null || user is null) return Problems.Unauthorized(ctx);
            if (Security.RequireMember(store, user.Id, orgId) is null) return Problems.Forbidden(ctx, "Not a member of this organisation.");
            var members = store.State.Memberships.Where(m => m.OrgId == orgId)
                .Join(store.State.Users, m => m.UserId, u => u.Id, (m, u) => new MembershipDto(m.OrgId, m.UserId, u.Username, m.Role.ToString())).ToList();
            return Results.Ok(members);
        }).WithName("ListMembers");

        api.MapPost("/orgs/{orgId}/members", async (HttpContext ctx, IDataStore store, string orgId, AddMemberRequest req) =>
        {
            var s = CurrentUser(ctx, store, out var user);
            if (s is null || user is null) return Problems.Unauthorized(ctx);
            if (!Security.CheckCsrf(ctx, s)) return Problems.Forbidden(ctx, "CSRF validation failed.");
            var mine = Security.RequireMember(store, user.Id, orgId);
            if (mine is null) return Problems.Forbidden(ctx, "Not a member of this organisation.");
            if (mine.Role != OrgRole.OrgAdmin) return Problems.Forbidden(ctx, "Only OrgAdmin can manage members.");
            var target = store.State.Users.FirstOrDefault(u => u.Username.Equals(req.Username, StringComparison.OrdinalIgnoreCase));
            if (target is null) return Problems.NotFound(ctx, "User not found.");
            if (!Enum.TryParse<OrgRole>(req.Role, true, out var role)) return Problems.Validation(ctx, new() { ["role"] = ["Role must be 'Member' or 'OrgAdmin'."] });
            if (store.State.Memberships.Any(m => m.OrgId == orgId && m.UserId == target.Id))
                return Problems.Conflict(ctx, "already-member", "User is already a member.");
            store.State.Memberships.Add(new Membership(orgId, target.Id, role, DateTime.UtcNow, DateTime.UtcNow));
            Audit(store, ctx, user.Id, orgId, "org.member_added", "Membership", target.Id);
            await store.SaveAsync();
            return Results.Created($"/api/v1/orgs/{orgId}/members/{target.Id}", new MembershipDto(orgId, target.Id, target.Username, role.ToString()));
        }).WithName("AddMember");

        api.MapPatch("/orgs/{orgId}/members/{userId}", async (HttpContext ctx, IDataStore store, string orgId, string userId, ChangeRoleRequest req) =>
        {
            var s = CurrentUser(ctx, store, out var user);
            if (s is null || user is null) return Problems.Unauthorized(ctx);
            if (!Security.CheckCsrf(ctx, s)) return Problems.Forbidden(ctx, "CSRF validation failed.");
            var mine = Security.RequireMember(store, user.Id, orgId);
            if (mine?.Role != OrgRole.OrgAdmin) return Problems.Forbidden(ctx, "Only OrgAdmin can manage members.");
            var m = store.State.Memberships.FirstOrDefault(x => x.OrgId == orgId && x.UserId == userId);
            if (m is null) return Problems.NotFound(ctx, "Membership not found.");
            if (!Enum.TryParse<OrgRole>(req.Role, true, out var role)) return Problems.Validation(ctx, new() { ["role"] = ["Role must be 'Member' or 'OrgAdmin'."] });
            if (m.Role == OrgRole.OrgAdmin && role == OrgRole.Member &&
                store.State.Memberships.Count(x => x.OrgId == orgId && x.Role == OrgRole.OrgAdmin) == 1)
                return Problems.Conflict(ctx, "last-admin", "Cannot demote the last OrgAdmin.");
            store.State.Memberships.Remove(m);
            store.State.Memberships.Add(m with { Role = role, UpdatedAt = DateTime.UtcNow });
            Audit(store, ctx, user.Id, orgId, "org.role_changed", "Membership", userId);
            await store.SaveAsync();
            return Results.Ok(new { ok = true });
        }).WithName("ChangeRole");

        api.MapDelete("/orgs/{orgId}/members/{userId}", async (HttpContext ctx, IDataStore store, string orgId, string userId) =>
        {
            var s = CurrentUser(ctx, store, out var user);
            if (s is null || user is null) return Problems.Unauthorized(ctx);
            if (!Security.CheckCsrf(ctx, s)) return Problems.Forbidden(ctx, "CSRF validation failed.");
            var mine = Security.RequireMember(store, user.Id, orgId);
            if (mine?.Role != OrgRole.OrgAdmin) return Problems.Forbidden(ctx, "Only OrgAdmin can manage members.");
            var m = store.State.Memberships.FirstOrDefault(x => x.OrgId == orgId && x.UserId == userId);
            if (m is null) return Problems.NotFound(ctx, "Membership not found.");
            if (m.Role == OrgRole.OrgAdmin && store.State.Memberships.Count(x => x.OrgId == orgId && x.Role == OrgRole.OrgAdmin) == 1)
                return Problems.Conflict(ctx, "last-admin", "Cannot remove the last OrgAdmin.");
            store.State.Memberships.Remove(m);
            Audit(store, ctx, user.Id, orgId, "org.member_removed", "Membership", userId);
            await store.SaveAsync();
            return Results.Ok(new { ok = true });
        }).WithName("RemoveMember");

        // ---------- Todos ----------
        api.MapPost("/orgs/{orgId}/todos", async (HttpContext ctx, IDataStore store, string orgId, CreateTodoRequest req) =>
        {
            var s = CurrentUser(ctx, store, out var user);
            if (s is null || user is null) return Problems.Unauthorized(ctx);
            if (!Security.CheckCsrf(ctx, s)) return Problems.Forbidden(ctx, "CSRF validation failed.");
            if (Security.RequireMember(store, user.Id, orgId) is null) return Problems.Forbidden(ctx, "Not a member of this organisation.");
            var errs = TodoValidator.Validate(req.Title, req.Description ?? "", req.Tags, req.Status, req.Priority, req.DueDate);
            if (errs.Count > 0) return Problems.Validation(ctx, errs);
            if (req.ClientProvidedId is not null)
            {
                var dup = store.State.Todos.FirstOrDefault(t => t.OrgId == orgId && t.ClientProvidedId == req.ClientProvidedId);
                if (dup is not null) // idempotent replay
                {
                    ctx.Response.Headers.ETag = Security.ETagFor(dup.Version);
                    return Results.Ok(ToDto(dup));
                }
            }
            var now = DateTime.UtcNow;
            var todo = new Todo(Guid.NewGuid().ToString("N"), orgId, req.Title.Trim(), req.Description ?? "",
                Enum.TryParse<TodoStatus>(req.Status, true, out var st) ? st : TodoStatus.Open,
                Enum.TryParse<TodoPriority>(req.Priority, true, out var pr) ? pr : TodoPriority.Medium,
                req.Tags ?? [], req.DueDate, now, now, 1, false, false, req.ClientProvidedId);
            store.State.Todos.Add(todo);
            Audit(store, ctx, user.Id, orgId, "todo.created", "Todo", todo.Id);
            await store.SaveAsync();
            ctx.Response.Headers.ETag = Security.ETagFor(todo.Version);
            return Results.Created($"/api/v1/orgs/{orgId}/todos/{todo.Id}", ToDto(todo));
        }).WithName("CreateTodo");

        api.MapGet("/orgs/{orgId}/todos", (HttpContext ctx, IDataStore store, string orgId,
            string? status, string? overdue, string? tag, string? sort, string? order,
            int page = 1, int pageSize = 20, bool includeArchived = false, bool includeDeleted = false) =>
        {
            var s = CurrentUser(ctx, store, out var user);
            if (s is null || user is null) return Problems.Unauthorized(ctx);
            if (Security.RequireMember(store, user.Id, orgId) is null) return Problems.Forbidden(ctx, "Not a member of this organisation.");
            page = Math.Clamp(page, 1, 1000); pageSize = Math.Clamp(pageSize, 1, 100);
            var q = store.State.Todos.Where(t => t.OrgId == orgId);
            if (!includeDeleted) q = q.Where(t => !t.IsDeleted);
            if (!includeArchived) q = q.Where(t => !t.IsArchived);
            if (status is not null)
            {
                if (!Enum.TryParse<TodoStatus>(status, true, out var st)) return Problems.Validation(ctx, new() { ["status"] = ["Invalid status filter."] });
                q = q.Where(t => t.Status == st);
            }
            if (overdue == "true") q = q.Where(t => t.DueDate != null && t.DueDate < DateTime.UtcNow && t.Status == TodoStatus.Open);
            if (tag is not null) q = q.Where(t => t.Tags.Contains(tag, StringComparer.OrdinalIgnoreCase));
            q = ((sort ?? "createdAt").ToLowerInvariant(), (order ?? "desc").ToLowerInvariant()) switch
            {
                ("duedate", "asc") => q.OrderBy(t => t.DueDate ?? DateTime.MaxValue),
                ("duedate", _) => q.OrderByDescending(t => t.DueDate ?? DateTime.MinValue),
                ("priority", "asc") => q.OrderBy(t => t.Priority),
                ("priority", _) => q.OrderByDescending(t => t.Priority),
                ("createdat", "asc") => q.OrderBy(t => t.CreatedAt),
                _ => q.OrderByDescending(t => t.CreatedAt),
            };
            var total = q.Count();
            var items = q.Skip((page - 1) * pageSize).Take(pageSize).Select(ToDto).ToList();
            return Results.Ok(new PageDto<TodoDto>(items, page, pageSize, total, (int)Math.Ceiling(total / (double)pageSize)));
        }).WithName("ListTodos");

        api.MapGet("/orgs/{orgId}/todos/{id}", (HttpContext ctx, IDataStore store, string orgId, string id) =>
        {
            var s = CurrentUser(ctx, store, out var user);
            if (s is null || user is null) return Problems.Unauthorized(ctx);
            if (Security.RequireMember(store, user.Id, orgId) is null) return Problems.Forbidden(ctx, "Not a member of this organisation.");
            var t = store.State.Todos.FirstOrDefault(x => x.Id == id && x.OrgId == orgId);
            if (t is null) return Problems.NotFound(ctx, "Todo not found.");
            ctx.Response.Headers.ETag = Security.ETagFor(t.Version);
            return Results.Ok(ToDto(t));
        }).WithName("GetTodo");

        async Task<IResult> Mutate(HttpContext ctx, IDataStore store, string orgId, string id,
            Func<Todo, Todo> apply, string auditAction, bool bumpVersion = true)
        {
            var s = CurrentUser(ctx, store, out var user);
            if (s is null || user is null) return Problems.Unauthorized(ctx);
            if (!Security.CheckCsrf(ctx, s)) return Problems.Forbidden(ctx, "CSRF validation failed.");
            if (Security.RequireMember(store, user.Id, orgId) is null) return Problems.Forbidden(ctx, "Not a member of this organisation.");
            var t = store.State.Todos.FirstOrDefault(x => x.Id == id && x.OrgId == orgId);
            if (t is null) return Problems.NotFound(ctx, "Todo not found.");
            var ifMatch = ctx.Request.Headers.IfMatch.FirstOrDefault();
            if (ifMatch is null) return Problems.Problem(ctx, 428, "precondition-required", "Precondition required.", "Send If-Match with the current ETag.");
            if (!Security.MatchVersion(ifMatch, t.Version)) return Problems.PreconditionFailed(ctx, $"Version mismatch: expected {Security.ETagFor(t.Version)}.");
            var updated = apply(t);
            if (bumpVersion) updated = updated with { Version = t.Version + 1, UpdatedAt = DateTime.UtcNow };
            store.State.Todos.Remove(t);
            store.State.Todos.Add(updated);
            Audit(store, ctx, user.Id, orgId, auditAction, "Todo", id);
            await store.SaveAsync();
            ctx.Response.Headers.ETag = Security.ETagFor(updated.Version);
            return Results.Ok(ToDto(updated));
        }

        api.MapPut("/orgs/{orgId}/todos/{id}", async (HttpContext ctx, IDataStore store, string orgId, string id, UpdateTodoRequest req) =>
        {
            if (req.Title is not null || req.Description is not null || req.Tags is not null)
            {
                var current = store.State.Todos.FirstOrDefault(x => x.Id == id && x.OrgId == orgId);
                var errs = TodoValidator.Validate(req.Title ?? current?.Title ?? "", req.Description ?? current?.Description ?? "",
                    req.Tags ?? current?.Tags, req.Status, req.Priority, req.DueDate);
                if (errs.Count > 0) return Problems.Validation(ctx, errs);
            }
            return await Mutate(ctx, store, orgId, id, t => t with
            {
                Title = req.Title?.Trim() ?? t.Title,
                Description = req.Description ?? t.Description,
                Status = req.Status is not null ? Enum.Parse<TodoStatus>(req.Status, true) : t.Status,
                Priority = req.Priority is not null ? Enum.Parse<TodoPriority>(req.Priority, true) : t.Priority,
                Tags = req.Tags ?? t.Tags,
                DueDate = req.ClearDueDate == true ? null : (req.DueDate ?? t.DueDate),
            }, "todo.updated");
        }).WithName("UpdateTodo");

        api.MapPatch("/orgs/{orgId}/todos/{id}/status", async (HttpContext ctx, IDataStore store, string orgId, string id, StatusChangeRequest req) =>
        {
            if (!Enum.TryParse<TodoStatus>(req.Status, true, out _)) return Problems.Validation(ctx, new() { ["status"] = ["Status must be 'Open' or 'Done'."] });
            return await Mutate(ctx, store, orgId, id, t => t with { Status = Enum.Parse<TodoStatus>(req.Status, true) }, "todo.status_changed");
        }).WithName("ToggleStatus");

        api.MapDelete("/orgs/{orgId}/todos/{id}", async (HttpContext ctx, IDataStore store, string orgId, string id) =>
            await Mutate(ctx, store, orgId, id, t => t with { IsDeleted = true }, "todo.soft_deleted")
        ).WithName("SoftDelete");

        api.MapPost("/orgs/{orgId}/todos/{id}/restore", async (HttpContext ctx, IDataStore store, string orgId, string id) =>
            await Mutate(ctx, store, orgId, id, t => t with { IsDeleted = false, IsArchived = false }, "todo.restored")
        ).WithName("RestoreTodo");

        api.MapDelete("/orgs/{orgId}/todos/{id}/permanent", async (HttpContext ctx, IDataStore store, string orgId, string id) =>
        {
            var s = CurrentUser(ctx, store, out var user);
            if (s is null || user is null) return Problems.Unauthorized(ctx);
            if (!Security.CheckCsrf(ctx, s)) return Problems.Forbidden(ctx, "CSRF validation failed.");
            var mine = Security.RequireMember(store, user.Id, orgId);
            if (mine is null) return Problems.Forbidden(ctx, "Not a member of this organisation.");
            if (mine.Role != OrgRole.OrgAdmin) return Problems.Forbidden(ctx, "Only OrgAdmin can hard-delete.");
            var t = store.State.Todos.FirstOrDefault(x => x.Id == id && x.OrgId == orgId);
            if (t is null) return Problems.NotFound(ctx, "Todo not found.");
            var ifMatch = ctx.Request.Headers.IfMatch.FirstOrDefault();
            if (ifMatch is null) return Problems.Problem(ctx, 428, "precondition-required", "Precondition required.", "Send If-Match with the current ETag.");
            if (!Security.MatchVersion(ifMatch, t.Version)) return Problems.PreconditionFailed(ctx, "Version mismatch.");
            store.State.Todos.Remove(t);
            Audit(store, ctx, user.Id, orgId, "todo.hard_deleted", "Todo", id);
            await store.SaveAsync();
            return Results.Ok(new { ok = true });
        }).WithName("HardDelete");

        // ---------- Audit ----------
        api.MapGet("/orgs/{orgId}/audit", (HttpContext ctx, IDataStore store, string orgId, string? entityType, int page = 1, int pageSize = 50) =>
        {
            var s = CurrentUser(ctx, store, out var user);
            if (s is null || user is null) return Problems.Unauthorized(ctx);
            var mine = Security.RequireMember(store, user.Id, orgId);
            if (mine is null) return Problems.Forbidden(ctx, "Not a member of this organisation.");
            if (mine.Role != OrgRole.OrgAdmin) return Problems.Forbidden(ctx, "Only OrgAdmin can view audit logs.");
            page = Math.Clamp(page, 1, 1000); pageSize = Math.Clamp(pageSize, 1, 100);
            var q = store.State.AuditEntries.Where(a => a.OrgId == orgId);
            if (entityType is not null) q = q.Where(a => a.EntityType.Equals(entityType, StringComparison.OrdinalIgnoreCase));
            q = q.OrderByDescending(a => a.Timestamp);
            var total = q.Count();
            var items = q.Skip((page - 1) * pageSize).Take(pageSize).ToList();
            return Results.Ok(new PageDto<AuditEntry>(items, page, pageSize, total, (int)Math.Ceiling(total / (double)pageSize)));
        }).WithName("AuditLog");

        // ---------- Import / Export ----------
        api.MapGet("/orgs/{orgId}/export", (HttpContext ctx, IDataStore store, string orgId) =>
        {
            var s = CurrentUser(ctx, store, out var user);
            if (s is null || user is null) return Problems.Unauthorized(ctx);
            if (Security.RequireMember(store, user.Id, orgId) is null) return Problems.Forbidden(ctx, "Not a member of this organisation.");
            var items = store.State.Todos.Where(t => t.OrgId == orgId && !t.IsDeleted).Select(t => new ImportItemDto(
                t.ClientProvidedId, t.Title, t.Description, t.Status.ToString(), t.Priority.ToString(), t.Tags, t.DueDate)).ToList();
            return Results.Ok(new { schemaVersion = 2, orgId, exportedAt = DateTime.UtcNow, items });
        }).WithName("Export");

        api.MapPost("/orgs/{orgId}/import", async (HttpContext ctx, IDataStore store, string orgId, ImportRequest req) =>
        {
            var s = CurrentUser(ctx, store, out var user);
            if (s is null || user is null) return Problems.Unauthorized(ctx);
            if (!Security.CheckCsrf(ctx, s)) return Problems.Forbidden(ctx, "CSRF validation failed.");
            if (Security.RequireMember(store, user.Id, orgId) is null) return Problems.Forbidden(ctx, "Not a member of this organisation.");
            if (req.Items is null || req.Items.Count == 0) return Problems.Validation(ctx, new() { ["items"] = ["At least one item is required."] });
            if (req.Items.Count > 500) return Problems.Validation(ctx, new() { ["items"] = ["At most 500 items per import."] });
            // Idempotency: repeated POST with same key returns previous report without duplicating.
            if (req.IdempotencyKey is not null && store.State.UsedIdempotencyKeys.Contains($"{orgId}:{req.IdempotencyKey}"))
            {
                Audit(store, ctx, user.Id, orgId, "import.duplicate_suppressed", "Import", req.IdempotencyKey);
                await store.SaveAsync();
                return Results.Ok(new ImportReportDto(0, 0, [], true));
            }
            var rejected = new List<ImportRejectedRow>();
            var accepted = 0;
            var now = DateTime.UtcNow;
            foreach (var (item, i) in req.Items.Select((x, i) => (x, i)))
            {
                var errs = TodoValidator.Validate(item.Title ?? "", item.Description ?? "", item.Tags, item.Status, item.Priority, item.DueDate);
                if (errs.Count > 0)
                {
                    rejected.Add(new ImportRejectedRow(i, item.ClientProvidedId, errs.SelectMany(kv => kv.Value.Select(v => $"{kv.Key}: {v}")).ToArray()));
                    continue;
                }
                if (item.ClientProvidedId is not null && store.State.Todos.Any(t => t.OrgId == orgId && t.ClientProvidedId == item.ClientProvidedId))
                    continue; // idempotent skip: already imported
                store.State.Todos.Add(new Todo(Guid.NewGuid().ToString("N"), orgId, item.Title!.Trim(), item.Description ?? "",
                    item.Status is not null ? Enum.Parse<TodoStatus>(item.Status, true) : TodoStatus.Open,
                    item.Priority is not null ? Enum.Parse<TodoPriority>(item.Priority, true) : TodoPriority.Medium,
                    item.Tags ?? [], item.DueDate, now, now, 1, false, false, item.ClientProvidedId));
                accepted++;
            }
            if (req.IdempotencyKey is not null) store.State.UsedIdempotencyKeys.Add($"{orgId}:{req.IdempotencyKey}");
            Audit(store, ctx, user.Id, orgId, "import.completed", "Import", $"{accepted}-accepted-{rejected.Count}-rejected");
            await store.SaveAsync();
            return Results.Ok(new ImportReportDto(accepted, rejected.Count, rejected, false));
        }).WithName("Import");
    }
}
