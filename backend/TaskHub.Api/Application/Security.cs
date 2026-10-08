using System.Collections.Concurrent;
using System.Security.Cryptography;
using TaskHub.Api.Domain;
using TaskHub.Api.Infrastructure;

namespace TaskHub.Api.Application;

/// <summary>Session + CSRF + brute-force protection helpers.</summary>
public static class Security
{
    public const string SessionCookie = "taskhub_session";
    public const string CsrfCookie = "taskhub_csrf";
    public const string CsrfHeader = "X-CSRF-Token";
    public const string CorrelationHeader = "X-Correlation-Id";

    public static string NewToken(int bytes = 32) => Convert.ToBase64String(RandomNumberGenerator.GetBytes(bytes));

    public static Session? GetSession(HttpContext ctx, IDataStore store)
    {
        if (!ctx.Request.Cookies.TryGetValue(SessionCookie, out var token)) return null;
        return store.State.Sessions.FirstOrDefault(s => s.Token == token && s.ExpiresAt > DateTime.UtcNow);
    }

    public static void SetSessionCookies(HttpContext ctx, Session session, bool secure)
    {
        ctx.Response.Cookies.Append(SessionCookie, session.Token, new CookieOptions
        {
            HttpOnly = true, SameSite = SameSiteMode.Lax, Secure = secure,
            Path = "/", MaxAge = TimeSpan.FromHours(24), IsEssential = true
        });
        ctx.Response.Cookies.Append(CsrfCookie, session.CsrfToken, new CookieOptions
        {
            HttpOnly = false, SameSite = SameSiteMode.Lax, Secure = secure,
            Path = "/", MaxAge = TimeSpan.FromHours(24), IsEssential = true
        });
    }

    public static void ClearSessionCookies(HttpContext ctx, bool secure)
    {
        ctx.Response.Cookies.Append(SessionCookie, "", new CookieOptions { HttpOnly = true, SameSite = SameSiteMode.Lax, Secure = secure, Path = "/", Expires = DateTimeOffset.UnixEpoch });
        ctx.Response.Cookies.Append(CsrfCookie, "", new CookieOptions { HttpOnly = false, SameSite = SameSiteMode.Lax, Secure = secure, Path = "/", Expires = DateTimeOffset.UnixEpoch });
    }

    /// <summary>Double-submit CSRF check for unsafe methods. Safe methods skip.</summary>
    public static bool CheckCsrf(HttpContext ctx, Session? session)
    {
        if (HttpMethods.IsGet(ctx.Request.Method) || HttpMethods.IsHead(ctx.Request.Method) || HttpMethods.IsOptions(ctx.Request.Method))
            return true;
        if (session is null) return false;
        var header = ctx.Request.Headers[CsrfHeader].FirstOrDefault();
        var cookie = ctx.Request.Cookies[CsrfCookie];
        return header is not null && cookie is not null && header == cookie && header == session.CsrfToken;
    }

    public static string CorrelationId(HttpContext ctx)
    {
        if (ctx.Items["CorrelationId"] is string existing) return existing;
        var incoming = ctx.Request.Headers[CorrelationHeader].FirstOrDefault();
        var id = string.IsNullOrWhiteSpace(incoming) ? Guid.NewGuid().ToString("N") : incoming[..Math.Min(incoming.Length, 64)];
        ctx.Items["CorrelationId"] = id;
        return id;
    }

    public static Membership? RequireMember(IDataStore store, string userId, string orgId)
        => store.State.Memberships.FirstOrDefault(m => m.OrgId == orgId && m.UserId == userId);

    public static string ETagFor(int version) => $"\"v{version}\"";

    public static bool MatchVersion(string? ifMatch, int version)
        => ifMatch is not null && (ifMatch.Trim() == ETagFor(version) || ifMatch.Trim() == $"W/{ETagFor(version)}" || ifMatch.Trim() == $"v{version}");
}

/// <summary>Fixed-window rate limiter for auth endpoints (per IP). Configurable.</summary>
public sealed class AuthRateLimiter
{
    private readonly ConcurrentDictionary<string, (int Count, DateTime WindowStart, DateTime? BlockedUntil)> _buckets = new();
    public int MaxAttempts { get; set; } = 20;
    public int WindowSeconds { get; set; } = 60;
    public int BlockSeconds { get; set; } = 300;

    public bool TryAcquire(string key, out int retryAfterSeconds)
    {
        retryAfterSeconds = 0;
        var now = DateTime.UtcNow;
        var entry = _buckets.GetOrAdd(key, _ => (0, now, null));
        if (entry.BlockedUntil is not null && entry.BlockedUntil > now)
        {
            retryAfterSeconds = (int)Math.Ceiling((entry.BlockedUntil.Value - now).TotalSeconds);
            return false;
        }
        if ((now - entry.WindowStart).TotalSeconds >= WindowSeconds) entry = (0, now, null);
        entry = (entry.Count + 1, entry.WindowStart, null);
        if (entry.Count > MaxAttempts)
        {
            entry = (entry.Count, entry.WindowStart, now.AddSeconds(BlockSeconds));
            _buckets[key] = entry;
            retryAfterSeconds = BlockSeconds;
            return false;
        }
        _buckets[key] = entry;
        return true;
    }

    public void Reset() => _buckets.Clear();
}
