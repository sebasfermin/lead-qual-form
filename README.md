# Lead Qualification System

Plain HTML/CSS/JavaScript lead qualification form for high-consideration contractor projects.

The form collects project details, returns a broad estimate range to the visitor, and sends the private lead score plus project data to a CRM webhook such as Zapier.

## Local Test

```bash
npm start
```

Open:

```text
http://127.0.0.1:3000/
```

If port `3000` is busy:

```bash
PORT=3002 npm start
```

## Vercel Deployment

This project is Vercel-ready.

Static files live in:

```text
public/
```

The API endpoint lives in:

```text
api/leads.js
```

After deploying to Vercel, the form assets will be available at:

```text
https://YOUR-VERCEL-DOMAIN/styles.css
https://YOUR-VERCEL-DOMAIN/form.js
https://YOUR-VERCEL-DOMAIN/api/leads
```

## Webflow Embed

Use `webflow-embed-snippet.html` as the starting point.

After deploying, replace local URLs like:

```text
http://127.0.0.1:3002
```

with the Vercel URL:

```text
https://YOUR-VERCEL-DOMAIN
```

The important parts are:

```html
<link rel="stylesheet" href="https://YOUR-VERCEL-DOMAIN/styles.css">

<section
  class="lead-form"
  data-company-id="demo-remodeling"
  data-config-url="https://YOUR-VERCEL-DOMAIN/api/companies/demo-remodeling"
  data-api-url="https://YOUR-VERCEL-DOMAIN/api/leads">
  ...
</section>

<script src="https://YOUR-VERCEL-DOMAIN/form.js"></script>
```

## CRM Webhook

Edit:

```text
contractor-config.json
```

Example:

```json
{
  "businessName": "Demo Remodeling Co.",
  "notificationEmail": "",
  "crmWebhookUrl": "https://hooks.zapier.com/hooks/catch/...",
  "crmWebhookEnabled": true
}
```

When enabled, each lead is sent to the webhook with fields such as:

```text
name
phone
postalCode
projectType
budget
estimateLow
estimateHigh
leadScore
leadTier
```

## Company Configuration

Each company can have its own editable config file:

```text
companies/demo-remodeling.json
```

This controls:

```text
business name
CRM webhook URL
public form copy
question labels
answer options
estimate base ranges
estimate multipliers
lead score weights
lead score tier names
result screen copy
```

To add a new company, duplicate the demo file:

```text
companies/acme-remodeling.json
```

Then update the Webflow embed:

```html
data-company-id="acme-remodeling"
data-config-url="https://YOUR-VERCEL-DOMAIN/api/companies/acme-remodeling"
```

## Note About Lead Storage

The local `server.js` version writes leads to `leads.json` for easy testing.

The Vercel API forwards leads to the webhook but does not permanently write to `leads.json`. For production lead history, add a database later.
