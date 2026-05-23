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

		using var command = connection.CreateCommand();
		command.CommandText = "SELECT invoice_id, customer_id, amount_raw, currency, status, due_date FROM invoices";

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
			});
		}

		return rows;
	}

	public IReadOnlyList<DuplicateCandidate> FindDuplicateCustomers(IEnumerable<CustomerRecord> customers)
	{
		var grouped = customers
			.Select(c => new { Customer = c, NormalizedEmail = NormalizeEmail(c.Email) })
			.Where(item => !string.IsNullOrWhiteSpace(item.NormalizedEmail))
			.GroupBy(item => item.NormalizedEmail)
			.Where(group => group.Count() > 1)
			.OrderBy(group => group.Key)
			.ToList();

		var output = new List<DuplicateCandidate>();
		var groupNumber = 1;

		foreach (var group in grouped)
		{
			foreach (var item in group.OrderBy(x => x.Customer.CustomerId))
			{
				output.Add(new DuplicateCandidate
				{
					DuplicateGroup = groupNumber,
					CustomerId = item.Customer.CustomerId,
					CompanyName = item.Customer.CompanyName,
					Email = item.Customer.Email,
					NormalizedEmail = item.NormalizedEmail,
					AccountTier = item.Customer.AccountTier,
				});
			}

			groupNumber++;
		}

		return output;
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
				AmountRaw = invoice.AmountRaw,
				AmountNormalized = normalized.Amount,
				ParseStatus = normalized.ParseStatus,
				FailureReason = normalized.FailureReason,
			});
		}

		return output;
	}

	public CleanupRunResult RunCleanupPipeline(
		string dbPath,
		string outputDir,
		string actor,
		IReadOnlyList<DuplicateCandidate>? precomputedDuplicates = null,
		IReadOnlyList<NormalizedInvoice>? precomputedInvoices = null)
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

		WriteDuplicateCsv(duplicatesPath, duplicates);
		WriteInvoiceCsv(invoicesPath, normalizedInvoices);

		var summary = new
		{
			run_id = runId,
			db_path = dbPath,
			duplicate_count = duplicateCount,
			invoice_total = invoiceTotal,
			invoice_normalized_count = invoiceNormalizedCount,
			invoice_invalid_count = invoiceInvalidCount,
			invoice_empty_count = invoiceEmptyCount,
			actor,
		};

		File.WriteAllText(summaryPath, JsonSerializer.Serialize(summary, new JsonSerializerOptions
		{
			WriteIndented = true,
		}));

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

	private static void WriteDuplicateCsv(string path, IReadOnlyList<DuplicateCandidate> rows)
	{
		var lines = new List<string>
		{
			"duplicate_group,customer_id,company_name,email,normalized_email,account_tier"
		};

		lines.AddRange(rows.Select(row => string.Join(",",
			row.DuplicateGroup,
			row.CustomerId,
			EscapeCsv(row.CompanyName),
			EscapeCsv(row.Email),
			EscapeCsv(row.NormalizedEmail),
			EscapeCsv(row.AccountTier))));

		File.WriteAllLines(path, lines, Encoding.UTF8);
	}

	private static void WriteInvoiceCsv(string path, IReadOnlyList<NormalizedInvoice> rows)
	{
		var lines = new List<string>
		{
			"invoice_id,customer_id,amount_raw,amount_normalized,parse_status,failure_reason"
		};

		lines.AddRange(rows.Select(row => string.Join(",",
			row.InvoiceId,
			row.CustomerId,
			EscapeCsv(row.AmountRaw),
			row.AmountNormalized?.ToString(CultureInfo.InvariantCulture) ?? string.Empty,
			EscapeCsv(row.ParseStatus),
			EscapeCsv(row.FailureReason))));

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
