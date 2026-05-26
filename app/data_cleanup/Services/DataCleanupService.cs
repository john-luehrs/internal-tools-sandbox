using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using data_cleanup.Models;
using Microsoft.Data.Sqlite;

namespace data_cleanup.Services;

public sealed class DataCleanupService
{
	private static readonly Regex CurrencyChars = new("[^\\d.\\-]", RegexOptions.Compiled);

	public string ResolveDefaultDbPath()
	{
		var root = ResolveWorkspaceRoot();
		return Path.Combine(root, "db", "finance.db");
	}

	public string ResolveDefaultOutputDir()
	{
		var root = ResolveWorkspaceRoot();
		return Path.Combine(root, "reports", "data_cleanup");
	}

	public IReadOnlyList<CustomerRecord> LoadCustomers(string dbPath)
	{
		var rows = new List<CustomerRecord>();
		using var connection = new SqliteConnection($"Data Source={dbPath}");
		connection.Open();

		using var command = connection.CreateCommand();
		command.CommandText = "SELECT customer_id, company_name, email, account_tier FROM customers";

		using var reader = command.ExecuteReader();
		while (reader.Read())
		{
			rows.Add(new CustomerRecord
			{
				CustomerId = reader.GetInt64(0),
				CompanyName = reader.IsDBNull(1) ? string.Empty : reader.GetString(1),
				Email = reader.IsDBNull(2) ? null : reader.GetString(2),
				AccountTier = reader.IsDBNull(3) ? null : reader.GetString(3),
			});
		}

		return rows;
	}

	public IReadOnlyList<InvoiceRecord> LoadInvoices(string dbPath)
	{
		var rows = new List<InvoiceRecord>();
		using var connection = new SqliteConnection($"Data Source={dbPath}");
		connection.Open();

		var hasCreatedBy = HasColumn(connection, "invoices", "created_by");

		using var command = connection.CreateCommand();
		command.CommandText = hasCreatedBy
			? "SELECT invoice_id, customer_id, amount_raw, currency, status, due_date, created_by FROM invoices"
			: "SELECT invoice_id, customer_id, amount_raw, currency, status, due_date, '' AS created_by FROM invoices";

		using var reader = command.ExecuteReader();
		while (reader.Read())
		{
			rows.Add(new InvoiceRecord
			{
				InvoiceId = reader.GetInt64(0),
				CustomerId = reader.GetInt64(1),
				AmountRaw = reader.IsDBNull(2) ? null : reader.GetString(2),
				Currency = reader.IsDBNull(3) ? null : reader.GetString(3),
				Status = reader.IsDBNull(4) ? null : reader.GetString(4),
				DueDate = reader.IsDBNull(5) ? null : reader.GetString(5),
				CreatedBy = reader.IsDBNull(6) ? null : reader.GetString(6),
			});
		}

		return rows;
	}

	public IReadOnlyList<DuplicateCandidate> FindDuplicateCustomers(IEnumerable<CustomerRecord> customers)
	{
		var customerRows = customers.ToList();
		var output = new List<DuplicateCandidate>();
		var seenCustomerIds = new HashSet<long>();
		var groupNumber = 1;

		var groupedByEmail = customerRows
			.Select(c => new { Customer = c, NormalizedEmail = NormalizeEmail(c.Email) })
			.Where(item => !string.IsNullOrWhiteSpace(item.NormalizedEmail))
			.GroupBy(item => item.NormalizedEmail)
			.Where(group => group.Count() > 1)
			.OrderBy(group => group.Key)
			.ToList();

		foreach (var group in groupedByEmail)
		{
			AppendDuplicateGroup(
				output,
				groupNumber,
				group.Select(item => item.Customer),
				group.Key,
				seenCustomerIds);

			groupNumber++;
		}

		var groupedByCompanyTier = customerRows
			.Select(c => new
			{
				Customer = c,
				NormalizedCompany = NormalizeCompany(c.CompanyName),
				NormalizedTier = NormalizeTier(c.AccountTier),
				NormalizedEmail = NormalizeEmail(c.Email),
			})
			.Where(item => !string.IsNullOrWhiteSpace(item.NormalizedCompany) && !string.IsNullOrWhiteSpace(item.NormalizedTier))
			.GroupBy(item => $"{item.NormalizedCompany}|{item.NormalizedTier}")
			.Where(group => group.Count() > 1)
			.Where(group => group.Select(item => item.NormalizedEmail).Where(email => !string.IsNullOrWhiteSpace(email)).Distinct().Count() > 1)
			.Where(group => group.Any(item => !seenCustomerIds.Contains(item.Customer.CustomerId)))
			.OrderBy(group => group.Key)
			.ToList();

		foreach (var group in groupedByCompanyTier)
		{
			var keyParts = group.Key.Split('|');
			var companyTierKey = $"company_tier:{keyParts[0]}|{keyParts[1]}";

			AppendDuplicateGroup(
				output,
				groupNumber,
				group.Select(item => item.Customer),
				companyTierKey,
				seenCustomerIds);

			groupNumber++;
		}

		return output;
	}

	private static void AppendDuplicateGroup(
		List<DuplicateCandidate> output,
		int groupNumber,
		IEnumerable<CustomerRecord> customers,
		string groupingSignal,
		ISet<long> seenCustomerIds)
	{
		var rows = customers.OrderBy(item => item.CustomerId).ToList();
		if (rows.Count < 2)
		{
			return;
		}

		var confidenceScore = ComputeDuplicateConfidenceScore(rows);
		var confidenceLabel = ResolveConfidenceLabel(confidenceScore);
		var riskLabel = ResolveRiskLabel(rows);

		foreach (var customer in rows)
		{
			output.Add(new DuplicateCandidate
			{
				DuplicateGroup = groupNumber,
				CustomerId = customer.CustomerId,
				CompanyName = customer.CompanyName,
				Email = customer.Email,
				NormalizedEmail = groupingSignal,
				AccountTier = customer.AccountTier,
				ConfidenceScore = confidenceScore,
				ConfidenceLabel = confidenceLabel,
				RiskLabel = riskLabel,
			});

			seenCustomerIds.Add(customer.CustomerId);
		}
	}

	public IReadOnlyList<DuplicateReviewItem> BuildDuplicateReviewQueue(IEnumerable<DuplicateCandidate> duplicates)
	{
		var queue = duplicates
			.GroupBy(item => item.DuplicateGroup)
			.OrderBy(group => group.Key)
			.Select(group =>
			{
				var rows = group.OrderBy(item => item.CustomerId).ToList();
				var first = rows.First();
				var emailSummary = BuildGroupEmailSummary(rows);

				return new DuplicateReviewItem
				{
					DuplicateGroup = group.Key,
					NormalizedEmail = emailSummary,
					CandidateCount = rows.Count,
					CustomerIds = string.Join(", ", rows.Select(item => item.CustomerId)),
					Companies = string.Join(" | ", rows.Select(item => item.CompanyName).Where(item => !string.IsNullOrWhiteSpace(item))),
					ConfidenceScore = first.ConfidenceScore,
					ConfidenceLabel = first.ConfidenceLabel,
					RiskLabel = first.RiskLabel,
				};
			})
			.ToList();

		return queue;
	}

	private static string BuildGroupEmailSummary(IReadOnlyList<DuplicateCandidate> rows)
	{
		var emails = rows
			.Select(item => NormalizeEmail(item.Email))
			.Where(item => !string.IsNullOrWhiteSpace(item))
			.Distinct(StringComparer.OrdinalIgnoreCase)
			.OrderBy(item => item)
			.ToList();

		if (emails.Count == 0)
		{
			return string.Empty;
		}

		if (emails.Count == 1)
		{
			return emails[0];
		}

		return string.Join(" | ", emails);
	}

	public IReadOnlyList<DuplicateReviewItem> ApplyWorkflowState(string outputDir, IEnumerable<DuplicateReviewItem> queue)
	{
		var path = ResolveWorkflowStatePath(outputDir);
		if (!File.Exists(path))
		{
			return queue.ToList();
		}

		var json = File.ReadAllText(path);
		var state = JsonSerializer.Deserialize<List<WorkflowStateRecord>>(json) ?? [];
		var stateByGroup = state.ToDictionary(item => item.DuplicateGroup);

		var merged = queue.Select(item =>
		{
			if (!stateByGroup.TryGetValue(item.DuplicateGroup, out var saved))
			{
				return item;
			}

			item.DecisionStatus = saved.DecisionStatus;
			item.DecisionNote = saved.DecisionNote;
			item.LifecycleState = saved.LifecycleState;
			item.OwnerName = saved.OwnerName;
			item.OwnerTeam = string.IsNullOrWhiteSpace(saved.OwnerTeam) ? "AR Ops" : saved.OwnerTeam;
			item.UpdatedUtc = saved.UpdatedUtc ?? string.Empty;
			return item;
		}).ToList();

		return merged;
	}

	public void SaveWorkflowState(string outputDir, IEnumerable<DuplicateReviewItem> queue)
	{
		Directory.CreateDirectory(outputDir);
		var path = ResolveWorkflowStatePath(outputDir);
		var payload = queue
			.OrderBy(item => item.DuplicateGroup)
			.Select(item => new WorkflowStateRecord
			{
				DuplicateGroup = item.DuplicateGroup,
				NormalizedEmail = item.NormalizedEmail,
				LifecycleState = item.LifecycleState,
				DecisionStatus = item.DecisionStatus,
				DecisionNote = item.DecisionNote,
				OwnerName = item.OwnerName,
				OwnerTeam = item.OwnerTeam,
				UpdatedUtc = item.UpdatedUtc,
			})
			.ToList();

		File.WriteAllText(path, JsonSerializer.Serialize(payload, new JsonSerializerOptions
		{
			WriteIndented = true,
		}));
	}

	public string ExportActionTemplate(string outputDir, IEnumerable<DuplicateReviewItem> queue)
	{
		Directory.CreateDirectory(outputDir);
		var exportDir = Path.Combine(outputDir, "action_exports");
		Directory.CreateDirectory(exportDir);

		var runId = DateTime.UtcNow.ToString("yyyyMMddTHHmmssZ", CultureInfo.InvariantCulture);
		var path = Path.Combine(exportDir, $"ar_actions_{runId}.csv");

		var lines = new List<string>
		{
			"duplicate_group,normalized_email,candidate_count,lifecycle_state,owner_name,owner_team,confidence_label,risk_label,decision_status,decision_note,updated_utc"
		};

		lines.AddRange(queue
			.OrderBy(item => item.DuplicateGroup)
			.Select(item => string.Join(",",
				item.DuplicateGroup,
				EscapeCsv(item.NormalizedEmail),
				item.CandidateCount,
				EscapeCsv(item.LifecycleState),
				EscapeCsv(item.OwnerName),
				EscapeCsv(item.OwnerTeam),
				EscapeCsv(item.ConfidenceLabel),
				EscapeCsv(item.RiskLabel),
				EscapeCsv(item.DecisionStatus),
				EscapeCsv(item.DecisionNote),
				EscapeCsv(item.UpdatedUtc))));

		File.WriteAllLines(path, lines, Encoding.UTF8);
		return path;
	}

	public IReadOnlyList<NormalizedInvoice> NormalizeInvoices(IEnumerable<InvoiceRecord> invoices)
	{
		var output = new List<NormalizedInvoice>();

		foreach (var invoice in invoices)
		{
			var normalized = NormalizeAmount(invoice.AmountRaw);
			output.Add(new NormalizedInvoice
			{
				InvoiceId = invoice.InvoiceId,
				CustomerId = invoice.CustomerId,
				InvoiceAuthor = string.IsNullOrWhiteSpace(invoice.CreatedBy) ? "unknown_author" : invoice.CreatedBy.Trim(),
				AmountRaw = invoice.AmountRaw,
				AmountNormalized = normalized.Amount,
				ParseStatus = normalized.ParseStatus,
				FailureReason = normalized.FailureReason,
				ReviewStatus = "unflagged",
			});
		}

		return output;
	}

	public CleanupRunResult RunCleanupPipeline(
		string dbPath,
		string outputDir,
		string actor,
		IReadOnlyList<DuplicateCandidate>? precomputedDuplicates = null,
		IReadOnlyList<NormalizedInvoice>? precomputedInvoices = null,
		IReadOnlyList<DuplicateReviewItem>? reviewQueue = null,
		IReadOnlyList<NormalizedInvoice>? flaggedInvoices = null)
	{
		Directory.CreateDirectory(outputDir);

		var runId = DateTime.UtcNow.ToString("yyyyMMddTHHmmssZ", CultureInfo.InvariantCulture);
		var duplicates = precomputedDuplicates ?? FindDuplicateCustomers(LoadCustomers(dbPath));
		var normalizedInvoices = precomputedInvoices ?? NormalizeInvoices(LoadInvoices(dbPath));

		var duplicateCount = duplicates.Count;
		var invoiceTotal = normalizedInvoices.Count;
		var invoiceNormalizedCount = normalizedInvoices.Count(x => x.ParseStatus == "normalized");
		var invoiceInvalidCount = normalizedInvoices.Count(x => x.ParseStatus == "invalid");
		var invoiceEmptyCount = normalizedInvoices.Count(x => x.ParseStatus == "empty");

		var duplicatesPath = Path.Combine(outputDir, $"duplicates_{runId}.csv");
		var invoicesPath = Path.Combine(outputDir, $"invoice_normalization_{runId}.csv");
		var summaryPath = Path.Combine(outputDir, $"summary_{runId}.json");
		var arLeadDigestPath = Path.Combine(outputDir, $"ar_lead_digest_{runId}.md");

		var reviewRows = reviewQueue?.ToList() ?? BuildDuplicateReviewQueue(duplicates).ToList();
		var invoiceRowsForRouting = flaggedInvoices?.ToList() ?? normalizedInvoices
			.Where(item => item.ParseStatus == "invalid" && item.ReviewStatus == "flagged")
			.ToList();
		var arActionReportPath = ExportActionTemplate(outputDir, reviewRows);

		WriteDuplicateCsv(duplicatesPath, duplicates);
		WriteInvoiceCsv(invoicesPath, normalizedInvoices);

		var mergeCandidates = reviewRows
			.Where(item => item.DecisionStatus == "approved" || item.LifecycleState == "approved")
			.Select(item => new
			{
				duplicate_group = item.DuplicateGroup,
				customer_ids = ParseCustomerIds(item.CustomerIds),
				normalized_email = item.NormalizedEmail,
				ar_assignee = item.OwnerName ?? "unassigned",
				confidence_label = item.ConfidenceLabel,
				risk_label = item.RiskLabel,
				state = item.LifecycleState,
			})
			.ToList();

		var rejectedCandidates = reviewRows
			.Where(item => item.DecisionStatus == "rejected" || item.LifecycleState == "rejected")
			.Select(item => new
			{
				duplicate_group = item.DuplicateGroup,
				customer_ids = ParseCustomerIds(item.CustomerIds),
				reason = string.IsNullOrWhiteSpace(item.DecisionNote) ? "manual_review_required" : item.DecisionNote,
				assignee_candidate = item.OwnerName ?? "unassigned",
				state = item.LifecycleState,
			})
			.ToList();

		var flaggedInvoiceAssignments = invoiceRowsForRouting
			.Where(item => item.ReviewStatus == "flagged")
			.Select(item => new
			{
				invoice_id = item.InvoiceId,
				customer_id = item.CustomerId,
				assignee = string.IsNullOrWhiteSpace(item.ReviewOwner) ? "unassigned" : item.ReviewOwner,
				invoice_author = item.InvoiceAuthor,
				failure_reason = item.FailureReason,
				review_status = item.ReviewStatus,
			})
			.ToList();

		var summary = new
		{
			run_id = runId,
			db_path = dbPath,
			actor,
			overall_picture = new
			{
				duplicate_count = duplicateCount,
				invoice_total = invoiceTotal,
				invoice_normalized_count = invoiceNormalizedCount,
				invoice_invalid_count = invoiceInvalidCount,
				invoice_empty_count = invoiceEmptyCount,
				review_queue_total = reviewRows.Count,
				merge_candidates_count = mergeCandidates.Count,
				rejected_candidates_count = rejectedCandidates.Count,
				flagged_invoices_count = flaggedInvoiceAssignments.Count,
			},
			ar_routing = new
			{
				merge_candidates = mergeCandidates,
				rejected_candidates = rejectedCandidates,
				flagged_invoices = flaggedInvoiceAssignments,
			},
			artifacts = new
			{
				duplicates_path = duplicatesPath,
				invoices_path = invoicesPath,
				ar_action_report_path = arActionReportPath,
				ar_lead_digest_path = arLeadDigestPath,
			},
		};

		File.WriteAllText(summaryPath, JsonSerializer.Serialize(summary, new JsonSerializerOptions
		{
			WriteIndented = true,
		}));

		WriteArLeadDigest(
			arLeadDigestPath,
			runId,
			actor,
			duplicateCount,
			invoiceTotal,
			invoiceInvalidCount,
			invoiceEmptyCount,
			mergeCandidates,
			rejectedCandidates,
			flaggedInvoiceAssignments,
			arActionReportPath,
			summaryPath);

		AppendAuditEvent(outputDir, actor, "data_cleanup_run", runId, new Dictionary<string, object>
		{
			["duplicate_count"] = duplicateCount,
			["invoice_total"] = invoiceTotal,
			["invoice_invalid_count"] = invoiceInvalidCount,
		});

		return new CleanupRunResult
		{
			RunId = runId,
			DuplicateCount = duplicateCount,
			InvoiceTotal = invoiceTotal,
			InvoiceNormalizedCount = invoiceNormalizedCount,
			InvoiceInvalidCount = invoiceInvalidCount,
			InvoiceEmptyCount = invoiceEmptyCount,
			DuplicatesPath = duplicatesPath,
			InvoicesPath = invoicesPath,
			SummaryPath = summaryPath,
			ArActionReportPath = arActionReportPath,
			ArLeadDigestPath = arLeadDigestPath,
		};
	}

	public void AppendAuditEvent(
		string outputDir,
		string actor,
		string action,
		string entityId,
		IReadOnlyDictionary<string, object>? metadata = null)
	{
		Directory.CreateDirectory(outputDir);
		var path = Path.Combine(outputDir, "audit_log.jsonl");

		var payload = new Dictionary<string, object?>
		{
			["timestamp_utc"] = DateTime.UtcNow.ToString("O", CultureInfo.InvariantCulture),
			["actor"] = actor,
			["action"] = action,
			["entity_id"] = entityId,
			["metadata"] = metadata,
		};

		File.AppendAllText(path, JsonSerializer.Serialize(payload) + Environment.NewLine);
	}

	private static string NormalizeEmail(string? email)
	{
		if (string.IsNullOrWhiteSpace(email))
		{
			return string.Empty;
		}

		return email.Trim().ToLowerInvariant();
	}

	private static string NormalizeCompany(string? companyName)
	{
		if (string.IsNullOrWhiteSpace(companyName))
		{
			return string.Empty;
		}

		return companyName.Trim().ToLowerInvariant();
	}

	private static string NormalizeTier(string? tier)
	{
		if (string.IsNullOrWhiteSpace(tier))
		{
			return string.Empty;
		}

		return tier.Trim().ToLowerInvariant();
	}

	private static (decimal? Amount, string ParseStatus, string? FailureReason) NormalizeAmount(string? amountRaw)
	{
		if (string.IsNullOrWhiteSpace(amountRaw))
		{
			return (null, "empty", "missing_amount");
		}

		var cleaned = CurrencyChars.Replace(amountRaw.Trim(), string.Empty);
		if (!cleaned.Any(char.IsDigit))
		{
			return (null, "invalid", "no_numeric_content");
		}

		if (cleaned.Count(c => c == '.') > 1)
		{
			return (null, "invalid", "invalid_decimal_format");
		}

		if (decimal.TryParse(cleaned, NumberStyles.Number | NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out var parsed))
		{
			return (parsed, "normalized", null);
		}

		return (null, "invalid", "parse_failed");
	}

	private static int ComputeDuplicateConfidenceScore(IEnumerable<CustomerRecord> group)
	{
		var rows = group.ToList();
		if (rows.Count == 0)
		{
			return 0;
		}

		var score = 50 + (rows.Count * 10);
		var normalizedCompanyNames = rows
			.Select(item => (item.CompanyName ?? string.Empty).Trim().ToLowerInvariant())
			.Where(item => !string.IsNullOrWhiteSpace(item))
			.Distinct()
			.ToList();

		if (normalizedCompanyNames.Count == 1)
		{
			score += 15;
		}

		if (rows.Any(item => string.Equals(item.AccountTier, "enterprise", StringComparison.OrdinalIgnoreCase)))
		{
			score += 5;
		}

		return Math.Clamp(score, 0, 99);
	}

	private static string ResolveConfidenceLabel(int confidenceScore)
	{
		if (confidenceScore >= 85)
		{
			return "high";
		}

		if (confidenceScore >= 70)
		{
			return "medium";
		}

		return "low";
	}

	private static string ResolveRiskLabel(IEnumerable<CustomerRecord> group)
	{
		var rows = group.ToList();
		if (rows.Count == 0)
		{
			return "low";
		}

		if (rows.Any(item => string.Equals(item.AccountTier, "enterprise", StringComparison.OrdinalIgnoreCase)) || rows.Count >= 4)
		{
			return "high";
		}

		if (rows.Any(item => string.Equals(item.AccountTier, "business", StringComparison.OrdinalIgnoreCase)) || rows.Count == 3)
		{
			return "medium";
		}

		return "low";
	}

	private static void WriteDuplicateCsv(string path, IReadOnlyList<DuplicateCandidate> rows)
	{
		var lines = new List<string>
		{
			"duplicate_group,customer_id,company_name,email,normalized_email,account_tier,confidence_score,confidence_label,risk_label"
		};

		lines.AddRange(rows.Select(row => string.Join(",",
			row.DuplicateGroup,
			row.CustomerId,
			EscapeCsv(row.CompanyName),
			EscapeCsv(row.Email),
			EscapeCsv(row.NormalizedEmail),
			EscapeCsv(row.AccountTier),
			row.ConfidenceScore,
			EscapeCsv(row.ConfidenceLabel),
			EscapeCsv(row.RiskLabel))));

		File.WriteAllLines(path, lines, Encoding.UTF8);
	}

	private static void WriteInvoiceCsv(string path, IReadOnlyList<NormalizedInvoice> rows)
	{
		var lines = new List<string>
		{
			"invoice_id,customer_id,invoice_author,amount_raw,amount_normalized,parse_status,failure_reason,review_status,review_owner,review_updated_utc"
		};

		lines.AddRange(rows.Select(row => string.Join(",",
			row.InvoiceId,
			row.CustomerId,
			EscapeCsv(row.InvoiceAuthor),
			EscapeCsv(row.AmountRaw),
			row.AmountNormalized?.ToString(CultureInfo.InvariantCulture) ?? string.Empty,
			EscapeCsv(row.ParseStatus),
			EscapeCsv(row.FailureReason),
			EscapeCsv(row.ReviewStatus),
			EscapeCsv(row.ReviewOwner),
			EscapeCsv(row.ReviewUpdatedUtc))));

		File.WriteAllLines(path, lines, Encoding.UTF8);
	}

	private static string EscapeCsv(string? value)
	{
		if (string.IsNullOrEmpty(value))
		{
			return string.Empty;
		}

		var escaped = value.Replace("\"", "\"\"");
		if (escaped.Contains(',') || escaped.Contains('"') || escaped.Contains('\n') || escaped.Contains('\r'))
		{
			return $"\"{escaped}\"";
		}

		return escaped;
	}

	private static bool HasColumn(SqliteConnection connection, string tableName, string columnName)
	{
		using var command = connection.CreateCommand();
		command.CommandText = $"PRAGMA table_info({tableName})";

		using var reader = command.ExecuteReader();
		while (reader.Read())
		{
			if (reader.IsDBNull(1))
			{
				continue;
			}

			var currentColumn = reader.GetString(1);
			if (string.Equals(currentColumn, columnName, StringComparison.OrdinalIgnoreCase))
			{
				return true;
			}
		}

		return false;
	}

	private static string ResolveWorkflowStatePath(string outputDir)
	{
		return Path.Combine(outputDir, "workflow_state.json");
	}

	private static IReadOnlyList<long> ParseCustomerIds(string customerIds)
	{
		if (string.IsNullOrWhiteSpace(customerIds))
		{
			return [];
		}

		return customerIds
			.Split(',')
			.Select(item => item.Trim())
			.Where(item => long.TryParse(item, out _))
			.Select(long.Parse)
			.ToList();
	}

	private static void WriteArLeadDigest(
		string path,
		string runId,
		string actor,
		int duplicateCount,
		int invoiceTotal,
		int invoiceInvalidCount,
		int invoiceEmptyCount,
		IReadOnlyList<object> mergeCandidates,
		IReadOnlyList<object> rejectedCandidates,
		IReadOnlyList<object> flaggedInvoices,
		string actionReportPath,
		string summaryPath)
	{
		var lines = new List<string>
		{
			"# AR Lead Data Cleanup Digest",
			string.Empty,
			$"Run ID: {runId}",
			$"Actor: {actor}",
			$"Generated UTC: {DateTime.UtcNow:O}",
			string.Empty,
			"## Overall Picture",
			$"- Duplicate rows detected: {duplicateCount}",
			$"- Invoice rows analyzed: {invoiceTotal}",
			$"- Invalid invoice parses: {invoiceInvalidCount}",
			$"- Empty invoice amounts: {invoiceEmptyCount}",
			string.Empty,
			"## Merge Candidate Customer IDs and AR Assignee",
			$"- Candidate groups count: {mergeCandidates.Count}",
			string.Empty,
			"## Rejected Customer IDs, Reason, and Assignee Candidate",
			$"- Rejected groups count: {rejectedCandidates.Count}",
			string.Empty,
			"## Flagged Invoice Numbers and Assignee",
			$"- Flagged invoices count: {flaggedInvoices.Count}",
			string.Empty,
			"## Artifact Paths",
			$"- AR action report: {actionReportPath}",
			$"- Structured summary: {summaryPath}",
		};

		lines.Add(string.Empty);
		lines.Add("### Merge Candidate Details");
		if (mergeCandidates.Count == 0)
		{
			lines.Add("- None");
		}
		else
		{
			foreach (var item in mergeCandidates)
			{
				lines.Add($"- {JsonSerializer.Serialize(item)}");
			}
		}

		lines.Add(string.Empty);
		lines.Add("### Rejected Candidate Details");
		if (rejectedCandidates.Count == 0)
		{
			lines.Add("- None");
		}
		else
		{
			foreach (var item in rejectedCandidates)
			{
				lines.Add($"- {JsonSerializer.Serialize(item)}");
			}
		}

		lines.Add(string.Empty);
		lines.Add("### Flagged Invoice Details");
		if (flaggedInvoices.Count == 0)
		{
			lines.Add("- None");
		}
		else
		{
			foreach (var item in flaggedInvoices)
			{
				lines.Add($"- {JsonSerializer.Serialize(item)}");
			}
		}

		File.WriteAllLines(path, lines, Encoding.UTF8);
	}

	private sealed class WorkflowStateRecord
	{
		public int DuplicateGroup { get; init; }
		public string NormalizedEmail { get; init; } = string.Empty;
		public string LifecycleState { get; init; } = "new";
		public string DecisionStatus { get; init; } = "pending";
		public string? DecisionNote { get; init; }
		public string? OwnerName { get; init; }
		public string OwnerTeam { get; init; } = "AR Ops";
		public string? UpdatedUtc { get; init; }
	}

	private static string ResolveWorkspaceRoot()
	{
		var current = new DirectoryInfo(Directory.GetCurrentDirectory());
		for (var i = 0; i < 8 && current is not null; i++)
		{
			if (Directory.Exists(Path.Combine(current.FullName, "db")) &&
				Directory.Exists(Path.Combine(current.FullName, "app")))
			{
				return current.FullName;
			}

			current = current.Parent;
		}

		return Directory.GetCurrentDirectory();
	}
}
