using CommunityToolkit.Mvvm.ComponentModel;

namespace data_cleanup.Models;

public sealed partial class NormalizedInvoice : ObservableObject
{
    public long InvoiceId { get; init; }
    public long CustomerId { get; init; }
    public string InvoiceAuthor { get; init; } = "unassigned";
    public string? AmountRaw { get; init; }
    public decimal? AmountNormalized { get; init; }
    public string ParseStatus { get; init; } = "empty";
    public string? FailureReason { get; init; }

    [ObservableProperty]
    private string _reviewStatus = "unflagged";

    [ObservableProperty]
    private string? _reviewOwner;

    [ObservableProperty]
    private string? _reviewUpdatedUtc;
}
