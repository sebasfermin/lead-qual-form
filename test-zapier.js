async function sendTestLead() {
  const response = await fetch("http://127.0.0.1:3001/api/leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      postalCode: "90210",
      projectType: "bathroom",
      timeline: "soon",
      spaceSize: "medium",
      scope: "partial",
      homeAge: "established",
      budget: "unknown",
      name: "Zapier Test Lead",
      phone: "5551234567"
    })
  });

  const result = await response.json();
  console.log(JSON.stringify(result, null, 2));
}

sendTestLead().catch(error => {
  console.error(error.message);
  process.exit(1);
});
