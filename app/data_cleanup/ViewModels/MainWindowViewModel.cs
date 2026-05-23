using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using data_cleanup.Models;
using data_cleanup.Services;

namespace data_cleanup.ViewModels;

public partial class MainWindowViewModel : ViewModelBase
{
	private readonly DataCleanupService _service = new();

	public ObservableCollection<CustomerRecord> CustomerRows { get; } = [];
	public ObservableCollection<InvoiceRecord> InvoiceRows { get; } = [];
	public ObservableCollection<CustomerRecord> DisplayedCustomerRows { get; } = [];
	public ObservableCollection<InvoiceRecord> DisplayedProfileInvoiceRows { get; } = [];
	public ObservableCollection<DuplicateCandidate> DuplicateRows { get; } = [];
	public ObservableCollection<NormalizedInvoice> NormalizedRows { get; } = [];
	public ObservableCollection<NormalizedInvoice> AffectedInvoiceRows { get; } = [];
	public ObservableCollection<NormalizedInvoice> DisplayedInvoiceRows { get; } = [];
	public ObservableCollection<NormalizedInvoice> InvalidInvoiceRows { get; } = [];

	[ObservableProperty]
	private string _dbPath;

	[ObservableProperty]
	private string _outputDirectory;

	[ObservableProperty]
	private string _actor;

	[ObservableProperty]
	private int _duplicateCount;

	[ObservableProperty]
	private int _duplicateGroupCount;

	[ObservableProperty]
	private int _invoiceTotal;

	[ObservableProperty]
	private int _customerTotal;

	[ObservableProperty]
	private int _invoiceNormalizedCount;

	[ObservableProperty]
	private int _invoiceInvalidCount;

	[ObservableProperty]
	private int _invoiceEmptyCount;

	[ObservableProperty]
	private bool _analysisReady;

	[ObservableProperty]
	private int _selectedStepIndex;

	[ObservableProperty]
	private string _invoicePreviewTitle;

	[ObservableProperty]
	private string _customerPreviewTitle;

	[ObservableProperty]
	private string _statusMessage;

	[ObservableProperty]
	private CleanupRunResult? _latestRun;

	public bool HasLatestRun => LatestRun is not null;
	public string DuplicateCountDisplay => AnalysisReady ? DuplicateCount.ToString() : "--";
	public string DuplicateGroupCountDisplay => AnalysisReady ? DuplicateGroupCount.ToString() : "--";
	public string InvoiceNormalizedCountDisplay => AnalysisReady ? InvoiceNormalizedCount.ToString() : "--";
	public string InvoiceInvalidCountDisplay => AnalysisReady ? InvoiceInvalidCount.ToString() : "--";
	public string InvoiceEmptyCountDisplay => AnalysisReady ? InvoiceEmptyCount.ToString() : "--";

	public MainWindowViewModel()
	{
		DbPath = _service.ResolveDefaultDbPath();
		OutputDirectory = _service.ResolveDefaultOutputDir();
		Actor = Environment.UserName;
		SelectedStepIndex = 0;
		InvoicePreviewTitle = "Affected invoice preview";
		CustomerPreviewTitle = "Customer records";
		StatusMessage = "Ready";

		RefreshAnalysis();
	}

	[RelayCommand]
	private void RefreshAnalysis()
	{
		try
		{
			var customers = _service.LoadCustomers(DbPath);
			var invoices = _service.LoadInvoices(DbPath);

			Replace(CustomerRows, customers);
			Replace(InvoiceRows, invoices);
			Replace(DisplayedCustomerRows, customers);
			Replace(DisplayedProfileInvoiceRows, invoices);
			Replace(DuplicateRows, []);
			Replace(NormalizedRows, []);
			Replace(AffectedInvoiceRows, []);
			Replace(DisplayedInvoiceRows, []);
			Replace(InvalidInvoiceRows, []);

			CustomerTotal = customers.Count;
			InvoiceTotal = invoices.Count;
			DuplicateCount = 0;
			DuplicateGroupCount = 0;
			InvoiceNormalizedCount = 0;
			InvoiceInvalidCount = 0;
			InvoiceEmptyCount = 0;
			AnalysisReady = false;
			InvoicePreviewTitle = "Affected invoice preview";
			CustomerPreviewTitle = "Customer records";

			StatusMessage = "Profile refreshed. Run Step 2 analysis to populate duplicate and normalization metrics.";
		}
		catch (Exception ex)
		{
			StatusMessage = $"Failed to refresh analysis: {ex.Message}";
		}
	}

	[RelayCommand]
	private void RunAnalysis()
	{
		try
		{
			var duplicates = _service.FindDuplicateCustomers(CustomerRows.ToList());
			var normalized = _service.NormalizeInvoices(InvoiceRows.ToList());
			var duplicateCustomerIds = duplicates
				.Select(item => item.CustomerId)
				.ToHashSet();

			var affectedInvoices = normalized
				.Where(item => item.ParseStatus != "normalized" || duplicateCustomerIds.Contains(item.CustomerId))
				.ToList();

			Replace(DuplicateRows, duplicates);
			Replace(NormalizedRows, normalized);
			Replace(AffectedInvoiceRows, affectedInvoices);
			Replace(DisplayedInvoiceRows, affectedInvoices);
			Replace(InvalidInvoiceRows, normalized.Where(item => item.ParseStatus == "invalid"));

			DuplicateCount = duplicates.Count;
			DuplicateGroupCount = duplicates.Select(x => x.DuplicateGroup).Distinct().Count();
			InvoiceTotal = normalized.Count;
			InvoiceNormalizedCount = normalized.Count(x => x.ParseStatus == "normalized");
			InvoiceInvalidCount = normalized.Count(x => x.ParseStatus == "invalid");
			InvoiceEmptyCount = normalized.Count(x => x.ParseStatus == "empty");
			AnalysisReady = true;
			InvoicePreviewTitle = "Affected invoice preview";

			StatusMessage = "Candidate analysis complete.";
		}
		catch (Exception ex)
		{
			StatusMessage = $"Failed to run analysis: {ex.Message}";
		}
	}

	[RelayCommand]
	private void ApplyKpiScope(string scope)
	{
		scope = (scope ?? string.Empty).Trim().ToLowerInvariant();

		if (!AnalysisReady && scope is "duplicate_rows" or "duplicate_groups" or "normalized" or "invalid" or "empty")
		{
			StatusMessage = "Run Step 2 analysis first, then click KPI cards to filter those analysis slices.";
			return;
		}

		switch (scope)
		{
			case "customers":
				Replace(DisplayedCustomerRows, CustomerRows);
				CustomerPreviewTitle = "Customer records";
				StatusMessage = "Showing all customers.";
				break;

			case "duplicate_rows":
			case "duplicate_groups":
				var duplicateCustomerIds = DuplicateRows
					.Select(item => item.CustomerId)
					.ToHashSet();
				Replace(DisplayedCustomerRows, CustomerRows.Where(item => duplicateCustomerIds.Contains(item.CustomerId)));
				CustomerPreviewTitle = "Duplicate-candidate customers";
				Replace(DisplayedProfileInvoiceRows, InvoiceRows.Where(item => duplicateCustomerIds.Contains(item.CustomerId)));
				Replace(DisplayedInvoiceRows, AffectedInvoiceRows);
				InvoicePreviewTitle = "Affected invoice preview";
				StatusMessage = "Focused on duplicate-related analysis results.";
				break;

			case "invoices":
				Replace(DisplayedProfileInvoiceRows, InvoiceRows);
				Replace(DisplayedInvoiceRows, NormalizedRows);
				InvoicePreviewTitle = "All analyzed invoices";
				StatusMessage = AnalysisReady ? "Showing all invoices." : "Showing all source invoices in Step 1.";
				break;

			case "normalized":
				Replace(DisplayedProfileInvoiceRows, InvoiceRows.Where((item, index) =>
					index < NormalizedRows.Count && NormalizedRows[index].ParseStatus == "normalized"));
				Replace(DisplayedInvoiceRows, NormalizedRows.Where(item => item.ParseStatus == "normalized"));
				InvoicePreviewTitle = "Normalized invoices";
				StatusMessage = "Showing only normalized invoices.";
				break;

			case "invalid":
				Replace(DisplayedProfileInvoiceRows, InvoiceRows.Where((item, index) =>
					index < NormalizedRows.Count && NormalizedRows[index].ParseStatus == "invalid"));
				Replace(DisplayedInvoiceRows, NormalizedRows.Where(item => item.ParseStatus == "invalid"));
				InvoicePreviewTitle = "Invalid invoice parses";
				StatusMessage = "Showing invoices with invalid parse status.";
				break;

			case "empty":
				Replace(DisplayedProfileInvoiceRows, InvoiceRows.Where((item, index) =>
					index < NormalizedRows.Count && NormalizedRows[index].ParseStatus == "empty"));
				Replace(DisplayedInvoiceRows, NormalizedRows.Where(item => item.ParseStatus == "empty"));
				InvoicePreviewTitle = "Empty invoice amounts";
				StatusMessage = "Showing invoices with empty amounts.";
				break;

			default:
				Replace(DisplayedCustomerRows, CustomerRows);
				CustomerPreviewTitle = "Customer records";
				Replace(DisplayedProfileInvoiceRows, InvoiceRows);
				Replace(DisplayedInvoiceRows, AffectedInvoiceRows);
				InvoicePreviewTitle = "Affected invoice preview";
				StatusMessage = "Showing affected invoices.";
				break;
		}
	}

	[RelayCommand]
	private void FlagDuplicateReview()
	{
		try
		{
			_service.AppendAuditEvent(
				OutputDirectory,
				Actor,
				"flagged_duplicates",
				"customer_batch",
				new Dictionary<string, object>
				{
					["duplicate_count"] = DuplicateCount,
					["duplicate_group_count"] = DuplicateGroupCount,
				});

			StatusMessage = "Duplicate review queue event logged.";
		}
		catch (Exception ex)
		{
			StatusMessage = $"Failed to log duplicate review action: {ex.Message}";
		}
	}

	[RelayCommand]
	private void FlagInvoiceExceptions()
	{
		try
		{
			_service.AppendAuditEvent(
				OutputDirectory,
				Actor,
				"flagged_invoice_exceptions",
				"invoice_batch",
				new Dictionary<string, object>
				{
					["invoice_invalid_count"] = InvoiceInvalidCount,
					["invoice_empty_count"] = InvoiceEmptyCount,
				});

			StatusMessage = "Invoice exception review queue event logged.";
		}
		catch (Exception ex)
		{
			StatusMessage = $"Failed to log invoice review action: {ex.Message}";
		}
	}

	[RelayCommand]
	private void RunPipeline()
	{
		try
		{
			var result = _service.RunCleanupPipeline(
				dbPath: DbPath,
				outputDir: OutputDirectory,
				actor: Actor,
				precomputedDuplicates: DuplicateRows.ToList(),
				precomputedInvoices: NormalizedRows.ToList());

			LatestRun = result;
			StatusMessage = $"Run complete: {result.RunId}";
		}
		catch (Exception ex)
		{
			StatusMessage = $"Run failed: {ex.Message}";
		}
	}

	partial void OnLatestRunChanged(CleanupRunResult? value)
	{
		OnPropertyChanged(nameof(HasLatestRun));
	}

	partial void OnAnalysisReadyChanged(bool value)
	{
		OnPropertyChanged(nameof(DuplicateCountDisplay));
		OnPropertyChanged(nameof(DuplicateGroupCountDisplay));
		OnPropertyChanged(nameof(InvoiceNormalizedCountDisplay));
		OnPropertyChanged(nameof(InvoiceInvalidCountDisplay));
		OnPropertyChanged(nameof(InvoiceEmptyCountDisplay));

		if (!value)
		{
			Replace(DisplayedInvoiceRows, []);
			Replace(DisplayedCustomerRows, CustomerRows);
			Replace(DisplayedProfileInvoiceRows, InvoiceRows);
			CustomerPreviewTitle = "Customer records";
			InvoicePreviewTitle = "Affected invoice preview";
		}
	}

	partial void OnDuplicateCountChanged(int value)
	{
		OnPropertyChanged(nameof(DuplicateCountDisplay));
	}

	partial void OnDuplicateGroupCountChanged(int value)
	{
		OnPropertyChanged(nameof(DuplicateGroupCountDisplay));
	}

	partial void OnInvoiceNormalizedCountChanged(int value)
	{
		OnPropertyChanged(nameof(InvoiceNormalizedCountDisplay));
	}

	partial void OnInvoiceInvalidCountChanged(int value)
	{
		OnPropertyChanged(nameof(InvoiceInvalidCountDisplay));
	}

	partial void OnInvoiceEmptyCountChanged(int value)
	{
		OnPropertyChanged(nameof(InvoiceEmptyCountDisplay));
	}

	private static void Replace<T>(ObservableCollection<T> collection, IEnumerable<T> items)
	{
		collection.Clear();
		foreach (var item in items)
		{
			collection.Add(item);
		}
	}
}
