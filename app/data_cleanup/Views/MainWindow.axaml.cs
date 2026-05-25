using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;

namespace data_cleanup.Views;

public partial class MainWindow : Window
{
    private static readonly Dictionary<string, string> ColumnTooltips = new()
    {
        ["ConfidenceScore"] = "Estimated likelihood (0-99) that this duplicate candidate is a true merge match.",
        ["ConfidenceLabel"] = "Categorical confidence bucket derived from confidence score (high, medium, low).",
        ["RiskLabel"] = "Business risk if the merge decision is wrong (high, medium, low).",
        ["RowRole"] = "Baseline row is the anchor for comparisons; candidate rows are compared to that baseline.",
        ["ComparedToCustomerId"] = "Customer ID used as the baseline comparison anchor for this group.",
        ["LifecycleState"] = "Workflow state: new, in_review, approved, resolved, or rejected.",
        ["OwnerName"] = "Assigned AR reviewer for this duplicate group.",
        ["OwnerTeam"] = "Owning team for assignment and handoff.",
        ["UpdatedUtc"] = "Last workflow update timestamp in UTC.",
        ["ReviewStatus"] = "Invoice review state in this run (for example unflagged or flagged).",
        ["ReviewOwner"] = "Actor who most recently flagged this invoice for review.",
        ["ReviewUpdatedUtc"] = "Invoice review update timestamp in UTC.",
        ["InvoiceAuthor"] = "Mock source author who created the invoice record.",
        ["EmailSignal"] = "For candidate rows, MATCH/DIFF is computed against the baseline row's email.",
        ["CompanySignal"] = "For candidate rows, MATCH/DIFF is computed against the baseline row's company name.",
        ["TierSignal"] = "For candidate rows, MATCH/DIFF is computed against the baseline row's account tier.",
        ["HighlightSummary"] = "At-a-glance summary of how this row compares to the baseline row.",
    };

    public MainWindow()
    {
        InitializeComponent();
    }

    private void OnAutoGeneratingColumn(object? sender, DataGridAutoGeneratingColumnEventArgs e)
    {
        var propertyName = e.PropertyName;
        var headerText = HumanizeColumnName(propertyName);

        var headerBlock = new TextBlock
        {
            Text = headerText,
        };

        if (ColumnTooltips.TryGetValue(propertyName, out var tip))
        {
            ToolTip.SetTip(headerBlock, tip);
        }

        e.Column.Header = headerBlock;
    }

    private void OnReviewQueueAutoGeneratingColumn(object? sender, DataGridAutoGeneratingColumnEventArgs e)
    {
        var propertyName = e.PropertyName;

        // These fields are retained in state/audit but hidden in the main queue grid
        // to keep the top review table readable on smaller screens.
        if (propertyName is "UpdatedUtc" or "OwnerTeam")
        {
            e.Cancel = true;
            return;
        }

        var compactHeaders = new Dictionary<string, string>
        {
            ["DuplicateGroup"] = "Group",
            ["NormalizedEmail"] = "Email",
            ["CandidateCount"] = "Count",
            ["CustomerIds"] = "Customer IDs",
            ["Companies"] = "Companies",
            ["ConfidenceScore"] = "Score",
            ["ConfidenceLabel"] = "Confidence",
            ["RiskLabel"] = "Risk",
            ["LifecycleState"] = "State",
            ["OwnerName"] = "Owner",
            ["DecisionStatus"] = "Decision",
            ["DecisionNote"] = "Reason",
        };

        var headerText = compactHeaders.TryGetValue(propertyName, out var compact)
            ? compact
            : HumanizeColumnName(propertyName);

        var headerBlock = new TextBlock
        {
            Text = headerText,
        };

        if (ColumnTooltips.TryGetValue(propertyName, out var tip))
        {
            ToolTip.SetTip(headerBlock, tip);
        }

        e.Column.Header = headerBlock;

        e.Column.MinWidth = propertyName switch
        {
            "Group" or "DuplicateGroup" => 56,
            "Count" or "CandidateCount" => 56,
            "Score" or "ConfidenceScore" => 56,
            "ConfidenceLabel" or "RiskLabel" => 84,
            "LifecycleState" => 88,
            "OwnerName" => 110,
            "DecisionStatus" => 90,
            "DecisionNote" => 200,
            _ => 120,
        };

        e.Column.MaxWidth = propertyName switch
        {
            "NormalizedEmail" => 220,
            "CustomerIds" => 150,
            "Companies" => 320,
            "OwnerName" => 140,
            "DecisionNote" => 320,
            _ => 160,
        };
    }

    private static string HumanizeColumnName(string propertyName)
    {
        if (string.IsNullOrWhiteSpace(propertyName))
        {
            return propertyName;
        }

        var separated = Regex.Replace(propertyName, "([A-Z]+)([A-Z][a-z])", "$1 $2");
        separated = Regex.Replace(separated, "([a-z0-9])([A-Z])", "$1 $2");

        var tokens = separated
            .Split(' ', System.StringSplitOptions.RemoveEmptyEntries)
            .Select(token => token.Equals("id", System.StringComparison.OrdinalIgnoreCase) ? "ID" : token)
            .ToArray();

        return string.Join(" ", tokens);
    }
}