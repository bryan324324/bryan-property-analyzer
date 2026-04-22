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

// ─── COUNTY DETECTION ────────────────────────────────────────────────────────

function detectCounty(address) {
  const zip = (address.match(/\b(\d{5})\b/) || [])[1];
  if (!zip) return { county: "Unknown", state: "FL", millage: 1.1 };

  const zipNum = parseInt(zip);

  if ((zipNum >= 33010 && zipNum <= 33299) || (zipNum >= 33010 && zipNum <= 33012)) {
    return { county: "Miami-Dade", state: "FL", millage: 1.9, paUrl: "https://www.miamidade.gov/propertysearch/#/" };
  }
  if (zipNum >= 33004 && zipNum <= 33388) {
    return { county: "Broward", state: "FL", millage: 1.8, paUrl: "https://bcpa.net" };
  }
  if (zipNum >= 33401 && zipNum <= 33498) {
    return { county: "Palm Beach", state: "FL", millage: 1.7, paUrl: "https://pbcpao.gov/property-search" };
  }
  if (zipNum >= 33901 && zipNum <= 33997) {
    return { county: "Lee", state: "FL", millage: 1.5, paUrl: "https://www.leepa.org" };
  }
  if ((zipNum >= 34101 && zipNum <= 34120) || (zipNum >= 34137 && zipNum <= 34145)) {
    return { county: "Collier", state: "FL", millage: 1.3, paUrl: "https://www.collierappraiser.com" };
  }

  return { county: "South Florida", state: "FL", millage: 1.6, paUrl: "https://www.miamidade.gov/propertysearch/#/" };
}

// ─── BUILD VERIFICATION LINKS ─────────────────────────────────────────────────

function buildVerificationLinks(address, countyInfo) {
  const encoded = encodeURIComponent(address);
  const encodedPlus = address.replace(/\s+/g, "+");
  return `VERIFICATION LINKS (open to confirm data):
- Zillow: https://www.zillow.com/homes/${encodedPlus}_rb/
- Realtor.com: https://www.realtor.com/realestateandforsale/${encodedPlus}
- Google Maps: https://www.google.com/maps/search/${encoded}
- ${countyInfo.county} Property Appraiser (actual taxes): ${countyInfo.paUrl}
- Miami-Dade PA: https://www.miamidade.gov/propertysearch/#/
- Broward PA: https://bcpa.net
- Palm Beach PA: https://pbcpao.gov/property-search
- Lee County PA: https://www.leepa.org
- Collier PA: https://www.collierappraiser.com`;
}

// ─── BUILD PROMPT ─────────────────────────────────────────────────────────────

function buildPrompt(address, type, mode, purchasePrice, downPayment, notes, countyInfo) {
  const price = purchasePrice ? `$${Number(purchasePrice).toLocaleString()}` : "not provided";
  const dp = downPayment ? `${downPayment}%` : "not provided";
  const notesTxt = notes || "None";
  const verificationLinks = buildVerificationLinks(address, countyInfo);

  const baseContext = `You are a licensed Florida real estate professional and senior analyst specializing in South Florida markets including Miami-Dade, Broward, Palm Beach, Lee, and Collier counties. You have deep knowledge of local property values, zoning codes, listing practices, and market conditions.

Analyze the following property and produce a detailed, investor-grade report.
Be direct, specific, and quantitative throughout. Never use vague language.
Never say "insufficient data" or "I cannot determine" — always provide a concrete estimate with stated assumptions.
If data points conflict between listing information and public record norms, flag the discrepancy explicitly.
County detected: ${countyInfo.county} County`.trim();

  const propertyInfo = `PROPERTY: ${address}
TYPE: ${type}
PURCHASE PRICE: ${price}
DOWN PAYMENT: ${dp}
COUNTY: ${countyInfo.county}
NOTES: ${notesTxt}`.trim();

  const modePrompts = {
    "Full Report": `Produce a Full Property Analysis with ALL of the following sections. Do not skip any section.

PROPERTY OVERVIEW
- Property type and subtype
- Estimated bed/bath/sqft based on property type and neighborhood norms
- Year built estimate
- Lot size estimate
- What the property itself is zoned as (e.g. RS-1, RS-2, RU-1, etc.)
- What the surrounding neighborhood is zoned as and what that means for future development
- Owner-occupied vs investor-owned neighborhood ratio estimate
- Notable neighborhood characteristics

ANNUAL TAXES
- Do not estimate. State the following exactly:
  "Actual tax records must be verified directly with the ${countyInfo.county} County Property Appraiser."
- Direct link: ${countyInfo.paUrl}
- Explain what to look for: assessed value vs market value, Save Our Homes cap, homestead vs non-homestead rates, any outstanding tax liens

MARKET COMPS (ESTIMATED)
- Select 3 comparable sales from the SAME zip code or immediately adjacent zip codes only
- Comps must match: same property type, similar sqft (within 20%), sold within last 12 months
- For each comp: street name/area, bed/bath, sqft estimate, sale price, price per sqft, approximate sale date
- Rank comps by closest match first
- Estimated price per sqft range for this specific submarket
- Buyer's market or seller's market signal for this zip code

VALUATION ESTIMATE
- REQUIRED: Specific dollar value range (e.g. $425,000 - $460,000) — never skip, never wider than $50,000
- State methodology and key assumptions
- Estimated ARV if property needs work
- Key value drivers pushing price up
- Key value detractors pushing price down
- Confidence level: High / Medium / Low with explanation

DAYS ON MARKET
- Typical days on market for this property type and zip code right now
- Estimate how long this property may have been listed if applicable
- Market absorption rate for this area

PRICE & LISTING STATUS HISTORY
- Any known listing history for this specific address
- Price reduction history if known
- Previous sale dates and prices if known
- Current listing status estimate: Active / Pending / Off-market / Recently sold
- Flag any unusual pricing patterns

PROPERTY DESCRIPTION
- Detailed property description based on typical properties of this type, age, and location
- Features typical for this neighborhood and price range
- Flag anything atypical based on the address and property type
- Note if this appears distressed, flipped, or renovated based on available context

DISCREPANCY FLAGS
- Flag any data points that don't add up or seem inconsistent
- Note differences between listing norms vs public record norms for this area
- Flag anything the buyer should verify in person or with a title search
- Note any zoning inconsistencies or potential issues

VERIFICATION LINKS
${verificationLinks}

LISTING AGENT NAME & CONTACT INFO
- Listing agent name and contact information if known for this address
- If unknown, provide the most likely listing brokerage for this area and price range
- Phone, email, and brokerage name if available
- Note if this appears to be a FSBO, REO, or short sale

LISTING AGENT BACKGROUND
- Background on the listing agent if known: years licensed, brokerage history, specialties
- Recent transaction volume and price range they typically work in
- Notable information about their reputation or market presence
- If agent unknown, describe what to look for when evaluating an agent in this market`,

    "Comps Only": `Produce a Comparable Sales Analysis for ${countyInfo.county} County:

COMP SUMMARY
- 3 comparable sales from the SAME zip code or immediately adjacent zip codes
- Same property type, similar sqft (within 20%), sold within last 12 months
- For each comp: street area, bed/bath, sqft, sale price, price per sqft, sale date
- Rank by closest match first
- Price per sqft range for this submarket
- Buyer's market vs seller's market signal
- Estimated subject property value range — specific dollar range required

KEY COMP FACTORS
- What drives value up in this specific zip code
- What drives value down
- Micro-market factors specific to this neighborhood`,

    "Investment Analysis": `Produce a Real Estate Investment Analysis for ${countyInfo.county} County:

INVESTMENT SNAPSHOT
- Deal type recommendation: buy-hold / flip / wholesale / pass
- Estimated ROI range
- Risk rating: Low / Medium / High with specific reasoning

VALUATION & COMPS
- Specific dollar value range — required, never skip
- 3 comparable sales: same zip, same type, last 12 months
- Price per sqft range

ANNUAL TAXES
- Do not estimate. Direct the user to verify actual taxes at: ${countyInfo.paUrl}
- Note: assessed value, homestead vs non-homestead, and any liens must be confirmed directly

RENTAL INCOME ESTIMATE
- Estimated gross monthly rent for this market and property type
- Vacancy rate for this submarket
- Estimated NOI (annual)

CASH FLOW ANALYSIS
- Gross rent minus: vacancy, taxes, insurance, maintenance reserve, management
- Net monthly cash flow estimate
- Cap rate estimate
- Cash-on-cash return estimate (if purchase price provided)

GO / NO-GO RECOMMENDATION
- Clear recommendation with primary reasoning
- Top 3 risks to this specific deal`,

    "Flip Analysis": `Produce a Fix-and-Flip Analysis for ${countyInfo.county} County:

VALUATION
- Estimated ARV: specific dollar range required
- Current as-is value estimate
- Comparable sales: same zip, same type, last 12 months

ANNUAL TAXES
- Do not estimate. Verify actual taxes at: ${countyInfo.paUrl}

FLIP NUMBERS
- Acquisition cost (purchase price if provided)
- Estimated rehab: light / medium / heavy with per-sqft ranges
- Carrying costs estimate (6 month hold)
- Closing costs estimate (8-10% of ARV)
- Estimated net profit range
- Estimated ROI on capital deployed

MARKET FIT
- Is this zip code flip-friendly right now
- Typical buyer profile for resale in this area
- Best finish level for maximum return

GO / NO-GO
- Clear recommendation with primary reasoning`,

    "Rental Analysis": `Produce a Rental Property Analysis for ${countyInfo.county} County:

VALUATION
- Specific dollar value range — required
- Comparable sales: same zip, same type, last 12 months

ANNUAL TAXES
- Do not estimate. Verify actual taxes at: ${countyInfo.paUrl}
- Note: non-homestead rate applies for investment property

RENTAL MARKET
- Estimated monthly rent range for this property type and zip
- Vacancy rate estimate
- Rent growth trend in this submarket
- Typical tenant profile

OPERATING EXPENSES (ANNUAL)
- Insurance, maintenance reserve, management (8-10%)
- Total operating expenses (excluding taxes — verify separately)

NOI & CASH FLOW
- Gross annual rent minus vacancy and expenses
- NOI calculation
- Cap rate estimate
- Cash-on-cash return (if purchase price provided)
- Monthly cash flow estimate

HOLD RECOMMENDATION
- Long-term appreciation outlook for this zip
- Rent growth projection`,
  };

  return `${baseContext}\n\n${propertyInfo}\n\n${modePrompts[mode] || modePrompts["Full Report"]}`;
}

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

  const countyInfo = detectCounty(address);

  setLoading(true);
  document.getElementById("output").textContent = "Analyzing...";
  document.getElementById("output-meta").textContent = "";

  const prompt = buildPrompt(address, type, mode, purchasePrice, downPayment, notes, countyInfo);
  const startTime = Date.now();

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 4000,
        system: "You are a licensed Florida real estate professional and senior analyst with 20+ years of experience in South Florida markets. You specialize in Miami-Dade, Broward, Palm Beach, Lee, and Collier counties. You have expert knowledge of local property values, zoning codes, HOA norms, flood zones, listing practices, and micro-market conditions. You produce precise, detailed, investor-grade analysis. You never skip sections, never give vague answers, and always provide specific dollar estimates with stated assumptions. You never estimate taxes — you always direct the user to verify taxes directly with the county property appraiser. When data points conflict, you flag the discrepancy clearly.",
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
    document.getElementById("output-meta").textContent = `${mode} · ${countyInfo.county} County · ${elapsed}s`;

  } catch (err) {
    document.getElementById("output").textContent = "Analysis failed. Check your connection and try again.";
    showError(err.message || "Unknown error");
    console.error("[Analysis Error]", err);
  } finally {
    setLoading(false);
  }
}
