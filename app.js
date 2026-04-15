// ─── INSTALL PROMPT ───────────────────────────────────────────────────────────

let deferredPrompt = null;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  document.getElementById("install-banner").classList.remove("hidden");
});

window.addEventListener("appinstalled", () => {
  document.getElementById("install-banner").classList.add("hidden");
  deferredPrompt = null;
});

function installApp() {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  deferredPrompt.userChoice.then(() => {
    deferredPrompt = null;
    document.getElementById("install-banner").classList.add("hidden");
  });
}

function dismissInstall() {
  document.getElementById("install-banner").classList.add("hidden");
}

// ─── SERVICE WORKER ───────────────────────────────────────────────────────────

if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("service-worker.js")
    .then(() => console.log("[SW] Registered"))
    .catch((err) => console.warn("[SW] Registration failed:", err));
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function showError(msg) {
  const el = document.getElementById("error-msg");
  el.textContent = msg;
  el.classList.remove("hidden");
}

function clearError() {
  document.getElementById("error-msg").classList.add("hidden");
}

function setLoading(on) {
  const btn = document.getElementById("run-btn");
  const text = document.getElementById("btn-text");
  const loader = document.getElementById("btn-loader");
  btn.disabled = on;
  text.classList.toggle("hidden", on);
  loader.classList.toggle("hidden", !on);
  document.querySelector(".panel.right").classList.toggle("loading", on);
}

function clearAll() {
  ["address", "purchase_price", "down_payment", "notes"].forEach(
    (id) => (document.getElementById(id).value = "")
  );
  document.getElementById("output").textContent =
    "Ready — fill out the form and hit RUN ANALYSIS.";
  document.getElementById("output-meta").textContent = "";
  clearError();
}

function copyOutput() {
  const text = document.getElementById("output").textContent;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.querySelectorAll(".buttons button")[1];
    const original = btn.textContent;
    btn.textContent = "COPIED";
    setTimeout(() => (btn.textContent = original), 1500);
  });
}

// ─── VALIDATION ───────────────────────────────────────────────────────────────

function validateInputs(address, purchasePrice, downPayment) {
  if (!address) return "Enter a property address.";
  if (address.length < 10) return "Address looks too short. Check and try again.";
  if (!/\d/.test(address)) return "Address should include a street number.";
  if (purchasePrice && isNaN(Number(purchasePrice)))
    return "Purchase price must be a number.";
  if (purchasePrice && Number(purchasePrice) <= 0)
    return "Purchase price must be greater than 0.";
  if (downPayment && (isNaN(Number(downPayment)) || Number(downPayment) < 0 || Number(downPayment) > 100))
    return "Down payment must be between 0 and 100.";
  return null;
}

// ─── BUILD PROMPT ─────────────────────────────────────────────────────────────

function buildPrompt(address, type, mode, purchasePrice, downPayment, notes) {
  const price = purchasePrice ? `$${Number(purchasePrice).toLocaleString()}` : "not provided";
  const dp = downPayment ? `${downPayment}%` : "not provided";
  const notesTxt = notes || "None";

  const baseContext = `You are a senior real estate analyst and mortgage professional in the United States.
Analyze the following property and produce a structured, actionable investor report.
Be direct, specific, and quantitative. No filler. No generic disclaimers.
If exact data is unavailable, provide realistic estimates with clear assumptions stated.
Format your output with clean sections using ALL-CAPS headers and hyphens for bullets.`.trim();

  const propertyInfo = `PROPERTY: ${address}
TYPE: ${type}
PURCHASE PRICE: ${price}
DOWN PAYMENT: ${dp}
NOTES: ${notesTxt}`.trim();

  const modePrompts = {
    "Full Report": `Produce a Full Property Analysis with these sections:

PROPERTY OVERVIEW
- Property type, typical characteristics for this area, zoning context

MARKET COMPS (ESTIMATED)
- 3 estimated comparable sales in the area with approximate price ranges
- Estimated price per sq ft range for the market
- Days on market trend (buyer's or seller's market signal)

VALUATION ESTIMATE
- Estimated ARV (after repair value) range based on market
- Estimated as-is value if notes suggest repairs needed
- Key value drivers and detractors

FINANCIAL ANALYSIS
- Estimated monthly mortgage payment (if purchase price provided, use 30yr fixed at current approx rate ~7%)
- Estimated property taxes (annual, based on typical county millage)
- Estimated insurance
- Total estimated monthly PITI

INVESTMENT POTENTIAL
- Cap rate estimate (if rental)
- Estimated gross rent range for this market
- Cash flow estimate (monthly, rough)
- Recommended exit strategies ranked: buy-and-hold, flip, wholesale, other

RED FLAGS / RISKS
- Market-specific risks
- Property-type risks
- Any red flags from the notes

RECOMMENDED NEXT STEPS
- Top 3 action items for this deal`,
    "Comps Only": `Produce a Comparable Sales Analysis:

COMP SUMMARY
- 3 estimated comparable sales in this market with price ranges and brief descriptions
- Estimated price per sq ft range
- Market trend (appreciating / stable / declining)
- Estimated subject property value range based on comps
- Buyer vs seller market indicator

KEY COMP FACTORS
- What drives value up or down in this specific market`,

    "Investment Analysis": `Produce a Real Estate Investment Analysis:

INVESTMENT SNAPSHOT
- Deal type recommendation (buy-hold / flip / wholesale / pass)
- Estimated ROI range
- Risk rating (Low / Medium / High) with reasoning

RENTAL INCOME ESTIMATE
- Estimated gross monthly rent for this market and property type
- Estimated vacancy factor
- Estimated net operating income (annual)

FINANCING BREAKDOWN (if purchase price provided)
- Down payment amount
- Estimated loan amount
- Estimated monthly P&I (30yr fixed ~7%)
- Estimated PITI total

CASH FLOW ANALYSIS
- Gross rent
- Minus: vacancy, taxes, insurance, maintenance reserve, property management (if applicable)
- Net monthly cash flow estimate
- Cap rate estimate
- Cash-on-cash return estimate

GO / NO-GO RECOMMENDATION
- Clear recommendation with primary reason`,

    "Flip Analysis": `Produce a Fix-and-Flip Analysis:

FLIP SNAPSHOT
- Estimated ARV range for this market
- Acquisition cost (purchase price if provided)
- Estimated rehab budget range (light / medium / heavy)
- Estimated total project cost

PROFIT ESTIMATE
- Estimated gross profit range (ARV minus acquisition + rehab + carrying costs)
- Estimated net profit after closing costs (~8-10% of ARV)
- Estimated project timeline: 3-6 months typical
- Estimated ROI on capital deployed

MARKET FIT
- Is this a flip-friendly market? (demand, DOM, buyer pool)
- Best product type for resale in this area

RISK FACTORS
- Rehab cost overrun risk
- Market timing risk
- Financing cost exposure

GO / NO-GO
- Clear recommendation`,
    "Rental Analysis": `Produce a Rental Property Analysis:

RENTAL MARKET SNAPSHOT
- Estimated monthly rent range for this property type and market
- Vacancy rate estimate for the area
- Rent growth trend

OPERATING INCOME ESTIMATE
- Gross annual rent
- Vacancy loss estimate
- Effective gross income

OPERATING EXPENSES (ANNUAL ESTIMATES)
- Property taxes
- Insurance
- Maintenance / repairs reserve
- Property management (if applicable, ~8-10% of rent)
- Total operating expenses

NET OPERATING INCOME
- NOI calculation
- Cap rate estimate

FINANCING & CASH FLOW (if purchase price provided)
- Annual debt service estimate
- Annual cash flow (NOI minus debt service)
- Monthly cash flow
- Cash-on-cash return

HOLD vs SELL RECOMMENDATION
- Long-term hold potential
- Market appreciation outlook`,
  };

  return `${baseContext}\n\n${propertyInfo}\n\n${modePrompts[mode] || modePrompts["Full Report"]}`;
}

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const ANTHROPIC_API_KEY = "";

// ─── MAIN RUN ─────────────────────────────────────────────────────────────────

async function run() {
  clearError();
  const address = document.getElementById("address").value.trim();
  const type = document.getElementById("type").value;
  const mode = document.getElementById("mode").value;
  const purchasePrice = document.getElementById("purchase_price").value.trim();
  const downPayment = document.getElementById("down_payment").value.trim();
  const notes = document.getElementById("notes").value.trim();

  const validationError = validateInputs(address, purchasePrice, downPayment);
  if (validationError) { showError(validationError); return; }

  setLoading(true);
  document.getElementById("output").textContent = "Analyzing...";
  document.getElementById("output-meta").textContent = "";

  const prompt = buildPrompt(address, type, mode, purchasePrice, downPayment, notes);
  const startTime = Date.now();

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system: "You are a senior real estate analyst and licensed mortgage professional. You produce clear, direct, investor-grade property analysis. No filler. No disclaimers. Format output with ALL-CAPS section headers.",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData?.error?.message || `API error ${response.status}`);
    }

    const data = await response.json();
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const text = data?.content?.filter((b) => b.type === "text").map((b) => b.text).join("\n") || "No output returned.";
    document.getElementById("output").textContent = text;
    document.getElementById("output-meta").textContent = `${mode} · ${elapsed}s`;

  } catch (err) {
    document.getElementById("output").textContent = "Analysis failed. Check your connection and try again.";
    showError(err.message || "Unknown error");
    console.error("[Analysis Error]", err);
  } finally {
    setLoading(false);
  }
}
