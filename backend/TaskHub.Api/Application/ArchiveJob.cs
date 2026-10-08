using TaskHub.Api.Infrastructure;

namespace TaskHub.Api.Application;

/// <summary>
/// In-process background job: archives Done todos older than ARCHIVE_AFTER_DAYS.
/// Archived items are hidden from the default list but remain restorable.
/// Interval configurable via Archive:IntervalSeconds (ARCHIVE_INTERVAL_SECONDS).
/// </summary>
public sealed class ArchiveJob(IServiceProvider services, IConfiguration config, ILogger<ArchiveJob> log) : BackgroundService
{
    public static int ArchiveAfterDays(IConfiguration c)
        => int.TryParse(Environment.GetEnvironmentVariable("ARCHIVE_AFTER_DAYS") ?? c["Archive:AfterDays"], out var d) ? d : 30;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var intervalSec = int.TryParse(Environment.GetEnvironmentVariable("ARCHIVE_INTERVAL_SECONDS") ?? config["Archive:IntervalSeconds"], out var s) ? s : 3600;
        log.LogInformation("Archive job started: after {Days} days, every {Interval}s", ArchiveAfterDays(config), intervalSec);
        while (!stoppingToken.IsCancellationRequested)
        {
            try { await Task.Delay(TimeSpan.FromSeconds(intervalSec), stoppingToken); }
            catch (TaskCanceledException) { break; }
            try { await RunOnceAsync(stoppingToken); }
            catch (Exception ex) { log.LogError(ex, "Archive job iteration failed"); }
        }
    }

    public async Task<int> RunOnceAsync(CancellationToken ct = default)
    {
        using var scope = services.CreateScope();
        var store = scope.ServiceProvider.GetRequiredService<IDataStore>();
        var cutoff = DateTime.UtcNow.AddDays(-ArchiveAfterDays(config));
        var count = 0;
        foreach (var t in store.State.Todos.Where(t => !t.IsDeleted && !t.IsArchived && t.Status == Domain.TodoStatus.Done && t.UpdatedAt < cutoff).ToList())
        {
            store.State.Todos.Remove(t);
            store.State.Todos.Add(t with { IsArchived = true, UpdatedAt = DateTime.UtcNow, Version = t.Version + 1 });
            store.State.AuditEntries.Add(new Domain.AuditEntry(Guid.NewGuid().ToString("N"), DateTime.UtcNow, null, t.OrgId, "todo.archived", "Todo", t.Id, "background-archive"));
            count++;
        }
        if (count > 0) await store.SaveAsync(ct);
        if (count > 0) log.LogInformation("Archive job archived {Count} todos", count);
        return count;
    }
}
