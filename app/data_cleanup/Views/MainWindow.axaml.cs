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