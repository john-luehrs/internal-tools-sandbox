using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
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

	[ObservableProperty]
	private bool _isDemoModeRunning;

	[ObservableProperty]
	private string _demoProgressLog;

	[ObservableProperty]
	private bool _isEmailPreviewOpen;

	[ObservableProperty]
	private string _emailPreviewSubject;

	[ObservableProperty]
	private string _emailPreviewBody;

	[ObservableProperty]
	private bool _isDecisionDialogOpen;

	[ObservableProperty]
	private bool _isRejectDecisionFlow;

	[ObservableProperty]
	private bool _showLandingPage;

	[ObservableProperty]
	private bool _isAutomatedOnlyMode;

	[ObservableProperty]
	private bool _isDataProfileVerified;

	public bool HasLatestRun => LatestRun is not null;
	public bool ShowMainWorkspace => !ShowLandingPage;
	public bool ShowManualWorkspace => ShowMainWorkspace && !IsAutomatedOnlyMode;
	public bool ShowAutomatedWorkspace => ShowMainWorkspace && IsAutomatedOnlyMode;
	public bool IsDecisionReasonVisible => IsRejectDecisionFlow;
	public string DecisionDialogTitle => IsRejectDecisionFlow ? "Reject Duplicate Group" : "Approve Duplicate Group";
	public string DecisionDialogInstruction => IsRejectDecisionFlow
		? "Assign an owner/team and provide a rejection reason."
		: "Assign an owner/team for this approval decision.";
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
		DemoProgressLog = "Demo mode ready. Click Start Demo Mode in Step 4 to run end-to-end automation.";
		EmailPreviewSubject = "AR Audit Results";
		EmailPreviewBody = "Run a pipeline first, then preview the AR lead email.";
		ShowLandingPage = true;
		IsAutomatedOnlyMode = false;
		IsDataProfileVerified = false;
		StatusMessage = "Ready";

		RefreshAnalysis();
	}

	[RelayCommand]
	private void StartManualRunMode()
	{
		IsEmailPreviewOpen = false;
		IsAutomatedOnlyMode = false;
		ShowLandingPage = false;
		IsDataProfileVerified = false;
		SelectedStepIndex = 0;
		StatusMessage = "Manual run mode selected. Use steps 1-4 to review and generate artifacts.";
	}

	[RelayCommand]
	private async Task StartAutomatedRunMode()
	{
		IsEmailPreviewOpen = false;
		IsAutomatedOnlyMode = true;
		ShowLandingPage = false;
		SelectedStepIndex = 3;
		StatusMessage = "Automated demo mode selected.";
		await StartDemoMode();
	}

	[RelayCommand]
	private void BackToModeSelection()
	{
		RefreshAnalysis();
		IsEmailPreviewOpen = false;
		IsDecisionDialogOpen = false;
		ShowLandingPage = true;
		StatusMessage = "Select Manual Run or Automated Demo.";
	}

	[RelayCommand]
	private void ContinueToCandidateAnalysis()
	{
		if (!IsDataProfileVerified)
		{
			StatusMessage = "Confirm source data verification in Step 1 before continuing.";
			return;
		}

		SelectedStepIndex = 1;
		StatusMessage = "Step 1 verified. Continue with candidate analysis.";
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
			IsDataProfileVerified = false;

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
		OpenDecisionDialog(isRejectFlow: false);
	}

	[RelayCommand]
	private void RejectSelectedMerge()
	{
		OpenDecisionDialog(isRejectFlow: true);
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
	private void ConfirmDecisionDialog()
	{
		if (SelectedDuplicateReviewItem is null)
		{
			StatusMessage = "Select a duplicate group in Review Queue first.";
			return;
		}

		if (string.IsNullOrWhiteSpace(AssignmentOwner))
		{
			StatusMessage = "Owner is required for approve/reject decisions.";
			return;
		}

		if (IsRejectDecisionFlow && string.IsNullOrWhiteSpace(ReviewNotes))
		{
			StatusMessage = "Rejection reason is required.";
			return;
		}

		var decision = IsRejectDecisionFlow ? "rejected" : "approved";
		SetSelectedMergeDecision(
			decision,
			decision,
			AssignmentOwner,
			AssignmentTeam,
			ReviewNotes);

		IsDecisionDialogOpen = false;
	}

	[RelayCommand]
	private void CancelDecisionDialog()
	{
		IsDecisionDialogOpen = false;
	}

	private void OpenDecisionDialog(bool isRejectFlow)
	{
		if (SelectedDuplicateReviewItem is null)
		{
			StatusMessage = "Select a duplicate group in Review Queue first.";
			return;
		}

		IsRejectDecisionFlow = isRejectFlow;
		AssignmentOwner = string.IsNullOrWhiteSpace(SelectedDuplicateReviewItem.OwnerName)
			? "ar.analyst"
			: SelectedDuplicateReviewItem.OwnerName;
		AssignmentTeam = string.IsNullOrWhiteSpace(SelectedDuplicateReviewItem.OwnerTeam)
			? "AR Ops"
			: SelectedDuplicateReviewItem.OwnerTeam;
		ReviewNotes = isRejectFlow ? string.Empty : "Approved in manual review";
		IsDecisionDialogOpen = true;
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
	private async Task StartDemoMode()
	{
		if (IsDemoModeRunning)
		{
			return;
		}

		try
		{
			IsDemoModeRunning = true;
			var steps = new[]
			{
				"Fetching info from DB",
				"Running duplicate search",
				"Running invoice flagging search",
				"Making merge decisions",
				"Assigning invoices",
				"Showing final result",
			};

			var completed = new bool[steps.Length];
			var activeIndex = -1;

			void Render()
			{
				var builder = new StringBuilder();
				builder.AppendLine("Automation demo progress:");
				builder.AppendLine();

				for (var i = 0; i < steps.Length; i++)
				{
					var marker = completed[i] ? "[x]" : (i == activeIndex ? "[>]" : "[ ]");
					builder.AppendLine($"{marker} {steps[i]}");
				}

				DemoProgressLog = builder.ToString();
			}

			activeIndex = 0;
			Render();
			RefreshAnalysis();
			await Task.Delay(350);
			completed[0] = true;

			activeIndex = 1;
			Render();
			RunAnalysis();
			await Task.Delay(350);
			completed[1] = true;

			activeIndex = 2;
			Render();
			var invalidCandidates = InvalidInvoiceRows.Count;
			StatusMessage = $"Invoice exception search found {invalidCandidates} invalid invoices.";
			await Task.Delay(350);
			completed[2] = true;

			activeIndex = 3;
			Render();
			AssignmentOwner = "ar.analyst";
			AssignmentTeam = "AR Ops";

			foreach (var item in DuplicateReviewQueue.ToList())
			{
				var owner = string.IsNullOrWhiteSpace(AssignmentOwner) ? "ar.analyst" : AssignmentOwner.Trim();
				var team = string.IsNullOrWhiteSpace(AssignmentTeam) ? "AR Ops" : AssignmentTeam.Trim();
				var now = DateTime.UtcNow.ToString("O");

				item.OwnerName = owner;
				item.OwnerTeam = team;
				item.UpdatedUtc = now;

				_service.AppendAuditEvent(
					OutputDirectory,
					Actor,
					"assigned_ar_owner",
					$"duplicate_group_{item.DuplicateGroup}",
					new Dictionary<string, object>
					{
						["duplicate_group"] = item.DuplicateGroup,
						["owner_name"] = item.OwnerName ?? string.Empty,
						["owner_team"] = item.OwnerTeam,
						["lifecycle_state"] = item.LifecycleState,
					});

				if (ShouldAutoApproveDuplicateGroup(item.DuplicateGroup))
				{
					var decisionNote = "Auto-approved by demo rule: email, company, and account tier all match";
					item.DecisionStatus = "approved";
					item.LifecycleState = "approved";
					item.DecisionNote = $"{decisionNote} at {DateTime.UtcNow:O}";
					item.UpdatedUtc = DateTime.UtcNow.ToString("O");

					_service.AppendAuditEvent(
						OutputDirectory,
						Actor,
						"approved_merge_candidate",
						$"duplicate_group_{item.DuplicateGroup}",
						new Dictionary<string, object>
						{
							["duplicate_group"] = item.DuplicateGroup,
							["candidate_count"] = item.CandidateCount,
							["confidence_score"] = item.ConfidenceScore,
							["confidence_label"] = item.ConfidenceLabel,
							["risk_label"] = item.RiskLabel,
							["decision_status"] = item.DecisionStatus,
							["decision_note"] = item.DecisionNote ?? string.Empty,
							["lifecycle_state"] = item.LifecycleState,
							["owner_name"] = item.OwnerName ?? string.Empty,
							["owner_team"] = item.OwnerTeam,
						});
				}
				else
				{
					var decisionNote = "Rejected by demo rule: not all 3 signals match; requires manual review";
					item.DecisionStatus = "rejected";
					item.LifecycleState = "rejected";
					item.DecisionNote = $"{decisionNote} at {DateTime.UtcNow:O}";
					item.UpdatedUtc = DateTime.UtcNow.ToString("O");

					_service.AppendAuditEvent(
						OutputDirectory,
						Actor,
						"rejected_merge_candidate",
						$"duplicate_group_{item.DuplicateGroup}",
						new Dictionary<string, object>
						{
							["duplicate_group"] = item.DuplicateGroup,
							["candidate_count"] = item.CandidateCount,
							["confidence_score"] = item.ConfidenceScore,
							["confidence_label"] = item.ConfidenceLabel,
							["risk_label"] = item.RiskLabel,
							["decision_status"] = item.DecisionStatus,
							["decision_note"] = item.DecisionNote ?? string.Empty,
							["lifecycle_state"] = item.LifecycleState,
							["owner_name"] = item.OwnerName ?? string.Empty,
							["owner_team"] = item.OwnerTeam,
						});
				}
			}

			RefreshWorkflowMetrics();

			await Task.Delay(350);
			completed[3] = true;

			activeIndex = 4;
			Render();
			FlagInvoiceExceptions();
			await Task.Delay(350);
			completed[4] = true;

			activeIndex = 5;
			Render();
			RunPipeline();
			await Task.Delay(350);
			completed[5] = true;
			activeIndex = -1;
			Render();

			if (LatestRun is not null)
			{
				DemoProgressLog += Environment.NewLine +
					Environment.NewLine +
					$"Completed run: {LatestRun.RunId}" + Environment.NewLine +
					$"Summary: {LatestRun.SummaryPath}" + Environment.NewLine +
					$"AR Action Report: {LatestRun.ArActionReportPath}" + Environment.NewLine +
					$"AR Lead Digest: {LatestRun.ArLeadDigestPath}";
			}

			StatusMessage = "Automation demo complete.";
		}
		catch (Exception ex)
		{
			StatusMessage = $"Automation demo failed: {ex.Message}";
		}
		finally
		{
			IsDemoModeRunning = false;
		}
	}

	[RelayCommand]
	private void OpenEmailPreview()
	{
		try
		{
			var summaryPath = ResolveSummaryPathForEmailPreview();
			if (string.IsNullOrWhiteSpace(summaryPath) || !File.Exists(summaryPath))
			{
				StatusMessage = "No summary report found. Run pipeline first, then preview email.";
				return;
			}

			BuildEmailTemplateFromSummary(summaryPath);
			IsEmailPreviewOpen = true;
			StatusMessage = "Email preview ready.";
		}
		catch (Exception ex)
		{
			StatusMessage = $"Failed to build email preview: {ex.Message}";
		}
	}

	[RelayCommand]
	private void CloseEmailPreview()
	{
		IsEmailPreviewOpen = false;
	}

	private string? ResolveSummaryPathForEmailPreview()
	{
		if (LatestRun is not null && !string.IsNullOrWhiteSpace(LatestRun.SummaryPath) && File.Exists(LatestRun.SummaryPath))
		{
			return LatestRun.SummaryPath;
		}

		if (!Directory.Exists(OutputDirectory))
		{
			return null;
		}

		return Directory
			.GetFiles(OutputDirectory, "summary_*.json")
			.OrderByDescending(File.GetLastWriteTimeUtc)
			.FirstOrDefault();
	}

	private void BuildEmailTemplateFromSummary(string summaryPath)
	{
		using var doc = JsonDocument.Parse(File.ReadAllText(summaryPath));
		var root = doc.RootElement;

		var runId = TryGetString(root, "run_id") ?? "unknown_run";
		var generatedUtc = ParseRunIdToUtc(runId) ?? DateTime.UtcNow;
		var overall = root.TryGetProperty("overall_picture", out var overallElement) ? overallElement : default;
		var routing = root.TryGetProperty("ar_routing", out var routingElement) ? routingElement : default;

		var duplicateCount = TryGetInt(overall, "duplicate_count");
		var invoiceInvalidCount = TryGetInt(overall, "invoice_invalid_count");
		var invoiceEmptyCount = TryGetInt(overall, "invoice_empty_count");
		var mergeCandidatesCount = TryGetInt(overall, "merge_candidates_count");
		var rejectedCandidatesCount = TryGetInt(overall, "rejected_candidates_count");
		var flaggedInvoicesCount = TryGetInt(overall, "flagged_invoices_count");
		var duplicateContext = LoadDuplicateContextByGroup(root);

		var mergeLines = BuildMergeLines(routing, duplicateContext);
		var rejectLines = BuildRejectLines(routing, duplicateContext);
		var invoiceLines = BuildFlaggedInvoiceLines(routing);
		var mergeGroupIds = BuildDuplicateGroupIdList(routing, "merge_candidates");
		var rejectedGroupIds = BuildDuplicateGroupIdList(routing, "rejected_candidates");
		var flaggedInvoiceIds = BuildFlaggedInvoiceIdList(routing);
		var unassignedMergeCount = CountUnassignedAssignments(routing, "merge_candidates", "ar_assignee");
		var unassignedRejectCount = CountUnassignedAssignments(routing, "rejected_candidates", "assignee_candidate");
		var unassignedInvoiceCount = CountUnassignedAssignments(routing, "flagged_invoices", "assignee");

		EmailPreviewSubject = $"AR Audit Results - Run {runId}";

		var builder = new StringBuilder();
		builder.AppendLine("Good Morning AR Lead,");
		builder.AppendLine();
		builder.AppendLine($"The scheduled AR audit completed at {generatedUtc:yyyy-MM-dd HH:mm:ss} UTC. We reviewed the database for duplicate customer records and invoice exceptions.");
		builder.AppendLine();
		builder.AppendLine("AR Lead Snapshot");
		builder.AppendLine($"- Duplicate candidate rows detected: {duplicateCount}");
		builder.AppendLine($"- Invalid invoices: {invoiceInvalidCount}");
		builder.AppendLine($"- Empty amount invoices: {invoiceEmptyCount}");
		builder.AppendLine($"- Merge-ready groups: {mergeCandidatesCount} ({FormatIdList(mergeGroupIds, "group")})");
		builder.AppendLine($"- Rejected groups needing validation: {rejectedCandidatesCount} ({FormatIdList(rejectedGroupIds, "group")})");
		builder.AppendLine($"- Flagged invoices routed: {flaggedInvoicesCount} ({FormatIdList(flaggedInvoiceIds, "invoice")})");
		builder.AppendLine($"- Unassigned actions: merges {unassignedMergeCount}, rejections {unassignedRejectCount}, invoices {unassignedInvoiceCount}");
		builder.AppendLine();
		builder.AppendLine("Action Tracker");
		builder.AppendLine("- Approved for merge (pending manual confirmation):");
		foreach (var line in mergeLines)
		{
			builder.AppendLine($"  {line}");
		}
		builder.AppendLine("- Rejected for merge (manual validation required):");
		foreach (var line in rejectLines)
		{
			builder.AppendLine($"  {line}");
		}
		builder.AppendLine("- Invoice reassignment actions:");
		foreach (var line in invoiceLines)
		{
			builder.AppendLine($"  {line}");
		}
		builder.AppendLine();
		builder.AppendLine("Thank you,");
		builder.AppendLine(Actor);

		EmailPreviewBody = builder.ToString();
	}

	private static DateTime? ParseRunIdToUtc(string runId)
	{
		if (DateTime.TryParseExact(runId, "yyyyMMddTHHmmssZ", null, System.Globalization.DateTimeStyles.AssumeUniversal, out var parsed))
		{
			return parsed.ToUniversalTime();
		}

		return null;
	}

	private static string? TryGetString(JsonElement element, string name)
	{
		if (element.ValueKind == JsonValueKind.Object && element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String)
		{
			return value.GetString();
		}

		return null;
	}

	private static int TryGetInt(JsonElement element, string name)
	{
		if (element.ValueKind == JsonValueKind.Object && element.TryGetProperty(name, out var value) && value.TryGetInt32(out var output))
		{
			return output;
		}

		return 0;
	}

	private static List<string> BuildMergeLines(JsonElement routing, IReadOnlyDictionary<int, List<DuplicateContextRow>> duplicateContext)
	{
		var lines = new List<string>();
		if (!routing.TryGetProperty("merge_candidates", out var candidates) || candidates.ValueKind != JsonValueKind.Array)
		{
			lines.Add("No customer groups were approved for merge in this run.");
			return lines;
		}

		foreach (var item in candidates.EnumerateArray())
		{
			var groupId = item.TryGetProperty("duplicate_group", out var groupElement) && groupElement.TryGetInt32(out var parsedGroup)
				? parsedGroup
				: -1;
			var ids = item.TryGetProperty("customer_ids", out var idsElement) && idsElement.ValueKind == JsonValueKind.Array
				? string.Join(" and ", idsElement.EnumerateArray().Select(x => x.ToString()))
				: "unknown customers";
			var assignee = TryGetString(item, "ar_assignee") ?? "unassigned";

			if (groupId > 0 && duplicateContext.TryGetValue(groupId, out var rows) && rows.Count > 0)
			{
				var customerSummary = FormatCustomerNameList(rows);
				lines.Add($"Group {groupId} | {customerSummary} | Owner: {assignee}.");
			}
			else
			{
				lines.Add($"Group {(groupId > 0 ? groupId : "?")} | Customers {ids} | Owner: {assignee}.");
			}
		}

		if (lines.Count == 0)
		{
			lines.Add("No customer groups were approved for merge in this run.");
		}

		return lines;
	}

	private static List<string> BuildRejectLines(JsonElement routing, IReadOnlyDictionary<int, List<DuplicateContextRow>> duplicateContext)
	{
		var lines = new List<string>();
		if (!routing.TryGetProperty("rejected_candidates", out var rejected) || rejected.ValueKind != JsonValueKind.Array)
		{
			lines.Add("No rejected merge candidates were recorded.");
			return lines;
		}

		foreach (var item in rejected.EnumerateArray())
		{
			var groupId = item.TryGetProperty("duplicate_group", out var groupElement) && groupElement.TryGetInt32(out var parsedGroup)
				? parsedGroup
				: -1;
			var ids = item.TryGetProperty("customer_ids", out var idsElement) && idsElement.ValueKind == JsonValueKind.Array
				? string.Join(" and ", idsElement.EnumerateArray().Select(x => x.ToString()))
				: "unknown customers";
			var assignee = TryGetString(item, "assignee_candidate") ?? "unassigned";

			if (groupId > 0 && duplicateContext.TryGetValue(groupId, out var rows) && rows.Count > 0)
			{
				var customerSummary = FormatCustomerNameList(rows);
				var reason = BuildReadableRejectionReason(rows, TryGetString(item, "reason"));
				lines.Add($"Group {groupId} | {customerSummary} | Owner: {assignee} | Reason: {reason}.");
			}
			else
			{
				var reason = NormalizeDecisionReason(TryGetString(item, "reason"));
				lines.Add($"Group {(groupId > 0 ? groupId : "?")} | Customers {ids} | Owner: {assignee} | Reason: {reason}.");
			}
		}

		if (lines.Count == 0)
		{
			lines.Add("No rejected merge candidates were recorded.");
		}

		return lines;
	}

	private static List<string> BuildFlaggedInvoiceLines(JsonElement routing)
	{
		var lines = new List<string>();
		if (!routing.TryGetProperty("flagged_invoices", out var flagged) || flagged.ValueKind != JsonValueKind.Array)
		{
			lines.Add("No flagged invoices were recorded.");
			return lines;
		}

		foreach (var item in flagged.EnumerateArray())
		{
			var invoiceId = item.TryGetProperty("invoice_id", out var invoiceElement) ? invoiceElement.ToString() : "unknown";
			var assignee = TryGetString(item, "assignee") ?? "unassigned";
			var reason = NormalizeFailureReason(TryGetString(item, "failure_reason"));
			lines.Add($"Invoice {invoiceId} | Owner: {assignee} | Verify: {reason}.");
		}

		if (lines.Count == 0)
		{
			lines.Add("No flagged invoices were recorded.");
		}

		return lines;
	}

	private static string NormalizeDecisionReason(string? reason)
	{
		if (string.IsNullOrWhiteSpace(reason))
		{
			return "manual review required";
		}

		var trimmed = reason.Trim();
		var timestampMarker = " at 20";
		var markerIndex = trimmed.IndexOf(timestampMarker, StringComparison.Ordinal);
		if (markerIndex > 0)
		{
			trimmed = trimmed[..markerIndex];
		}

		return trimmed.TrimEnd('.', ' ');
	}

	private static string NormalizeFailureReason(string? reason)
	{
		if (string.IsNullOrWhiteSpace(reason))
		{
			return "manual review required";
		}

		return reason.Trim().ToLowerInvariant() switch
		{
			"no_numeric_content" => "amount field contains no numeric value",
			"invalid_decimal_format" => "amount format contains invalid decimal placement",
			"parse_failed" => "amount could not be parsed",
			"missing_amount" => "amount value is missing",
			_ => reason.Trim().Replace('_', ' '),
		};
	}

	private static IReadOnlyDictionary<int, List<DuplicateContextRow>> LoadDuplicateContextByGroup(JsonElement summaryRoot)
	{
		try
		{
			if (!summaryRoot.TryGetProperty("artifacts", out var artifacts) || artifacts.ValueKind != JsonValueKind.Object)
			{
				return new Dictionary<int, List<DuplicateContextRow>>();
			}

			var duplicatesPath = TryGetString(artifacts, "duplicates_path");
			if (string.IsNullOrWhiteSpace(duplicatesPath) || !File.Exists(duplicatesPath))
			{
				return new Dictionary<int, List<DuplicateContextRow>>();
			}

			var lines = File.ReadAllLines(duplicatesPath);
			if (lines.Length <= 1)
			{
				return new Dictionary<int, List<DuplicateContextRow>>();
			}

			var header = ParseCsvLine(lines[0]);
			var groupIndex = header.FindIndex(x => string.Equals(x, "duplicate_group", StringComparison.OrdinalIgnoreCase));
			var customerIdIndex = header.FindIndex(x => string.Equals(x, "customer_id", StringComparison.OrdinalIgnoreCase));
			var companyIndex = header.FindIndex(x => string.Equals(x, "company_name", StringComparison.OrdinalIgnoreCase));
			var emailIndex = header.FindIndex(x => string.Equals(x, "email", StringComparison.OrdinalIgnoreCase));
			var tierIndex = header.FindIndex(x => string.Equals(x, "account_tier", StringComparison.OrdinalIgnoreCase));

			if (groupIndex < 0 || customerIdIndex < 0)
			{
				return new Dictionary<int, List<DuplicateContextRow>>();
			}

			var byGroup = new Dictionary<int, List<DuplicateContextRow>>();
			for (var i = 1; i < lines.Length; i++)
			{
				if (string.IsNullOrWhiteSpace(lines[i]))
				{
					continue;
				}

				var values = ParseCsvLine(lines[i]);
				if (!TryGetIntValue(values, groupIndex, out var groupId) || !TryGetIntValue(values, customerIdIndex, out var customerId))
				{
					continue;
				}

				var row = new DuplicateContextRow
				{
					DuplicateGroup = groupId,
					CustomerId = customerId,
					CompanyName = GetValue(values, companyIndex),
					Email = GetValue(values, emailIndex),
					AccountTier = GetValue(values, tierIndex),
				};

				if (!byGroup.TryGetValue(groupId, out var groupRows))
				{
					groupRows = [];
					byGroup[groupId] = groupRows;
				}

				groupRows.Add(row);
			}

			foreach (var group in byGroup.Values)
			{
				group.Sort((a, b) => a.CustomerId.CompareTo(b.CustomerId));
			}

			return byGroup;
		}
		catch
		{
			return new Dictionary<int, List<DuplicateContextRow>>();
		}
	}

	private static string FormatCustomerNameList(IReadOnlyList<DuplicateContextRow> rows)
	{
		if (rows.Count == 0)
		{
			return "Unknown customers";
		}

		var entries = rows
			.OrderBy(x => x.CustomerId)
			.Select(x => $"{(string.IsNullOrWhiteSpace(x.CompanyName) ? "Unknown Company" : x.CompanyName.Trim())} (Customer ID {x.CustomerId})")
			.ToList();

		if (entries.Count == 1)
		{
			return entries[0];
		}

		if (entries.Count == 2)
		{
			return $"{entries[0]} and {entries[1]}";
		}

		return string.Join(", ", entries.Take(entries.Count - 1)) + $", and {entries[^1]}";
	}

	private static string BuildReadableRejectionReason(IReadOnlyList<DuplicateContextRow> rows, string? fallbackReason)
	{
		if (rows.Count == 0)
		{
			return NormalizeDecisionReason(fallbackReason);
		}

		var normalizedEmails = rows
			.Select(x => (x.Email ?? string.Empty).Trim().ToLowerInvariant())
			.Where(x => !string.IsNullOrWhiteSpace(x))
			.Distinct()
			.Count();

		var normalizedCompanies = rows
			.Select(x => (x.CompanyName ?? string.Empty).Trim().ToLowerInvariant())
			.Where(x => !string.IsNullOrWhiteSpace(x))
			.Distinct()
			.Count();

		var normalizedTiers = rows
			.Select(x => (x.AccountTier ?? string.Empty).Trim().ToLowerInvariant())
			.Where(x => !string.IsNullOrWhiteSpace(x))
			.Distinct()
			.Count();

		var sameEmail = normalizedEmails == 1;
		var sameCompany = normalizedCompanies == 1;
		var sameMarket = normalizedTiers == 1;

		if (sameEmail && sameMarket && !sameCompany)
		{
			return "Same billing email address and market, but company name differs";
		}

		if (sameEmail && sameCompany && !sameMarket)
		{
			return "Same company and billing email address, but market differs";
		}

		if (!sameEmail && sameCompany && sameMarket)
		{
			return "Same company and market, but billing email address differs";
		}

		if (sameEmail && !sameCompany && !sameMarket)
		{
			return "Billing email matches, but both company name and market differ";
		}

		return NormalizeDecisionReason(fallbackReason);
	}

	private static bool TryGetIntValue(IReadOnlyList<string> values, int index, out int parsed)
	{
		parsed = 0;
		if (index < 0 || index >= values.Count)
		{
			return false;
		}

		return int.TryParse(values[index], out parsed);
	}

	private static string GetValue(IReadOnlyList<string> values, int index)
	{
		if (index < 0 || index >= values.Count)
		{
			return string.Empty;
		}

		return values[index];
	}

	private static List<string> ParseCsvLine(string line)
	{
		var values = new List<string>();
		if (line is null)
		{
			return values;
		}

		var current = new StringBuilder();
		var inQuotes = false;

		for (var i = 0; i < line.Length; i++)
		{
			var ch = line[i];
			if (ch == '"')
			{
				if (inQuotes && i + 1 < line.Length && line[i + 1] == '"')
				{
					current.Append('"');
					i++;
				}
				else
				{
					inQuotes = !inQuotes;
				}
				continue;
			}

			if (ch == ',' && !inQuotes)
			{
				values.Add(current.ToString());
				current.Clear();
				continue;
			}

			current.Append(ch);
		}

		values.Add(current.ToString());
		return values;
	}

	private sealed class DuplicateContextRow
	{
		public int DuplicateGroup { get; init; }
		public int CustomerId { get; init; }
		public string CompanyName { get; init; } = string.Empty;
		public string Email { get; init; } = string.Empty;
		public string AccountTier { get; init; } = string.Empty;
	}

	private static List<int> BuildDuplicateGroupIdList(JsonElement routing, string propertyName)
	{
		var output = new List<int>();
		if (!routing.TryGetProperty(propertyName, out var section) || section.ValueKind != JsonValueKind.Array)
		{
			return output;
		}

		foreach (var item in section.EnumerateArray())
		{
			if (item.TryGetProperty("duplicate_group", out var groupId) && groupId.TryGetInt32(out var parsed))
			{
				output.Add(parsed);
			}
		}

		return output.OrderBy(x => x).ToList();
	}

	private static List<int> BuildFlaggedInvoiceIdList(JsonElement routing)
	{
		var output = new List<int>();
		if (!routing.TryGetProperty("flagged_invoices", out var section) || section.ValueKind != JsonValueKind.Array)
		{
			return output;
		}

		foreach (var item in section.EnumerateArray())
		{
			if (item.TryGetProperty("invoice_id", out var invoiceId) && invoiceId.TryGetInt32(out var parsed))
			{
				output.Add(parsed);
			}
		}

		return output.OrderBy(x => x).ToList();
	}

	private static int CountUnassignedAssignments(JsonElement routing, string sectionName, string assigneeField)
	{
		if (!routing.TryGetProperty(sectionName, out var section) || section.ValueKind != JsonValueKind.Array)
		{
			return 0;
		}

		var count = 0;
		foreach (var item in section.EnumerateArray())
		{
			var assignee = TryGetString(item, assigneeField);
			if (string.IsNullOrWhiteSpace(assignee) || string.Equals(assignee, "unassigned", StringComparison.OrdinalIgnoreCase))
			{
				count++;
			}
		}

		return count;
	}

	private static string FormatIdList(IReadOnlyCollection<int> ids, string noun)
	{
		if (ids.Count == 0)
		{
			return $"no {noun}s";
		}

		return string.Join(", ", ids);
	}

	private bool ShouldAutoApproveDuplicateGroup(int duplicateGroup)
	{
		var rows = DuplicateRows
			.Where(item => item.DuplicateGroup == duplicateGroup)
			.ToList();

		if (rows.Count <= 1)
		{
			return false;
		}

		var normalizedEmails = rows
			.Select(item => (item.Email ?? string.Empty).Trim().ToLowerInvariant())
			.ToList();

		var normalizedCompanyNames = rows
			.Select(item => (item.CompanyName ?? string.Empty).Trim().ToLowerInvariant())
			.ToList();

		var normalizedTiers = rows
			.Select(item => (item.AccountTier ?? string.Empty).Trim().ToLowerInvariant())
			.ToList();

		if (normalizedEmails.Any(string.IsNullOrWhiteSpace) ||
			normalizedCompanyNames.Any(string.IsNullOrWhiteSpace) ||
			normalizedTiers.Any(string.IsNullOrWhiteSpace))
		{
			return false;
		}

		var distinctEmailCount = normalizedEmails.Distinct().Count();
		var distinctCompanyCount = normalizedCompanyNames.Distinct().Count();
		var distinctTierCount = normalizedTiers.Distinct().Count();

		return distinctEmailCount == 1 && distinctCompanyCount == 1 && distinctTierCount == 1;
	}

	[RelayCommand]
	private void RunPipeline()
	{
		try
		{
			var undecidedGroups = DuplicateReviewQueue
				.Where(item =>
					item.DecisionStatus != "approved" &&
					item.DecisionStatus != "rejected" &&
					item.DecisionStatus != "resolved")
				.Select(item => item.DuplicateGroup)
				.Distinct()
				.OrderBy(group => group)
				.ToList();

			if (undecidedGroups.Count > 0)
			{
				StatusMessage = $"Complete review decisions before run. Undecided groups: {string.Join(", ", undecidedGroups)}.";
				return;
			}

			var unassignedDecisionGroups = DuplicateReviewQueue
				.Where(item =>
					(item.DecisionStatus == "approved" || item.DecisionStatus == "rejected" ||
					 item.LifecycleState == "approved" || item.LifecycleState == "rejected") &&
					string.IsNullOrWhiteSpace(item.OwnerName))
				.Select(item => item.DuplicateGroup)
				.Distinct()
				.OrderBy(group => group)
				.ToList();

			if (unassignedDecisionGroups.Count > 0)
			{
				StatusMessage = $"Assign an owner for approved/rejected groups before run: {string.Join(", ", unassignedDecisionGroups)}.";
				return;
			}

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

	partial void OnShowLandingPageChanged(bool value)
	{
		OnPropertyChanged(nameof(ShowMainWorkspace));
		OnPropertyChanged(nameof(ShowManualWorkspace));
		OnPropertyChanged(nameof(ShowAutomatedWorkspace));
	}

	partial void OnIsAutomatedOnlyModeChanged(bool value)
	{
		OnPropertyChanged(nameof(ShowManualWorkspace));
		OnPropertyChanged(nameof(ShowAutomatedWorkspace));
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
			return;
		}

		PopulateSelectedDuplicateComparison(value);
		ReviewNotes = value.DecisionNote ?? string.Empty;

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

	private void SetSelectedMergeDecision(string decision, string lifecycleState, string ownerName, string ownerTeam, string decisionReason)
	{
		try
		{
			if (SelectedDuplicateReviewItem is null)
			{
				StatusMessage = "Select a duplicate group in Review Queue first.";
				return;
			}

			if (string.IsNullOrWhiteSpace(ownerName))
			{
				StatusMessage = "Assign an owner before approving or rejecting this group.";
				return;
			}

			if (decision == "rejected" && string.IsNullOrWhiteSpace(decisionReason))
			{
				StatusMessage = "Enter a rejection reason in Notes before rejecting.";
				return;
			}

			SelectedDuplicateReviewItem.OwnerName = ownerName.Trim();
			SelectedDuplicateReviewItem.OwnerTeam = string.IsNullOrWhiteSpace(ownerTeam) ? "AR Ops" : ownerTeam.Trim();

			SelectedDuplicateReviewItem.DecisionStatus = decision;
			SelectedDuplicateReviewItem.LifecycleState = lifecycleState;
			var notePrefix = string.IsNullOrWhiteSpace(decisionReason)
				? decision
				: decisionReason.Trim();
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
		// Notes are edited in decision and email preview dialogs.
	}

	partial void OnIsRejectDecisionFlowChanged(bool value)
	{
		OnPropertyChanged(nameof(IsDecisionReasonVisible));
		OnPropertyChanged(nameof(DecisionDialogTitle));
		OnPropertyChanged(nameof(DecisionDialogInstruction));
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
