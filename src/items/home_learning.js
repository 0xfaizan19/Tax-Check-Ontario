// Home and School (learning) items: buying, selling and renovating a home, rent and property tax,
// tuition, student loans, scholarships, RRSP plans for school, RESP payouts and student aid.

// Federal + Ontario tax at another taxable income, rebuilding this return's credits the way engine.js does.
// Post phase only (needs X.R). Used for strategy estimates, never added to the claims.
function hlTaxAt(X, ti) {
  const R = X.R, C = X.C, c = R.cppEi;
  const ni = pos(R.ni + ti - R.ti);   // BPA shrinks as income rises
  const divFed = C.eligDiv * P.div.eligGross * P.div.fedElig + C.nonEligDiv * P.div.nonGross * P.div.fedNon;
  const fedCr = P.fed.rate * (P.fedBpa(ni) + c.cppBase + c.ei + Math.min(P.fed.cea, R.emp) + C.fed + R.fedMedNet) + R.donFed + R.topup + divFed + C.fedCr;
  const fed = pos(brk(ti, P.fed.b) - fedCr);
  const b = pos(brk(ti, P.on.b) - P.on.rate * (P.on.bpa + c.cppBase + c.ei + C.on + R.onMedNet) - R.donOn - C.onCr);
  const divOn = C.eligDiv * P.div.eligGross * P.div.onElig + C.nonEligDiv * P.div.nonGross * P.div.onNon;
  const l73 = pos(b + .2 * pos(b - P.on.s1) + .36 * pos(b - P.on.s2) - divOn);
  const red = Math.min(l73, pos(2 * (P.on.redBasic + P.on.redDep * C.redDeps) - l73));   // Ontario tax reduction
  const afterRed = pos(l73 - red - C.onCrPost);
  const lift = Math.min(afterRed, pos(Math.min(P.on.liftMax, P.on.liftRate * R.emp) - .05 * Math.max(0, ni - P.on.liftInd, R.afni + ti - R.ti - P.on.liftFam)));
  return fed + afterRed - lift + ohp(ti);
}
// Extra tax from adding `add` to taxable income
function hlExtraTax(X, add) { return hlTaxAt(X, X.R.ti + pos(add)) - hlTaxAt(X, X.R.ti); }

// Ontario land transfer tax, 1 or 2 single-family residences (Toronto's MLTT uses the same rates up to $2M)
function hlLtt(p) {
  p = pos(p);
  return .005 * Math.min(p, 55000) + .01 * pos(Math.min(p, 250000) - 55000) + .015 * pos(Math.min(p, 400000) - 250000)
    + .02 * pos(Math.min(p, 2000000) - 400000) + .025 * pos(p - 2000000);
}

// RRSP plan repayment (HBP / LLP): what the designated repayment avoids and what a shortfall costs
function hlRepaySay(v, X, plan) {
  const req = pos(num(v.req)), paid = pos(num(v.paid)), short = pos(req - paid);
  if (!req) return X.say(`No ${plan} repayment is due for 2026. Check your notice of assessment for the year your repayments start.`);
  const avoided = hlExtraTax(X, req) - hlExtraTax(X, short);
  if (paid) X.say(avoided >= 1 ? `Designating ${fmt(Math.min(paid, req))} as your ${plan} repayment keeps it out of your income and avoids about ${fmt(avoided)} of tax.`
    : `At your income a missed repayment wouldn't be taxed, but designating ${fmt(Math.min(paid, req))} still lowers your balance.`);
  if (short) X.say(`The ${fmt(short)} shortfall is added to your income on line 12900 and costs about ${fmt(hlExtraTax(X, short))}. It isn't included in the totals here.`);
  else if (paid > req) X.say(`The extra ${fmt(paid - req)} repaid lowers your future required repayments.`);
}

// Rent and property tax credits (OEPTC, NOEC) are computed here by otb_housing; items/ontario_ended.js
// skips its on_oeptc / on_noec ids in favour of it, and the senior homeowners' grant stays there.

ITEMS.push(
// ---------------- HOME ----------------
{
  id: "first_home", cat: "home", kind: "calc",
  q: "I bought my first home in 2026",
  name: "First-time home buyers' amount and land transfer tax refund",
  lines: "L31270 · Ontario LTT refund",
  hint: "You qualify if you and your spouse didn't live in a home either of you owned in 2022 to 2026, or you bought a more accessible home for someone with the disability credit. The $10,000 amount is worth $1,400 and can be split with a co-buyer.",
  tags: "first time home buyer house condo hbta fthba land transfer tax refund toronto mltt 31270 disability accessible",
  src: ["first_time_home_buyers_amount", "ontario_ltt_first_time_buyer_refund"],
  fields: [
    { k: "amt", label: "My share of the $10,000 home buyers' amount", type: "money", def: 10000, min: 0, max: 10000 },
    { k: "price", label: "Purchase price", type: "money", def: 800000 },
    { k: "never", label: "My spouse and I have never owned a home anywhere (for the land transfer tax refund)", type: "bool", def: true },
    { k: "toronto", label: "The home is in the City of Toronto", type: "bool", def: false }
  ],
  cr(v, C, X) {
    const a = Math.min(10000, pos(num(v.amt)));   // $10,000 per home, not indexed; 14% = $1,400
    C.fed += a;
    X.say(`Home buyers' amount ${fmt(a)}, worth ${fmt(P.fed.rate * a)} off federal tax.`);
    const ltt = hlLtt(num(v.price));
    if (!num(v.price)) return;
    if (v.never) {
      X.say(`Ontario land transfer tax: ${fmt(ltt)}. First-time buyer refund: ${fmt(Math.min(4000, ltt))}, claimed when the deed is registered, not on your return.`);   // Ontario max $4,000
      if (v.toronto) X.say(`Toronto land transfer tax refund: ${fmt(Math.min(4475, ltt))} more.`);   // Toronto max $4,475
    } else X.say("The land transfer tax refund needs you and your spouse to have never owned a home anywhere in the world.");
  }
},
{
  id: "hbp", cat: "home", kind: "tip",
  q: "I took money out of my RRSP under the Home Buyers' Plan",
  name: "Home Buyers' Plan (HBP) repayments",
  lines: "T1036 · Schedule 7 · L12900",
  hint: "First-time buyers can take up to $60,000 from an RRSP tax-free to buy a home, then repay it over 15 years. Any required repayment you skip is added to your income.",
  tip: "Withdrawals made from 2022 to 2028 get a longer grace period, so repayments start in the fifth year after the withdrawal; older withdrawals started repaying in the second year. Designate RRSP contributions made in 2026 or by March 1, 2027 as your repayment on Schedule 7; those contributions aren't deductible. RRSP money deposited less than 90 days before the withdrawal can't be deducted. Each spouse has their own $60,000 limit, and it combines with an FHSA.",
  tags: "hbp home buyers plan rrsp withdrawal repayment first home t1036 schedule 7",
  src: ["home_buyers_plan"],
  fields: [
    { k: "req", label: "Required HBP repayment for 2026 (notice of assessment)", type: "money", def: 2000 },
    { k: "paid", label: "RRSP contributions I'll designate as my repayment", type: "money", def: 2000 }
  ],
  post(v, C, X) { hlRepaySay(v, X, "HBP"); }
},
{
  id: "sell_home", cat: "home", kind: "tip",
  q: "I sold a home in 2026 that I lived in",
  name: "Principal residence exemption",
  lines: "Schedule 3 · T2091(IND) · L12700",
  hint: "The gain on a home you, your spouse or your child lived in is tax-free for the years you designate it, one home per family per year. You still have to report the sale.",
  tip: "The tax-free share is (1 + years designated) divided by years owned, so the extra year covers buying one home and selling another in the same year. If you also own a cottage, give each year to the property with the bigger gain per year. A home owned less than 365 days falls under the flipping rule and is taxed as business income, unless a life event such as a new job, death, disability or separation forced the sale. Report the sale and designation on Schedule 3, or you risk a penalty and losing the exemption.",
  tags: "principal residence exemption sell house condo capital gain schedule 3 t2091 cottage flipping",
  src: ["principal_residence_exemption"],
  fields: [
    { k: "gain", label: "Gain on the home (price minus cost and selling costs)", type: "money", def: 300000 },
    { k: "owned", label: "Years I owned it", type: "int", def: 10, min: 1, max: 60 },
    { k: "desig", label: "Years I designate as my principal residence", type: "int", def: 10, min: 0, max: 60 }
  ],
  post(v, C, X) {
    const gain = pos(num(v.gain)), owned = Math.max(1, Math.round(num(v.owned))), desig = clamp(Math.round(num(v.desig)), 0, owned);
    if (!gain) return X.say("No gain, so nothing to exempt. A loss on your home can't be claimed.");
    if (!desig) return X.say("With no years designated, none of the gain is exempt. Designate at least one year on Schedule 3 to use the exemption.");
    const exempt = gain * Math.min(1, (1 + desig) / owned);   // the +1 year only applies once at least one year is designated
    const taxable = .5 * (gain - exempt);   // 50% inclusion
    const saved = hlExtraTax(X, .5 * gain) - hlExtraTax(X, taxable);
    X.say(`${fmt(exempt)} of the ${fmt(gain)} gain is tax-free, avoiding about ${fmt(saved)} of tax.`);
    if (taxable) X.say(`The rest leaves a ${fmt(taxable)} taxable capital gain, which isn't added to the totals here.`);
  }
},
{
  id: "new_home_rebates", cat: "home", kind: "tip",
  q: "I bought a newly built home to live in",
  name: "GST/HST new housing rebates, first-time buyer rebate, Ontario enhanced rebate",
  lines: "GST190 · RC7190-ON · no return line",
  hint: "Rebates of HST on a new or substantially renovated home, usually credited by the builder on closing. First-time buyers, and anyone who signs with a builder from April 1, 2026 to March 31, 2027, get much more.",
  tip: "First-time buyers who signed with a builder on or after March 20, 2025 get back the 5% federal GST up to $1 million (phasing out by $1.5 million) and the 8% Ontario part up to $80,000. Any buyer who signs from April 1, 2026 to March 31, 2027 also gets Ontario's enhanced rebate and New Home Affordability Payment, worth up to $130,000 together. If the builder didn't credit the rebate, apply to CRA within 2 years of closing. None of these depends on your income.",
  tags: "gst hst new housing rebate new build condo builder first time buyer enhr onhap new home affordability payment gst190 rc7190",
  src: ["gst_hst_new_housing_rebate", "fthb_gst_rebate_federal", "ontario_fthb_hst_rebate", "ontario_enhr_and_onhap"],
  fields: [
    { k: "price", label: "Price of the home before HST", type: "money", def: 800000 },
    { k: "first", label: "I'm a first-time buyer (no home owned by me or my spouse in 2022 to 2026)", type: "bool", def: true },
    { k: "window", label: "I signed with the builder between April 1, 2026 and March 31, 2027", type: "bool", def: false }
  ],
  post(v, C, X) {
    const p = pos(num(v.price)), first = !!v.first, win = !!v.window;
    if (!p) return;
    // Federal: new housing rebate 36% of the 5% GST (max $6,300), gone at $450,000; first-time buyer rebate replaces it
    const nhrFed = p <= 350000 ? Math.min(.018 * p, 6300) : p < 450000 ? 6300 * (450000 - p) / 100000 : 0;
    const fthbFed = first ? (p <= 1e6 ? Math.min(.05 * p, 50000) : p < 1.5e6 ? 50000 * (1.5e6 - p) / 5e5 : 0) : 0;
    const fed = Math.max(nhrFed, fthbFed);
    // Ontario 8% part: regular rebate 75% (max $24,000); first-time buyer and enhanced (ENHR) rebates up to $80,000
    const reg = Math.min(24000, .06 * p);
    const fthbOn = first ? (p <= 1e6 ? Math.min(.08 * p, 80000) : p < 1.5e6 ? Math.max(24000, 80000 * (1.5e6 - p) / 5e5) : reg) : 0;
    const enhr = win ? (p <= 1e6 ? Math.min(.08 * p, 80000) : p <= 1.5e6 ? 80000 : p < 1.85e6 ? 80000 - .16 * (p - 1.5e6) : 24000) : 0;
    const on = Math.min(Math.max(reg, fthbOn, enhr), 80000, .08 * p);
    // New Home Affordability Payment: Ontario covers the 5% federal part, less any federal rebate
    const f = win ? (p <= 1e6 ? .05 * p : p <= 1.5e6 ? 50000 : p < 1.85e6 ? 50000 * (1.85e6 - p) / 350000 : 0) : 0;
    const onhap = pos(f - fed);
    X.say(`Federal ${fthbFed >= nhrFed && fthbFed ? "first-time buyer" : "new housing"} rebate: ${fmt(fed)}. Ontario HST rebate: ${fmt(on)}.`);
    if (win) X.say(`New Home Affordability Payment: ${fmt(onhap)}${onhap ? "" : " (the federal rebate already covers the 5%)"}.`);
    X.say(`About ${fmt(fed + on + onhap)} in total, not part of your income tax.${p > 1e6 ? " Amounts between $1 million and $1.85 million are estimates." : ""}`);
  }
},
{
  id: "home_accessibility", cat: "home", kind: "calc",
  q: "I renovated to make a home safer for someone 65+ or disabled",
  name: "Home accessibility tax credit",
  lines: "L31285",
  hint: "Ramps, grab bars, walk-in tubs, wider doors and similar work in the home of a person 65+ or with the disability credit (you, your spouse or a relative you support). Up to $20,000 of costs a year, worth $2,800 federal.",
  tags: "home accessibility tax credit hatc renovation senior disabled grab bars ramp walk-in tub 31285",
  src: ["home_accessibility_for_relative", "home_accessibility_tax_credit"],
  fields: [
    { k: "exp", label: "Eligible renovation costs paid in 2026", type: "money", def: 20000 },
    { k: "med", label: "Part I'm claiming as medical expenses instead", type: "money", def: 0 },
    { k: "share", label: "My share of the claim (%)", type: "pct", def: 100 }
  ],
  cr(v, C, X) {
    const e = Math.min(20000, pos(num(v.exp) - num(v.med))) * clamp(num(v.share), 0, 100) / 100;   // $20,000 per person or home
    C.fed += e;
    X.say(`Claimed ${fmt(e)}, worth ${fmt(P.fed.rate * e)} federal.`);
    if (num(v.med)) X.say("From 2026 the same cost can't be claimed both here and as a medical expense.");
  }
},
{
  id: "mhrtc", cat: "home", kind: "calc",
  q: "I built a secondary unit for a relative 65+ or with a disability",
  name: "Multigenerational home renovation tax credit",
  lines: "L45355 · Schedule 12",
  hint: "A self-contained unit finished in 2026 so a relative 65+, or an adult with the disability credit, can live with family. Refundable 14% of up to $50,000 of costs, once per person in their lifetime.",
  tags: "multigenerational home renovation mhrtc secondary suite basement apartment in-law granny flat parent 45355",
  src: ["multigenerational_home_renovation", "multigenerational_home_renovation_credit"],
  fields: [
    { k: "exp", label: "Renovation costs for the unit (after grants or reimbursements)", type: "money", def: 50000 },
    { k: "share", label: "My share of the claim (%)", type: "pct", def: 100 }
  ],
  cr(v, C, X) {
    // 2026 rate = lowest federal rate 14% (CRA shows 14.5% / $7,250 for 2025), max $7,000
    const cr = .14 * Math.min(50000, pos(num(v.exp))) * clamp(num(v.share), 0, 100) / 100;
    C.fedRef += cr;
    X.say(`Refundable credit: ${fmt(cr)}, paid even if you owe no tax.`);
  }
},
{
  id: "otb_housing", cat: "home", kind: "calc",
  q: "I paid rent or property tax on my home in Ontario",
  name: "Ontario energy and property tax credit, Northern Ontario energy credit",
  lines: "ON-BEN · L61020 · L61040",
  hint: "Paid with the Ontario Trillium Benefit from July 2027 if you file form ON-BEN. Up to $1,307 ($1,488 if 64+), less 2% of family net income over $29,047 single or $36,309 for families. One spouse applies.",
  tags: "oeptc energy property tax credit rent ontario trillium benefit otb on-ben noec northern ontario energy credit tenant homeowner",
  src: ["ontario_energy_property_tax_credit", "northern_ontario_energy_credit", "on_oeptc", "on_noec"],
  fields: [
    { k: "rent", label: "Rent I paid for my Ontario home in 2026", type: "money", def: 24000 },
    { k: "ptax", label: "Property tax I paid on my Ontario home in 2026", type: "money", def: 0 },
    { k: "senior", label: "My spouse or I was 64 or older on Dec 31, 2026", type: "bool", def: false },
    { k: "north", label: "I lived in Northern Ontario on Dec 31, 2026", type: "bool", def: false }
  ],
  cr(v, C, X) {
    // July 2026 to June 2027 values, used as the estimate for the benefit year paid from the 2026 return
    const A = X.afni, sp = !!X.hh.spouse, fam = sp || (X.hh.kids || []).length > 0;
    const occ = .2 * pos(num(v.rent)) + pos(num(v.ptax));   // 20% of rent counts as property tax
    if (!occ) return X.say("These credits need rent or property tax paid on your Ontario home.");
    const energy = Math.min(290, occ);
    const prop = v.senior ? Math.min(occ, 617 + Math.min(581, .1 * occ)) : Math.min(occ, 73 + Math.min(944, .1 * occ));
    const thr = v.senior ? (sp ? 43571 : 36309) : (fam ? 36309 : 29047);
    const oeptc = pos(energy + prop - .02 * pos(A - thr));
    const noec = !v.north ? 0 : fam ? pos(290 - .01 * pos(A - 65356)) : pos(189 - .01 * pos(A - 50833));
    C.ben += oeptc + noec;
    X.say(oeptc ? `Energy and property tax credit: ${fmt(oeptc)} a year.`
      : `Energy and property tax credit: $0. Your costs give ${fmt(energy + prop)}, which is gone once family net income passes ${fmt(thr + (energy + prop) / .02)}.`);
    if (v.north) X.say(`Northern Ontario energy credit: ${fmt(noec)}${noec ? " a year" : `, since it ends at ${fmt(fam ? 94356 : 69733)} of family net income`}.`);
    if (v.senior && oeptc) X.say("If you also get the senior homeowners' property tax grant, low property tax can trim this credit a little.");
  }
},

// ---------------- SCHOOL (learning) ----------------
{
  id: "student_loan_interest", cat: "learning", kind: "calc",
  q: "I paid interest on a government student loan",
  name: "Interest paid on student loans",
  lines: "L31900 · ON 58520",
  hint: "Canada, OSAP or other provincial student loans only, not bank loans or student lines of credit. Federal loans are interest-free since April 2023, so this is mostly OSAP interest, and unused interest carries forward 5 years.",
  tags: "student loan interest osap nslsc canada student loan 31900",
  src: ["student_loan_interest"],
  fields: [
    { k: "amt", label: "Student loan interest paid in 2026", type: "money", def: 600 },
    { k: "cf", label: "Unclaimed interest I paid in 2021 to 2025", type: "money", def: 0 }
  ],
  cr(v, C, X) {
    const a = pos(num(v.amt)) + pos(num(v.cf));   // credit at 14% federal, 5.05% Ontario (before surtax); runs before tuition, which counts line 31900 in its room
    C.fed += a; C.on += a;
    X.say(`Credit amount ${fmt(a)} on both returns. You can leave interest unclaimed and use it in any of the next 5 years instead.`);
  }
},
{
  id: "tuition", cat: "learning", kind: "calc",
  q: "I paid tuition in 2026 or have unused tuition from past years",
  name: "Tuition amount and carry-forwards",
  lines: "Schedule 11 · L32300 · ON(S11) · ON 58560",
  hint: "Fees over $100 per school on your T2202 and professional exam fees give 14% federal, and Ontario balances from 2017 or earlier still count. Leave out fees your employer repaid tax-free or the Canada training credit covers.",
  tags: "tuition t2202 university college course schedule 11 carry forward unused tuition notice of assessment exam fees",
  src: ["tuition_own_2026", "tuition_carryforward_federal", "tuition_carryforward_ontario"],
  fields: [
    { k: "fees", label: "Tuition paid to Canadian schools in 2026 (T2202)", type: "money", def: 8000 },
    { k: "foreign", label: "Tuition paid to a university outside Canada", type: "money", def: 0 },
    { k: "cfFed", label: "Unused federal tuition on my 2025 notice of assessment", type: "money", def: 0 },
    { k: "cfOn", label: "Unused Ontario tuition from 2017 or earlier (notice of assessment)", type: "money", def: 0 }
  ],
  cr(v, C, X) {
    const ti = X.ti, c = X.cppEi, fees = pos(num(v.fees)) + pos(num(v.foreign));
    // Schedule 11 room: taxable income (or federal tax / 14% above $58,523) minus credits on lines 30000 to 31900
    const capF = pos((ti <= 58523 ? ti : brk(ti, P.fed.b) / P.fed.rate) - (P.fedBpa(X.ni) + c.cppBase + c.ei + Math.min(P.fed.cea, X.emp) + C.fed));
    const cfF = Math.min(pos(num(v.cfFed)), capF);   // carry-forward must be used first
    const curF = Math.min(fees, pos(capF - cfF));
    C.fed += cfF + curF;
    X.say(`Federal tuition claimed: ${fmt(cfF + curF)}${cfF ? ` (${fmt(cfF)} carried forward)` : ""}.`);
    const left = fees - curF, cfLeft = pos(num(v.cfFed)) - cfF;
    if (left) X.say(`${fmt(left)} of 2026 fees is unused. Up to ${fmt(pos(Math.min(fees, P.fed.tuitionTransfer) - curF))} can go to a parent, grandparent or spouse; the rest carries forward.`);
    if (cfLeft) X.say(`${fmt(cfLeft)} of your federal carry-forward stays for later years.`);
    // ON(S11): pre-2017 Ontario balance only; room = taxable income (or Ontario tax / 5.05% above $53,891) minus Ontario credits
    if (num(v.cfOn)) {
      const capO = pos((ti <= 53891 ? ti : brk(ti, P.on.b) / P.on.rate) - (P.on.bpa + c.cppBase + c.ei + C.on));
      const cfO = Math.min(pos(num(v.cfOn)), capO);
      C.on += cfO;
      X.say(`Ontario tuition carry-forward used: ${fmt(cfO)}. Only if you lived in Ontario at the end of 2017 and every year since 2021.`);
    }
  }
},
{
  id: "scholarship", cat: "learning", kind: "calc",
  q: "I received a scholarship, bursary or fellowship in 2026",
  name: "Scholarship exemption and student moving expenses",
  lines: "L13010 · L21900 · T4A box 105",
  hint: "Awards for a program you're in full time are tax-free; part-time awards are tax-free up to tuition and materials, and others get $500 tax-free. Moving 40 km+ for school is deductible against the taxable part.",
  tags: "scholarship bursary fellowship award grant t4a box 105 13010 student moving expenses t1-m",
  src: ["scholarship_exemption", "student_moving_expenses"],
  fields: [
    { k: "award", label: "Scholarships, bursaries and fellowships received in 2026", type: "money", def: 5000 },
    { k: "enrol", label: "My enrolment in the program the award supports", type: "select", def: "full", opts: [
      ["full", "Full-time student"], ["ptdis", "Part-time, with a disability"], ["pt", "Part-time student"],
      ["school", "Elementary or high school award"], ["other", "Not enrolled, post-doc or job-related"]] },
    { k: "tm", label: "Tuition and program materials for that program", type: "money", def: 2000, show: v => v.enrol === "pt" },
    { k: "move", label: "Moving costs to get 40 km+ closer to school, if I study full time after secondary school", type: "money", def: 0, show: v => v.enrol === "full" || v.enrol === "other" }
  ],
  inc(v, C, X) { C.income += pos(num(v.award)); },
  ded(v, C, X) {
    const a = pos(num(v.award));
    const full = ["full", "ptdis", "school"].includes(v.enrol) ? a : v.enrol === "pt" ? Math.min(a, pos(num(v.tm))) : 0;
    const exempt = full + Math.min(500, a - full);   // $500 basic exemption on the rest
    const taxable = a - exempt;
    const canMove = v.enrol === "full" || v.enrol === "other";   // student moves need full-time post-secondary study
    const mv = canMove ? Math.min(pos(num(v.move)), taxable) : 0;   // only against taxable award income
    C.ded += exempt + mv;
    X.say(`Tax-free: ${fmt(exempt)}. Taxable on line 13010: ${fmt(taxable)}.`);
    if (canMove && num(v.move)) X.say(mv ? `Moving expenses deducted: ${fmt(mv)}.${num(v.move) > mv ? " The rest carries forward against future award income." : ""}`
      : "Moving costs for school only reduce taxable award income, and yours is fully tax-free. Carry them forward.");
  }
},
{
  id: "llp", cat: "learning", kind: "tip",
  q: "I took money out of my RRSP under the Lifelong Learning Plan",
  name: "Lifelong Learning Plan (LLP) repayments",
  lines: "RC96 · Schedule 7 · L12900",
  hint: "You can take up to $10,000 a year ($20,000 in total) from an RRSP tax-free for full-time school for you or your spouse. It's repaid over 10 years, and any missed repayment is added to your income.",
  tip: "Repayments start in the second year in a row that the student isn't in full-time school, and no later than the fifth year after the first withdrawal. Designate RRSP contributions made in 2026 or by March 1, 2027 as your repayment on Schedule 7; they aren't deductible. RRSP money deposited less than 90 days before a withdrawal can't be deducted. Once the balance is repaid you can use the plan again.",
  tags: "llp lifelong learning plan rrsp withdrawal school repayment rc96 schedule 7",
  src: ["lifelong_learning_plan"],
  fields: [
    { k: "req", label: "Required LLP repayment for 2026 (notice of assessment)", type: "money", def: 2000 },
    { k: "paid", label: "RRSP contributions I'll designate as my repayment", type: "money", def: 2000 }
  ],
  post(v, C, X) { hlRepaySay(v, X, "LLP"); }
},
{
  id: "student_grants", cat: "learning", kind: "tip",
  q: "My child or I will apply for OSAP for full-time studies",
  name: "Canada Student Grant and OSAP grants",
  lines: "Uses 2026 line 15000 · no return line",
  hint: "Non-repayable grants of up to $4,200 a year federal, plus Ontario grants, for full-time students. They're based on gross family income, so RRSP deductions don't raise them.",
  tip: "For a dependent student, the parents' 2026 gross income sets the 2027-28 grant; for a married student, the student's and spouse's income does. The federal grant is full below a threshold for your family size and gone at a cut-off, for example $76,952 and $129,769 for a family of 4. Use the OSAP estimator for the Ontario part and apply every year, even if you think your income is too high. Grants are tax-free for a full-time student.",
  tags: "osap canada student grant student aid csfa university college bursary family income",
  src: ["student_grants_csfa_osap"],
  fields: [{ k: "size", label: "Family size (parents and children, or me, my spouse and children)", type: "int", def: 4, min: 1, max: 10 }],
  post(v, C, X) {
    // 2026-27 full grant below / $0 at, by family size 1 to 7+ ($4,200 max, $525 a month of study)
    const T = [[38474, 69987], [54412, 98017], [66641, 117317], [76952, 129769], [86033, 141180], [94245, 151937], [101797, 161321]];
    const [thr, cut] = T[clamp(Math.round(num(v.size)), 1, 7) - 1];
    const inc = X.R.totalInc + X.spouseNI;
    const g = 4200 * clamp((cut - inc) / (cut - thr), 0, 1);
    X.say(g ? `Estimated Canada Student Grant: about ${fmt(g)} a year on ${fmt(inc)} of family income (straight-line estimate; the exact taper isn't published).`
      : `Canada Student Grant: $0 at ${fmt(inc)} of family income (cut-off ${fmt(cut)}). Loans and OSAP may still apply.`);
  }
},
{
  id: "resp_aip", cat: "learning", kind: "calc",
  q: "I'm taking RESP growth out because no child will use it",
  name: "RESP accumulated income payment rolled into an RRSP",
  lines: "L13000 · L20800 · T1172 · L41800",
  hint: "RESP growth paid to you is taxed as income plus an extra 20% federal tax. Moving up to $50,000 of it into your or your spouse's RRSP, within your room, by 60 days after year end avoids both.",
  tags: "resp accumulated income payment aip rrsp rollover t1172 20% tax education savings",
  src: ["resp_aip_rrsp_rollover"],
  fields: [
    { k: "aip", label: "Accumulated income payment received (T4A box 040)", type: "money", def: 20000 },
    { k: "room", label: "My unused RRSP room", type: "money", def: 20000 },
    { k: "prior", label: "AIP I rolled into an RRSP in earlier years", type: "money", def: 0 }
  ],
  inc(v, C, X) {
    const a = pos(num(v.aip));
    C.income += a;
    C.fedCr -= .2 * a;   // T1172 additional 20% tax, entered as a negative federal credit
  },
  ded(v, C, X) {
    const a = pos(num(v.aip));
    const roll = Math.min(a, pos(num(v.room)), pos(50000 - num(v.prior)));   // $50,000 lifetime, not indexed
    C.ded += roll;
    C.fedCr += .2 * roll;
    X.say(`Rolling ${fmt(roll)} into your RRSP removes it from income and saves ${fmt(.2 * roll)} of the 20% tax. It uses the same RRSP room, so lower your RRSP limit under Savings.`);
    if (a > roll) X.say(`${fmt(a - roll)} stays taxable with ${fmt(.2 * (a - roll))} of extra tax. Moving the RESP to a sibling or waiting may be better.`);
    X.say("Your own contributions come back tax-free; the grants go back to the government.");
  }
},
{
  id: "student_rap", cat: "learning", kind: "tip",
  q: "My student loan payments are hard to afford on my income",
  name: "Repayment Assistance Plan for Canada and Ontario student loans",
  lines: "No return line · apply through NSLSC",
  hint: "If your loan payment is high for your family income, the government pays the interest, and later the principal, above an affordable payment. You pay $0 while a single person's gross income is under $3,866 a month.",
  tip: "The affordable payment is set by gross family income and family size, and is never more than 10% of monthly income. In stage 1 the government covers interest you can't; after 5 years in the plan or 10 years out of school it covers principal too, so the loan is paid off within 15 years. Apply through the National Student Loans Service Centre and renew every 6 months. Interest you pay yourself still counts for the student loan interest credit.",
  tags: "rap repayment assistance plan student loan nslsc osap affordable payment",
  src: ["student_loan_repayment_assistance"],
  fields: [
    { k: "size", label: "Family size", type: "int", def: 1, min: 1, max: 10 },
    { k: "req", label: "My normal monthly student loan payment", type: "money", def: 450 },
    { k: "share", label: "My share of our family's student loan balance (%)", type: "pct", def: 100 }
  ],
  post(v, C, X) {
    // Monthly income threshold Y and increment Z by family size 1 to 7+ (canada.ca, July 2026)
    const Y = [3866, 4535, 5556, 6412, 7170, 7854, 8483], Z = [250, 350, 425, 500, 575, 650, 725];
    const i = clamp(Math.round(num(v.size)), 1, 7) - 1, A = clamp(num(v.share), 0, 100) / 100;
    const m = (X.R.totalInc + X.spouseNI) / 12;
    const ap = m <= Y[i] ? 0 : m * Math.min(.1 * A, 1.5 * ((m - Y[i]) / (100 * Z[i]) + .01) * A);
    const relief = pos(pos(num(v.req)) - ap);
    X.say(!ap ? `Your affordable payment is $0, so the plan would cover your full ${fmt(relief)} a month.`
      : relief ? `Affordable payment about ${fmt(ap)} a month, so the plan would cover about ${fmt(relief)} a month.`
      : `Affordable payment about ${fmt(ap)} a month, above your ${fmt(num(v.req))} payment, so no relief at this income.`);
  }
},
{
  id: "clb", cat: "learning", kind: "calc",
  q: "My child could qualify for the Canada Learning Bond",
  name: "Canada Learning Bond",
  lines: "RESP · no return line",
  hint: "Up to $2,000 paid into an RESP for a child born in 2004 or later while family net income is $58,523 or less (1 to 3 children). No contribution is needed, and past eligible years are paid when you apply.",
  tags: "canada learning bond clb resp low income education savings child",
  src: ["canada_learning_bond"],
  rows: { label: "Child", add: "Add a child", max: 10, fields: [
    { k: "age", label: "Age on Dec 31, 2026", type: "int", def: 4, min: 0, max: 17 },
    { k: "prior", label: "Years this child already got the bond", type: "int", def: 0, min: 0, max: 16 }
  ] },
  cr(v, C, X) {
    const rows = v.rows || [], n = Math.max(rows.length, (X.hh.kids || []).length);
    // Income limit by number of children (1-3, 4, 5); 6+ extends the same $7,541 step (approximate)
    const thr = n <= 3 ? 58523 : n === 4 ? 66036 : 73577 + 7541 * (n - 5);
    if (X.afni > thr) return X.say(`$0: family net income ${fmt(X.afni)} is over the ${fmt(thr)} limit.`);
    let tot = 0;
    for (const r of rows) {
      const prior = clamp(Math.round(num(r.prior)), 0, 16);
      if (num(r.age) + 1 > 15) continue;   // paid for benefit years up to age 15
      const got = prior ? 500 + 100 * (prior - 1) : 0;
      tot += Math.min(prior ? 100 : 500, pos(2000 - got));   // $500 first year, $100 after, $2,000 lifetime
    }
    C.ben += tot;
    X.say(`Canada Learning Bond: ${fmt(tot)} into the RESP for July 2027 to June 2028.`);
  }
},
{
  id: "adult_basic_ed", cat: "learning", kind: "calc",
  q: "My adult basic education tuition was paid by a government program",
  name: "Deduction for adult basic education tuition assistance",
  lines: "L25600 · T4E box 21 · T4A box 196",
  hint: "Tuition assistance for high-school level upgrading or literacy from EI Part II or a similar labour market program is taxable, but you deduct the same amount back. You can't also claim those fees as tuition.",
  tags: "adult basic education tuition assistance ei part ii t4e box 21 t4a box 196 upgrading 25600",
  src: ["adult_basic_education_assistance_deduction"],
  fields: [{ k: "amt", label: "Assistance included in my income (T4E box 21 or T4A box 196)", type: "money", def: 3000 }],
  inc(v, C, X) { C.income += pos(num(v.amt)); },
  ded(v, C, X) { const a = pos(num(v.amt)); C.dedTI += a; X.say(`Deducted ${fmt(a)} from taxable income, so the assistance is tax-free.`); }
}
);
