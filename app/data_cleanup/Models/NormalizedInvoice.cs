namespace data_cleanup.Models;

public sealed class NormalizedInvoice
{
    public long InvoiceId { get; init; }
    public long CustomerId { get; init; }
    public string? AmountRaw { get; init; }
    public decimal? AmountNormalized { get; init; }
    public string ParseStatus { get; init; } = "empty";
    public string? FailureReason { get; init; }
}
