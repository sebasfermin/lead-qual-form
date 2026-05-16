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
    return {};
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

  return {
    source: "Lead Qualification System",
    businessName: config.businessName || "",
    leadId: lead.id,
    createdAt: lead.createdAt,
    name: lead.answers.name,
    phone: lead.answers.phone,
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
    leadTier: lead.qualification.tier
  };
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

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
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
    const answers = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const config = readCompanyConfig(answers.companyId);
    const qualification = calculateLead(answers, config);
    const lead = {
      id: `lead_${Date.now()}`,
      createdAt: new Date().toISOString(),
      answers,
      qualification
    };
    let crmDelivery;
    try {
      crmDelivery = await sendToCrm(lead, config);
    } catch (error) {
      crmDelivery = { skipped: false, error: error.message };
    }

    res.status(200).json({ ok: true, lead, crmDelivery });
  } catch (error) {
    res.status(400).json({ ok: false, error: "Could not process lead" });
  }
};
