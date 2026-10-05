// Ontario programs and credits (cat "ontario") and measures that no longer apply (cat "ended").
// Research bucket: ontario_ended. Near-duplicate research ids from different researchers are merged
// into one item each and listed together in src.

SKIPPED.push(
  ["on_oeptc", "folded into otb_housing (items/home_learning.js), which already computes the energy and property tax credit"],
  ["on_noec", "folded into otb_housing (items/home_learning.js), which already computes the Northern Ontario energy credit"]
);

ITEMS.push(
// ---------------- ONTARIO ----------------
{
  id: "on_senior_homeowner_grant", cat: "ontario", kind: "calc",
  q: "I or my spouse is 64+ and we own the Ontario home we live in",
  name: "Ontario Senior Homeowners' Property Tax Grant",
  lines: "ON-BEN 61070 · 61120",
  hint: "Up to $500 toward the 2026 property tax on the home you own and live in, if you or your spouse was 64 or older on Dec 31, 2026. It falls by 3.33% of family net income over $35,000 ($45,000 for a couple).",
  tags: "oshptg senior homeowners property tax grant ontario trillium on-ben 64 older owner",
  src: ["on_oshptg", "ontario_senior_homeowners_property_tax_grant"],
  fields: [{ k: "ptax", label: "Property tax I paid on my home in 2026", type: "money", def: 4000 }],
  cr(v, C, X) {
    const ptax = pos(num(v.ptax)), A = X.afni, thr = X.hh.spouse ? 45000 : 35000;   // thresholds not indexed
    if (!ptax) return X.say("The grant needs property tax you paid on a home you own and live in.");
    // Grant = lesser of property tax and $500 less 3.33% of family net income over the threshold
    const grant = Math.min(ptax, pos(500 - .0333 * pos(A - thr)));
    C.ben += grant;
    X.say(grant ? `Grant: ${fmt(grant)}, paid as a lump sum after your return is assessed. One grant per couple.`
      : `$0: family net income of ${fmt(A)} is over ${fmt(thr + 500 / .0333)}, where the grant ends.`);
    if (grant && ptax < 1241) X.say("With property tax this low, the grant also trims your energy and property tax credit a little.");
  }
},
{
  id: "on_senior_transit", cat: "ontario", kind: "calc",
  q: "I was 65+ on Dec 31, 2025 and pay for public transit in Ontario",
  name: "Ontario Seniors' Public Transit Tax Credit",
  lines: "ON479 63100",
  hint: "Refundable 15% of up to $3,000 of your own Ontario transit fares and passes, so up to $450 at any income. You must be born in 1960 or earlier. GO and specialized transit count; VIA, coaches and ride-hailing don't.",
  tags: "senior transit ttc presto go transit metrolinx bus subway streetcar fare pass wheel-trans specialized transit 65 older",
  src: ["ontario_seniors_public_transit_credit", "on_seniors_public_transit_credit"],
  fields: [{ k: "cost", label: "My 2026 Ontario transit costs, after any reimbursement", type: "money", def: 1500 }],
  cr(v, C, X) {
    const c = Math.min(3000, pos(num(v.cost)));   // eligible costs capped at $3,000
    const cr = .15 * c;                        // 15% refundable, max $450
    C.onRef += cr;
    X.say(`Credit: ${fmt(cr)} (15% of ${fmt(c)}). Keep your receipts or PRESTO history. Only you can claim your own fares.`);
  }
},
{
  id: "on_focused_flow_through", cat: "ontario", kind: "calc",
  q: "I bought flow-through shares that fund Ontario mineral exploration",
  name: "Ontario focused flow-through share tax credit",
  lines: "ON479 63220 · T1221",
  hint: "Refundable 5% of the Ontario exploration expenses renounced to you, shown on your T101 or T5013 and Form T1221. It comes on top of the resource deduction and the federal exploration credit.",
  tags: "flow-through shares ffts mining mineral exploration cee t101 t5013 t1221 resource junior miner",
  src: ["on_focused_flow_through_credit"],
  fields: [{ k: "exp", label: "Qualifying Ontario exploration expenses (Form T1221)", type: "money", def: 10000 }],
  cr(v, C, X) {
    const cr = .05 * pos(num(v.exp));   // 5% refundable
    C.onRef += cr;
    X.say(`Ontario credit: ${fmt(cr)}. It reduces your exploration expense pool next year. Claim the resource deduction itself separately.`);
  }
},
{
  id: "on_senior_dental_drug", cat: "ontario", kind: "tip",
  q: "I'm 65 or older and my income is low",
  name: "Ontario Seniors Dental Care Program and Seniors Co-Payment Program",
  hint: "Free routine dental care, and no $100 drug deductible plus a $2 co-pay per prescription, if net income is $25,480 or less ($42,290 for a couple) for August 2026 to July 2027.",
  tip: "Both programs check the net income on your last tax return, so file every year, and so should your spouse. RRSP or FHSA deductions that lower net income can bring you under the limit. Apply for dental care on ontario.ca, and send the Seniors Co-Payment application so pharmacies charge the lower co-pay.",
  tags: "seniors dental care program osdcp free dentist ontario drug benefit odb co-payment deductible prescription pharmacy low income 65",
  src: ["on_seniors_income_tested_health"],
  fields: [
    { k: "rx", label: "Prescriptions I fill in a year", type: "int", def: 20, min: 0 },
    { k: "dental", label: "Dental care I'd otherwise pay for in a year", type: "money", def: 1000 }
  ],
  post(v, C, X) {
    const couple = !!X.hh.spouse, inc = couple ? X.afni : X.ni, lim = couple ? 42290 : 25480;   // Aug 2026 to Jul 2027 limits
    const who = couple ? "Your combined net income" : "Your net income";
    if (inc > lim) return X.say(`${who} of ${fmt(inc)} is over the ${fmt(lim)} limit, so these programs don't apply.`);
    const drug = 100 + (6.11 - 2) * clamp(Math.round(num(v.rx)), 0, 400);   // waived $100 deductible + $4.11 less per fill
    X.say(`${who} of ${fmt(inc)} is under the ${fmt(lim)} limit. Together they are worth about ${fmt(drug + num(v.dental))} a year to you.`);
  }
},
{
  id: "on_healthy_smiles", cat: "ontario", kind: "tip",
  q: "My kids are 17 or under and our family income is low",
  name: "Healthy Smiles Ontario",
  hint: "Free dental care for children 17 and under when adjusted family net income is $29,065 or less for one child, plus $2,200 for each extra child (from July 1, 2026).",
  tip: "Eligibility uses your family's net income from your tax returns, so both parents should file every year. Deductions such as RRSP contributions lower that income. Apply online or through your local public health unit; children in Ontario Works or ODSP families qualify automatically. It works with the Canadian Dental Care Plan without double coverage.",
  tags: "healthy smiles ontario hso kids dental dentist children free dental low income",
  src: ["healthy_smiles_ontario"],
  post(v, C, X) {
    const n = (X.hh.kids || []).filter(k => num(k.age) < 18).length;   // children 17 and under
    if (!n) return X.say("Turn on Children under Family and add children 17 or under to check eligibility.");
    const thr = 29065 + 2200 * (n - 1);   // $29,065 for one child, +$2,200 per extra child
    X.say(X.afni <= thr ? `Family net income of ${fmt(X.afni)} is under the ${fmt(thr)} limit for ${n} child${n > 1 ? "ren" : ""}, so they likely qualify.`
      : `Family net income of ${fmt(X.afni)} is over the ${fmt(thr)} limit for ${n} child${n > 1 ? "ren" : ""}, so they don't qualify.`);
  }
},
{
  id: "on_oesp", cat: "ontario", kind: "calc",
  q: "My household has a low income and pays an Ontario electricity bill",
  name: "Ontario Electricity Support Program (OESP)",
  lines: "Not on the return · income checked with CRA",
  hint: "A monthly credit of $35 to $75 on your electricity bill, set by household after-tax income (up to $71,000) and how many people live with you. Electric heat, some medical devices or Indigenous households get more.",
  tags: "oesp electricity hydro bill credit ontario energy board oeb low income leap utility",
  src: ["ontario_electricity_support_program"],
  fields: [
    { k: "others", label: "Other people living with me (not a partner or child I entered)", type: "int", def: 0, min: 0, max: 20 },
    { k: "othInc", label: "Their total after-tax income", type: "money", def: 0, show: v => num(v.others) > 0 }
  ],
  post(v, C, X) {
    const sp = X.hh.spouse, n = 1 + (sp ? 1 : 0) + (X.hh.kids || []).length + clamp(Math.round(num(v.others)), 0, 20);
    const mine = X.ni - X.R.fedTax - X.R.onTax;
    const spouse = sp ? X.spouseNI - simpleTax(X.spouseNI) : 0;
    const inc = pos(mine + spouse + (num(v.others) > 0 ? num(v.othInc) : 0));
    // OEB table: monthly credit by after-tax household income band, for 1, 2, 3, 4, 5, 6, 7+ people
    const T = [[38000, [45, 45, 51, 57, 63, 75, 75]], [54000, [0, 40, 45, 51, 57, 63, 75]],
      [65000, [0, 0, 35, 40, 45, 51, 57]], [71000, [0, 0, 0, 0, 35, 40, 45]]];
    const band = T.find(b => Math.round(inc) <= b[0]);
    const m = band ? band[1][Math.min(n, 7) - 1] : 0;
    C.ben += 12 * m;
    X.say(m ? `${fmt(m)} a month (${fmt(12 * m)} a year) for ${n} ${n > 1 ? "people" : "person"} with household after-tax income of about ${fmt(inc)}. Enhanced rates are higher.`
      : `$0: household after-tax income of about ${fmt(inc)} is too high for ${n} ${n > 1 ? "people" : "person"}.`);
  }
},
{
  id: "on_rent_geared_help", cat: "ontario", kind: "calc",
  q: "I get rent help based on my income (social housing or COHB)",
  name: "Canada-Ontario Housing Benefit, rent-geared-to-income housing",
  lines: "Not on the return · uses line 23600",
  hint: "Both programs expect you to pay about 30% of household net income from your last return toward rent. Filing every year keeps the help, and deductions such as RRSP contributions raise it.",
  tags: "cohb canada-ontario housing benefit rent supplement portable housing benefit rgi rent geared to income social housing subsidized housing service manager",
  src: ["canada_ontario_housing_benefit", "ontario_rgi_social_housing_rent"],
  fields: [
    { k: "type", label: "Which program", type: "select", def: "cohb", opts: [["cohb", "Canada-Ontario Housing Benefit (I rent privately)"], ["rgi", "Rent-geared-to-income social housing"]] },
    { k: "amr", label: "Average market rent for my area and unit size (monthly)", type: "money", def: 1800, show: v => v.type !== "rgi" },
    { k: "mkt", label: "Market rent for my unit (monthly)", type: "money", def: 1800, show: v => v.type === "rgi" },
    { k: "oth", label: "Net income of other household members (not my partner)", type: "money", def: 0 }
  ],
  cr(v, C, X) {
    const rgi = v.type === "rgi", pay = .3 * (X.afni + num(v.oth)) / 12;   // 30% of household net income, per month
    const cap = rgi ? num(v.mkt) : .8 * num(v.amr);                         // COHB covers the gap up to 80% of average market rent
    const m = pos(cap - pay);
    C.ben += 12 * m;
    X.say(m ? `About ${fmt(m)} a month (${fmt(12 * m)} a year). Each $1,000 of deductions adds about $300 a year.`
      : `$0: 30% of household net income is ${fmt(pay)} a month, above ${rgi ? "your unit's market rent" : "80% of the average market rent"} (${fmt(cap)}).`);
    if (!rgi) X.say("Service managers cap how many new households they take each year.");
  }
},
{
  id: "on_acsd", cat: "ontario", kind: "calc",
  q: "My child under 18 has a severe disability and lives at home",
  name: "Assistance for Children with Severe Disabilities (ACSD)",
  lines: "Not on the return · Ontario ministry program",
  hint: "Ontario pays $25 to $678 a month per child for extra disability costs when family income is $77,640 or less. The ministry sets the amount, so enter what you get or expect.",
  tags: "acsd severe disability child ontario assistance special needs monthly payment",
  src: ["ontario_acsd"],
  rows: { label: "Child", add: "Add a child", max: 6, fields: [
    { k: "monthly", label: "Monthly ACSD amount ($25 to $678)", type: "money", def: 400, min: 25, max: 678 }
  ] },
  cr(v, C, X) {
    const rows = v.rows || [];
    if (!rows.length) return;
    if (X.afni > 77640) return X.say(`$0: family net income of ${fmt(X.afni)} is over the $77,640 limit.`);   // 2026 income limit
    const yr = rows.reduce((s, r) => s + 12 * clamp(num(r.monthly), 25, 678), 0);   // rates from July 1, 2026
    C.ben += yr;
    X.say(`${fmt(yr)} a year for ${rows.length} child${rows.length > 1 ? "ren" : ""}. It's separate from the Child Disability Benefit.`);
  }
},
{
  id: "on_gains", cat: "ontario", kind: "tip",
  q: "I'm 65+ and get the Guaranteed Income Supplement (GIS)",
  name: "Ontario Guaranteed Annual Income System (GAINS)",
  hint: "Ontario adds up to $92 a month ($1,104 a year) for seniors on GIS. It stops once private income, not counting OAS and GIS, passes $4,416 single or $8,832 for a couple.",
  tip: "GAINS is paid automatically with your GIS, as long as you and your spouse file a return every year. It uses last year's income, so your 2026 return sets payments from July 2027. TFSA withdrawals don't count as income, so drawing on a TFSA before an RRSP keeps GIS and GAINS higher.",
  tags: "gains guaranteed annual income system gis guaranteed income supplement oas old age security senior low income top-up",
  src: ["on_gains"],
  post(v, C, X) {
    const couple = !!X.hh.spouse, pi = couple ? X.afni : X.ni, lim = couple ? 8832 : 4416;
    // Implied reduction: 25 cents per $1 single, 12.5 cents per $1 of combined income for each spouse
    const est = pos(1104 - (couple ? .125 : .25) * pi);
    X.say(est ? `Rough estimate: about ${fmt(est)} a year for you if you get GIS. Ontario doesn't publish the exact reduction.`
      : `$0: ${couple ? "combined " : ""}income of ${fmt(pi)} on this dashboard is over the ${fmt(lim)} limit.`);
  }
},
{
  id: "on_coop_education", cat: "ontario", kind: "calc",
  q: "My unincorporated business hired an Ontario co-op student",
  name: "Ontario co-operative education tax credit",
  lines: "ON479 63260 to 63300",
  hint: "Refundable 25% to 30% of the wages or agency fees for each qualifying co-op placement that ended in 2026, up to $3,000 a placement. For sole proprietors and partners, not limited partners.",
  tags: "co-op coop student placement internship employer business credit ontario university college",
  src: ["ontario_coop_education_credit", "on_coop_education_credit"],
  fields: [{ k: "payroll", label: "My business's total 2025 payroll", type: "money", def: 100000 }],
  rows: { label: "Placement", add: "Add a placement", max: 10, fields: [
    { k: "wages", label: "Wages and agency fees for this placement, after other grants", type: "money", def: 12000 }
  ] },
  cr(v, C, X) {
    const p = pos(num(v.payroll));
    // 30% if prior-year payroll is $400,000 or less, 25% at $600,000 or more, sliding in between
    const rate = p <= 400000 ? .30 : p >= 600000 ? .25 : .30 - .05 * (p - 400000) / 200000;
    const cr = (v.rows || []).reduce((s, r) => s + Math.min(3000, rate * pos(num(r.wages))), 0);   // $3,000 cap per placement
    C.onRef += cr;
    X.say(`Rate ${Math.round(rate * 1000) / 10}%: credit ${fmt(cr)}. The credit counts as business income next year.`);
  }
},
{
  id: "on_farmer_food_donation", cat: "ontario", kind: "calc",
  q: "I farm and gave my farm products to a food bank or school program",
  name: "Ontario community food program donation tax credit for farmers",
  lines: "ON428 62150",
  hint: "An extra 25% Ontario credit on farm products you grew or raised and gave to an eligible community food program. Also enter the gift under Charitable donations. Unused amounts carry forward 5 years.",
  tags: "farmer farm food bank student nutrition program donation agricultural products community food program",
  src: ["on_community_food_farmers_credit"],
  fields: [{ k: "amt", label: "Value of farm products donated in 2026", type: "money", def: 2000 }],
  cr(v, C, X) {
    C.onCrPost += .25 * pos(num(v.amt));   // 25%, non-refundable, taken after the Ontario surtax and tax reduction
  },
  post(v, C, X) {
    const cr = .25 * pos(num(v.amt));
    // If Ontario tax before the health premium is already $0, the credit was limited by it
    X.say(X.R.onTax - X.R.onHP > 0 ? `Credit: ${fmt(cr)} (25% of ${fmt(num(v.amt))}). Spouses can split it.`
      : `Up to ${fmt(cr)}, but it can't go below $0 Ontario tax. Carry forward what you can't use for up to 5 years.`);
  }
},

// ---------------- ENDED ----------------
{
  id: "ended_home_office_flat", cat: "ended", kind: "ended", ended: "2022",
  q: "Flat-rate home office deduction ($2 a day)",
  name: "Temporary flat rate method, Form T777S", lines: "former L22900",
  hint: "It covered only 2020 to 2022; for 2026, employees required to work from home claim actual costs with a T2200 from their employer.",
  tags: "work from home wfh home office 2 dollars per day covid t777s t2200 temporary flat rate",
  src: ["ended_flat_rate_home_office", "ended_home_office_flat_rate"]
},
{
  id: "ended_transit_pass", cat: "ended", kind: "ended", ended: "2017",
  q: "Public transit pass credit",
  name: "Federal public transit amount", lines: "former L36400",
  hint: "It ended for transit used after June 30, 2017, and commuting costs aren't deductible, though seniors can use the Ontario Seniors' Public Transit Tax Credit.",
  tags: "transit pass ttc presto monthly pass commute bus subway go train",
  src: ["ended_public_transit_credit"]
},
{
  id: "ended_carbon_rebate", cat: "ended", kind: "ended", ended: "2025",
  q: "Canada Carbon Rebate",
  name: "Climate action incentive payment, with rural and child supplements", lines: "No return line",
  hint: "It ended with the consumer carbon charge: the last regular payment was in April 2025, and nothing is paid after October 30, 2026.",
  tags: "carbon tax rebate climate action incentive cai ccr fuel charge quarterly payment",
  src: ["ended_canada_carbon_rebate"]
},
{
  id: "ended_gst_topups", cat: "ended", kind: "ended", ended: "2024",
  q: "One-time GST and grocery top-up payments",
  name: "2022 GST credit doubling, 2023 Grocery Rebate, June 2026 top-up", lines: "No return line",
  hint: "The last one-time top-up was paid in June 2026 based on 2024 income. Your 2026 return only sets the regular GST/HST credit, now the Canada Groceries and Essentials Benefit.",
  tags: "grocery rebate gst credit doubling one-time payment cgeb top-up extra payment",
  src: ["ended_one_time_gst_topups"]
},
{
  id: "ended_digital_news", cat: "ended", kind: "ended", ended: "2024",
  q: "Digital news subscription credit",
  name: "Digital news subscription tax credit", lines: "former L31350",
  hint: "It gave 15% of up to $500 for 2020 to 2024 only; you can still claim a missed year by asking CRA to adjust that return.",
  tags: "newspaper subscription digital news online news credit",
  src: ["ended_digital_news_subscription", "ended_digital_news_credit"]
},
{
  id: "ended_fitness_arts", cat: "ended", kind: "ended", ended: "2016",
  q: "Children's fitness and arts tax credits",
  name: "Federal children's fitness and arts amounts", lines: "former lines 365 and 370",
  hint: "They were halved in 2016 and eliminated from 2017, but day camps and day sports schools can still count as child care expenses under Children.",
  tags: "kids sports hockey soccer swimming music lessons arts fitness credit",
  src: ["ended_childrens_fitness_arts", "ended_childrens_fitness_arts_credits"]
},
{
  id: "ended_on_childrens_activity", cat: "ended", kind: "ended", ended: "2016",
  q: "Ontario Children's Activity Tax Credit",
  name: "Ontario children's activity tax credit", lines: "former ON479",
  hint: "Ontario eliminated it after 2016, but day camps can still count as child care expenses, which also opens the Ontario CARE credit.",
  tags: "kids sports arts activity lessons ontario credit",
  src: ["ended_ontario_childrens_activity", "ended_on_childrens_activity_credit"]
},
{
  id: "ended_hatc_medical_double", cat: "ended", kind: "ended", ended: "2025",
  q: "Claiming a renovation under both medical and home accessibility",
  name: "Home accessibility and medical expense double claim", lines: "L31285 · L33099",
  hint: "From 2026 a cost claimed as a medical expense can't also count for the home accessibility credit, so put each cost where it saves more, usually medical expenses at higher incomes.",
  tags: "hatc home accessibility tax credit medical expense double claim renovation ramp grab bars bill c-15",
  src: ["hatc_metc_double_claim_ended", "ended_hatc_metc_double_claim"]
},
{
  id: "ended_on_taxpayer_rebate", cat: "ended", kind: "ended", ended: "2025",
  q: "Ontario $200 taxpayer rebate",
  name: "Ontario Taxpayer Rebate", lines: "No return line",
  hint: "It was a one-time 2025 payment of $200 per adult and per child for people who filed a 2023 return, and nothing is paid based on 2026.",
  tags: "ontario rebate cheque 200 dollars one-time payment",
  src: ["ended_on_taxpayer_rebate"]
},
{
  id: "ended_child_amount", cat: "ended", kind: "ended", ended: "2014",
  q: "Federal amount for children under 18",
  name: "Child tax credit amount", lines: "former line 367",
  hint: "Children now count through the Canada Child Benefit, the eligible dependant amount and the caregiver amount for a child with an impairment.",
  tags: "child tax credit amount for children under 18 kids credit",
  src: ["ended_child_amount"]
},
{
  id: "ended_education_textbook", cat: "ended", kind: "ended", ended: "2016",
  q: "Education and textbook amounts",
  name: "Federal education and textbook amounts", lines: "former monthly amounts, Schedule 11",
  hint: "They were eliminated from 2017 while the tuition credit stayed, and unused amounts from 2016 and earlier are still in your federal tuition carryforward.",
  tags: "education amount textbook amount student monthly credit schedule 11 carryforward",
  src: ["ended_education_textbook_amounts", "ended_fed_education_textbook_amounts"]
},
{
  id: "ended_on_tuition", cat: "ended", kind: "ended", ended: "2017",
  q: "Ontario tuition and education credits",
  name: "Ontario tuition and education amounts", lines: "former ON428 · carryforward ON 58560",
  hint: "Ontario stopped them for studies after September 4, 2017, but unused Ontario amounts from before then can still be claimed on line 58560.",
  tags: "ontario tuition credit education amount student university college carryforward on(s11)",
  src: ["ended_ontario_tuition_education_credit", "ended_on_tuition_education_credits"]
},
{
  id: "ended_on_seniors_home_safety", cat: "ended", kind: "ended", ended: "2022",
  q: "Ontario Seniors' Home Safety Tax Credit",
  name: "Ontario seniors' home safety tax credit", lines: "former ON479",
  hint: "It gave 25% of up to $10,000 for 2021 and 2022 only; for 2026 use the federal home accessibility credit, medical expenses or the multigenerational home renovation credit.",
  tags: "seniors home safety grab bars ramp renovation accessibility ontario credit",
  src: ["ended_ontario_seniors_home_safety", "ontario_seniors_home_safety_credit_ended", "ontario_seniors_home_safety_credit", "ended_on_seniors_home_safety_credit"]
},
{
  id: "ended_on_jobs_training", cat: "ended", kind: "ended", ended: "2022",
  q: "Ontario Jobs Training Tax Credit",
  name: "Ontario jobs training tax credit", lines: "former ON479",
  hint: "It refunded 50% of up to $4,000 of training fees for 2021 and 2022 only; the federal Canada training credit and tuition credit remain.",
  tags: "job training course ontario credit retraining career",
  src: ["ended_ontario_jobs_training_credit", "ended_on_jobs_training_credit"]
},
{
  id: "ended_on_staycation", cat: "ended", kind: "ended", ended: "2022",
  q: "Ontario Staycation Tax Credit",
  name: "Ontario staycation tax credit", lines: "former ON479",
  hint: "It refunded 20% of 2022 Ontario vacation stays (up to $200, or $400 for a family) and was never extended.",
  tags: "staycation vacation hotel cottage travel ontario credit",
  src: ["ended_on_staycation_credit"]
},
{
  id: "ended_uccb", cat: "ended", kind: "ended", ended: "2016",
  q: "Universal Child Care Benefit (UCCB)",
  name: "Universal Child Care Benefit", lines: "former line 117",
  hint: "It was replaced by the tax-free Canada Child Benefit in July 2016.",
  tags: "uccb universal child care benefit taxable child payment",
  src: ["ended_uccb"]
},
{
  id: "ended_family_tax_cut", cat: "ended", kind: "ended", ended: "2015",
  q: "Family Tax Cut (income splitting for parents)",
  name: "Family tax cut credit", lines: "former line 423 · Schedule 1-A",
  hint: "It let couples with children under 18 split income for 2014 and 2015 only; pension splitting and spousal RRSPs still let couples shift income.",
  tags: "family tax cut income splitting couples children schedule 1-a",
  src: ["ended_family_tax_cut"]
},
{
  id: "ended_old_caregiver", cat: "ended", kind: "ended", ended: "2016",
  q: "Caregiver amount for a parent 65+ without an impairment",
  name: "Pre-2017 caregiver and infirm dependant amounts", lines: "former lines 315 and 306",
  hint: "The Canada caregiver credit replaced it in 2017 and needs an impairment, though a parent without one can still be your eligible dependant if you're single.",
  tags: "caregiver amount parent grandparent senior living with me infirm dependant",
  src: ["ended_old_caregiver_amounts"]
},
{
  id: "ended_first_time_donor", cat: "ended", kind: "ended", ended: "2017",
  q: "First-time donor's super credit",
  name: "First-time donor's super credit", lines: "former Schedule 9",
  hint: "The extra 25% on up to $1,000 of a first-time donor's cash gifts expired after 2017, and gifts still get the regular donation credit.",
  tags: "first-time donor super credit fdsc charity donation",
  src: ["ended_first_time_donor_super_credit"]
},
{
  id: "ended_working_canadians_rebate", cat: "ended", kind: "ended", ended: "never enacted",
  q: "Working Canadians Rebate ($250)",
  name: "Proposed Working Canadians Rebate", lines: "No return line",
  hint: "It was proposed in November 2024 for people who earned up to $150,000 in 2023, but it never became law.",
  tags: "working canadians rebate 250 cheque proposed",
  src: ["ended_working_canadians_rebate"]
},
{
  id: "ended_interim_dental", cat: "ended", kind: "ended", ended: "2024",
  q: "Interim Canada Dental Benefit",
  name: "Canada Dental Benefit for children under 12", lines: "No return line",
  hint: "It paid up to $650 per child for dental care from October 2022 to June 2024, and the Canadian Dental Care Plan and Healthy Smiles Ontario now fill that role.",
  tags: "canada dental benefit cdb kids dentist children under 12 cdcp",
  src: ["ended_interim_canada_dental_benefit"]
},
{
  id: "ended_chb_topup", cat: "ended", kind: "ended", ended: "2023",
  q: "One-time $500 Canada Housing Benefit top-up",
  name: "One-time top-up to the Canada Housing Benefit", lines: "No return line",
  hint: "It was a single $500 payment for low-income renters based on 2021 income, with applications closing March 31, 2023; the ongoing program is the Canada-Ontario Housing Benefit.",
  tags: "canada housing benefit 500 rent top-up renters one-time payment",
  src: ["ended_canada_housing_benefit_topup"]
},
{
  id: "ended_ccb_young_child", cat: "ended", kind: "ended", ended: "2021",
  q: "Canada Child Benefit young child supplement",
  name: "CCB young child supplement", lines: "No return line",
  hint: "The extra COVID relief payments for children under 6 were made for 2021 only, and the regular Canada Child Benefit continues.",
  tags: "ccb young child supplement covid extra payment children under 6",
  src: ["ended_ccb_young_child_supplement"]
},
{
  id: "ended_care_topup", cat: "ended", kind: "ended", ended: "2021",
  q: "Ontario CARE credit 20% top-up",
  name: "2021 CARE tax credit enhancement", lines: "former ON479-A",
  hint: "The 20% boost applied to 2021 only, and the regular Ontario CARE credit continues under Children.",
  tags: "care credit child care ontario top-up 20 percent",
  src: ["ended_care_2021_topup"]
},
{
  id: "ended_on_healthy_homes", cat: "ended", kind: "ended", ended: "2016",
  q: "Ontario Healthy Homes Renovation Tax Credit",
  name: "Ontario healthy homes renovation tax credit", lines: "former ON479",
  hint: "It refunded 15% of up to $10,000 of accessibility renovations for seniors until 2016; for 2026 use the federal home accessibility credit or medical expenses.",
  tags: "healthy homes renovation seniors accessibility ontario credit",
  src: ["ontario_healthy_homes_renovation_credit", "ended_on_healthy_homes_credit"]
},
{
  id: "ended_home_relocation_loan", cat: "ended", kind: "ended", ended: "2017",
  q: "Home relocation loan deduction",
  name: "Employee home relocation loan deduction", lines: "former L24800",
  hint: "It was repealed from 2018, so the taxable benefit on a low-interest employer housing loan now has no offsetting deduction.",
  tags: "relocation loan employer housing loan interest benefit deduction",
  src: ["ended_home_relocation_loan_deduction"]
},
{
  id: "ended_labour_funds", cat: "ended", kind: "ended", ended: "2016",
  q: "Labour-sponsored fund tax credit",
  name: "Federal LSVCC credit for federal funds, Ontario LSIF credit", lines: "L41400 · former Ontario LSIF",
  hint: "Ontario's credit ended after 2011 and the federal credit for federally registered funds after 2016, and Ontario has no provincially registered funds left to claim.",
  tags: "labour-sponsored fund lsvcc lsif venture capital credit",
  src: ["ended_ontario_lsif_credit", "ended_federal_lsvcc_federal_funds"]
},
{
  id: "ended_entrepreneurs_incentive", cat: "ended", kind: "ended", ended: "never enacted",
  q: "Canadian Entrepreneurs' Incentive",
  name: "Proposed lower capital gains inclusion for founders", lines: "Never legislated",
  hint: "Proposed in Budget 2024 and cancelled in Budget 2025, so founders selling shares still rely on the lifetime capital gains exemption.",
  tags: "entrepreneurs incentive cei founder capital gains business sale budget 2024",
  src: ["ended_canadian_entrepreneurs_incentive"]
},
{
  id: "ended_overseas_employment", cat: "ended", kind: "ended", ended: "2015",
  q: "Overseas employment tax credit",
  name: "Overseas employment tax credit", lines: "former Form T626",
  hint: "It was phased out and gone from 2016, so work abroad in 2026 relies on the foreign tax credit or a tax treaty.",
  tags: "overseas employment work abroad foreign project t626 oetc",
  src: ["ended_overseas_employment_credit"]
},
{
  id: "ended_gifts_of_medicine", cat: "ended", kind: "ended", ended: "2017",
  q: "Extra deduction for donating medicine",
  name: "Additional deduction for gifts of medicine", lines: "former deduction, Schedule 9",
  hint: "It ended for gifts made after March 21, 2017, and donated medicine still gets the regular charitable donation credit.",
  tags: "gifts of medicine donation pharmaceutical charity abroad",
  src: ["ended_gifts_of_medicine"]
},
{
  id: "ended_fuel_charge_farmers", cat: "ended", kind: "ended", ended: "2025",
  q: "Return of fuel charge proceeds to farmers credit",
  name: "Fuel charge farmers tax credit", lines: "former L47556 · T2043",
  hint: "The federal fuel charge was removed on April 1, 2025, so the last credit was for farm fiscal periods ending in 2025, and nothing replaced it.",
  tags: "farmer fuel charge carbon tax credit t2043 farming",
  src: ["ended_fuel_charge_farmers_credit"]
},
{
  id: "ended_on_apprenticeship", cat: "ended", kind: "ended", ended: "2020",
  q: "Ontario Apprenticeship Training Tax Credit",
  name: "Ontario apprenticeship training tax credit", lines: "former ON479",
  hint: "It closed to apprentices registered after November 14, 2017 and ran out by late 2020, replaced by Ontario employer grants.",
  tags: "apprentice apprenticeship training employer trades ontario credit",
  src: ["ended_ontario_apprenticeship_training_credit"]
},
{
  id: "ended_municipal_allowance", cat: "ended", kind: "ended", ended: "2018",
  q: "Tax-free allowance for elected municipal officials",
  name: "One-third tax-free expense allowance", lines: "T4 box 14",
  hint: "Since 2019 the whole expense allowance for councillors and school trustees is taxable, though actual work expenses may be deductible with a T2200.",
  tags: "municipal councillor mayor school trustee allowance one-third tax-free",
  src: ["ended_municipal_officer_allowance"]
}
);
