const form = document.querySelector("#leadForm");
const steps = Array.from(document.querySelectorAll(".step"));
const backButton = document.querySelector("#backButton");
const nextButton = document.querySelector("#nextButton");
const submitButton = document.querySelector("#submitButton");
const formError = document.querySelector("#formError");
const progressBar = document.querySelector("#progressBar");
const estimateRange = document.querySelector("#estimateRange");
const widget = document.querySelector(".lead-form");
const apiUrl = widget?.dataset.apiUrl || "/api/leads";

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
  return Object.fromEntries(data.entries());
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
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

showStep(0);
