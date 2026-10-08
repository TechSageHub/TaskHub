using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using TaskHub.Api.Application;
using TaskHub.Api.Infrastructure;

namespace TaskHub.Tests;

public sealed class TestFactory : WebApplicationFactory<Program>
{
    public AuthRateLimiter? Limiter { get; private set; }
    protected override void ConfigureWebHost(Microsoft.AspNetCore.Hosting.IWebHostBuilder b)
    {
        b.UseSetting("Storage:Provider", "InMemory");
        b.ConfigureServices(s =>
        {
            s.AddSingleton<IDataStore, InMemoryStore>();
            s.AddSingleton(new AuthRateLimiter { MaxAttempts = 1000, WindowSeconds = 60, BlockSeconds = 60 });
        });
    }
    protected override void ConfigureClient(HttpClient c) { c.BaseAddress = new Uri("http://localhost"); }
}

/// <summary>Cookie-aware HTTP helper: keeps session + CSRF in sync like the real SPA.</summary>
public sealed class ApiClient
{
    private readonly HttpClient _http;
    private string? _csrf;
    public ApiClient(HttpClient http) { _http = http; }
    public async Task<HttpResponseMessage> SendAsync(HttpMethod method, string url, object? body = null, string? ifMatch = null, string? correlation = null)
    {
        var req = new HttpRequestMessage(method, url);
        req.Headers.Add("X-Correlation-Id", correlation ?? Guid.NewGuid().ToString("N"));
        if (ifMatch is not null) req.Headers.TryAddWithoutValidation("If-Match", ifMatch);
        if (body is not null && (method == HttpMethod.Post || method == HttpMethod.Put || method == HttpMethod.Patch || method == HttpMethod.Delete))
            req.Content = JsonContent.Create(body);
        if (_csrf is not null && method != HttpMethod.Get && method != HttpMethod.Head && method != HttpMethod.Options)
            req.Headers.Add("X-CSRF-Token", _csrf);
        var res = await _http.SendAsync(req);
        if (res.Headers.TryGetValues("Set-Cookie", out var cookies))
            foreach (var c in string.Join(";", cookies).Split(';'))
            {
                var t = c.Trim();
                if (t.StartsWith("taskhub_csrf=")) _csrf = t["taskhub_csrf=".Length..].Split(';')[0];
            }
        return res;
    }
    public async Task<string?> RegisterAsync(string username, string password = "Password123!")
    {
        var r = await SendAsync(HttpMethod.Post, "/api/v1/auth/register", new { username, password });
        Assert.True(r.IsSuccessStatusCode, await r.Content.ReadAsStringAsync());
        return await CsrfAsync();
    }
    public async Task<string?> LoginAsync(string username, string password = "Password123!")
    {
        var r = await SendAsync(HttpMethod.Post, "/api/v1/auth/login", new { username, password });
        Assert.True(r.IsSuccessStatusCode, await r.Content.ReadAsStringAsync());
        return await CsrfAsync();
    }
    public async Task<string?> CsrfAsync()
    {
        var r = await _http.GetAsync("/api/v1/auth/csrf");
        if (!r.IsSuccessStatusCode) return null;
        var doc = await r.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
        _csrf = doc.GetProperty("csrfToken").GetString();
        return _csrf;
    }
    public Task<HttpResponseMessage> Post(string url, object body, string? ifMatch = null) => SendAsync(HttpMethod.Post, url, body, ifMatch);
    public Task<HttpResponseMessage> Put(string url, object body, string? ifMatch) => SendAsync(HttpMethod.Put, url, body, ifMatch);
    public Task<HttpResponseMessage> Patch(string url, object body, string? ifMatch) => SendAsync(HttpMethod.Patch, url, body, ifMatch);
    public Task<HttpResponseMessage> Delete(string url, string? ifMatch = null, object? body = null) => SendAsync(HttpMethod.Delete, url, body, ifMatch);
    public Task<HttpResponseMessage> Get(string url) => SendAsync(HttpMethod.Get, url);
}
