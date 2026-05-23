namespace data_cleanup.Models;

public sealed class InvoiceRecord
{
    public long InvoiceId { get; init; }
    public long CustomerId { get; init; }
    public string? AmountRaw { get; init; }
    public string? Currency { get; init; }
    public string? Status { get; init; }
    public string? DueDate { get; init; }
}
