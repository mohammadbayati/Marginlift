function parseCSV(text) {
  const input = String(text || "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        field += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field);
      field = "";
      if (row.some(value => value.trim() !== "")) rows.push(row);
      row = [];
      continue;
    }

    field += char;
  }

  row.push(field);
  if (row.some(value => value.trim() !== "")) rows.push(row);

  if (rows.length < 2) {
    throw new Error("CSV باید حداقل یک ردیف داده داشته باشد.");
  }

  const headers = rows[0].map(value => normalizeHeader(value));
  return rows.slice(1).map(values => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = (values[index] || "").trim();
    });
    return record;
  });
}

function normalizeHeader(value) {
  return String(value || "").trim().toLowerCase();
}

function toNumber(value, fallback = 0) {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  const normalized = String(value || "")
    .replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/,/g, "")
    .trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeCampaignRows(rows) {
  return rows.map((row, index) => ({
    segmentFa: required(row.segment_fa || row.segment || row.segment_name, "segment_fa", index),
    group: required(row.campaign_group || row.group || row.treatment, "campaign_group", index),
    users: toNumber(required(row.users, "users", index)),
    conversionRate: toNumber(required(row.conversion_rate || row.conversion, "conversion_rate", index)),
    costPerUser: toNumber(row.incentive_cost_per_user_toman || row.cost_per_user || row.cost_per_user_toman),
    estimatedRevenue: toNumber(row.estimated_revenue_toman || row.revenue || row.revenue_toman),
    incrementalLiftPoints: toNumber(row.incremental_lift_points || row.uplift || row.lift),
    recommendedActionFa: row.recommended_action_fa || row.recommended_action || ""
  }));
}

function required(value, field, index) {
  if (value === undefined || value === null || String(value).trim() === "") {
    throw new Error(`ستون ${field} در ردیف ${index + 2} خالی است.`);
  }
  return value;
}

module.exports = {
  normalizeCampaignRows,
  parseCSV,
  toNumber
};
