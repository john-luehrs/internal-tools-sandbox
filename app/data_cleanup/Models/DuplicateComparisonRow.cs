namespace data_cleanup.Models;

public sealed class DuplicateComparisonRow
{
    public long CustomerId { get; init; }
    public string RowRole { get; init; } = "candidate";
    public long ComparedToCustomerId { get; init; }
    public string CompanyName { get; init; } = string.Empty;
    public string? Email { get; init; }
    public string? AccountTier { get; init; }
    public string EmailSignal { get; init; } = "DIFF";
    public string CompanySignal { get; init; } = "DIFF";
    public string TierSignal { get; init; } = "DIFF";
    public string HighlightSummary { get; init; } = string.Empty;
}
