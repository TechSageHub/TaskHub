using System.Text.RegularExpressions;
using TaskHub.Api.Domain;

namespace TaskHub.Api.Application;

/// <summary>Boundary validation for todo input. Used by endpoints and import.</summary>
public static class TodoValidator
{
    private static readonly Regex TagPattern = new(@"^[A-Za-z0-9_-]{1,30}$", RegexOptions.Compiled);

    public static Dictionary<string, string[]> Validate(string title, string description,
        List<string>? tags, string? status, string? priority, DateTime? dueDate)
    {
        var errors = new Dictionary<string, string[]>();
        void Add(string field, string msg)
        {
            if (errors.TryGetValue(field, out var arr)) errors[field] = [.. arr, msg];
            else errors[field] = [msg];
        }
        if (string.IsNullOrWhiteSpace(title)) Add("title", "Title is required.");
        else if (title.Length > 200) Add("title", "Title must be 200 characters or fewer.");
        if (description is not null && description.Length > 2000) Add("description", "Description must be 2000 characters or fewer.");
        if (tags is not null)
        {
            if (tags.Count > 10) Add("tags", "At most 10 tags are allowed.");
            for (var i = 0; i < tags.Count; i++)
                if (!TagPattern.IsMatch(tags[i]))
                    Add($"tags[{i}]", "Tags may only contain letters, numbers, '-' or '_' (max 30 chars).");
            if (tags.Distinct(StringComparer.OrdinalIgnoreCase).Count() != tags.Count)
                Add("tags", "Duplicate tags are not allowed.");
        }
        if (status is not null && !Enum.TryParse<TodoStatus>(status, true, out _))
            Add("status", "Status must be 'Open' or 'Done'.");
        if (priority is not null && !Enum.TryParse<TodoPriority>(priority, true, out _))
            Add("priority", "Priority must be 'Low', 'Medium' or 'High'.");
        return errors;
    }

    public static Dictionary<string, string[]> ValidateCredentials(string username, string password)
    {
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(username) || username.Length is < 3 or > 50)
            errors["username"] = ["Username must be 3-50 characters."];
        else if (!Regex.IsMatch(username, @"^[A-Za-z0-9_.-]+$"))
            errors["username"] = ["Username may only contain letters, numbers, '.', '_' or '-'."];
        if (string.IsNullOrEmpty(password) || password.Length < 8 || password.Length > 128)
            errors["password"] = ["Password must be 8-128 characters."];
        return errors;
    }
}
