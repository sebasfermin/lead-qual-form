import fs from "node:fs";
import path from "node:path";

function readCompanyConfig(companyId: unknown) {
  const safeCompanyId = String(companyId || "demo-remodeling").replace(/[^a-z0-9-_]/gi, "");
  const filePath = path.join(process.cwd(), "companies", `${safeCompanyId}.json`);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export default function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  const config = readCompanyConfig(req.query.companyId);

  if (!config) {
    res.status(404).json({ ok: false, error: "Company config not found" });
    return;
  }

  res.status(200).json({ ok: true, config });
}
