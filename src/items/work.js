// Work items: employment expenses, side business, stock options, moving, work credits, work strategies,
// plus the northern residents deductions (home) and the Canada training credit (learning).
// Research bucket "work" (research/work.json). 2026 constants are inline with short comments.
// Wrapped in a function so helper names can't clash with other items files.
(() => {

// Federal and Ontario tax at another taxable income, rebuilt from this return's credits the way engine.js does.
// Post phase only (needs X.R). Used for estimates and for amounts the CRA recomputes (averaging, EI repayment).
function wkTaxAt(X, ti) {
  const R = X.R, C = X.C, c = R.cppEi;
  ti = pos(ti);
  const ni = pos(R.ni + ti - R.ti);
  const divFed = C.eligDiv * P.div.eligGross * P.div.fedElig + C.nonEligDiv * P.div.nonGross * P.div.fedNon;
  const fedCr = P.fed.rate * (P.fedBpa(ni) + c.cppBase + c.ei + Math.min(P.fed.cea, R.emp) + C.fed + R.fedMedNet) + R.donFed + R.topup + divFed + C.fedCr;
  const fed = pos(brk(ti, P.fed.b) - fedCr);
  const b = pos(brk(ti, P.on.b) - P.on.rate * (P.on.bpa + c.cppBase + c.ei + C.on + R.onMedNet) - R.donOn - C.onCr);
  const divOn = C.eligDiv * P.div.eligGross * P.div.onElig + C.nonEligDiv * P.div.nonGross * P.div.onNon;
  const l73 = pos(b + .2 * pos(b - P.on.s1) + .36 * pos(b - P.on.s2) - divOn);
  const red = Math.min(l73, pos(2 * (P.on.redBasic + P.on.redDep * C.redDeps) - l73));
  const afterRed = pos(l73 - red - C.onCrPost);
  const lift = Math.min(afterRed, pos(Math.min(P.on.liftMax, P.on.liftRate * R.emp) - .05 * Math.max(0, ni - P.on.liftInd, R.afni + ti - R.ti - P.on.liftFam)));
  const on = afterRed - lift + ohp(ti);
  return { fed, on, total: fed + on };
}
// Tax on the slice of taxable income between lo and hi (post phase only)
const wkSlice = (X, hi, lo) => wkTaxAt(X, hi).total - wkTaxAt(X, lo).total;
const wkPct = x => (Math.round(x * 1000) / 10) + "%";

// Side business: net profit after expenses and business-use-of-home (BUOH can't create a loss)
function wkBiz(v) {
  const g = pos(num(v.gross));
  const exp = pos(num(v.exp)) + .5 * pos(num(v.meals)) + pos(num(v.cca));   // meals and entertainment 50% (ITA 67.1)
  const before = g - exp;
  const want = v.home ? clamp(num(v.homePct), 0, 100) / 100 * pos(num(v.homeCosts)) : 0;
  const buoh = Math.min(want, pos(before));
  return { g, exp, buoh, lost: want - buoh, net: before - buoh };
}

// Stock option deductions (line 24900): 50% of the qualifying benefit, plus 50% more on shares donated within 30 days
function wkOpt(v) {
  const b = pos(num(v.ben)), q = v.qual ? pos(b - pos(num(v.nq))) : 0;
  return { b, q, d1: .5 * q, d2: .5 * Math.min(pos(num(v.don)), q) };
}

// Employee motor vehicle: 2026 lease limits by lease start year [capital cost ceiling, monthly lease cap], before HST
const WK_LEASE = { "2026": [39000, 1100], "2025": [38000, 1100], "2024": [37000, 1050], "2023": [36000, 950], "2022": [34000, 900], "2019": [30000, 800] };
function wkVehicle(v) {
  const tkm = pos(num(v.tkm)), use = tkm ? clamp(pos(num(v.wkm)) / tkm, 0, 1) : 0;
  let cca = 0, lease = 0;
  if (v.own === "new") {
    const cost = pos(num(v.cost));
    cca = v.zev ? pos(Math.min(cost, 61000) * 1.13 - pos(num(v.evInc))) * 1.0   // Class 54 ZEV: $61,000 + HST cap, less any federal EV incentive, 100% first year
      : Math.min(cost, 39000) * 1.13 * .45;            // Class 10 / 10.1: $39,000 + HST cap, 45% first year (30% x 1.5)
  } else if (v.own === "old") cca = .30 * pos(num(v.ucc));   // Class 10 / 10.1 / 54 after the first year: 30%
  else {
    const [ceil, capM] = WK_LEASE[v.lstart] || WK_LEASE["2026"];
    const pay = pos(num(v.lease)), m = clamp(num(v.lmon), 0, 12);
    lease = Math.min(pay, capM * 1.13 * m, pay * ceil * 1.13 / Math.max(ceil * 1.13, .85 * pos(num(v.msrp)) * 1.13));   // ITA 67.3
  }
  const intr = Math.min(pos(num(v.int)), (v.oldLoan ? 300 : 350) * 365 / 30);   // $350 per 30 days for loans from 2024, $300 for 2001-2023 loans
  return { use, cca, lease, intr, d: use * (pos(num(v.ops)) + intr + lease + cca) };
}

// Volunteer firefighter / search and rescue: $6,000 amount (credit $840) vs keeping box 87 honoraria tax-free
function wkVfaPick(v, C, X) {
  if (v.same || num(v.hrs) < 200) return false;
  return .14 * 6000 >= pos(num(v.hon)) * margAt(pos(X.preNI - C.ded));
}

// SR&ED ITC for individuals: 15%, arm's-length contract and third-party payments at 80%
const wkSred = v => { const e = pos(num(v.exp)), c = Math.min(pos(num(v.con)), e); return .15 * (e - c + .8 * c); };

ITEMS.push(
// ---------------- WORK: employment expenses ----------------
{
  id: "employee_home_office", cat: "work", kind: "calc",
  q: "I work from home for my employer and have a signed T2200",
  name: "Work-space-in-the-home expenses (detailed method)",
  lines: "L22900 · T777 · T2200",
  hint: "You qualify if you worked from home more than half the time for 4 weeks in a row, or the space is only for work and meeting clients. Mortgage interest, furniture and computers don't count.",
  tags: "home office work from home wfh remote t2200 t2200s t777 t777s work space rent utilities internet detailed method",
  src: ["employee_home_office_detailed", "work_from_home_expenses"],
  fields: [
    { k: "pct", label: "Work space as a share of the home's finished area (%)", type: "pct", def: 10 },
    { k: "only", label: "The space is used only for work", type: "bool", def: true },
    { k: "hrs", label: "Hours a week I work in that shared space", type: "num", def: 40, min: 0, max: 168, show: v => !v.only },
    { k: "months", label: "Months in 2026 I worked from home", type: "int", def: 12, min: 0, max: 12 },
    { k: "costs", label: "Rent, utilities, home internet and minor upkeep for the year", type: "money", def: 34200 },
    { k: "comm", label: "I'm paid by commission for this job", type: "bool", def: false },
    { k: "insTax", label: "Home insurance and property tax for the year", type: "money", def: 0, show: v => v.comm },
    { k: "reimb", label: "Amount my employer paid me back for these costs", type: "money", def: 0 }
  ],
  ded(v, C, X) {
    const use = clamp(num(v.pct), 0, 100) / 100 * (v.only ? 1 : clamp(num(v.hrs), 0, 168) / 168);
    const pool = (pos(num(v.costs)) + (v.comm ? pos(num(v.insTax)) : 0)) * clamp(num(v.months), 0, 12) / 12;
    const d = Math.min(pos(pool * use - pos(num(v.reimb))), X.emp);   // can't create an employment loss
    C.ded += d; C.workDed += d;
    X.say(`Work-space share ${wkPct(use)} of ${fmt(pool)} in home costs: ${fmt(d)} deducted.`);
    X.say("With more than one employer, get a T2200 from each and split shared costs so nothing is claimed twice.");
  }
},
{
  id: "side_business", cat: "work", kind: "calc",
  q: "I have side self-employment or freelance income",
  name: "Business or professional income and expenses",
  lines: "L13500 · T2125",
  hint: "Report your revenue and deduct reasonable costs to earn it, including half of business meals and CCA on equipment. Your T4 jobs already max out CPP, so the profit has no extra CPP.",
  tags: "self-employed freelance contractor consulting gig side hustle sole proprietor t2125 business expenses cca business use of home",
  src: ["side_business_expenses_t2125", "side_business_use_of_home"],
  fields: [
    { k: "gross", label: "Business revenue in 2026", type: "money", def: 30000 },
    { k: "exp", label: "Business expenses (supplies, software, fees, advertising, phone)", type: "money", def: 5000 },
    { k: "meals", label: "Business meals and entertainment (half counts)", type: "money", def: 1000 },
    { k: "cca", label: "CCA on equipment and the business share of a vehicle", type: "money", def: 2000 },
    { k: "home", label: "I run it from home (main place of business, or a space only for clients)", type: "bool", def: false },
    { k: "homePct", label: "Business share of the home (%)", type: "pct", def: 10, show: v => v.home },
    { k: "homeCosts", label: "Home costs: heat, power, water, insurance, upkeep, mortgage interest, property tax or rent", type: "money", def: 25500, show: v => v.home }
  ],
  prof(v, C, X) { X.hh.bizNet = wkBiz(v).net; },
  inc(v, C, X) { const b = wkBiz(v); C.income += b.g; C.earnedExtra += b.net; },
  ded(v, C, X) {
    const b = wkBiz(v);
    C.ded += b.exp + b.buoh;
    X.say(`Net ${b.net < 0 ? "loss" : "profit"}: ${fmt(Math.abs(b.net))}${b.buoh ? ` after ${fmt(b.buoh)} of business-use-of-home` : ""}.${b.net < 0 ? " A business loss offsets your other income." : ""}`);
    if (b.lost > 0) X.say(`${fmt(b.lost)} of home costs can't create a loss and carries forward to next year.`);
    if (b.g > 30000) X.say("Over $30,000 of sales in four quarters, you must register for GST/HST.");
  }
},
{
  id: "stock_options", cat: "work", kind: "calc",
  q: "I exercised employee stock options in 2026",
  name: "Security options deduction", lines: "L24900 · T4 boxes 38, 39, 41",
  hint: "Half of a qualifying stock option benefit comes off taxable income. For options granted after June 2021 by large employers, only the first $200,000 of yearly vesting value qualifies.",
  tags: "stock options employee stock option plan esop rsu exercise box 38 box 39 box 41 security options deduction ccpc startup donate shares",
  src: ["security_options_deduction", "security_options_donated_shares"],
  fields: [
    { k: "ben", label: "Stock option benefit (T4 box 38)", type: "money", def: 50000 },
    { k: "qual", label: "My T4 shows it qualifies for the deduction (box 39 or 41)", type: "bool", def: true },
    { k: "nq", label: "Part that doesn't qualify ($200,000 vesting limit or designated)", type: "money", def: 0, show: v => v.qual },
    { k: "don", label: "Benefit on option shares I gave to a charity within 30 days", type: "money", def: 0, show: v => v.qual }
  ],
  inc(v, C, X) { const o = wkOpt(v); C.income += o.b; C.earnedExtra += o.b; },
  ded(v, C, X) {
    const o = wkOpt(v);
    C.dedTI += o.d1 + o.d2;
    if (!o.q) return X.say("Non-qualifying options are fully taxed as employment income.");
    X.say(`Deducting ${fmt(o.d1)}${o.d2 ? ` plus ${fmt(o.d2)} for donated shares` : ""} from taxable income. Net income still includes the full benefit.`);
    if (o.d2) X.say("Enter the donation itself under Charitable donations.");
  },
  post(v, C, X) {
    const o = wkOpt(v), d = o.d1 + o.d2;
    // Minimum tax from 2024: 20.5% on adjusted taxable income (100% of the benefit) over the $181,440 exemption
    if (d && .205 * pos(X.ti + d - 181440) > X.R.fedTax) X.say("A benefit this large may trigger alternative minimum tax. Check Form T691.");
  }
},
{
  id: "employee_vehicle", cat: "work", kind: "calc",
  q: "I drive my own car for work (not commuting) and pay the costs",
  name: "Motor vehicle expenses for employees", lines: "L22900 · T777 · T2200",
  hint: "You need a T2200 and no tax-free per-km allowance. Only the work share of kilometres counts, and driving between home and your usual workplace is personal.",
  tags: "car vehicle mileage kilometres gas fuel lease cca class 10.1 electric ev zero emission t777 t2200 driving for work",
  src: ["employee_motor_vehicle"],
  fields: [
    { k: "wkm", label: "Kilometres driven for work in 2026", type: "num", def: 10000 },
    { k: "tkm", label: "Total kilometres driven in 2026", type: "num", def: 20000 },
    { k: "ops", label: "Fuel or charging, repairs, insurance and licence", type: "money", def: 6000 },
    { k: "int", label: "Car loan interest paid in 2026", type: "money", def: 0 },
    { k: "oldLoan", label: "The car loan started before 2024", type: "bool", def: false, show: v => num(v.int) > 0 },
    { k: "own", label: "How I have the car", type: "select", def: "new", opts: [["new", "I bought it in 2026"], ["old", "I bought it before 2026"], ["lease", "I lease it"]] },
    { k: "cost", label: "Price before tax", type: "money", def: 45000, show: v => v.own === "new" },
    { k: "zev", label: "It's a zero-emission vehicle", type: "bool", def: false, show: v => v.own === "new" },
    { k: "evInc", label: "Federal EV purchase incentive I received", type: "money", def: 0, show: v => v.own === "new" && v.zev },
    { k: "ucc", label: "Undepreciated cost at the start of 2026 (last year's T777)", type: "money", def: 20000, show: v => v.own === "old" },
    { k: "lease", label: "Lease payments in 2026, with HST", type: "money", def: 7200, show: v => v.own === "lease" },
    { k: "msrp", label: "Manufacturer's list price before tax", type: "money", def: 45000, show: v => v.own === "lease" },
    { k: "lstart", label: "Year the lease started", type: "select", def: "2026", show: v => v.own === "lease",
      opts: [["2026", "2026"], ["2025", "2025"], ["2024", "2024"], ["2023", "2023"], ["2022", "2022"], ["2019", "2019 to 2021"]] },
    { k: "lmon", label: "Months leased in 2026", type: "int", def: 12, min: 0, max: 12, show: v => v.own === "lease" }
  ],
  ded(v, C, X) {
    const r = wkVehicle(v);
    C.ded += r.d; C.workDed += r.d;
    X.say(`Work use ${wkPct(r.use)}: ${fmt(r.d)} deducted${r.cca ? `, including ${fmt(r.use * r.cca)} of CCA` : ""}${r.lease ? `, including ${fmt(r.use * r.lease)} of lease costs` : ""}.`);
    if (num(v.int) > r.intr) X.say(`Interest is capped at ${v.oldLoan ? "$300" : "$350"} per 30 days, so ${fmt(r.intr)} for the year.`);
    if (v.own === "new" && !v.zev && num(v.cost) > 39000) X.say("CCA is limited to $39,000 plus HST for passenger vehicles.");
    if (v.own === "new" && v.zev && num(v.cost) > 61000) X.say("CCA is limited to $61,000 plus HST for zero-emission passenger vehicles.");
  }
},
{
  id: "moving_for_work", cat: "work", kind: "calc",
  q: "I moved at least 40 km closer to a new job or work location",
  name: "Moving expenses", lines: "L21900 · T1-M",
  hint: "Moving costs come off the income you earn at the new location, and unused amounts carry forward to 2027. The new home must be at least 40 km closer to the new work by the shortest normal route.",
  tags: "moving expenses relocation move new job t1-m 21900 land transfer tax real estate commission movers",
  src: ["moving_expenses_work", "moving_expenses"],
  fields: [
    { k: "km", label: "How much closer my new home is to the new work (km)", type: "int", def: 120 },
    { k: "move", label: "Movers, storage, travel, up to 15 days of temporary lodging, lease cancellation", type: "money", def: 6000 },
    { k: "sell", label: "Selling costs of my old home (commission, legal fees)", type: "money", def: 0 },
    { k: "buy", label: "Legal fees and land transfer tax on the new home (only if I sold the old one)", type: "money", def: 0 },
    { k: "vacant", label: "Costs of keeping the empty old home while for sale", type: "money", def: 0 },
    { k: "reimb", label: "Tax-free reimbursement from my employer", type: "money", def: 0 },
    { k: "cf", label: "Unused moving costs carried from 2025", type: "money", def: 0 },
    { k: "newInc", label: "What I earned at the new location in 2026", type: "money", def: 40000 }
  ],
  ded(v, C, X) {
    if (num(v.km) < 40) return X.say("The new home must be at least 40 km closer to the new work location.");
    const e = pos(pos(num(v.move)) + pos(num(v.sell)) + pos(num(v.buy)) + Math.min(pos(num(v.vacant)), 5000) - pos(num(v.reimb)));   // vacant home max $5,000
    const d = Math.min(e + pos(num(v.cf)), pos(num(v.newInc)), X.emp + pos(C.earnedExtra));
    C.ded += d;
    const tot = e + pos(num(v.cf));
    X.say(`Deducting ${fmt(d)} of ${fmt(tot)} in moving costs.${tot > d ? ` ${fmt(tot - d)} carries forward to next year's income at the new location.` : ""}`);
  }
},
{
  id: "work_supplies_phone", cat: "work", kind: "calc",
  q: "I pay for my own work supplies or cell phone for my job",
  name: "Supplies, cell phone, office rent and assistant's salary", lines: "L22900 · T777 · T2200",
  hint: "Supplies used up in your work (not equipment or computers) and the work share of a basic cell plan count, plus office rent or an assistant if your contract requires them. You need a T2200.",
  tags: "supplies stationery toner cell phone mobile plan office rent assistant t2200 t777 employment expenses",
  src: ["employee_supplies_phone_office_assistant"],
  fields: [
    { k: "sup", label: "Supplies used up in my work", type: "money", def: 300 },
    { k: "cell", label: "Cell phone plan for the year", type: "money", def: 900 },
    { k: "cellPct", label: "Work share of cell phone use (%)", type: "pct", def: 40 },
    { k: "other", label: "Office rent or an assistant's pay my contract requires", type: "money", def: 0 },
    { k: "reimb", label: "Amount my employer paid me back", type: "money", def: 0 }
  ],
  ded(v, C, X) {
    const d = pos(pos(num(v.sup)) + pos(num(v.cell)) * clamp(num(v.cellPct), 0, 100) / 100 + pos(num(v.other)) - pos(num(v.reimb)));
    C.ded += d; C.workDed += d;
    X.say(`Deducting ${fmt(d)}. The phone itself and connection fees don't count.`);
  }
},
{
  id: "work_travel", cat: "work", kind: "calc",
  q: "I travel for my job and pay my own travel costs",
  name: "Travel, lodging, meals and parking for employees", lines: "L22900 · T777 · T2200",
  hint: "For work away from your employer's place of business when you get no tax-free travel allowance. Meals count at 50%, and only on trips of 12 hours or more away from the area.",
  tags: "business travel airfare hotel meals parking per diem t2200 t777 employment expenses",
  src: ["employee_travel_meals_lodging"],
  fields: [
    { k: "fares", label: "Fares and hotels I paid", type: "money", def: 2700 },
    { k: "meals", label: "Meals on trips of 12 hours or more", type: "money", def: 600 },
    { k: "park", label: "Parking away from my usual workplace", type: "money", def: 200 },
    { k: "allow", label: "My employer pays me a tax-free travel allowance", type: "bool", def: false }
  ],
  ded(v, C, X) {
    if (v.allow) return X.say("A tax-free travel allowance rules out this deduction.");
    const d = pos(num(v.fares)) + .5 * pos(num(v.meals)) + pos(num(v.park));   // meals 50% (ITA 67.1)
    C.ded += d; C.workDed += d;
    X.say(`Deducting ${fmt(d)}. Car costs go under the vehicle item.`);
  }
},
{
  id: "commission_expenses", cat: "work", kind: "calc",
  q: "I'm paid partly by commission and pay my own selling costs",
  name: "Commission employee expenses", lines: "L22900 · T777 · T2200",
  hint: "Commission employees can also deduct advertising, client entertainment and licences, up to their commission income (car interest and CCA aside). You need a T2200 from your employer.",
  tags: "commission sales real estate agent advertising promotion client entertainment t2200 t777 employment expenses",
  src: ["commission_employee_expenses"],
  fields: [
    { k: "comm", label: "Commissions earned in 2026", type: "money", def: 20000 },
    { k: "sell", label: "Advertising, promotion, licences, cell airtime and accounting fees", type: "money", def: 2200 },
    { k: "meals", label: "Client meals and entertainment (half counts)", type: "money", def: 2000 },
    { k: "car", label: "Work share of car loan interest and CCA", type: "money", def: 0 }
  ],
  ded(v, C, X) {
    const pool = pos(num(v.sell)) + .5 * pos(num(v.meals)), cap = pos(num(v.comm));
    const d = Math.min(pool, cap) + pos(num(v.car));
    C.ded += d; C.workDed += d;
    X.say(`Deducting ${fmt(d)}.${pool > cap ? ` The commission cap cuts ${fmt(pool - cap)}; the salaried method (travel, vehicle, supplies, home office) may allow more.` : ""}`);
    X.say("Don't enter the same costs again in the travel, vehicle or home office items.");
  }
},
{
  id: "employee_gst_rebate", cat: "work", kind: "calc",
  q: "I deducted work expenses that included HST",
  name: "GST/HST rebate for employees", lines: "L45700 · GST370",
  hint: "You get back 13/113 of deducted work costs that carried HST if your employer is a GST/HST registrant other than a bank, insurer or similar. The rebate is taxable in the year you receive it.",
  tags: "gst370 hst rebate employee partnership rebate 45700 employment expenses union dues",
  src: ["employee_gst_hst_rebate"],
  fields: [
    { k: "reg", label: "My employer is a GST/HST registrant, not a financial institution", type: "bool", def: true },
    { k: "exp", label: "Deducted work costs that carried HST (count the deductible half of meals)", type: "money", def: 5000 },
    { k: "cca", label: "CCA on a car or instrument bought with HST", type: "money", def: 0 }
  ],
  cr(v, C, X) {
    if (!v.reg) return X.say("Not available when the employer isn't a registrant or is a listed financial institution.");
    const r = 13 / 113 * (pos(num(v.exp)) + pos(num(v.cca)));   // 13% Ontario HST
    C.fedRef += r;
    X.say(`Rebate ${fmt(r)}. Rent, insurance, interest, licences and salaries carry no HST, so leave them out.`);
    X.say(`It's taxable on your 2027 return (the CCA part lowers your UCC instead), so it's worth about ${fmt(r * (1 - X.marg))} after tax.`);
  }
},

// ---------------- WORK: pay and benefit strategies ----------------
{
  id: "tax_free_employer_benefits", cat: "work", kind: "tip",
  q: "My employer could give me tax-free perks instead of taxable pay",
  name: "Non-taxable employer benefits and allowances", lines: "T4130 · left out of T4 box 14",
  hint: "A health spending account, gifts up to $500 a year, relocation reimbursements, training for your job and a reasonable per-km allowance can all be tax-free. A cash-out option makes them taxable.",
  tags: "health spending account hsa private health services plan perks gifts awards relocation reimbursement training employer paid dues counselling benefits",
  src: ["nontaxable_employer_benefits"],
  tip: "Every dollar your employer moves from salary into a tax-free benefit skips income tax, and your CPP and EI are already maxed, so there's no payroll cost either. A health spending account is usually the biggest lever: it pays medical and dental costs with pre-tax dollars (those costs then can't go under medical expenses). Ask HR before the year starts which benefits can replace part of a raise or bonus.",
  fields: [{ k: "amt", label: "Pay I could take as tax-free benefits instead", type: "money", def: 3000 }],
  post(v, C, X) {
    const a = Math.min(pos(num(v.amt)), X.ti);
    X.say(`Taking ${fmt(a)} as tax-free benefits instead of pay saves about ${fmt(wkSlice(X, X.ti, X.ti - a))} of tax.`);
  }
},
{
  id: "income_timing", cat: "work", kind: "tip",
  q: "I expect a lower-income year soon and could shift pay into it",
  name: "Timing a bonus, option exercise or deferred salary leave", lines: "T4 box 14 · T4 box 38 · Reg. 6801(a)",
  hint: "A bonus can be paid up to 3 years after the year it's earned, you choose when to exercise options, and a deferred salary leave plan can hold back up to a third of a job's pay for a leave of 6 months or more.",
  tags: "bonus deferral stock option exercise timing sabbatical self-funded leave 4 over 5 deferred salary leave plan retirement year lower income",
  src: ["income_timing_bonus_options", "deferred_salary_leave_plan"],
  tip: "Income taxed in a year when your rate is lower costs less. Ask your employer to pay a bonus next calendar year, exercise options in a lower-income year, or join a self-funded leave plan (such as 4-over-5) that pays the held-back salary during the leave. It's a deferral plus a rate difference, not an exemption, so it only helps if the later year's rate is really lower.",
  fields: [
    { k: "how", label: "How I'd shift it", type: "select", def: "bonus", opts: [["bonus", "Defer a bonus"], ["options", "Exercise options later"], ["leave", "Deferred salary leave plan"]] },
    { k: "amt", label: "Amount I could move out of 2026", type: "money", def: 30000 },
    { k: "fut", label: "My expected pay in that later year, before this amount", type: "money", def: 90000 }
  ],
  post(v, C, X) {
    const a = Math.min(pos(num(v.amt)), X.ti), fut = pos(num(v.fut));
    const now = wkSlice(X, X.ti, X.ti - a), later = simpleTax(fut + a) - simpleTax(fut);
    X.say(`Moving ${fmt(a)} saves about ${fmt(now)} of 2026 tax and adds about ${fmt(later)} in the later year: net ${fmt(now - later)}.`);
    if (now <= later) X.say("That year's rate isn't lower than this year's, so shifting doesn't help.");
    if (v.how === "leave") X.say("A leave plan can defer at most one third of that job's salary, and the leave must start within 6 years.");
    if (v.how === "options") X.say("Options keep the 50% deduction in either year, but you carry the share-price risk while you wait.");
  }
},
{
  id: "per_km_car_allowance", cat: "work", kind: "tip",
  q: "My employer pays me a flat car allowance that's taxed",
  name: "Switching to a tax-free per-km allowance", lines: "ITA 6(1)(b)(vii.1) · T4 box 14",
  hint: "An allowance based only on business kilometres at reasonable rates is tax-free: 73 cents a km for the first 5,000 km in 2026, then 67 cents. A flat monthly amount is taxable.",
  tags: "car allowance per km kilometre allowance reasonable allowance mileage flat allowance vehicle",
  src: ["reasonable_per_km_car_allowance"],
  tip: "Ask your employer to replace a flat allowance with one paid per business kilometre at CRA's reasonable rates, and log your trips. The allowance then leaves your T4, but you can no longer deduct vehicle expenses for that driving, so it pays off when the tax-free amount is bigger than your vehicle deduction. Never mix a flat and a per-km allowance for the same driving, or the whole amount becomes taxable.",
  fields: [
    { k: "flat", label: "Flat taxable car allowance I get each year", type: "money", def: 7200 },
    { k: "km", label: "Business kilometres a year", type: "num", def: 9000 },
    { k: "veh", label: "Vehicle expenses I deduct now for this job", type: "money", def: 3000 }
  ],
  post(v, C, X) {
    const km = pos(num(v.km));
    const r = .73 * Math.min(km, 5000) + .67 * pos(km - 5000);   // 2026 reasonable rates, provinces
    const conv = Math.min(pos(num(v.flat)), r), net = conv - pos(num(v.veh));
    if (net <= 0) return X.say(`A per-km allowance would be ${fmt(r)}, no more than the vehicle expenses you'd give up, so it doesn't help.`);
    X.say(`A tax-free ${fmt(conv)} per-km allowance replaces taxable pay, less ${fmt(num(v.veh))} of lost deductions: about ${fmt(wkSlice(X, X.ti, X.ti - net))} less tax.`);
  }
},
{
  id: "company_car_benefit", cat: "work", kind: "tip",
  q: "My employer gives me a company car I also use personally",
  name: "Lowering the automobile standby and operating benefit", lines: "T4 box 34 · ITA 6(2)",
  hint: "The standby charge is 2% of the car's cost a month (two thirds of the lease cost if leased). It drops when over half your driving is for work and personal driving stays under 1,667 km a month.",
  tags: "company car employer car standby charge operating benefit automobile benefit box 34 personal kilometres logbook",
  src: ["employer_automobile_benefit_reduction"],
  tip: "Keep a kilometre log: with more than 50% business use, the standby charge shrinks in proportion to personal km under 1,667 per 30 days. If your employer pays operating costs, pick the cheaper of 34 cents per personal km or half the standby charge, and repay personal costs by February 14, 2027. Handing the car back while you're away also removes those months.",
  fields: [
    { k: "leased", label: "My employer leases the car", type: "bool", def: false },
    { k: "cost", label: "Car's cost including HST", type: "money", def: 67800, show: v => !v.leased },
    { k: "lcost", label: "Yearly lease cost with HST, not counting insurance", type: "money", def: 12000, show: v => v.leased },
    { k: "months", label: "Months it was available to me", type: "int", def: 12, min: 0, max: 12 },
    { k: "tkm", label: "Total kilometres in 2026", type: "num", def: 30000 },
    { k: "pkm", label: "Personal kilometres in 2026 (including commuting)", type: "num", def: 10000 },
    { k: "ops", label: "My employer pays the operating costs", type: "bool", def: true }
  ],
  post(v, C, X) {
    const n = clamp(num(v.months), 0, 12), tkm = pos(num(v.tkm)), pkm = Math.min(pos(num(v.pkm)), tkm);
    const sc = v.leased ? 2 / 3 * pos(num(v.lcost)) * n / 12   // leased: two thirds of the lease cost for the months available
      : .02 * pos(num(v.cost)) * n;                              // owned: 2% a month of cost
    const base = sc + (v.ops ? .34 * pkm : 0);                  // 34 cents per personal km in 2026
    const bus = tkm ? (tkm - pkm) / tkm : 0, lim = 1667 * n;   // 1,667 km per 30-day period
    const scR = bus > .5 && lim ? sc * Math.min(pkm, lim) / lim : sc;
    const ob = v.ops ? (bus > .5 ? Math.min(.5 * scR, .34 * pkm) : .34 * pkm) : 0;
    const cut = base - scR - ob;
    if (cut <= 0) return X.say(`Your benefit is about ${fmt(base)}. With business use at ${wkPct(bus)}, the reductions don't apply yet.`);
    X.say(`With a log and the best operating method, the benefit falls from ${fmt(base)} to ${fmt(scR + ob)}, about ${fmt(wkSlice(X, X.ti, X.ti - cut))} less tax.`);
  }
},
{
  id: "employer_low_interest_loan", cat: "work", kind: "tip",
  q: "My employer lent me money at low or no interest",
  name: "Employee loan interest benefit", lines: "T4 box 36 · L22100",
  hint: "The gap between the 3% prescribed rate and the interest you pay by January 30, 2027 is a taxable benefit. For a home-purchase loan, the rate on the loan date is locked for 5 years.",
  tags: "employee loan interest free loan low interest loan taxable benefit box 36 prescribed rate home purchase loan carrying charges",
  src: ["employee_loan_interest_benefit"],
  tip: "If you used the loan to invest or earn business income, the benefit counts as interest you paid, so you deduct the same amount as a carrying charge and pay no tax on it. For a home loan the benefit is taxed, but it's usually still cheaper than bank interest. Paying the interest by January 30 lowers the benefit dollar for dollar, but costs more cash than the tax it saves.",
  fields: [
    { k: "amt", label: "Average loan balance in 2026", type: "money", def: 200000 },
    { k: "paid", label: "Interest I pay for 2026 by January 30, 2027", type: "money", def: 0 },
    { k: "inv", label: "I used the money to invest or earn business income", type: "bool", def: false }
  ],
  post(v, C, X) {
    const ben = pos(pos(num(v.amt)) * .03 - pos(num(v.paid)));   // 3% prescribed rate all of 2026
    X.say(`Taxable benefit about ${fmt(ben)} (already in your T4), costing about ${fmt(wkSlice(X, X.ti, X.ti - ben))} of tax.`);
    if (v.inv && ben) X.say(`Claim the same ${fmt(ben)} as a carrying charge on line 22100, so the net tax is about $0.`);
  }
},

// ---------------- WORK: credits for specific jobs ----------------
{
  id: "educator_school_supplies", cat: "work", kind: "calc",
  q: "I'm a teacher or ECE and bought classroom supplies myself",
  name: "Eligible educator school supply tax credit", lines: "L46800 · L46900",
  hint: "Certified teachers and early childhood educators get back 25% of up to $1,000 of supplies they paid for, such as books, games, art supplies and some electronics. It's refundable with no income test.",
  tags: "teacher ece early childhood educator classroom supplies school supply credit 46800 46900",
  src: ["eligible_educator_school_supply_credit", "eligible_educator_school_supplies"],
  fields: [{ k: "amt", label: "Supplies I paid for and wasn't paid back for", type: "money", def: 800 }],
  cr(v, C, X) {
    const c = .25 * Math.min(1000, pos(num(v.amt)));   // 25% of up to $1,000
    C.fedRef += c;
    X.say(`Refundable credit ${fmt(c)}.`);
  }
},
{
  id: "psw_tax_credit", cat: "work", kind: "calc",
  q: "I work as a personal support worker for a health care employer",
  name: "Personal support workers tax credit (new for 2026)", lines: "New 2026 refundable line · ITA 122.93",
  hint: "You get 5% of eligible PSW earnings, up to $1,100 a year, refundable and not income-tested. Your main duties must be one-on-one help with daily living at a hospital, care home, home care agency or similar.",
  tags: "psw personal support worker long-term care home care hospital health care aide budget 2025 bill c-15",
  src: ["personal_support_worker_credit", "personal_support_workers_credit"],
  fields: [{ k: "earn", label: "My 2026 earnings as a PSW (part of my T4 pay)", type: "money", def: 45000 }],
  cr(v, C, X) {
    const c = Math.min(1100, .05 * Math.min(pos(num(v.earn)), X.emp));   // 5%, max $1,100 (2026 to 2030, not indexed)
    C.fedRef += c;
    X.say(`Refundable credit ${fmt(c)}. The full $1,100 is reached at $22,000 of PSW earnings.`);
  }
},
{
  id: "trade_tools", cat: "work", kind: "calc",
  q: "I'm a tradesperson and bought my own new tools for work",
  name: "Tradesperson's and apprentice mechanic's tools", lines: "L22900 · T777 · T2200 Part C",
  hint: "Tradespeople deduct up to $1,000 of new tools costing more than $1,501 in 2026. Registered apprentice mechanics can deduct more: tool costs above the greater of $2,501 and 5% of apprentice income.",
  tags: "tools tradesperson trades apprentice mechanic automotive red seal t777 t2200 tool deduction",
  src: ["tradesperson_tools_deduction", "apprentice_mechanic_tools_deduction"],
  fields: [
    { k: "cost", label: "New tools I bought in 2026 that my employer requires", type: "money", def: 2600 },
    { k: "appr", label: "I'm a registered apprentice vehicle mechanic", type: "bool", def: false },
    { k: "ainc", label: "My 2026 income as an apprentice mechanic", type: "money", def: 45000, show: v => v.appr },
    { k: "cf", label: "Unused apprentice tool deductions from earlier years", type: "money", def: 0, show: v => v.appr }
  ],
  ded(v, C, X) {
    const cost = pos(num(v.cost));
    const d1 = Math.min(1000, pos(Math.min(cost, X.emp) - 1501));   // $1,000 max above the $1,501 threshold (= Canada employment amount)
    let d2 = 0;
    if (v.appr) {
      const b = Math.min(cost, Math.max(2501, .05 * pos(num(v.ainc) - d1)));   // greater of $2,501 and 5% of apprentice income
      d2 = Math.min(pos(cost - b) + pos(num(v.cf)), pos(X.preNI - C.ded - d1));
    }
    C.ded += d1 + d2; C.workDed += d1 + d2;
    X.say(`Tradesperson's tools: ${fmt(d1)}${v.appr ? `. Apprentice mechanic's tools: ${fmt(d2)} (you can hold some back for a later year)` : ""}.`);
  }
},
{
  id: "disability_supports", cat: "work", kind: "calc",
  q: "I have an impairment and pay for supports that let me work",
  name: "Disability supports deduction", lines: "L21500 · T929",
  hint: "Attendant care, sign-language services, talking software, note-takers and similar supports you paid for so you can work or study, up to your earned income. The same cost can't also go under medical expenses.",
  tags: "disability supports attendant care sign language interpreter assistive devices software t929 21500 impairment",
  src: ["disability_supports_deduction"],
  fields: [{ k: "amt", label: "Eligible supports I paid for in 2026, not reimbursed", type: "money", def: 5000 }],
  ded(v, C, X) {
    const d = Math.min(pos(num(v.amt)), pos(X.earned));
    C.ded += d; C.disSupports += d;
    X.say(`Deducting ${fmt(d)}. At your income this is worth far more than claiming the same costs as medical expenses.`);
  }
},
{
  id: "volunteer_firefighter", cat: "work", kind: "calc",
  q: "I'm a volunteer firefighter or search and rescue volunteer",
  name: "Volunteer firefighter or search and rescue amount, or tax-free honoraria", lines: "L31220 · L31240 · T4 box 87",
  hint: "With 200 or more volunteer hours you can claim a $6,000 federal amount (worth $840), but then your tax-free honoraria become taxable. The better of the two is picked for you.",
  tags: "volunteer firefighter search and rescue sar paramedic emergency volunteer honoraria box 87 31220 31240",
  src: ["volunteer_firefighter_sar_amount", "emergency_volunteer_honoraria_exemption"],
  fields: [
    { k: "hrs", label: "Volunteer hours in 2026 (firefighting and search and rescue combined)", type: "num", def: 220 },
    { k: "hon", label: "Tax-free honoraria on my T4 (box 87)", type: "money", def: 1000 },
    { k: "same", label: "The same organization also employs me for similar duties", type: "bool", def: false }
  ],
  inc(v, C, X) { C.income += pos(num(v.hon)); },   // honoraria are taxable unless exempted below
  ded(v, C, X) {
    const pick = wkVfaPick(v, C, X);
    X.hh.wkVfaPick = pick;
    if (!pick && !v.same) C.ded += pos(num(v.hon));   // up to $1,000 per organization stays tax-free (box 87)
  },
  cr(v, C, X) {
    if (v.same) return X.say("Honoraria from an organization that also employs you for similar work are taxable, and those hours don't count.");
    if (X.hh.wkVfaPick) {
      C.fed += 6000;   // $6,000 amount (not indexed); no Ontario equivalent
      X.say(`Claiming the $6,000 volunteer amount (worth $840) beats keeping ${fmt(num(v.hon))} of honoraria tax-free, so the honoraria are taxed.`);
    } else X.say(num(v.hrs) < 200 ? "Under 200 hours, so your honoraria stay tax-free instead." : "Keeping your honoraria tax-free is worth more than the $6,000 amount.");
  }
},
{
  id: "legal_fees_employment", cat: "work", kind: "calc",
  q: "I paid a lawyer to collect pay, severance or a pension owed to me",
  name: "Legal fees to collect wages, a retiring allowance or pension", lines: "L22900 · L23200",
  hint: "Fees to collect or establish your right to wages are deductible, win or lose. Fees for severance or pension benefits are deductible up to what you received, and unused fees carry forward 7 years.",
  tags: "legal fees lawyer wrongful dismissal severance retiring allowance pension unpaid wages employment standards",
  src: ["employee_legal_fees_collect_salary", "legal_fees_retiring_allowance_pension"],
  fields: [
    { k: "for", label: "What the fees were for", type: "select", def: "wages", opts: [["wages", "Salary or wages owed to me"], ["sev", "Severance, wrongful dismissal damages or a pension"]] },
    { k: "fees", label: "Legal fees paid in 2026", type: "money", def: 5000 },
    { k: "back", label: "Fees awarded or paid back to me", type: "money", def: 0 },
    { k: "got", label: "Severance or pension received in 2026, minus what I moved to an RRSP", type: "money", def: 40000, show: v => v.for === "sev" }
  ],
  ded(v, C, X) {
    const net = pos(num(v.fees) - num(v.back));
    const d = v.for === "sev" ? Math.min(net, pos(num(v.got))) : net;
    C.ded += d;
    if (v.for === "wages") C.workDed += d;
    X.say(`Deducting ${fmt(d)}${v.for === "sev" ? " on line 23200" : " on line 22900"}.${net > d ? ` ${fmt(net - d)} carries forward up to 7 years.` : ""}`);
  }
},
{
  id: "severance_rrsp_transfer", cat: "work", kind: "calc",
  q: "I received severance pay (a retiring allowance) in 2026",
  name: "Retiring allowance and the pre-1996 RRSP transfer", lines: "L13000 · L20800 · T4A box 26",
  hint: "Severance is taxable, but $2,000 per year of service before 1996 (plus $1,500 per year before 1989 with no vested pension) can go into your RRSP without using room, in 2026 or 60 days after.",
  tags: "severance retiring allowance termination pay wrongful dismissal rrsp rollover eligible retiring allowance 1996 transfer",
  src: ["retiring_allowance_rrsp_rollover"],
  fields: [
    { k: "ra", label: "Severance (retiring allowance) received in 2026", type: "money", def: 60000 },
    { k: "yrs", label: "Years I worked there before 1996 (part years count)", type: "num", def: 10 },
    { k: "yrs89", label: "Years before 1989 with no vested pension or DPSP", type: "num", def: 0 },
    { k: "moved", label: "Amount I move to my own RRSP or pension plan", type: "money", def: 20000 }
  ],
  inc(v, C, X) { C.income += pos(num(v.ra)); },
  ded(v, C, X) {
    const elig = 2000 * pos(num(v.yrs)) + 1500 * Math.min(pos(num(v.yrs89)), pos(num(v.yrs)));   // ITA 60(j.1), not indexed
    const d = Math.min(elig, pos(num(v.ra)), pos(num(v.moved)));
    C.ded += d;
    if (!elig) return X.say("With no service before 1996, only your regular RRSP room can shelter severance.");
    X.say(`${fmt(d)} of ${fmt(elig)} eligible goes to your RRSP tax-free, without using contribution room.`);
  }
},
{
  id: "salary_repaid", cat: "work", kind: "calc",
  q: "I paid back salary or wages to an employer in 2026",
  name: "Salary repayment deduction", lines: "L22900",
  hint: "Pay you repaid in 2026 that was taxed as your income in 2026 or an earlier year counts, including pay repaid for a time covered by disability or workers' compensation benefits.",
  tags: "salary repayment overpayment paid back wages clawback signing bonus repaid",
  src: ["salary_repayment"],
  fields: [{ k: "amt", label: "Salary or wages repaid in 2026", type: "money", def: 3000 }],
  ded(v, C, X) {
    const d = pos(num(v.amt));
    C.ded += d; C.workDed += d;
    X.say("If your employer corrected your T4 instead, don't deduct it again.");
  }
},
{
  id: "ei_benefit_repayment", cat: "work", kind: "calc",
  q: "I received EI regular or fishing benefits in 2026",
  name: "EI benefits and the benefit repayment", lines: "L11900 · L23500 · L42200 · T4E",
  hint: "You repay 30% of regular benefits, capped at 30% of net income over $86,125. It doesn't apply to maternity, parental or sickness benefits, or if you had no regular benefits in the 10 years before.",
  tags: "ei employment insurance clawback repayment t4e regular benefits fishing benefits layoff 23500 42200",
  src: ["ei_benefit_repayment"],
  fields: [
    { k: "ben", label: "EI regular or fishing benefits (T4E)", type: "money", def: 10000 },
    { k: "first", label: "I had no EI regular benefits in 2016 to 2025", type: "bool", def: false }
  ],
  // Benefits are taxable income. The baseline repays 30% of them; post works out the real repayment
  // and the line 23500 deduction, so the badge shows what the threshold, the exemption and the deduction save.
  inc(v, C, X) { const b = pos(num(v.ben)); C.income += b; C.fedRef -= .3 * b; },
  post(v, C, X) {
    const b = pos(num(v.ben)), over = pos(X.ni - 86125);   // threshold = 1.25 x 2026 maximum insurable earnings $68,900
    const r = v.first ? 0 : .3 * Math.min(b, over);
    const t0 = wkTaxAt(X, X.ti), t1 = wkTaxAt(X, X.ti - r);   // repayment is deducted on line 23500
    C.fedRef += .3 * b - r + (t0.fed - t1.fed); C.onRef += t0.on - t1.on;
    if (v.first) return X.say("No repayment: you had no regular benefits in the 10 years before 2026.");
    if (!r) return X.say("No repayment: your net income is under $86,125.");
    X.say(`You repay ${fmt(r)}. It's deducted on line 23500, so it isn't taxed too.`);
    if (over < b) X.say("Each $1,000 of RRSP or FHSA deduction cuts the repayment by $300.");
  }
},
{
  id: "wage_loss_premium_offset", cat: "work", kind: "calc",
  q: "I got taxable disability benefits from a group plan I paid into",
  name: "Wage-loss replacement benefits, net of your premiums", lines: "L10400 · T4A box 107",
  hint: "When your employer paid part of a group disability plan, benefits are taxable, but you subtract the premiums you paid since 1968 that you haven't used yet. If you paid all the premiums, benefits aren't taxable.",
  tags: "long-term disability ltd short-term disability std wage loss replacement plan group insurance premiums t4a box 107",
  src: ["wage_loss_replacement_premium_offset"],
  fields: [
    { k: "ben", label: "Disability (wage-loss) benefits received in 2026", type: "money", def: 20000 },
    { k: "prem", label: "Premiums I paid that I haven't used against earlier benefits", type: "money", def: 3000 }
  ],
  inc(v, C, X) { C.income += pos(num(v.ben)); },
  ded(v, C, X) {
    const d = Math.min(pos(num(v.ben)), pos(num(v.prem)));
    C.ded += d;
    X.say(`${fmt(d)} of premiums offsets the benefits.${num(v.prem) > d ? ` ${fmt(num(v.prem) - d)} carries forward to later benefits.` : ""}`);
  }
},

// ---------------- WORK: side-business strategies ----------------
{
  id: "side_business_family_wage", cat: "work", kind: "tip",
  q: "A lower-income family member works in my side business",
  name: "Paying a family member a reasonable wage", lines: "T2125 salaries · T4 for the family member",
  hint: "Wages for real work at a fair rate are deductible from your business income and taxed at the family member's lower rate. You have to actually pay them and run payroll.",
  tags: "family salary pay spouse pay child income splitting side business payroll t4 reasonable wage",
  src: ["side_business_family_salary"],
  tip: "Pay your spouse or child a market wage for work they really do, issue a T4 and remit source deductions. You deduct the wage and your share of their CPP at your rate, they pay little or no tax on it, and they earn RRSP room and CPP credits. EI usually doesn't apply to related employees, and a wage to your spouse lowers any spouse amount you claim.",
  fields: [
    { k: "w", label: "Wage I could pay for the year", type: "money", def: 15000 },
    { k: "other", label: "Their other income for 2026", type: "money", def: 0 },
    { k: "sp", label: "It's my spouse or partner", type: "bool", def: false }
  ],
  post(v, C, X) {
    const w = pos(num(v.w)); if (!w) return;
    const c = contrib(w), cpp = c.cpp + c.cpp2;   // employee CPP; the employer pays the same (deductible)
    const mine = wkSlice(X, X.ti, X.ti - w - cpp);
    const sp = v.sp && X.hh.spouse, y = sp ? X.spouseNI : pos(num(v.other));
    const theirs = simpleTax(y + w) - simpleTax(y);
    let lost = 0;
    if (sp) {   // spouse amount shrinks as their income rises (federal 14%, Ontario 5.05% before surtax)
      const onR = P.on.rate * (X.R.basicOn > P.on.s2 ? 1.56 : X.R.basicOn > P.on.s1 ? 1.2 : 1);
      const f = n => pos(P.fedBpa(X.ni) - n), o = n => pos(Math.min(P.on.spouseMax, P.on.spouseBase - n));
      lost = .14 * (f(y) - f(y + w)) + onR * (o(y) - o(y + w));
    }
    X.say(`Paying ${fmt(w)} saves you about ${fmt(mine)}. They pay about ${fmt(theirs)} of tax, and CPP costs ${fmt(2 * cpp)} in total (it builds their pension)${lost ? `, and your spouse amount is worth ${fmt(lost)} less` : ""}.`);
    X.say(`Net family saving: about ${fmt(mine - theirs - 2 * cpp - lost)} a year.`);
  }
},
{
  id: "incorporate_side_business", cat: "work", kind: "tip",
  q: "My side business earns more than I need to spend",
  name: "Incorporating to defer tax on retained profits", lines: "Corporate T2 · later T1 L12010",
  hint: "A Canadian-controlled private corporation pays about 11.7% combined tax on active business income in 2026 (up to $500,000). You pay personal tax only when profits come out as salary or dividends.",
  tags: "incorporate corporation ccpc small business deduction holding company retained earnings dividends tosi",
  src: ["side_business_incorporation"],
  tip: "Profit you leave in the company is taxed at the small business rate instead of your top personal rate, and the difference can be invested until you take it out. It's a deferral, not a permanent saving: dividends are taxed later, and Ontario's credit on small business dividends drops from 2027. Weigh setup, accounting and legal costs, and note that dividends to family members are limited by the TOSI rules.",
  fields: [{ k: "p", label: "Profit I could leave in the company each year", type: "money", def: 50000 }],
  post(v, C, X) {
    const p = pos(num(v.p)), biz = pos(num(X.hh.bizNet));
    const base = biz ? X.ti - Math.min(p, biz) : X.ti;   // profit already in income sits on top
    const personal = wkSlice(X, base + p, base);
    const corp = .117 * p;   // 9% federal + Ontario 3.2% to June 30, 2026 and 2.2% after (about 11.7% for 2026)
    X.say(`Keeping ${fmt(p)} in a corporation costs about ${fmt(corp)} of corporate tax instead of about ${fmt(personal)} personally: ${fmt(personal - corp)} deferred.`);
  }
},

// ---------------- WORK: less common situations ----------------
{
  id: "foreign_tax_employment", cat: "work", kind: "calc",
  q: "I paid foreign income tax on pay I earned working abroad",
  name: "Foreign tax credit on employment income", lines: "L40500 · T2209 · T2036",
  hint: "Foreign tax on employment income that's also taxed here comes off your federal tax, then Ontario tax, up to the Canadian tax on that income. Unused foreign tax on employment income can't carry forward.",
  tags: "foreign tax credit us work days cross-border t2209 t2036 40500 double tax treaty",
  src: ["foreign_tax_credit_employment_income"],
  fields: [
    { k: "inc", label: "Employment income earned abroad (part of my T4 pay)", type: "money", def: 20000 },
    { k: "tax", label: "Foreign income tax paid on it", type: "money", def: 4000 }
  ],
  // Needs final tax, so it runs in post. Each part is capped at the tax left, so it stays non-refundable.
  post(v, C, X) {
    const R = X.R, fi = clamp(num(v.inc), 0, X.emp), ft = pos(num(v.tax));
    if (!fi || !ft || !X.ni) return;
    const share = Math.min(1, fi / X.ni);
    const fedBasic = R.fedTax + R.fedPolCr + C.fedCr;          // federal tax after credits, before line 40500
    const fed = Math.min(ft, share * fedBasic, R.fedTax);
    const onLeft = R.onTax - R.onHP + R.lift;                   // Ontario tax after surtax and reduction, before LIFT and OHP
    const on = Math.min(pos(ft - fed), share * (onLeft + C.onCrPost), onLeft);
    C.fedRef += fed; C.onRef += on;
    X.say(`Federal foreign tax credit ${fmt(fed)}, Ontario ${fmt(on)}.${ft > fed + on ? ` ${fmt(ft - fed - on)} of foreign tax can't be used.` : ""}`);
  }
},
{
  id: "retroactive_lump_sum", cat: "work", kind: "calc",
  q: "I got $3,000 or more of back pay for earlier years",
  name: "Retroactive lump-sum payment averaging", lines: "T1198 · CRA calculates it",
  hint: "For back pay from a court order, arbitration award or settlement, the CRA taxes it at the earlier years' rates (plus notional interest) when that's lower. The payer gives you a T1198.",
  tags: "back pay retroactive pay arbitration award settlement lump sum averaging t1198 retro pay",
  src: ["retroactive_lump_sum_averaging"],
  fields: [
    { k: "amt", label: "Back pay for earlier years (part of my T4 pay, T1198)", type: "money", def: 20000 },
    { k: "rate", label: "My combined tax rate in the year it was for (%)", type: "pct", def: 29.65 },
    { k: "int", label: "Notional interest the CRA adds (estimate)", type: "money", def: 600 }
  ],
  post(v, C, X) {
    const q = Math.min(pos(num(v.amt)), X.ti);
    if (q < 3000) return X.say("Averaging needs at least $3,000 of qualifying back pay.");
    const now = wkSlice(X, X.ti, X.ti - q), alt = q * clamp(num(v.rate), 0, 100) / 100 + pos(num(v.int));
    const s = pos(now - alt);
    C.fedRef += s;   // the CRA applies the lower of the two calculations
    X.say(s ? `Taxed now: about ${fmt(now)}. At the earlier rate plus interest: about ${fmt(alt)}. The CRA uses the lower.` : "Your earlier rate plus interest isn't lower than this year's, so averaging doesn't help.");
  }
},
{
  id: "labour_mobility", cat: "work", kind: "calc",
  q: "I'm in construction and lived 120 km closer to a temporary site",
  name: "Labour mobility deduction for tradespeople", lines: "L22900 · T777",
  hint: "Construction workers deduct temporary lodging and one round trip when they stay at least 120 km closer to a temporary site for 36 hours or more. Up to $10,000 a year and half the pay from that site.",
  tags: "labour mobility construction trades temporary work location camp lodging travel 120 km t777",
  src: ["labour_mobility_deduction"],
  fields: [
    { k: "lodge", label: "Temporary lodging (my usual home stayed available to me)", type: "money", def: 8000 },
    { k: "trip", label: "One round trip: transport and meals", type: "money", def: 900 },
    { k: "site", label: "Pay I earned at the temporary site in 2026", type: "money", def: 30000 },
    { k: "reimb", label: "Amounts my employer paid back", type: "money", def: 0 }
  ],
  ded(v, C, X) {
    const e = pos(pos(num(v.lodge)) + pos(num(v.trip)) - pos(num(v.reimb)));
    const d = Math.min(10000, e, .5 * pos(num(v.site)));   // $10,000 cap and 120 km test from 2026 (S.C. 2026, c. 22)
    C.ded += d; C.workDed += d;
    X.say(`Deducting ${fmt(d)}.${e > d ? ` ${fmt(e - d)} carries to 2027 for the same relocation.` : ""}`);
  }
},
{
  id: "special_work_site", cat: "work", kind: "calc",
  q: "My employer pays my board and lodging at a remote or temporary site",
  name: "Tax-free board, lodging and travel at a special or remote work site", lines: "ITA 6(6) · TD4 · T4 box 14",
  hint: "Meals, lodging and travel home are tax-free at a temporary site too far to commute from while you keep your home, or at a site 80 km or more from a community of 1,000. It should be left off your T4.",
  tags: "special work site remote work location camp board lodging td4 fly in fly out mining oil sands 6(6)",
  src: ["special_work_site_board_lodging"],
  fields: [
    { k: "board", label: "Value of board and lodging (or allowance) for 2026", type: "money", def: 12000 },
    { k: "trans", label: "Travel between my home and the site paid by my employer", type: "money", def: 2500 },
    { k: "onT4", label: "It's included in my T4 income now", type: "bool", def: true }
  ],
  ded(v, C, X) {
    if (!v.onT4) return X.say("Already left out of your T4, so there's nothing more to do.");
    const e = Math.min(pos(num(v.board)) + pos(num(v.trans)), X.emp);
    C.ded += e;
    X.say(`${fmt(e)} shouldn't be taxed. Ask your employer for an amended T4 and a signed TD4; you can't deduct it on your return yourself.`);
  }
},
{
  id: "part_time_travel_allowance", cat: "work", kind: "calc",
  q: "My part-time job is 80 km or more away and pays my travel",
  name: "Tax-free travel allowance for a distant part-time job", lines: "ITA 81(3.1) · T4 box 14",
  hint: "A reasonable travel allowance from a part-time employer is tax-free when the job is at least 80 km from your home and your other work, or you teach part-time at a college or university 80 km away.",
  tags: "part-time job travel allowance 80 km second job sessional instructor teaching commute 81(3.1)",
  src: ["part_time_employee_travel_allowance"],
  fields: [
    { k: "allow", label: "Travel allowance or reimbursement from the part-time employer", type: "money", def: 4000 },
    { k: "km", label: "One-way distance (km)", type: "num", def: 95 },
    { k: "trips", label: "Round trips in 2026", type: "int", def: 40 },
    { k: "onT4", label: "My employer included it in my T4 income", type: "bool", def: true }
  ],
  ded(v, C, X) {
    const dist = 2 * pos(num(v.km)) * pos(num(v.trips));
    const r = .73 * Math.min(dist, 5000) + .67 * pos(dist - 5000);   // 2026 CRA reasonable rates as a guide
    const e = Math.min(pos(num(v.allow)), r, X.emp);
    if (!v.onT4) return X.say(`Up to about ${fmt(r)} is reasonable for your driving, so the allowance should stay tax-free.`);
    C.ded += e;
    X.say(`${fmt(e)} should be tax-free. Ask the employer to leave it off your T4. The same travel can't also be deducted.`);
  }
},
{
  id: "transport_employee_meals", cat: "work", kind: "calc",
  q: "I work in transport and pay for meals and lodging on the road",
  name: "Transport employee meals and lodging", lines: "L22900 · TL2",
  hint: "Airline, rail, bus and trucking employees away overnight deduct meals ($23 each by the simplified method) at 50%, or 80% for long-haul truckers, plus lodging. Your employer signs form TL2.",
  tags: "truck driver long haul trucker transport employee airline pilot rail bus meals lodging tl2 simplified meal rate",
  src: ["transport_employee_meals_lodging"],
  fields: [
    { k: "type", label: "My job", type: "select", def: "std", opts: [["std", "Airline, rail, bus or other transport employee"], ["truck", "Long-haul truck driver"]] },
    { k: "meals", label: "Meals eaten on trips away overnight", type: "int", def: 400 },
    { k: "lodge", label: "Lodging and showers I paid", type: "money", def: 2000 },
    { k: "allow", label: "Tax-free meal or lodging allowance I got", type: "money", def: 0 }
  ],
  ded(v, C, X) {
    const rate = v.type === "truck" ? .8 : .5;   // 80% for long-haul truckers, 50% otherwise
    const d = pos(pos(num(v.meals)) * 23 * rate + pos(num(v.lodge)) - pos(num(v.allow)));   // $23 simplified meal rate (2026 rate not yet published)
    C.ded += d; C.workDed += d;
    X.say(`Deducting ${fmt(d)}. You can use receipts instead of the $23 rate.`);
  }
},
{
  id: "artist_employment_expenses", cat: "work", kind: "calc",
  q: "I'm employed as an artist, performer or musician",
  name: "Employed artists' expenses and musical instrument costs", lines: "L22900 · T777",
  hint: "Employed artists deduct costs to earn artistic income, up to the lesser of $1,000 and 20% of that income. Musicians who must supply their instrument also deduct its upkeep, rental, insurance and CCA.",
  tags: "artist actor musician dancer singer writer composer painter instrument performer t777 employment expenses",
  src: ["artists_employment_expenses", "musician_instrument_expenses"],
  fields: [
    { k: "ainc", label: "Employment income from artistic work", type: "money", def: 20000 },
    { k: "aexp", label: "Costs I paid to earn it (supplies, agent fees, promotion)", type: "money", def: 950 },
    { k: "inst", label: "My job requires me to supply my own instrument", type: "bool", def: false },
    { k: "icost", label: "Instrument repairs, rental and insurance", type: "money", def: 700, show: v => v.inst },
    { k: "inew", label: "Price of an instrument bought in 2026, with HST", type: "money", def: 0, show: v => v.inst },
    { k: "iucc", label: "Undepreciated cost of instruments at the start of 2026", type: "money", def: 0, show: v => v.inst },
    { k: "iuse", label: "Share of instrument use for the job (%)", type: "pct", def: 80, show: v => v.inst }
  ],
  ded(v, C, X) {
    const inc = Math.min(pos(num(v.ainc)), X.emp);
    let instD = 0;
    if (v.inst) {
      const cca = .30 * pos(num(v.inew)) + .20 * pos(num(v.iucc));   // Class 8: 20%, 30% in the first year (x 1.5)
      instD = Math.min(clamp(num(v.iuse), 0, 100) / 100 * (pos(num(v.icost)) + cca), inc);
    }
    const lim = pos(Math.min(1000, .2 * inc) - instD);   // artists' limit, reduced by instrument costs
    const artD = Math.min(pos(num(v.aexp)), lim);
    C.ded += instD + artD; C.workDed += instD + artD;
    X.say(`Deducting ${fmt(artD)} of artistic expenses${v.inst ? ` and ${fmt(instD)} of instrument costs` : ""}.${num(v.aexp) > artD ? ` ${fmt(num(v.aexp) - artD)} carries forward against future artistic income.` : ""}`);
  }
},
{
  id: "artist_project_grant", cat: "work", kind: "calc",
  q: "I received an arts council project grant in 2026",
  name: "Artists' project grant: expense and $500 exemption", lines: "L13010 · T4A box 105",
  hint: "Only the part of a project grant above your reasonable project costs and the $500 basic exemption is taxable. The $500 is shared with any scholarship or award exemption.",
  tags: "arts grant canada council ontario arts council toronto arts council project grant artist t4a box 105 13010",
  src: ["artists_project_grant_exemption"],
  fields: [
    { k: "g", label: "Project grant received in 2026", type: "money", def: 10000 },
    { k: "e", label: "Reasonable costs to carry out the project", type: "money", def: 6000 },
    { k: "used", label: "I already used the $500 exemption on another award this year", type: "bool", def: false }
  ],
  inc(v, C, X) { C.income += pos(num(v.g)); },
  ded(v, C, X) {
    const g = pos(num(v.g)), ex1 = Math.min(g, pos(num(v.e))), ex2 = v.used ? 0 : Math.min(500, g - ex1);   // $500 basic exemption (not indexed)
    C.ded += ex1 + ex2;
    X.say(`Taxable part of the grant: ${fmt(g - ex1 - ex2)}. Costs used here can't also be deducted elsewhere.`);
  }
},
{
  id: "artist_inventory_nil", cat: "work", kind: "calc",
  q: "I sell art I create and have unsold works at year end",
  name: "Artists' election to value inventory at nil", lines: "T2125 · ITA 10(6)",
  hint: "Self-employed painters, printmakers and sculptors can value unsold works at nil, so their cost is deducted now instead of when they sell. Enter your art sales and costs under Side business as you paid them.",
  tags: "artist inventory nil election paintings prints sculpture unsold works visual artist t2125 10(6)",
  src: ["artist_inventory_nil_election"],
  fields: [
    { k: "close", label: "Cost of my unsold works at December 31, 2026", type: "money", def: 6000 },
    { k: "open", label: "Cost of my unsold works at December 31, 2025", type: "money", def: 0 },
    { k: "prior", label: "I made this election in an earlier year", type: "bool", def: false }
  ],
  // Without the election, normal inventory accounting adds closing stock and deducts opening stock
  // (in a later election year the two cancel, so only growth in unsold stock shows as a saving)
  inc(v, C, X) { const cl = pos(num(v.close)), op = pos(num(v.open)); C.income += v.prior ? pos(cl - op) : cl - op; },
  ded(v, C, X) {
    const cl = pos(num(v.close)), op = pos(num(v.open));
    const d = v.prior ? pos(cl - op) : cl;   // first election year: opening stock is still expensed
    C.ded += d;
    if (v.prior && cl < op) X.say("Your unsold stock shrank, so the election saves nothing extra this year. Costs stay deducted as you pay them.");
    else X.say(`The election lowers 2026 business income by ${fmt(d)} compared with normal inventory accounting.`);
    if (!num(X.hh.bizNet)) X.say("Turn on Side business and enter your art sales and costs there.");
  }
},
{
  id: "clergy_residence", cat: "work", kind: "calc",
  q: "I'm a member of the clergy or a minister serving a congregation",
  name: "Clergy residence deduction", lines: "L23100 · T1223",
  hint: "Clergy, members of religious orders and regular ministers who serve a congregation (or work full-time in church administration) can deduct the value of their housing. Your employer certifies Part B of T1223.",
  tags: "clergy minister pastor priest imam rabbi religious order parsonage manse housing t1223 23100",
  src: ["clergy_residence_deduction"],
  fields: [
    { k: "home", label: "My housing", type: "select", def: "own", opts: [["own", "I rent or own my home"], ["emp", "My employer provides it"]] },
    { k: "frv", label: "Rent and utilities I pay, or my home's fair rental value", type: "money", def: 24000, show: v => v.home === "own" },
    { k: "box30", label: "Value of the housing on my T4 (box 30)", type: "money", def: 24000, show: v => v.home === "emp" },
    { k: "pay", label: "Pay from my ministry work in 2026", type: "money", def: 90000 },
    { k: "months", label: "Months in 2026 I served in that role", type: "int", def: 12, min: 0, max: 12, show: v => v.home === "own" }
  ],
  ded(v, C, X) {
    const pay = Math.min(pos(num(v.pay)), X.emp);
    const d = v.home === "emp" ? Math.min(pos(num(v.box30)), pay)
      : Math.min(pay, Math.max(pay / 3, Math.min(10000, 1000 * clamp(num(v.months), 0, 12))), pos(num(v.frv)));   // T1223 line 5
    C.ded += d;
    X.say(`Deducting ${fmt(d)}. Home office claims on the same space reduce it.`);
  }
},
{
  id: "deployed_forces_police", cat: "work", kind: "calc",
  q: "I'm in the Armed Forces or police and was deployed abroad",
  name: "Canadian Forces and police deployment deduction", lines: "L24400 · T4 box 43",
  hint: "Pay earned while deployed on an international operational mission comes off taxable income. Your employer reports the eligible amount in box 43 of your T4.",
  tags: "canadian armed forces caf military police rcmp deployment international mission box 43 24400",
  src: ["cf_police_deployed_deduction"],
  fields: [{ k: "amt", label: "Eligible deployment pay (T4 box 43)", type: "money", def: 40000 }],
  ded(v, C, X) {
    const d = Math.min(pos(num(v.amt)), X.emp);
    C.dedTI += d;
    X.say("Net income still includes this pay, so income-tested amounts don't change.");
  }
},
{
  id: "other_deductions_25600", cat: "work", kind: "calc",
  q: "I work for the UN, took a vow of poverty, or have treaty-exempt pay",
  name: "Additional deductions (international organization, vow of poverty, tax treaty)", lines: "L25600",
  hint: "Pay from a prescribed international organization such as the UN, income you give your religious order under a vow of perpetual poverty, and pay exempt under a tax treaty all come off taxable income.",
  tags: "united nations un international organization vow of perpetual poverty tax treaty exempt income 25600",
  src: ["additional_deductions_line_25600"],
  fields: [
    { k: "type", label: "Which applies", type: "select", def: "io", opts: [["io", "Prescribed international organization"], ["vow", "Vow of perpetual poverty"], ["treaty", "Treaty-exempt employment income"]] },
    { k: "amt", label: "Amount already in my income above, net of related expenses", type: "money", def: 90000 }
  ],
  ded(v, C, X) {
    // international organization and treaty pay: limited to that employment income; vow of poverty: income given to the order
    const d = Math.min(pos(num(v.amt)), v.type === "vow" ? X.preNI : Math.min(X.emp, X.preNI));
    C.dedTI += d;
    X.say("Net income still includes it, so the basic personal amount and benefits use the full income.");
    X.say(v.type === "vow" ? "Only earned income and pension you actually gave to the order count."
      : v.type === "treaty" ? "Keep proof that the treaty exempts this pay, such as the country, days worked and who paid you."
      : "Only pay from an organization prescribed in the Income Tax Regulations, such as the UN, counts.");
  }
},
{
  id: "indian_act_exempt_income", cat: "work", kind: "calc",
  q: "I'm a status Indian and some of my pay is connected to a reserve",
  name: "Tax-exempt employment income under the Indian Act", lines: "T4 box 71 · ITA 81(1)(a)",
  hint: "Employment income situated on a reserve is tax-free, for example when 90% or more of your duties are on a reserve, or you and your employer both live on one. Your employer reports it in box 71.",
  tags: "indian act section 87 status first nations reserve exempt income box 71 tax exempt",
  src: ["indian_act_exempt_employment_income"],
  fields: [{ k: "amt", label: "Exempt employment income (T4 box 71) counted in my jobs above", type: "money", def: 30000 }],
  ded(v, C, X) {
    const d = Math.min(pos(num(v.amt)), X.emp);
    C.ded += d;
    X.say("Exempt pay doesn't create RRSP room. You can elect to pay CPP on it (form CPT20).");
    if (X.emp - d < 40000) X.say("The Canada workers benefit counts exempt pay, so any workers benefit shown may be too high.");
  }
},
{
  id: "apprenticeship_job_creation_credit", cat: "work", kind: "calc",
  q: "My side business employs a first- or second-year Red Seal apprentice",
  name: "Apprenticeship job creation tax credit", lines: "L41200 · T2038(IND)",
  hint: "You get 10% of an apprentice's eligible pay in the first 24 months of their contract, up to $2,000 per apprentice a year, off federal tax. Their wages are also a business expense.",
  tags: "apprentice apprenticeship job creation tax credit red seal trade employer t2038 41200",
  src: ["apprenticeship_job_creation_itc"],
  rows: { label: "Apprentice", add: "Add an apprentice", max: 10, fields: [
    { k: "sal", label: "Eligible pay to this apprentice in 2026", type: "money", def: 40000 }
  ] },
  cr(v, C, X) {
    const itc = (v.rows || []).reduce((s, r) => s + Math.min(2000, .1 * pos(num(r.sal))), 0);   // 10%, max $2,000 each
    C.fedCr += itc;
    X.say(`Credit ${fmt(itc)} against federal tax. Add it to business income on your 2027 return; unused credit carries back 3 years or forward 20.`);
  }
},
{
  id: "sred_itc_individual", cat: "work", kind: "calc",
  q: "My side business does research and development (SR&ED)",
  name: "SR&ED investment tax credit for individuals", lines: "L41200 · L45400 · T661 · T2038(IND)",
  hint: "15% of qualified SR&ED spending comes off federal tax, and 40% of any credit you can't use is refunded. File T661 within 12 months after your return's due date.",
  tags: "sred sr&ed scientific research experimental development investment tax credit t661 t2038 41200 45400",
  src: ["sred_investment_tax_credit_individual"],
  fields: [
    { k: "exp", label: "Qualified SR&ED spending in 2026", type: "money", def: 20000 },
    { k: "con", label: "Part paid to arm's-length contractors or third parties", type: "money", def: 5000 }
  ],
  cr(v, C, X) { C.fedCr += wkSred(v); },
  post(v, C, X) {
    const itc = wkSred(v); if (!itc) return;
    const R = X.R, c = R.cppEi;
    const cr338 = P.fed.rate * (R.bpa + c.cppBase + c.ei + Math.min(P.fed.cea, X.emp) + C.fed + R.fedMedNet);
    const divFed = C.eligDiv * P.div.eligGross * P.div.fedElig + C.nonEligDiv * P.div.nonGross * P.div.fedNon;
    const room = R.basicFed - cr338 - R.donFed - R.topup - divFed - (C.fedCr - itc);   // federal tax left for this credit
    const used = clamp(room, 0, itc), refund = .4 * (itc - used);   // 40% of the unused current-year credit is refunded
    C.fedRef += refund;
    X.say(`Credit ${fmt(itc)}: ${fmt(used)} used against federal tax${refund ? `, ${fmt(refund)} refunded` : ""}. It reduces your SR&ED pool next year.`);
  }
},
{
  id: "farm_fishing_loss", cat: "work", kind: "calc",
  q: "I farm or fish on the side and had a loss in 2026",
  name: "Farming or fishing loss (restricted farm loss limit)", lines: "L14100 · L14300 · T2042 · T2121",
  hint: "A fishing loss, or a farm loss when farming is your main source of income, offsets other income in full. Otherwise a farm loss is capped at $17,500 (the first $2,500, then half), and the rest carries forward.",
  tags: "farm loss hobby farm restricted farm loss fishing loss t2042 t2121 14100 14300 31",
  src: ["farm_fishing_losses"],
  fields: [
    { k: "type", label: "Activity", type: "select", def: "farm", opts: [["farm", "Farming"], ["fish", "Fishing"]] },
    { k: "loss", label: "Net loss for 2026", type: "money", def: 20000 },
    { k: "chief", label: "Farming is my chief source of income", type: "bool", def: false, show: v => v.type === "farm" }
  ],
  ded(v, C, X) {
    const l = pos(num(v.loss));
    const d = v.type === "fish" || v.chief ? l : Math.min(l, 2500 + Math.min(pos(l - 2500) / 2, 15000));   // ITA 31, max $17,500
    C.ded += d;
    X.say(`Deducting ${fmt(d)} of the loss.${l > d ? ` ${fmt(l - d)} is a restricted farm loss you can use only against farm income (3 years back, 20 forward).` : ""}`);
  }
},
{
  id: "farm_income_deferral", cat: "work", kind: "tip",
  q: "I have farm income I could push into a later year",
  name: "Farm income deferrals: livestock, inventory, AgriInvest, co-op shares", lines: "T2042 · ITA 28, 80.3, 135.1",
  hint: "Farmers can defer income through the drought and flood livestock deferral, AgriInvest, and co-op patronage dividends paid in shares. The cash-method inventory adjustment moves income between years.",
  tags: "farm income deferral livestock tax deferral drought flood agriinvest optional inventory adjustment oia patronage dividends co-op shares",
  src: ["farm_fishing_income_deferrals", "agricultural_coop_patronage_share_deferral"],
  tip: "In a prescribed drought or flood region, 30% of breeding livestock sales (herd cut 15% to 30%) or 90% (herd cut 30% or more) can move to next year. Patronage dividends paid in eligible co-op shares aren't taxed until the shares are redeemed, and AgriInvest government matching is taxed only when withdrawn. Deferral pays off most when the later year's rate is lower, for example after a T4 job ends.",
  fields: [
    { k: "how", label: "How", type: "select", def: "livestock", opts: [["livestock", "Livestock sales in a drought or flood region"], ["coop", "Co-op patronage dividends paid in shares"], ["other", "Other deferral"]] },
    { k: "amt", label: "Farm income I could defer", type: "money", def: 10000 },
    { k: "rate", label: "My expected combined tax rate when it's taxed (%)", type: "pct", def: 30 }
  ],
  post(v, C, X) {
    const a = Math.min(pos(num(v.amt)), X.ti), now = wkSlice(X, X.ti, X.ti - a), later = a * clamp(num(v.rate), 0, 100) / 100;
    X.say(v.how === "livestock" ? "You can defer 30% of net breeding-herd sales if the herd shrank 15% to 30%, or 90% if it shrank 30% or more, while the region is prescribed."
      : v.how === "coop" ? "Shares from an eligible farm co-op are taxed when redeemed (the co-op withholds 15%), usually no sooner than 5 years after issue."
      : "AgriInvest government matching is taxed when withdrawn, and a cash-method inventory adjustment adds income back next year.");
    X.say(now > later ? `Deferring ${fmt(a)} saves about ${fmt(now)} now and costs about ${fmt(later)} later: net ${fmt(now - later)}, plus the time value.`
      : `Deferring ${fmt(a)} saves about ${fmt(now)} now but costs about ${fmt(later)} later, so it only buys time.`);
  }
},
{
  id: "forestry_power_saw", cat: "work", kind: "calc",
  q: "I work in forestry and buy and run my own power saw",
  name: "Power saw expenses for forestry workers", lines: "L22900 · T777 · T2200",
  hint: "Forestry employees deduct the full cost of a chainsaw or trimmer bought in 2026, less any trade-in, plus fuel, oil and repairs. You need a T2200.",
  tags: "forestry logging chainsaw power saw tree trimmer t777 t2200",
  src: ["forestry_power_saw_expenses"],
  fields: [
    { k: "cost", label: "Power saws bought in 2026", type: "money", def: 1200 },
    { k: "trade", label: "Trade-in or sale proceeds", type: "money", def: 200 },
    { k: "ops", label: "Fuel, oil and repairs", type: "money", def: 800 },
    { k: "reimb", label: "Amounts my employer paid back", type: "money", def: 0 }
  ],
  ded(v, C, X) {
    const d = pos(pos(num(v.cost)) - pos(num(v.trade)) + pos(num(v.ops)) - pos(num(v.reimb)));
    C.ded += d; C.workDed += d;
    X.say(`Deducting ${fmt(d)}.`);
  }
},
{
  id: "teachers_exchange_fund", cat: "work", kind: "calc",
  q: "I contributed to a teachers' exchange fund",
  name: "Teachers' exchange fund contribution", lines: "L22900 · ITA 8(1)(d)",
  hint: "Teachers can deduct up to $250 paid to a fund set up by the Canadian Education Association (now EdCan) for Commonwealth teachers in Canada. Check that the fund still exists before claiming.",
  tags: "teacher exchange fund canadian education association edcan commonwealth",
  src: ["teachers_exchange_fund"],
  fields: [{ k: "amt", label: "Contribution in 2026", type: "money", def: 250 }],
  ded(v, C, X) { const d = Math.min(250, pos(num(v.amt))); C.ded += d; C.workDed += d; X.say(`Deducting ${fmt(d)} (the most is $250).`); }   // $250 cap, not indexed
},

// ---------------- HOME: northern residents ----------------
{
  id: "northern_residents", cat: "home", kind: "calc",
  q: "I lived in a northern Ontario zone like Moosonee or Red Lake",
  name: "Northern residents deductions (residency and travel)", lines: "L25500 · T2222",
  hint: "Six months in a row in a prescribed zone gives $11 a day ($22 if you keep your own home there), and half in the intermediate zone, plus trip costs. Thunder Bay, Timmins, Kenora and Sudbury don't qualify.",
  tags: "northern residents deduction prescribed zone moosonee moose factory attawapiskat sandy lake red lake pickle lake ear falls t2222 25500 travel benefit",
  src: ["northern_residents_residency", "northern_residents_travel", "northern_residents_deduction"],
  fields: [
    { k: "zone", label: "Zone", type: "select", def: "a", opts: [["a", "Northern zone: Moosonee, Attawapiskat, Sandy Lake, Fort Severn"], ["b", "Intermediate zone: Red Lake, Ear Falls, Pickle Lake, Cat Lake"]] },
    { k: "days", label: "Days I lived there in 2026", type: "int", def: 365, min: 0, max: 365 },
    { k: "sole", label: "I kept my own home there and no one else in it claims this", type: "bool", def: true },
    { k: "board", label: "Tax-free board and lodging at a work site (T4 box 31)", type: "money", def: 0 }
  ],
  rows: { label: "Traveller", add: "Add a traveller", max: 8, fields: [
    { k: "cost", label: "Their 2026 trip costs, up to the cheapest return airfare (2 non-medical trips)", type: "money", def: 900 },
    { k: "ben", label: "Taxable employer travel benefit for them (T4 box 32)", type: "money", def: 0 }
  ] },
  ded(v, C, X) {
    const half = v.zone === "b" ? .5 : 1, days = clamp(num(v.days), 0, 365);
    const res = Math.min(pos(11 * half * days * (v.sole ? 2 : 1) - pos(num(v.board))), .2 * X.preNI);   // $11 a day + $11 for a home (ITA 110.7), max 20% of net income
    const travel = half * (v.rows || []).reduce((s, r) => {
      const cost = pos(num(r.cost)), ben = pos(num(r.ben));
      return s + (ben ? Math.min(ben, cost) : Math.min(1200, cost));   // $1,200 standard travel amount per person
    }, 0);
    C.dedTI += res + travel;
    X.say(`Residency ${fmt(res)}${travel ? `, travel ${fmt(travel)}` : ""}. It lowers taxable income, not net income.`);
  }
},

// ---------------- LEARNING: Canada training credit ----------------
{
  id: "canada_training_credit", cat: "learning", kind: "calc",
  q: "I paid for courses or exam fees and have training credit room",
  name: "Canada training credit", lines: "L45350 · Schedule 11",
  hint: "If you're 26 to 65, you get back half of your 2026 tuition or exam fees, up to the limit on your 2025 notice of assessment ($250 added a year, $5,000 lifetime). It's refundable at any income.",
  tags: "canada training credit ctc course upskilling professional exam tuition refundable 45350 notice of assessment",
  src: ["canada_training_credit"],
  fields: [
    { k: "lim", label: "My 2026 Canada training credit limit (2025 notice of assessment)", type: "money", def: 1750 },
    { k: "fees", label: "Eligible tuition and exam fees for 2026", type: "money", def: 4000 },
    { k: "age", label: "My age on December 31, 2026", type: "int", def: 40 }
  ],
  cr(v, C, X) {
    const age = num(v.age);
    if (age < 26 || age > 65) return X.say("Only for people aged 26 to 65 at the end of the year.");
    const ctc = Math.min(pos(num(v.lim)), .5 * pos(num(v.fees)));
    C.fedRef += ctc;
    X.say(`Refundable credit ${fmt(ctc)}. Enter only the other ${fmt(pos(num(v.fees)) - ctc)} of fees under Tuition, so the net gain is about ${fmt(.86 * ctc)}.`);
    if (X.ni > 181440) X.say("No new $250 is added for 2027 because your net income is over $181,440.");
  }
}
);
})();
