using TaskHub.Api.Api;
using TaskHub.Api.Application;
using TaskHub.Api.Infrastructure;

var builder = WebApplication.CreateBuilder(args);

// ----- Configuration (env-overridable) -----
var storageProvider = Environment.GetEnvironmentVariable("STORAGE_PROVIDER") ?? builder.Configuration["Storage:Provider"] ?? "InMemory";
var fileDir = Environment.GetEnvironmentVariable("STORAGE_FILE_DIR") ?? builder.Configuration["Storage:FileDirectory"] ?? Path.Combine(AppContext.BaseDirectory, "data");
var cookieSecureDefault = (Environment.GetEnvironmentVariable("COOKIE_SECURE") ?? builder.Configuration["Auth:CookieSecure"] ?? "SameAsRequest").Equals("Always", StringComparison.OrdinalIgnoreCase);

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new() { Title = "TaskHub API", Version = "v1", Description = "Multi-tenant todo platform. All endpoints live under /api/v1." });
});
builder.Services.AddSingleton<AuthRateLimiter>(_ =>
{
    var r = new AuthRateLimiter();
    if (int.TryParse(Environment.GetEnvironmentVariable("AUTH_MAX_ATTEMPTS") ?? builder.Configuration["Auth:MaxAttempts"], out var m)) r.MaxAttempts = m;
    if (int.TryParse(Environment.GetEnvironmentVariable("AUTH_WINDOW_SECONDS") ?? builder.Configuration["Auth:WindowSeconds"], out var w)) r.WindowSeconds = w;
    if (int.TryParse(Environment.GetEnvironmentVariable("AUTH_BLOCK_SECONDS") ?? builder.Configuration["Auth:BlockSeconds"], out var b)) r.BlockSeconds = b;
    return r;
});
if (storageProvider.Equals("File", StringComparison.OrdinalIgnoreCase))
    builder.Services.AddSingleton<IDataStore>(sp => new FileStore(fileDir, sp.GetRequiredService<ILogger<FileStore>>()));
else
    builder.Services.AddSingleton<IDataStore, InMemoryStore>();
builder.Services.AddHostedService<ArchiveJob>();
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p.WithOrigins("http://localhost:5173", "http://localhost:4173").AllowAnyHeader().AllowAnyMethod().AllowCredentials()));

var app = builder.Build();

// ----- Correlation ID + structured logging + security headers -----
app.Use(async (ctx, next) =>
{
    var cid = Security.CorrelationId(ctx);
    ctx.Response.Headers[Security.CorrelationHeader] = cid;
    ctx.Response.Headers["X-Content-Type-Options"] = "nosniff";
    ctx.Response.Headers["X-Frame-Options"] = "DENY";
    using (app.Logger.BeginScope(new Dictionary<string, object> { ["correlationId"] = cid, ["method"] = ctx.Request.Method, ["path"] = ctx.Request.Path }))
    {
        app.Logger.LogInformation("Incoming request {Method} {Path}", ctx.Request.Method, ctx.Request.Path);
        await next();
        app.Logger.LogInformation("Completed request {Method} {Path} with {Status}", ctx.Request.Method, ctx.Request.Path, ctx.Response.StatusCode);
    }
});
app.UseCors();

// Global exception → Problem Details (never leak internals)
app.Use(async (ctx, next) =>
{
    try { await next(); }
    catch (Exception ex)
    {
        app.Logger.LogError(ex, "Unhandled exception correlation {Cid}", Security.CorrelationId(ctx));
        await Problems.Problem(ctx, 500, "internal-error", "Internal server error.", "Something went wrong.").ExecuteAsync(ctx);
    }
});

app.UseSwagger();
app.UseSwaggerUI(c => { c.SwaggerEndpoint("/swagger/v1/swagger.json", "TaskHub v1"); c.RoutePrefix = "swagger"; });

// ----- Health -----
app.MapGet("/health/live", () => Results.Ok(new { status = "up", time = DateTime.UtcNow })).WithName("Live");
app.MapGet("/health/ready", (IDataStore store) =>
{
    try
    {
        _ = store.State.SchemaVersion;
        return Results.Ok(new { status = "ready", storage = storageProvider, schemaVersion = store.State.SchemaVersion, time = DateTime.UtcNow });
    }
    catch (Exception ex) { return Results.Json(new { status = "not-ready", error = ex.Message }, statusCode: 503); }
}).WithName("Ready");

var api = app.MapGroup("/api/v1");
Endpoints.Map(api, cookieSecureDefault);

app.Logger.LogInformation("TaskHub starting with storage provider {Provider}", storageProvider);
app.Run();

public partial class Program { }
