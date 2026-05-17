const fs = require("fs");
const path = require("path");

function money(value) {
  return Math.round(value / 500) * 500;
}

function calculateLead(answers, config) {
  const baseRanges = config.estimate?.baseRanges || {};
  const multipliers = config.estimate?.multipliers || {};
  const scoring = config.scoring || {};
  const base = baseRanges[answers.projectType] || baseRanges.other || [10000, 75000];
  const multiplier =
    (multipliers.spaceSize?.[answers.spaceSize] || 1) *
    (multipliers.scope?.[answers.scope] || 1) *
    (multipliers.homeAge?.[answers.homeAge] || 1);

  const estimateLow = money(base[0] * multiplier);
  const estimateHigh = money(base[1] * multiplier);

  const hasPostalCode = answers.postalCode && answers.postalCode.trim().length >= 5;
  const hasPhone = answers.phone && answers.phone.trim().length >= 7;
  const contactScore =
    (hasPostalCode ? scoring.contact?.postalCode || 0 : 0) +
    (hasPhone ? scoring.contact?.phone || 0 : 0);
  const score = Math.min(
    100,
    (scoring.budget?.[answers.budget] || 0) +
      (scoring.timeline?.[answers.timeline] || 0) +
      (scoring.scope?.[answers.scope] || 0) +
      (scoring.spaceSize?.[answers.spaceSize] || 0) +
      contactScore
  );

  const tiers = scoring.tiers || [{ min: 0, label: "Low Fit" }];
  const tier = tiers.find(item => score >= item.min)?.label || "Low Fit";

  return { score, tier, estimateLow, estimateHigh };
}

function readCompanyConfig(companyId) {
  const safeCompanyId = String(companyId || "demo-remodeling").replace(/[^a-z0-9-_]/gi, "");
  const filePath = path.join(process.cwd(), "companies", `${safeCompanyId}.json`);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Company config not found: ${safeCompanyId}`);
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function optionLabel(config, fieldName, value) {
  return config.fields?.[fieldName]?.options?.find(option => option.value === value)?.label || value;
}

function leadLabels(answers, config) {
  return {
    projectType: optionLabel(config, "projectType", answers.projectType),
    timeline: optionLabel(config, "timeline", answers.timeline),
    spaceSize: optionLabel(config, "spaceSize", answers.spaceSize),
    scope: optionLabel(config, "scope", answers.scope),
    homeAge: optionLabel(config, "homeAge", answers.homeAge),
    budget: optionLabel(config, "budget", answers.budget)
  };
}

function buildCrmPayload(lead, config) {
  const labels = leadLabels(lead.answers, config);
  const ai = lead.aiAnalysis || {};

  return {
    source: "Lead Qualification System",
    businessName: config.businessName || "",
    leadId: lead.id,
    createdAt: lead.createdAt,
    name: lead.answers.name,
    phone: lead.answers.phone,
    message: lead.answers.message || "",
    postalCode: lead.answers.postalCode,
    projectType: labels.projectType,
    timeline: labels.timeline,
    spaceSize: labels.spaceSize,
    scope: labels.scope,
    homeAge: labels.homeAge,
    budget: labels.budget,
    estimateLow: lead.qualification.estimateLow,
    estimateHigh: lead.qualification.estimateHigh,
    leadScore: lead.qualification.score,
    leadTier: lead.qualification.tier,
    aiSummary: ai.summary || "",
    aiSalesNotes: ai.salesNotes || "",
    aiRiskFlags: Array.isArray(ai.riskFlags) ? ai.riskFlags.join(", ") : ai.riskFlags || "",
    aiTalkingPoints: Array.isArray(ai.talkingPoints) ? ai.talkingPoints.join("\n") : ai.talkingPoints || "",
    aiRecommendedFollowUp: ai.recommendedFollowUp || ""
  };
}

function emptyAiAnalysis() {
  return {
    summary: "",
    salesNotes: "",
    riskFlags: [],
    talkingPoints: [],
    recommendedFollowUp: ""
  };
}

function parseOpenAiText(result) {
  if (typeof result.output_text === "string") return result.output_text;

  const output = Array.isArray(result.output) ? result.output : [];
  const textParts = [];

  output.forEach(item => {
    const content = Array.isArray(item.content) ? item.content : [];
    content.forEach(part => {
      if (typeof part.text === "string") textParts.push(part.text);
    });
  });

  return textParts.join("\n");
}

async function analyzeLead(lead, config) {
  if (!process.env.OPENAI_API_KEY) {
    console.warn("OPENAI_API_KEY is not configured; skipping AI analysis.");
    return emptyAiAnalysis();
  }

  const labels = leadLabels(lead.answers, config);
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5.2",
      input: [
        {
          role: "system",
          content:
            "You analyze contractor remodeling leads. Return only valid JSON with concise, useful sales notes. Do not make legal, financial, or guaranteed pricing claims."
        },
        {
          role: "user",
          content: JSON.stringify({
            businessName: config.businessName || "",
            lead: {
              name: lead.answers.name,
              postalCode: lead.answers.postalCode,
              projectType: labels.projectType,
              timeline: labels.timeline,
              spaceSize: labels.spaceSize,
              scope: labels.scope,
              homeAge: labels.homeAge,
              budget: labels.budget,
              message: lead.answers.message || "",
              qualification: lead.qualification
            },
            requiredJsonShape: {
              summary: "One sentence summary of the lead.",
              salesNotes: "Helpful private notes for the business owner.",
              riskFlags: ["Potential concerns or empty array."],
              talkingPoints: ["Useful follow-up talking points."],
              recommendedFollowUp: "Suggested next step."
            }
          })
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "lead_ai_analysis",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              summary: { type: "string" },
              salesNotes: { type: "string" },
              riskFlags: {
                type: "array",
                items: { type: "string" }
              },
              talkingPoints: {
                type: "array",
                items: { type: "string" }
              },
              recommendedFollowUp: { type: "string" }
            },
            required: ["summary", "salesNotes", "riskFlags", "talkingPoints", "recommendedFollowUp"]
          }
        }
      }
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI analysis failed with ${response.status}: ${detail}`);
  }

  const result = await response.json();
  const text = parseOpenAiText(result);
  if (!text) {
    throw new Error("OpenAI analysis response did not include output text");
  }

  return { ...emptyAiAnalysis(), ...JSON.parse(text) };
}

async function sendToCrm(lead, config) {
  if (!config.crmWebhookEnabled || !config.crmWebhookUrl) {
    return { skipped: true, reason: "CRM webhook is not enabled" };
  }

  const response = await fetch(config.crmWebhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildCrmPayload(lead, config))
  });

  if (!response.ok) {
    throw new Error(`CRM webhook failed with ${response.status}`);
  }

  return { skipped: false, status: response.status };
}

async function getAirtableFieldNames(baseId, tableId, token) {
  const response = await fetch(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Airtable schema lookup failed with ${response.status}: ${detail}`);
  }

  const schema = await response.json();
  const table = schema.tables?.find(item => item.id === tableId || item.name === tableId);

  if (!table) {
    throw new Error(`Airtable table not found in base: ${tableId}`);
  }

  return new Set((table.fields || []).map(field => field.name));
}

function buildAirtableFields(lead, config, availableFieldNames) {
  const payload = buildCrmPayload(lead, config);
  const fieldMap = config.airtable?.fieldMap || {};
  const fields = {};
  const missingFields = [];

  Object.entries(fieldMap).forEach(([payloadKey, airtableFieldName]) => {
    if (!airtableFieldName) return;

    const value = payload[payloadKey];
    if (value === undefined || value === null) return;

    if (availableFieldNames && !availableFieldNames.has(airtableFieldName)) {
      missingFields.push(airtableFieldName);
      return;
    }

    fields[airtableFieldName] = value;
  });

  if (missingFields.length) {
    console.warn("Skipped Airtable fields that do not exist:", missingFields);
  }

  return fields;
}

async function sendToAirtable(lead, config) {
  const baseId = config.airtable?.baseId;
  const tableId = config.airtable?.tableId;
  const token = process.env.AIRTABLE_TOKEN;

  if (!baseId || !tableId) {
    return { skipped: true, reason: "Airtable destination is not configured" };
  }

  if (!token) {
    throw new Error("AIRTABLE_TOKEN is not configured");
  }

  const availableFieldNames = await getAirtableFieldNames(baseId, tableId, token);
  const fields = buildAirtableFields(lead, config, availableFieldNames);
  if (!Object.keys(fields).length) {
    throw new Error("Airtable field map has no fields matching the destination table");
  }

  const response = await fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableId)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      records: [{ fields }],
      typecast: true
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Airtable delivery failed with ${response.status}: ${detail}`);
  }

  const result = await response.json();
  return {
    skipped: false,
    status: response.status,
    recordId: result.records?.[0]?.id
  };
}

async function deliverLead(lead, config) {
  if (config.airtable?.baseId && config.airtable?.tableId) {
    return sendToAirtable(lead, config);
  }

  return sendToCrm(lead, config);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function publicSubmitResponse(lead) {
  return {
    ok: true,
    estimate: {
      estimateLow: lead.qualification.estimateLow,
      estimateHigh: lead.qualification.estimateHigh
    }
  };
}

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  try {
    const answers =
      req.body && typeof req.body === "string"
        ? JSON.parse(req.body)
        : req.body || (await readBody(req));
    const config = readCompanyConfig(answers.companyId);
    const qualification = calculateLead(answers, config);
    const lead = {
      id: `lead_${Date.now()}`,
      createdAt: new Date().toISOString(),
      answers,
      qualification,
      aiAnalysis: emptyAiAnalysis()
    };
    try {
      lead.aiAnalysis = await analyzeLead(lead, config);
    } catch (error) {
      console.error("Lead AI analysis failed:", error);
      lead.aiAnalysis = { ...emptyAiAnalysis(), error: error.message };
    }

    let delivery;
    try {
      delivery = await deliverLead(lead, config);
    } catch (error) {
      console.error("Lead delivery failed:", error);
      delivery = { skipped: false, error: error.message };
    }

    if (delivery.error || delivery.skipped) {
      res.status(502).json({
        ok: false,
        error: "Lead could not be saved. Please try again."
      });
      return;
    }

    res.status(200).json(publicSubmitResponse(lead));
  } catch (error) {
    res.status(400).json({ ok: false, error: "Could not process lead", detail: error.message });
  }
};
