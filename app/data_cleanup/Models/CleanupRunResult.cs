namespace data_cleanup.Models;

public sealed class CleanupRunResult
{
    public string RunId { get; init; } = string.Empty;
    public int DuplicateCount { get; init; }
    public int InvoiceTotal { get; init; }
    public int InvoiceNormalizedCount { get; init; }
    public int InvoiceInvalidCount { get; init; }
    public int InvoiceEmptyCount { get; init; }
    public string DuplicatesPath { get; init; } = string.Empty;
    public string InvoicesPath { get; init; } = string.Empty;
    public string SummaryPath { get; init; } = string.Empty;
    public string ArActionReportPath { get; init; } = string.Empty;
    public string ArLeadDigestPath { get; init; } = string.Empty;
}
