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
	public ObservableCollection<DuplicateReviewItem> DuplicateReviewQueue { get; } = [];
	public ObservableCollection<DuplicateComparisonRow> SelectedDuplicateComparisonRows { get; } = [];
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

	[ObservableProperty]
	private DuplicateReviewItem? _selectedDuplicateReviewItem;

	[ObservableProperty]
	private string _selectedComparisonTitle;

	[ObservableProperty]
	private string _assignmentOwner;

	[ObservableProperty]
	private string _assignmentTeam;

	[ObservableProperty]
	private string _reviewNotes;

	[ObservableProperty]
	private bool _showRejectReasonPrompt;

	[ObservableProperty]
	private int _analysisRunCount;

	[ObservableProperty]
	private string _lastAnalysisRunUtc;

	[ObservableProperty]
	private string _lastActionExportPath;

	[ObservableProperty]
	private NormalizedInvoice? _selectedInvalidInvoice;

	public bool HasLatestRun => LatestRun is not null;
	public string DuplicateCountDisplay => AnalysisReady ? DuplicateCount.ToString() : "--";
	public string DuplicateGroupCountDisplay => AnalysisReady ? DuplicateGroupCount.ToString() : "--";
	public string InvoiceNormalizedCountDisplay => AnalysisReady ? InvoiceNormalizedCount.ToString() : "--";
	public string InvoiceInvalidCountDisplay => AnalysisReady ? InvoiceInvalidCount.ToString() : "--";
	public string InvoiceEmptyCountDisplay => AnalysisReady ? InvoiceEmptyCount.ToString() : "--";
	public int PendingReviewCount => DuplicateReviewQueue.Count(item => item.LifecycleState == "new");
	public int ApprovedReviewCount => DuplicateReviewQueue.Count(item => item.LifecycleState == "approved");
	public int RejectedReviewCount => DuplicateReviewQueue.Count(item => item.LifecycleState == "rejected");
	public int InReviewCount => DuplicateReviewQueue.Count(item => item.LifecycleState == "in_review");
	public int ResolvedCount => DuplicateReviewQueue.Count(item => item.LifecycleState == "resolved");
	public string ClosureRateDisplay => DuplicateReviewQueue.Count == 0
		? "0%"
		: $"{(ResolvedCount * 100.0 / DuplicateReviewQueue.Count):0}%";

	public MainWindowViewModel()
	{
		DbPath = _service.ResolveDefaultDbPath();
		OutputDirectory = _service.ResolveDefaultOutputDir();
		Actor = Environment.UserName;
		SelectedStepIndex = 0;
		InvoicePreviewTitle = "Affected invoice preview";
		CustomerPreviewTitle = "Customer records";
		SelectedComparisonTitle = "Quick comparison (select a duplicate group)";
		AssignmentOwner = "ar.analyst";
		AssignmentTeam = "AR Ops";
		ReviewNotes = string.Empty;
		ShowRejectReasonPrompt = false;
		LastAnalysisRunUtc = "--";
		LastActionExportPath = "--";
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
			Replace(DuplicateReviewQueue, []);
			Replace(SelectedDuplicateComparisonRows, []);
			Replace(NormalizedRows, []);
			Replace(AffectedInvoiceRows, []);
			Replace(DisplayedInvoiceRows, []);
			Replace(InvalidInvoiceRows, []);
			SelectedDuplicateReviewItem = null;
			SelectedComparisonTitle = "Quick comparison (select a duplicate group)";

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
			var workflowQueue = _service.BuildDuplicateReviewQueue(duplicates);
			foreach (var item in workflowQueue)
			{
				item.LifecycleState = "in_review";
				item.DecisionStatus = "pending";

				if (string.IsNullOrWhiteSpace(item.UpdatedUtc))
				{
					item.UpdatedUtc = DateTime.UtcNow.ToString("O");
				}
			}

			Replace(DuplicateReviewQueue, workflowQueue);
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
			AnalysisRunCount++;
			LastAnalysisRunUtc = DateTime.UtcNow.ToString("O");
			SelectedDuplicateReviewItem = DuplicateReviewQueue.FirstOrDefault();
			RefreshWorkflowMetrics();

			StatusMessage = "Candidate analysis complete. Duplicate groups were auto-set to in_review.";
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
	private void ApproveSelectedMerge()
	{
		SetSelectedMergeDecision("approved", "approved");
	}

	[RelayCommand]
	private void RejectSelectedMerge()
	{
		SetSelectedMergeDecision("rejected", "rejected");
	}

	[RelayCommand]
	private void ResolveSelectedItem()
	{
		UpdateSelectedLifecycleState("resolved", "approved", "resolved_work_item", "resolved");
	}

	[RelayCommand]
	private void AssignSelectedOwner()
	{
		try
		{
			if (SelectedDuplicateReviewItem is null)
			{
				StatusMessage = "Select a duplicate group to assign ownership.";
				return;
			}

			if (string.IsNullOrWhiteSpace(AssignmentOwner))
			{
				StatusMessage = "Provide an owner before assigning.";
				return;
			}

			SelectedDuplicateReviewItem.OwnerName = AssignmentOwner.Trim();
			SelectedDuplicateReviewItem.OwnerTeam = string.IsNullOrWhiteSpace(AssignmentTeam) ? "AR Ops" : AssignmentTeam.Trim();
			SelectedDuplicateReviewItem.UpdatedUtc = DateTime.UtcNow.ToString("O");
			if (SelectedDuplicateReviewItem.LifecycleState == "new")
			{
				SelectedDuplicateReviewItem.LifecycleState = "in_review";
			}

			_service.SaveWorkflowState(OutputDirectory, DuplicateReviewQueue);
			_service.AppendAuditEvent(
				OutputDirectory,
				Actor,
				"assigned_ar_owner",
				$"duplicate_group_{SelectedDuplicateReviewItem.DuplicateGroup}",
				new Dictionary<string, object>
				{
					["duplicate_group"] = SelectedDuplicateReviewItem.DuplicateGroup,
					["owner_name"] = SelectedDuplicateReviewItem.OwnerName ?? string.Empty,
					["owner_team"] = SelectedDuplicateReviewItem.OwnerTeam,
					["lifecycle_state"] = SelectedDuplicateReviewItem.LifecycleState,
				});

			RefreshWorkflowMetrics();
			StatusMessage = $"Group {SelectedDuplicateReviewItem.DuplicateGroup} assigned to {SelectedDuplicateReviewItem.OwnerName}.";
		}
		catch (Exception ex)
		{
			StatusMessage = $"Failed to assign ownership: {ex.Message}";
		}
	}

	[RelayCommand]
	private void ExportActionTemplate()
	{
		try
		{
			var path = _service.ExportActionTemplate(OutputDirectory, DuplicateReviewQueue);
			LastActionExportPath = path;
			_service.AppendAuditEvent(
				OutputDirectory,
				Actor,
				"exported_action_template",
				"duplicate_review_queue",
				new Dictionary<string, object>
				{
					["export_path"] = path,
					["record_count"] = DuplicateReviewQueue.Count,
				});

			StatusMessage = $"Action export generated: {path}";
		}
		catch (Exception ex)
		{
			StatusMessage = $"Failed to export action template: {ex.Message}";
		}
	}

	[RelayCommand]
	private void FlagInvoiceExceptions()
	{
		try
		{
			if (InvalidInvoiceRows.Count == 0)
			{
				StatusMessage = "No invalid invoices to flag.";
				return;
			}

			var now = DateTime.UtcNow.ToString("O");
			foreach (var row in InvalidInvoiceRows)
			{
				row.ReviewStatus = "flagged";
				row.ReviewOwner = string.IsNullOrWhiteSpace(row.InvoiceAuthor) ? "unknown_author" : row.InvoiceAuthor;
				row.ReviewUpdatedUtc = now;
			}

			_service.AppendAuditEvent(
				OutputDirectory,
				Actor,
				"flagged_invoice_exceptions",
				"invoice_batch",
				new Dictionary<string, object>
				{
					["invoice_invalid_count"] = InvoiceInvalidCount,
					["invoice_empty_count"] = InvoiceEmptyCount,
					["review_status"] = "flagged",
					["assignment_mode"] = "assign_to_invoice_author",
				});

			StatusMessage = $"Flagged {InvalidInvoiceRows.Count} invalid invoices for review.";
		}
		catch (Exception ex)
		{
			StatusMessage = $"Failed to log invoice review action: {ex.Message}";
		}
	}

	[RelayCommand]
	private void FlagSelectedInvoice()
	{
		try
		{
			if (SelectedInvalidInvoice is null)
			{
				StatusMessage = "Select an invalid invoice row first.";
				return;
			}

			var now = DateTime.UtcNow.ToString("O");
			SelectedInvalidInvoice.ReviewStatus = "flagged";
			SelectedInvalidInvoice.ReviewOwner = string.IsNullOrWhiteSpace(SelectedInvalidInvoice.InvoiceAuthor)
				? "unknown_author"
				: SelectedInvalidInvoice.InvoiceAuthor;
			SelectedInvalidInvoice.ReviewUpdatedUtc = now;

			_service.AppendAuditEvent(
				OutputDirectory,
				Actor,
				"flagged_single_invoice_exception",
				$"invoice_{SelectedInvalidInvoice.InvoiceId}",
				new Dictionary<string, object>
				{
					["invoice_id"] = SelectedInvalidInvoice.InvoiceId,
					["review_status"] = SelectedInvalidInvoice.ReviewStatus,
				});

			StatusMessage = $"Invoice {SelectedInvalidInvoice.InvoiceId} flagged for review.";
		}
		catch (Exception ex)
		{
			StatusMessage = $"Failed to flag selected invoice: {ex.Message}";
		}
	}

	[RelayCommand]
	private void UnflagSelectedInvoice()
	{
		try
		{
			if (SelectedInvalidInvoice is null)
			{
				StatusMessage = "Select an invalid invoice row first.";
				return;
			}

			var now = DateTime.UtcNow.ToString("O");
			SelectedInvalidInvoice.ReviewStatus = "unflagged";
			SelectedInvalidInvoice.ReviewOwner = string.IsNullOrWhiteSpace(SelectedInvalidInvoice.InvoiceAuthor)
				? "unknown_author"
				: SelectedInvalidInvoice.InvoiceAuthor;
			SelectedInvalidInvoice.ReviewUpdatedUtc = now;

			_service.AppendAuditEvent(
				OutputDirectory,
				Actor,
				"unflagged_single_invoice_exception",
				$"invoice_{SelectedInvalidInvoice.InvoiceId}",
				new Dictionary<string, object>
				{
					["invoice_id"] = SelectedInvalidInvoice.InvoiceId,
					["review_status"] = SelectedInvalidInvoice.ReviewStatus,
				});

			StatusMessage = $"Invoice {SelectedInvalidInvoice.InvoiceId} unflagged.";
		}
		catch (Exception ex)
		{
			StatusMessage = $"Failed to unflag selected invoice: {ex.Message}";
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
				precomputedInvoices: NormalizedRows.ToList(),
				reviewQueue: DuplicateReviewQueue.ToList(),
				flaggedInvoices: InvalidInvoiceRows.ToList());

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

	partial void OnSelectedDuplicateReviewItemChanged(DuplicateReviewItem? value)
	{
		if (value is null)
		{
			Replace(SelectedDuplicateComparisonRows, []);
			SelectedComparisonTitle = "Quick comparison (select a duplicate group)";
			ReviewNotes = string.Empty;
			ShowRejectReasonPrompt = false;
			return;
		}

		PopulateSelectedDuplicateComparison(value);
		ReviewNotes = value.DecisionNote ?? string.Empty;
		ShowRejectReasonPrompt = false;

		StatusMessage = $"Selected group {value.DuplicateGroup} | state: {value.LifecycleState} | owner: {value.OwnerName ?? "unassigned"}.";
	}

	private void PopulateSelectedDuplicateComparison(DuplicateReviewItem selectedGroup)
	{
		var rows = DuplicateRows
			.Where(item => item.DuplicateGroup == selectedGroup.DuplicateGroup)
			.OrderBy(item => item.CustomerId)
			.ToList();

		if (rows.Count == 0)
		{
			Replace(SelectedDuplicateComparisonRows, []);
			SelectedComparisonTitle = "Quick comparison (no rows in selected group)";
			return;
		}

		var baseline = rows[0];
		var baselineEmail = (baseline.Email ?? string.Empty).Trim().ToLowerInvariant();
		var baselineCompany = (baseline.CompanyName ?? string.Empty).Trim().ToLowerInvariant();
		var baselineTier = (baseline.AccountTier ?? string.Empty).Trim().ToLowerInvariant();

		var comparisonRows = rows.Select(item =>
		{
			var isBaseline = item.CustomerId == baseline.CustomerId;
			var normalizedEmail = (item.Email ?? string.Empty).Trim().ToLowerInvariant();
			var normalizedCompany = (item.CompanyName ?? string.Empty).Trim().ToLowerInvariant();
			var normalizedTier = (item.AccountTier ?? string.Empty).Trim().ToLowerInvariant();

			var emailSignal = isBaseline ? "BASELINE" : (normalizedEmail == baselineEmail ? "MATCH" : "DIFF");
			var companySignal = isBaseline ? "BASELINE" : (normalizedCompany == baselineCompany ? "MATCH" : "DIFF");
			var tierSignal = isBaseline ? "BASELINE" : (normalizedTier == baselineTier ? "MATCH" : "DIFF");
			var rowRole = isBaseline ? "baseline" : "candidate";

			return new DuplicateComparisonRow
			{
				CustomerId = item.CustomerId,
				RowRole = rowRole,
				ComparedToCustomerId = baseline.CustomerId,
				CompanyName = item.CompanyName ?? string.Empty,
				Email = item.Email,
				AccountTier = item.AccountTier,
				EmailSignal = emailSignal,
				CompanySignal = companySignal,
				TierSignal = tierSignal,
				HighlightSummary = isBaseline
					? "Baseline row for this group"
					: $"vs {baseline.CustomerId} -> Email: {emailSignal} | Company: {companySignal} | Tier: {tierSignal}",
			};
		}).ToList();

		Replace(SelectedDuplicateComparisonRows, comparisonRows);
		SelectedComparisonTitle = $"Quick comparison - Group {selectedGroup.DuplicateGroup} ({selectedGroup.CandidateCount} candidates)";
	}

	private void SetSelectedMergeDecision(string decision, string lifecycleState)
	{
		try
		{
			if (SelectedDuplicateReviewItem is null)
			{
				StatusMessage = "Select a duplicate group in Review Queue first.";
				return;
			}

			if (decision == "rejected" && string.IsNullOrWhiteSpace(ReviewNotes))
			{
				ShowRejectReasonPrompt = true;
				StatusMessage = "Enter a rejection reason in Notes before rejecting.";
				return;
			}

			ShowRejectReasonPrompt = false;

			SelectedDuplicateReviewItem.DecisionStatus = decision;
			SelectedDuplicateReviewItem.LifecycleState = lifecycleState;
			var notePrefix = string.IsNullOrWhiteSpace(ReviewNotes)
				? decision
				: ReviewNotes.Trim();
			SelectedDuplicateReviewItem.DecisionNote = $"{notePrefix} at {DateTime.UtcNow:O}";
			SelectedDuplicateReviewItem.UpdatedUtc = DateTime.UtcNow.ToString("O");

			_service.AppendAuditEvent(
				OutputDirectory,
				Actor,
				decision == "approved" ? "approved_merge_candidate" : "rejected_merge_candidate",
				$"duplicate_group_{SelectedDuplicateReviewItem.DuplicateGroup}",
				new Dictionary<string, object>
				{
					["duplicate_group"] = SelectedDuplicateReviewItem.DuplicateGroup,
					["candidate_count"] = SelectedDuplicateReviewItem.CandidateCount,
					["confidence_score"] = SelectedDuplicateReviewItem.ConfidenceScore,
					["confidence_label"] = SelectedDuplicateReviewItem.ConfidenceLabel,
					["risk_label"] = SelectedDuplicateReviewItem.RiskLabel,
					["decision_status"] = SelectedDuplicateReviewItem.DecisionStatus,
					["decision_note"] = SelectedDuplicateReviewItem.DecisionNote ?? string.Empty,
					["lifecycle_state"] = SelectedDuplicateReviewItem.LifecycleState,
					["owner_name"] = SelectedDuplicateReviewItem.OwnerName ?? string.Empty,
					["owner_team"] = SelectedDuplicateReviewItem.OwnerTeam,
				});

			RefreshWorkflowMetrics();
			StatusMessage = $"Duplicate group {SelectedDuplicateReviewItem.DuplicateGroup} marked {decision}.";
		}
		catch (Exception ex)
		{
			StatusMessage = $"Failed to apply merge decision: {ex.Message}";
		}
	}

	partial void OnReviewNotesChanged(string value)
	{
		// Keep the inline reject prompt visible while the user types.
		// It should close only when reject succeeds or selection changes.
	}

	private void UpdateSelectedLifecycleState(string lifecycleState, string decisionStatus, string auditAction, string statusSuffix)
	{
		try
		{
			if (SelectedDuplicateReviewItem is null)
			{
				StatusMessage = "Select a duplicate group in Review Queue first.";
				return;
			}

			SelectedDuplicateReviewItem.LifecycleState = lifecycleState;
			SelectedDuplicateReviewItem.DecisionStatus = decisionStatus;
			SelectedDuplicateReviewItem.DecisionNote = $"{statusSuffix} at {DateTime.UtcNow:O}";
			SelectedDuplicateReviewItem.UpdatedUtc = DateTime.UtcNow.ToString("O");

			_service.AppendAuditEvent(
				OutputDirectory,
				Actor,
				auditAction,
				$"duplicate_group_{SelectedDuplicateReviewItem.DuplicateGroup}",
				new Dictionary<string, object>
				{
					["duplicate_group"] = SelectedDuplicateReviewItem.DuplicateGroup,
					["lifecycle_state"] = SelectedDuplicateReviewItem.LifecycleState,
					["decision_status"] = SelectedDuplicateReviewItem.DecisionStatus,
				});

			RefreshWorkflowMetrics();
			StatusMessage = $"Duplicate group {SelectedDuplicateReviewItem.DuplicateGroup} {statusSuffix}.";
		}
		catch (Exception ex)
		{
			StatusMessage = $"Failed to update lifecycle state: {ex.Message}";
		}
	}

	private void RefreshWorkflowMetrics()
	{
		OnPropertyChanged(nameof(PendingReviewCount));
		OnPropertyChanged(nameof(ApprovedReviewCount));
		OnPropertyChanged(nameof(RejectedReviewCount));
		OnPropertyChanged(nameof(InReviewCount));
		OnPropertyChanged(nameof(ResolvedCount));
		OnPropertyChanged(nameof(ClosureRateDisplay));
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
