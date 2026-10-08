using System.Security.Cryptography;

namespace TaskHub.Api.Application;

/// <summary>
/// Password hashing with PBKDF2-SHA256 (210k iterations), a NIST-approved modern KDF.
/// Format: v1.{iterations}.{saltB64}.{hashB64}. Constant-time verification.
/// </summary>
public static class PasswordHasher
{
    private const int Iterations = 210_000;
    private const int SaltSize = 16;
    private const int HashSize = 32;

    public static string Hash(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(SaltSize);
        var hash = Rfc2898DeriveBytes.Pbkdf2(password, salt, Iterations, HashAlgorithmName.SHA256, HashSize);
        return $"v1.{Iterations}.{Convert.ToBase64String(salt)}.{Convert.ToBase64String(hash)}";
    }

    public static bool Verify(string password, string encoded)
    {
        try
        {
            var parts = encoded.Split('.');
            if (parts.Length != 4 || parts[0] != "v1") return false;
            var iters = int.Parse(parts[1]);
            var salt = Convert.FromBase64String(parts[2]);
            var expected = Convert.FromBase64String(parts[3]);
            var actual = Rfc2898DeriveBytes.Pbkdf2(password, salt, iters, HashAlgorithmName.SHA256, expected.Length);
            return CryptographicOperations.FixedTimeEquals(actual, expected);
        }
        catch { return false; }
    }
}
