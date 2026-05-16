const fs = require("fs");
const path = require("path");

const fallbackConfig = {
  businessName: "Demo Remodeling Co.",
  crmWebhookUrl: "https://hooks.zapier.com/hooks/catch/11917962/4obo9l1/",
  crmWebhookEnabled: true,
  fields: {
    projectType: {
      options: [
        { value: "kitchen", label: "Kitchen remodel" },
        { value: "bathroom", label: "Bathroom remodel" },
        { value: "basement", label: "Basement" },
        { value: "landscaping", label: "Landscaping" },
        { value: "deck", label: "Deck or patio" },
        { value: "whole_home", label: "Whole-home renovation" },
        { value: "other", label: "Other" }
      ]
    },
    timeline: {
      options: [
        { value: "exploring", label: "Just starting to explore" },
        { value: "planning", label: "Comparing ideas and prices" },
        { value: "soon", label: "Ready to hire soon" },
        { value: "urgent", label: "Need the work done urgently" }
      ]
    },
    spaceSize: {
      options: [
        { value: "small", label: "Small" },
        { value: "medium", label: "Medium" },
        { value: "large", label: "Large" },
        { value: "extra_large", label: "Extra large" }
      ]
    },
    scope: {
      options: [
        { value: "refresh", label: "Light refresh" },
        { value: "partial", label: "Partial remodel" },
        { value: "full", label: "Full teardown" },
        { value: "structural", label: "Heavy or structural work" }
      ]
    },
    homeAge: {
      options: [
        { value: "newer", label: "Less than 15 years" },
        { value: "established", label: "15-40 years" },
        { value: "older", label: "40-75 years" },
        { value: "historic", label: "75+ years" }
      ]
    },
    budget: {
      options: [
        { value: "under_10k", label: "Under $10k" },
        { value: "10k_25k", label: "$10k-$25k" },
        { value: "25k_50k", label: "$25k-$50k" },
        { value: "50k_100k", label: "$50k-$100k" },
        { value: "100k_plus", label: "$100k+" },
        { value: "unknown", label: "I don't know yet" }
      ]
    }
  },
  estimate: {
    baseRanges: {
      kitchen: [25000, 85000],
      bathroom: [12000, 45000],
      basement: [30000, 90000],
      landscaping: [8000, 60000],
      deck: [10000, 55000],
      whole_home: [90000, 300000],
      other: [10000, 75000]
    },
    multipliers: {
      spaceSize: { small: 0.8, medium: 1, large: 1.35, extra_large: 1.7 },
      scope: { refresh: 0.75, partial: 1, full: 1.45, structural: 1.9 },
      homeAge: { newer: 1, established: 1.08, older: 1.18, historic: 1.32 }
    }
  },
  scoring: {
    budget: { under_10k: 4, "10k_25k": 9, "25k_50k": 16, "50k_100k": 22, "100k_plus": 25, unknown: 10 },
    timeline: { exploring: 5, planning: 10, soon: 17, urgent: 20 },
    scope: { refresh: 8, partial: 13, full: 18, structural: 20 },
    spaceSize: { small: 7, medium: 11, large: 15, extra_large: 18 },
    contact: { postalCode: 7, phone: 10 },
    tiers: [
      { min: 80, label: "Priority Lead" },
      { min: 60, label: "Qualified Lead" },
      { min: 40, label: "Nurture Lead" },
      { min: 0, label: "Low Fit" }
    ]
  }
};

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
    return fallbackConfig;
  }

  return {
    ...fallbackConfig,
    ...JSON.parse(fs.readFileSync(filePath, "utf8"))
  };
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
