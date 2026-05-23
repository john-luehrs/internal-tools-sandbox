namespace data_cleanup.Models;

public sealed class CustomerRecord
{
    public long CustomerId { get; init; }
    public string CompanyName { get; init; } = string.Empty;
    public string? Email { get; init; }
    public string? AccountTier { get; init; }
}
