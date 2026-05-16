const form = document.querySelector("#leadForm");
const steps = Array.from(document.querySelectorAll(".step"));
const backButton = document.querySelector("#backButton");
const nextButton = document.querySelector("#nextButton");
const submitButton = document.querySelector("#submitButton");
const formError = document.querySelector("#formError");
const progressBar = document.querySelector("#progressBar");
const estimateRange = document.querySelector("#estimateRange");
const resultEyebrow = document.querySelector("#resultEyebrow");
const resultSummary = document.querySelector("#resultSummary");
const finePrint = document.querySelector(".fine-print");
const widget = document.querySelector(".lead-form");
const apiUrl = widget?.dataset.apiUrl || "/api/leads";
const configUrl = widget?.dataset.configUrl || "";
const companyId = widget?.dataset.companyId || "demo-remodeling";

let currentStep = 0;

function showStep(index) {
  currentStep = index;
  steps.forEach((step, stepIndex) => {
    step.classList.toggle("is-active", stepIndex === currentStep);
  });

  const isResult = currentStep === steps.length - 1;
  backButton.hidden = currentStep === 0 || isResult;
  nextButton.hidden = currentStep >= steps.length - 2;
  submitButton.hidden = currentStep !== steps.length - 2;
  progressBar.style.width = `${Math.round((currentStep / (steps.length - 1)) * 100)}%`;
  formError.textContent = "";
}

function validateCurrentStep() {
  const activeStep = steps[currentStep];
  const fields = Array.from(activeStep.querySelectorAll("input[required]"));
  const radioGroups = new Set();

  for (const field of fields) {
    if (field.type === "radio") {
      radioGroups.add(field.name);
      continue;
    }

    if (!field.value.trim()) {
      field.focus();
      return false;
    }
  }

  for (const group of radioGroups) {
    if (!form.querySelector(`input[name="${group}"]:checked`)) {
      return false;
    }
  }

  return true;
}

function getAnswers() {
  const data = new FormData(form);
  return {
    companyId,
    ...Object.fromEntries(data.entries())
  };
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

function renderOptions(fieldName, fieldConfig) {
  const question = document.querySelector(`[data-field-question="${fieldName}"]`);
  const options = document.querySelector(`[data-field-options="${fieldName}"]`);

  if (!fieldConfig || !options) return;
  if (question && fieldConfig.question) question.textContent = fieldConfig.question;

  options.innerHTML = "";
  fieldConfig.options.forEach((option, index) => {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = fieldName;
    input.value = option.value;
    if (index === 0) input.required = true;
    label.append(input, ` ${option.label}`);
    options.append(label);
  });
}

function applyConfig(config) {
  if (!config) return;

  const copy = config.copy || {};
  const eyebrow = document.querySelector(".lead-form__header .eyebrow");
  const headline = document.querySelector("#form-title");
  const intro = document.querySelector(".intro");

  if (eyebrow && copy.eyebrow) eyebrow.textContent = copy.eyebrow;
  if (headline && copy.headline) headline.textContent = copy.headline;
  if (intro && copy.intro) intro.textContent = copy.intro;
  if (resultEyebrow && copy.resultEyebrow) resultEyebrow.textContent = copy.resultEyebrow;
  if (resultSummary && copy.resultSummary) resultSummary.textContent = copy.resultSummary;
  if (finePrint && copy.finePrint) finePrint.textContent = copy.finePrint;
  if (submitButton && copy.submitButton) submitButton.textContent = copy.submitButton;

  Object.entries(config.fields || {}).forEach(([fieldName, fieldConfig]) => {
    renderOptions(fieldName, fieldConfig);
  });
}

async function loadConfig() {
  if (!configUrl) return;

  try {
    const response = await fetch(configUrl);
    if (!response.ok) throw new Error("Config failed");
    const result = await response.json();
    applyConfig(result.config);
  } catch (error) {
    formError.textContent = "Form settings could not load. Using default settings.";
  }
}

nextButton.addEventListener("click", () => {
  if (!validateCurrentStep()) {
    formError.textContent = "Please answer this step before continuing.";
    return;
  }

  showStep(currentStep + 1);
});

backButton.addEventListener("click", () => {
  showStep(Math.max(0, currentStep - 1));
});

form.addEventListener("submit", async event => {
  event.preventDefault();

  if (!validateCurrentStep()) {
    formError.textContent = "Please add your contact details before continuing.";
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Calculating...";
  formError.textContent = "";

  try {
    if (window.location.protocol === "file:" && apiUrl.startsWith("/")) {
      throw new Error("FILE_PREVIEW");
    }

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(getAnswers())
    });

    if (!response.ok) throw new Error("Submission failed");

    const result = await response.json();
    const qualification = result.lead.qualification;

    estimateRange.textContent = `${formatMoney(qualification.estimateLow)} to ${formatMoney(qualification.estimateHigh)}`;
    showStep(steps.length - 1);
  } catch (error) {
    formError.textContent =
      error.message === "FILE_PREVIEW"
        ? "This preview needs to run through the local server before it can submit."
        : "Something went wrong. Please make sure the local server is running and try again.";
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Get estimate";
  }
});

loadConfig().finally(() => showStep(0));
