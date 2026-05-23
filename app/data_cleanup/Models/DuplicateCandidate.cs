namespace data_cleanup.Models;

public sealed class DuplicateCandidate
{
    public int DuplicateGroup { get; init; }
    public long CustomerId { get; init; }
    public string CompanyName { get; init; } = string.Empty;
    public string? Email { get; init; }
    public string? NormalizedEmail { get; init; }
    public string? AccountTier { get; init; }
}
