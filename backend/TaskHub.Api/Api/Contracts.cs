namespace TaskHub.Api.Api;

public sealed record RegisterRequest(string Username, string Password);
public sealed record LoginRequest(string Username, string Password);
public sealed record UserDto(string Id, string Username);
public sealed record OrgDto(string Id, string Name);
public sealed record MembershipDto(string OrgId, string UserId, string Username, string Role);
public sealed record CreateOrgRequest(string Name);
public sealed record AddMemberRequest(string Username, string Role);
public sealed record ChangeRoleRequest(string Role);
public sealed record CreateTodoRequest(
    string Title, string? Description, string? Status, string? Priority,
    List<string>? Tags, DateTime? DueDate, string? ClientProvidedId);
public sealed record UpdateTodoRequest(
    string? Title, string? Description, string? Status, string? Priority,
    List<string>? Tags, DateTime? DueDate, bool? ClearDueDate);
public sealed record StatusChangeRequest(string Status);
public sealed record TodoDto(
    string Id, string OrgId, string Title, string Description, string Status,
    string Priority, List<string> Tags, DateTime? DueDate,
    DateTime CreatedAt, DateTime UpdatedAt, int Version, bool IsDeleted, bool IsArchived);
public sealed record PageDto<T>(List<T> Items, int Page, int PageSize, int Total, int TotalPages);
public sealed record ImportItemDto(
    string? ClientProvidedId, string Title, string? Description, string? Status,
    string? Priority, List<string>? Tags, DateTime? DueDate);
public sealed record ImportRequest(List<ImportItemDto> Items, string? IdempotencyKey);
public sealed record ImportRejectedRow(int Index, string? ClientProvidedId, string[] Reasons);
public sealed record ImportReportDto(int Accepted, int Rejected, List<ImportRejectedRow> RejectedRows, bool DuplicateRequest);

public static class Problems
{
    public static IResult Problem(HttpContext ctx, int status, string code, string title, string? detail = null, object? errors = null)
    {
        var cid = Application.Security.CorrelationId(ctx);
        var body = new Dictionary<string, object?>
        {
            ["type"] = $"https://taskhub.local/problems/{code}",
            ["title"] = title,
            ["status"] = status,
            ["code"] = code,
            ["correlationId"] = cid,
        };
        if (detail is not null) body["detail"] = detail;
        if (errors is not null) body["errors"] = errors;
        return Results.Json(body, statusCode: status, contentType: "application/problem+json");
    }

    public static IResult Validation(HttpContext ctx, Dictionary<string, string[]> errors)
        => Problem(ctx, 400, "validation-failed", "Validation failed.", "One or more fields are invalid.", errors);
    public static IResult Unauthorized(HttpContext ctx, string detail = "Authentication required.")
        => Problem(ctx, 401, "unauthorized", "Unauthorized.", detail);
    public static IResult Forbidden(HttpContext ctx, string detail = "You do not have permission.")
        => Problem(ctx, 403, "forbidden", "Forbidden.", detail);
    public static IResult NotFound(HttpContext ctx, string detail)
        => Problem(ctx, 404, "not-found", "Not found.", detail);
    public static IResult Conflict(HttpContext ctx, string code, string detail)
        => Problem(ctx, 409, code, "Conflict.", detail);
    public static IResult PreconditionFailed(HttpContext ctx, string detail)
        => Problem(ctx, 412, "precondition-failed", "Precondition failed.", detail);
    public static IResult TooMany(HttpContext ctx, int retryAfter)
        => Problem(ctx, 429, "rate-limited", "Too many requests.", $"Slow down and retry after {retryAfter}s.");
}
