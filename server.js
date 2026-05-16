const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "127.0.0.1";
const PUBLIC_DIR = path.join(__dirname, "public");
const LEADS_FILE = path.join(__dirname, "leads.json");
const CONFIG_FILE = path.join(__dirname, "contractor-config.json");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function money(value) {
  return Math.round(value / 500) * 500;
}

function calculateLead(answers) {
  const projectBase = {
    kitchen: [25000, 85000],
    bathroom: [12000, 45000],
    basement: [30000, 90000],
    landscaping: [8000, 60000],
    deck: [10000, 55000],
    whole_home: [90000, 300000],
    other: [10000, 75000]
  };

  const sizeMultiplier = {
    small: 0.8,
    medium: 1,
    large: 1.35,
    extra_large: 1.7
  };

  const scopeMultiplier = {
    refresh: 0.75,
    partial: 1,
    full: 1.45,
    structural: 1.9
  };

  const ageMultiplier = {
    newer: 1,
    established: 1.08,
    older: 1.18,
    historic: 1.32
  };

  const budgetScore = {
    under_10k: 4,
    "10k_25k": 9,
    "25k_50k": 16,
    "50k_100k": 22,
    "100k_plus": 25,
    unknown: 10
  };

  const timelineScore = {
    exploring: 5,
    planning: 10,
    soon: 17,
    urgent: 20
  };

  const scopeScore = {
    refresh: 8,
    partial: 13,
    full: 18,
    structural: 20
  };

  const sizeScore = {
    small: 7,
    medium: 11,
    large: 15,
    extra_large: 18
  };

  const base = projectBase[answers.projectType] || projectBase.other;
  const multiplier =
    (sizeMultiplier[answers.spaceSize] || 1) *
    (scopeMultiplier[answers.scope] || 1) *
    (ageMultiplier[answers.homeAge] || 1);

  const estimateLow = money(base[0] * multiplier);
  const estimateHigh = money(base[1] * multiplier);

  const hasPostalCode = answers.postalCode && answers.postalCode.trim().length >= 5;
  const hasPhone = answers.phone && answers.phone.trim().length >= 7;
  const contactScore = (hasPostalCode ? 7 : 0) + (hasPhone ? 10 : 0);
  const score = Math.min(
    100,
    (budgetScore[answers.budget] || 0) +
      (timelineScore[answers.timeline] || 0) +
      (scopeScore[answers.scope] || 0) +
      (sizeScore[answers.spaceSize] || 0) +
      contactScore
  );

  let tier = "Low Fit";
  if (score >= 80) tier = "Priority Lead";
  else if (score >= 60) tier = "Qualified Lead";
  else if (score >= 40) tier = "Nurture Lead";

  return { score, tier, estimateLow, estimateHigh };
}

function saveLead(lead) {
  let leads = [];
  if (fs.existsSync(LEADS_FILE)) {
    leads = JSON.parse(fs.readFileSync(LEADS_FILE, "utf8"));
  }
  leads.push(lead);
  fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2));
}

function readConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    return {};
  }

  return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
}

function leadLabels(answers) {
  const labels = {
    projectType: {
      kitchen: "Kitchen remodel",
      bathroom: "Bathroom remodel",
      basement: "Basement",
      landscaping: "Landscaping",
      deck: "Deck or patio",
      whole_home: "Whole-home renovation",
      other: "Other"
    },
    timeline: {
      exploring: "Just starting to explore",
      planning: "Comparing ideas and prices",
      soon: "Ready to hire soon",
      urgent: "Need the work done urgently"
    },
    spaceSize: {
      small: "Small",
      medium: "Medium",
      large: "Large",
      extra_large: "Extra large"
    },
    scope: {
      refresh: "Light refresh",
      partial: "Partial remodel",
      full: "Full teardown",
      structural: "Heavy or structural work"
    },
    homeAge: {
      newer: "Less than 15 years",
      established: "15-40 years",
      older: "40-75 years",
      historic: "75+ years"
    },
    budget: {
      under_10k: "Under $10k",
      "10k_25k": "$10k-$25k",
      "25k_50k": "$25k-$50k",
      "50k_100k": "$50k-$100k",
      "100k_plus": "$100k+",
      unknown: "I don't know yet"
    }
  };

  return {
    projectType: labels.projectType[answers.projectType] || answers.projectType,
    timeline: labels.timeline[answers.timeline] || answers.timeline,
    spaceSize: labels.spaceSize[answers.spaceSize] || answers.spaceSize,
    scope: labels.scope[answers.scope] || answers.scope,
    homeAge: labels.homeAge[answers.homeAge] || answers.homeAge,
    budget: labels.budget[answers.budget] || answers.budget
  };
}

function buildCrmPayload(lead, config) {
  const labels = leadLabels(lead.answers);

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

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
    res.end(content);
  });
}

function writeJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS" && req.url === "/api/leads") {
    writeJson(res, 204, {});
    return;
  }

  if (req.method === "POST" && req.url === "/api/leads") {
    try {
      const body = await readBody(req);
      const answers = JSON.parse(body);
      const config = readConfig();
      const qualification = calculateLead(answers);
      const lead = {
        id: `lead_${Date.now()}`,
        createdAt: new Date().toISOString(),
        answers,
        qualification
      };

      saveLead(lead);
      let crmDelivery;
      try {
        crmDelivery = await sendToCrm(lead, config);
      } catch (error) {
        crmDelivery = { skipped: false, error: error.message };
      }

      writeJson(res, 200, { ok: true, lead, crmDelivery });
    } catch (error) {
      writeJson(res, 400, { ok: false, error: "Could not process lead" });
    }
    return;
  }

  const requestedPath = req.url === "/" ? "/index.html" : req.url;
  const filePath = path.normalize(path.join(PUBLIC_DIR, requestedPath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  serveFile(res, filePath);
});

server.listen(PORT, HOST, () => {
  console.log(`Lead qualification system running at http://${HOST}:${PORT}`);
});
