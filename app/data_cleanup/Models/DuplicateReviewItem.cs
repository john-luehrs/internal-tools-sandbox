using CommunityToolkit.Mvvm.ComponentModel;

namespace data_cleanup.Models;

public partial class DuplicateReviewItem : ObservableObject
{
    public int DuplicateGroup { get; init; }
    public string NormalizedEmail { get; init; } = string.Empty;
    public int CandidateCount { get; init; }
    public string CustomerIds { get; init; } = string.Empty;
    public string Companies { get; init; } = string.Empty;
    public int ConfidenceScore { get; init; }
    public string ConfidenceLabel { get; init; } = "low";
    public string RiskLabel { get; init; } = "low";

    [ObservableProperty]
    private string _decisionStatus = "pending";

    [ObservableProperty]
    private string? _decisionNote;
}
