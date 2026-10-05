// Health, savings, family and other items (research bucket: health_savings_family_other).
// Strategy tips only explain an estimate with X.say; they never add to C.

// ---- Estimate helpers for this file (prefixed so they can't clash with other item files) ----
const HSFO = (() => {
  // Ontario surtax factor on a credit or tax change, given basic Ontario tax
  const sf = b => 1 + (b > P.on.s1 ? .2 : 0) + (b > P.on.s2 ? .36 : 0);
  // Federal + Ontario tax on taxable income ti with credit amounts cF / cO.
  // el / ne: grossed-up eligible / non-eligible dividends already inside ti. noRed / noOhp drop the Ontario reduction / OHP.
  function tax(ti, cF, cO, o) {
    o = o || {};
    const el = o.el || 0, ne = o.ne || 0;
    ti = pos(ti);
    const fed = pos(brk(ti, P.fed.b) - P.fed.rate * cF - el * P.div.fedElig - ne * P.div.fedNon);
    const basicOn = pos(brk(ti, P.on.b) - P.on.rate * cO);
    const sur = .2 * pos(basicOn - P.on.s1) + .36 * pos(basicOn - P.on.s2);
    const l73 = pos(basicOn + sur - el * P.div.onElig - ne * P.div.onNon);
    const red = o.noRed ? 0 : Math.min(l73, pos(2 * P.on.redBasic - l73));
    const on = l73 - red + (o.noOhp ? 0 : ohp(ti));
    return { fed, on, basicOn, total: fed + on };
  }
  // Your basic credit amounts (BPA at net income ni, CPP, EI, Canada employment amount)
  const mine = (X, ni) => { const c = X.cppEi; return [P.fedBpa(ni) + c.cppBase + c.ei + Math.min(P.fed.cea, X.emp), P.on.bpa + c.cppBase + c.ei]; };
  // Extra tax on you from d more ordinary income plus el / ne grossed-up dividends (negative d: a deduction, result negative)
  function extra(X, d, el, ne) {
    el = el || 0; ne = ne || 0;
    const add = d + el + ne, [f0, o0] = mine(X, X.ni), [f1, o1] = mine(X, X.ni + add);
    return tax(X.ti + add, f1, o1, { el, ne }).total - tax(X.ti, f0, o0).total;
  }
  // Tax saved by deducting d at your income
  const ded = (X, d) => -extra(X, -Math.min(d, X.ti));
  // Extra tax for someone else (partner, child) with net income ni; emp = that income is employment income
  function other(ni, d, emp, el, ne) {
    el = el || 0; ne = ne || 0;
    const c = emp ? contrib(ni) : { cppBase: 0, ei: 0 }, cea = emp ? Math.min(P.fed.cea, ni) : 0;
    const cr = n => [P.fedBpa(n) + c.cppBase + c.ei + cea, P.on.bpa + c.cppBase + c.ei];
    const add = d + el + ne, [f0, o0] = cr(ni), [f1, o1] = cr(ni + add);
    return tax(ni + add, f1, o1, { el, ne }).total - tax(ni, f0, o0).total;
  }
  // Tax on a year of investment income of a given type, for you
  const invTax = (X, amt, type) => type === "gains" ? extra(X, .5 * amt) : type === "div" ? extra(X, 0, P.div.eligGross * amt) : extra(X, amt);
  const spOn = s => pos(Math.min(P.on.spouseMax, P.on.spouseBase - s));   // Ontario spouse amount (58120)
  // Your spouse amount lost (tax dollars) when your partner's net income rises from s to s + d.
  // Only called for strategies that involve a partner, so it applies whether or not the spouse item is on.
  const spLoss = (X, s, d) => .14 * (pos(P.fedBpa(X.ni) - s) - pos(P.fedBpa(X.ni) - s - d)) + P.on.rate * sf(X.R.basicOn) * (spOn(s) - spOn(s + d));
  const pct = x => (Math.round(x * 100) / 100) + "%";
  return { sf, tax, mine, extra, ded, other, invTax, spOn, spLoss, pct };
})();

SKIPPED.push(
  ["home_buyers_amount_disabled_relative", "same line 31270 as the home bucket's first_time_home_buyers_amount, whose research already covers buying a more accessible home for a DTC-eligible person; one switch avoids a double claim"],
  ["personal_support_workers_tax_credit", "duplicate of the work bucket's personal_support_worker_credit / personal_support_workers_credit (a job-based credit, built in Work)"],
  ["retiring_allowance_rrsp_transfer", "duplicate of the work bucket's retiring_allowance_rrsp_rollover (severance moved to an RRSP, built in Work)"],
  ["indigenous_s87_exemption", "duplicate of the work bucket's indian_act_exempt_employment_income (exempt T4 income, built in Work)"],
  ["ontario_seniors_low_income_dental_drug", "duplicate of the ontario_ended bucket's on_seniors_income_tested_health (Ontario Seniors Dental Care and Co-Payment programs)"]
);

ITEMS.push(
// ---------------- HEALTH ----------------
{
  id: "health_spending_account", cat: "health", kind: "tip",
  q: "My employer offers a health spending account or flex credits",
  name: "Health spending account, flex credits and other tax-free health benefits",
  lines: "Not on your return (private health services plan)",
  hint: "Health and dental costs paid through an employer health spending account are tax-free, while the medical credit returns only about 20% of costs above a threshold. You usually choose your flex split before the plan year.",
  tip: "Direct flex credits into the health spending account instead of taking them as taxable pay, if your family will have enough dental, vision, drug or therapy costs to use it. The account pays those costs with pre-tax dollars. Don't also claim the reimbursed costs as medical expenses. Employer-paid counselling for mental or physical health is also tax-free.",
  tags: "hsa health spending account flex credits flexible benefits phsp private health services plan counselling employer benefits",
  src: ["employer_health_spending_account"],
  fields: [{ k: "amt", label: "Amount I could run through the account each year", type: "money", def: 3000 }],
  post(v, C, X) {
    const amt = num(v.amt);
    if (!amt) return;
    const tax = HSFO.extra(X, amt);
    // Medical credit you'd give up on the reimbursed costs (only the part above your 3% threshold)
    const thrF = Math.min(P.fed.medCap, .03 * X.ni), thrO = Math.min(P.on.medCap, .03 * X.ni);
    const lost = .14 * Math.min(amt, pos(C.fedMed - thrF)) + P.on.rate * HSFO.sf(X.R.basicOn) * Math.min(amt, pos(C.onMed - thrO));
    X.say(`Running ${fmt(amt)} through the account instead of taxable pay saves about ${fmt(tax - lost)} a year` +
      (lost ? ` (${fmt(tax)} of tax, minus ${fmt(lost)} of medical credit you'd no longer claim).` : "."));
  }
},
{
  id: "family_medical_donation_pooling", cat: "health", kind: "tip",
  q: "My partner and I can choose who claims medical costs and donations",
  name: "Claiming family medical expenses and donations on the better return",
  lines: "L33099 · L34900 · ON 58689 · ON 58969",
  hint: "Either partner can claim the family's medical costs and both partners' donations. Medical costs often go further on the lower-income return, donations on the higher-income one.",
  tip: "Medical costs only count above 3% of net income (at most $2,890 federal), so the lower-income partner often gets a bigger credit, if they have enough tax to use it. Donations above $200 earn 29% federal, or 33% on income over $258,482, so pool them on the higher-income return and use only one $200 low-rate tier. Enter the pooled amounts under Medical expenses and Donations on whichever return wins, and compare both ways before filing.",
  tags: "pool medical expenses donations spouse partner lower income threshold who claims optimize",
  src: ["medical_expense_spouse_optimization", "pool_family_credits"],
  fields: [
    { k: "sni", label: "Partner's 2026 net income", type: "money", def: 40000, show: (v, R) => !(R && R.hh && R.hh.spouse) },
    { k: "med", label: "Family medical costs (if not entered under Medical expenses)", type: "money", def: 6000 }
  ],
  post(v, C, X) {
    const sni = X.hh.spouse ? X.spouseNI : num(v.sni);
    const E = C.fedMed > 0 ? C.fedMed : num(v.med), Eo = C.onMed > 0 ? C.onMed : num(v.med);
    if (!E) return X.say("Enter your family's medical costs to compare.");
    // Your credit (Ontario credit grows with your surtax)
    const youF = .14 * pos(E - Math.min(P.fed.medCap, .03 * X.ni));
    const youO = P.on.rate * HSFO.sf(X.R.basicOn) * pos(Eo - Math.min(P.on.medCap, .03 * X.ni));
    // Partner's credit, limited to the tax they have (assumes employment income)
    const c = contrib(sni), sp = HSFO.tax(sni, P.fedBpa(sni) + c.cppBase + c.ei + Math.min(P.fed.cea, sni), P.on.bpa + c.cppBase + c.ei);
    const spF = Math.min(sp.fed, .14 * pos(E - Math.min(P.fed.medCap, .03 * sni)));
    const spO = Math.min(sp.basicOn, P.on.rate * pos(Eo - Math.min(P.on.medCap, .03 * sni))) * HSFO.sf(sp.basicOn);
    const gain = spF + spO - youF - youO;
    X.say(gain > 0
      ? `Claiming ${fmt(E)} of medical costs on your partner's return gives about ${fmt(gain)} more credit than on yours.`
      : `Keep the medical costs on your return: about ${fmt(-gain)} more credit than on your partner's.`);
  }
},
{
  id: "cdcp_dental", cat: "health", kind: "tip",
  q: "My family has no dental insurance through work or a private plan",
  name: "Canadian Dental Care Plan (CDCP)",
  lines: "No return line · based on adjusted family net income",
  hint: "Free or lower-cost dental care for families with adjusted family net income under $90,000 and no access to any dental insurance. Your 2026 return sets eligibility for July 2027 to June 2028.",
  tip: "Apply through Service Canada once your and your partner's returns are filed. Under $70,000 of family net income there's no co-pay; from $70,000 to $79,999 you pay 40% of the plan's fee guide, and from $80,000 to $89,999 you pay 60%. An RRSP or FHSA deduction that brings family net income under one of these lines can open or improve coverage. Access to any employer or private dental plan disqualifies you, even if you don't use it.",
  tags: "cdcp dental care plan dentist teeth insurance service canada low income",
  src: ["canada_dental_care_plan", "canadian_dental_care_plan"],
  fields: [{ k: "cost", label: "Expected family dental costs a year", type: "money", def: 2000 }],
  post(v, C, X) {
    const A = X.afni, cost = num(v.cost);
    if (A >= 90000) {
      const need = A - 89999;
      return X.say(`Family net income of ${fmt(A)} is over the $90,000 limit, so you don't qualify.` +
        (need <= 20000 ? ` A further ${fmt(need)} of RRSP or FHSA deductions would bring you under it.` : ""));
    }
    const copay = A < 70000 ? 0 : A < 80000 ? .4 : .6;   // 2026 co-pay tiers
    X.say(`At family net income of ${fmt(A)} you pay ${copay * 100}% of the fee guide, so the plan would cover about ${fmt((1 - copay) * cost)} of ${fmt(cost)}.`);
  }
},
{
  id: "trillium_drug", cat: "health", kind: "tip",
  q: "My household's prescription drug costs are high",
  name: "Ontario Trillium Drug Program",
  lines: "No return line · based on household net income",
  hint: "Ontario pays prescription costs after a yearly deductible of about 4% of household net income, for people without full drug coverage. After that you pay up to $2 per prescription.",
  tip: "Register with the Trillium Drug Program before the program year starts on August 1, or as soon as large costs start. The deductible is based on both partners' net incomes and is paid in four quarterly parts. What you still pay, including the deductible, counts as a medical expense. Private insurance pays first, and Trillium can cover what's left.",
  tags: "trillium drug program prescriptions medication pharmacy ontario drug benefit deductible",
  src: ["ontario_trillium_drug_program"],
  fields: [
    { k: "cost", label: "Prescription costs a year not covered by insurance", type: "money", def: 15000 },
    { k: "fills", label: "Prescriptions filled a year", type: "int", def: 24, min: 0 }
  ],
  post(v, C, X) {
    const cost = num(v.cost), ded = .04 * X.afni;   // deductible about 4% of household net income
    const pay = pos(cost - ded - 2 * num(v.fills));
    X.say(`Deductible about ${fmt(ded)} (4% of household net income of ${fmt(X.afni)}). ` +
      (pay ? `The program would pay about ${fmt(pay)} of your ${fmt(cost)}.` : "Your costs are below the deductible, so the program wouldn't pay anything yet."));
  }
},
{
  id: "canada_disability_benefit_calc", cat: "health", kind: "calc",
  q: "I'm 18 to 64 with the disability tax credit, or my partner is",
  name: "Canada Disability Benefit",
  lines: "No return line · 2026 return sets July 2027 to June 2028",
  hint: "A monthly federal benefit of up to $204.20 ($2,450 a year) for people 18 to 64 with the disability tax credit. It's reduced by family net income, so it's usually $0 with a full-time salary.",
  tags: "canada disability benefit cdb dtc monthly payment service canada",
  src: ["canada_disability_benefit", "canada_disability_benefit_spouse"],
  fields: [{ k: "who", label: "Who has the disability tax credit", type: "select", def: "me", opts: [["me", "Me"], ["spouse", "My partner"], ["both", "Both of us"]] }],
  cr(v, C, X) {
    const couple = !!X.hh.spouse || v.who !== "me";
    if (v.who !== "me" && !X.hh.spouse) X.say("Turn on the spouse item so your partner's income is counted.");
    // July 2026 to June 2027 values: $204.20 a month; couple threshold $32,500 (single $23,000);
    // working income exemption $14,294 couple ($10,210 single); 20% reduction (10% each if both eligible)
    const T = couple ? 32500 : 23000, wie = couple ? Math.min(X.earned + X.spouseNI, 14294) : Math.min(X.earned, 10210);
    const r = v.who === "both" ? .10 : .20, n = v.who === "both" ? 2 : 1;
    const ben = n * pos(2450.40 - r * pos(X.afni - wie - T));
    C.ben += ben;
    X.say(ben ? `${fmt(ben)} a year, paid July 2027 to June 2028.`
      : `$0: it's reduced by ${r * 100}% of family net income over ${fmt(wie + T)}, and yours is ${fmt(X.afni)}.`);
  }
},
{
  id: "dtc_employer_transport", cat: "health", kind: "tip",
  q: "I have the disability credit and my employer pays my taxi or parking",
  name: "Tax-free employer-paid transport, parking or attendant",
  lines: "ITA 6(16) · not included on your T4",
  hint: "If you qualify for the disability tax credit, employer-paid taxi or para-transit to work, parking near work, or an attendant who helps you do your job is not a taxable benefit.",
  tip: "Ask your employer to pay or reimburse these costs directly instead of raising your salary to cover them. The benefit stays off your T4, so you save tax at your full marginal rate. Check that box 14 of your T4 doesn't include them, and ask payroll to correct it if it does.",
  tags: "disability employee benefit taxi para-transit parking attendant dtc employer paid non-taxable",
  src: ["dtc_employee_tax_free_benefits"],
  fields: [{ k: "amt", label: "Yearly value of employer-paid transport, parking or attendant", type: "money", def: 3000 }],
  post(v, C, X) {
    const amt = num(v.amt);
    if (amt) X.say(`${fmt(amt)} a year of these benefits would cost about ${fmt(HSFO.extra(X, amt))} in tax if paid to you as salary.`);
  }
},
{
  id: "retro_disability_lump_sum", cat: "health", kind: "tip",
  q: "I got a retroactive disability or wage-loss lump sum in 2026",
  name: "Retroactive lump sums taxed at earlier years' rates",
  lines: "T1198 · T4A(P) (CPP or QPP)",
  hint: "If a 2026 lump sum from CPP disability, a wage-loss plan or a settlement covers earlier years, CRA can tax that part at those years' rates. It needs $3,000 or more for earlier years ($300 for CPP or QPP).",
  tip: "For a wage-loss replacement plan, employment settlement or similar payment, ask the payer for Form T1198 and file it with your return. For CPP or QPP disability, CRA uses your T4A(P) and does the comparison for you. CRA applies it only when it lowers your tax, and T1198 adds notional interest to the earlier-year tax. It helps most when the earlier years had lower income, such as while you were off work.",
  tags: "retroactive lump sum cpp disability qpp wage loss replacement ltd settlement back pay t1198 averaging",
  src: ["retroactive_lump_sum_spreading"],
  fields: [
    { k: "amt", label: "Part of the lump sum for earlier years", type: "money", def: 15000 },
    { k: "rate", label: "My combined tax rate in those years (%)", type: "pct", def: 29.65 }
  ],
  post(v, C, X) {
    const amt = num(v.amt);
    if (!amt) return;
    const now = HSFO.extra(X, amt), then = amt * clamp(num(v.rate), 0, 100) / 100;
    X.say(now > then
      ? `Taxed in 2026 on top of your income, ${fmt(amt)} costs about ${fmt(now)}; at ${HSFO.pct(num(v.rate))} in earlier years, about ${fmt(then)}. Spreading it could save about ${fmt(now - then)} before interest.`
      : "Your 2026 rate isn't higher than the earlier years' rate, so spreading it wouldn't save tax.");
  }
},
{
  id: "qualified_disability_trust_tip", cat: "health", kind: "tip",
  q: "I'm setting up a trust in my will for a relative with a disability",
  name: "Qualified disability trust",
  lines: "T3 · joint election (ITA 122(3))",
  hint: "A trust created by a will for a beneficiary with the disability tax credit can pay tax at graduated rates on the income it keeps, instead of the top rate. The trustee and beneficiary elect each year.",
  tip: "Set up the trust in your will, naming a beneficiary who qualifies for the disability tax credit. Each year the trustee and beneficiary jointly elect, and income kept in the trust is taxed like a person's income, without the basic personal amount. A recovery tax applies if the beneficiary stops qualifying or capital goes to someone else. Henson trust wording can also protect ODSP eligibility.",
  tags: "qualified disability trust qdt testamentary trust will inheritance henson trust odsp estate planning",
  src: ["qualified_disability_trust"],
  fields: [{ k: "inc", label: "Income the trust would keep each year", type: "money", def: 30000 }],
  post(v, C, X) {
    const x = num(v.inc);
    if (!x) return;
    const surtax = b => b + .2 * pos(b - P.on.s1) + .36 * pos(b - P.on.s2);
    const top = .33 * x + surtax(.1316 * x);                 // flat top rates: 33% federal, 13.16% Ontario plus surtax
    const grad = brk(x, P.fed.b) + surtax(brk(x, P.on.b));   // graduated rates, no basic personal amount
    X.say(`On ${fmt(x)} kept in the trust, graduated rates mean about ${fmt(grad)} of tax instead of ${fmt(top)} at the flat top rate, saving about ${fmt(top - grad)} a year.`);
  }
},

// ---------------- SAVINGS ----------------
{
  id: "tfsa_shelter", cat: "savings", kind: "tip",
  q: "I keep savings or investments in a TFSA",
  name: "Tax-Free Savings Account (TFSA)",
  lines: "Not on your return",
  hint: "Growth and withdrawals are tax-free and don't count as income. New room is $7,000 for 2026, and unused room carries forward: $109,000 in total if you've been 18+ and resident since 2009.",
  tip: "Fill your TFSA before investing in a taxable account, and hold your most heavily taxed investments there, such as savings accounts, GICs and bonds. There's no deduction, but you never pay tax on the income, and withdrawals don't affect benefits or the OAS clawback. Amounts you withdraw are added back to your room the next January. Over-contributions are taxed at 1% a month.",
  tags: "tfsa tax free savings account room contribution limit gic investing",
  src: ["tfsa"],
  fields: [
    { k: "bal", label: "Amount in my TFSA that would otherwise be taxable", type: "money", def: 50000 },
    { k: "ret", label: "Expected yearly return (%)", type: "pct", def: 5 },
    { k: "type", label: "Main type of return", type: "select", def: "interest", opts: [["interest", "Interest (savings, GICs, bonds)"], ["gains", "Capital gains"], ["div", "Canadian eligible dividends"]] }
  ],
  post(v, C, X) {
    const I = num(v.bal) * num(v.ret) / 100;
    if (!I) return;
    X.say(`${fmt(I)} of yearly return in the TFSA avoids about ${fmt(HSFO.invTax(X, I, v.type))} of tax a year at your income.`);
  }
},
{
  id: "resp_cesg_grant", cat: "savings", kind: "calc",
  q: "I contribute to an RESP for my children",
  name: "RESP: Canada Education Savings Grant",
  lines: "No return line · grant paid into the RESP",
  hint: "The government adds 20% of the first $2,500 you put in each year per child ($500), plus up to $100 more at lower family incomes. Unused grant room carries forward, up to $1,000 a year and $7,200 per child.",
  tags: "resp registered education savings plan cesg grant canada learning bond kids children university college education",
  src: ["resp_grants", "resp_cesg"],
  rows: { label: "Child", add: "Add a child", max: 10, fields: [
    { k: "age", label: "Child's age on Dec 31, 2026", type: "int", def: 5, min: 0, max: 17 },
    { k: "contrib", label: "My 2026 contributions for this child", type: "money", def: 2500 },
    { k: "unused", label: "Unused grant room from earlier years (grant dollars)", type: "money", def: 0 },
    { k: "got", label: "Grant already received for this child", type: "money", def: 0 }
  ] },
  cr(v, C, X) {
    // Additional CESG rate on the first $500: 20% up to $58,523 family income, 10% up to $117,045 (2026 thresholds)
    const rate = X.afni <= 58523 ? .2 : X.afni <= 117045 ? .1 : 0;
    let tot = 0, addTot = 0, old = false;
    for (const r of v.rows || []) {
      const c = num(r.contrib), left = pos(7200 - num(r.got));   // $7,200 lifetime grant per child
      const room = 2500 + Math.min(2500, num(r.unused) / .2);    // this year's $2,500 plus up to $2,500 catch-up
      const basic = Math.min(.2 * Math.min(c, room), 1000, left);
      const add = Math.min(rate * Math.min(c, 500), pos(left - basic));
      tot += basic + add; addTot += add;
      if (num(r.age) >= 16) old = true;
    }
    C.ben += tot;
    X.say(`Grant: ${fmt(tot)}${addTot ? `, including ${fmt(addTot)} extra at your family income` : ""}. It's paid into the RESP, not to you.`);
    if (old) X.say("At 16 or 17 the grant needs earlier saving: $2,000 in total by the end of the year they turned 15, or $100 a year in any 4 earlier years.");
    if (X.afni <= 58523) X.say("At your family income, also apply for the Canada Learning Bond, which needs no contribution.");
  }
},
{
  id: "rrsp_fhsa_defer_deduction", cat: "savings", kind: "tip",
  q: "I'd rather save my RRSP or FHSA deduction for a higher-income year",
  name: "Carrying forward RRSP and FHSA deductions",
  lines: "Schedule 7 · Schedule 15",
  hint: "You can contribute now and deduct later. Undeducted RRSP and FHSA contributions carry forward with no time limit, which pays off if your tax rate will be higher later.",
  tip: "Contribute as usual, then on Schedule 7 (RRSP) or Schedule 15 (FHSA) deduct less than you put in; the rest carries forward until you choose to deduct it. This makes sense when this year's income is unusually low, for example with a job switched off or a leave, and you expect a higher bracket soon. If you're already in the top bracket, deduct now. Enter only the part you deduct this year under RRSP or FHSA.",
  tags: "rrsp fhsa carry forward undeducted contributions defer deduction timing schedule 7 schedule 15 low income year",
  src: ["rrsp_fhsa_deduction_timing"],
  fields: [
    { k: "amt", label: "Contributions I'd hold back from deducting this year", type: "money", def: 10000 },
    { k: "fut", label: "Taxable income I expect in the year I deduct it", type: "money", def: 250000 }
  ],
  post(v, C, X) {
    const d = num(v.amt), fut = num(v.fut);
    if (!d) return;
    const now = HSFO.ded(X, d), later = -HSFO.other(fut, -Math.min(d, fut), true);
    X.say(`Deducting ${fmt(d)} this year saves about ${fmt(now)}; at ${fmt(fut)} of income later it would save about ${fmt(later)}.` +
      (later > now ? ` Waiting gains about ${fmt(later - now)}, before the time value of money.` : " Waiting doesn't help, so deduct it now."));
  }
},
{
  id: "rrsp_t746", cat: "savings", kind: "calc",
  q: "I withdrew RRSP contributions I never deducted",
  name: "Deduction for a refund of undeducted RRSP contributions",
  lines: "L12900 · L23200 · T746 · T3012A",
  hint: "If you over-contributed and took the extra out in time (the year you contributed, the year it was assessed, or the next year), the withdrawal isn't taxed. Knowingly over-contributing beyond the $2,000 buffer doesn't qualify.",
  tags: "rrsp over-contribution withdrawal refund undeducted t746 t3012a excess 1% penalty",
  src: ["rrsp_undeducted_refund_t746"],
  fields: [
    { k: "amt", label: "Undeducted contributions I withdrew in 2026", type: "money", def: 5000 },
    { k: "ok", label: "Withdrawn in time, and it was an honest mistake or within $2,000", type: "bool", def: true }
  ],
  inc(v, C, X) { C.income += num(v.amt); },   // the withdrawal is income on line 12900
  ded(v, C, X) {
    const w = num(v.amt);
    if (!v.ok) return X.say("Without the T746 conditions the withdrawal is taxed as income.");
    C.ded += w;
    X.say(`Offsets the ${fmt(w)} withdrawal, so it isn't taxed. Don't also count these contributions under RRSP. Use Form T3012A to avoid tax withheld on the withdrawal.`);
  }
},
{
  id: "rdsp_grants", cat: "savings", kind: "calc",
  q: "I contribute to an RDSP for someone with the disability tax credit",
  name: "RDSP: Canada Disability Savings Grant and Bond",
  lines: "No return line · paid into the RDSP",
  hint: "The government adds $3 per $1 on the first $500 and $2 per $1 on the next $1,000 at family income of $117,045 or less (up to $3,500 a year), or $1 per $1 on $1,000 above that. Lower incomes also get a bond of up to $1,000.",
  tags: "rdsp registered disability savings plan cdsg cdsb grant bond disabled child dtc",
  src: ["rdsp_grants_bonds", "rdsp_grant_bond"],
  rows: { label: "Beneficiary", add: "Add a beneficiary", max: 6, fields: [
    { k: "contrib", label: "2026 contributions", type: "money", def: 1500 },
    { k: "adult", label: "The beneficiary is 18 or older", type: "bool", def: false },
    { k: "inc", label: "If 18+: their own net income plus their spouse's", type: "money", def: 20000 }
  ] },
  cr(v, C, X) {
    let g = 0, b = 0;
    for (const r of v.rows || []) {
      const c = num(r.contrib), I = r.adult ? num(r.inc) : X.afni;   // under 18: parents' family income
      g += I <= 117045 ? 3 * Math.min(c, 500) + 2 * Math.min(pos(c - 500), 1000) : Math.min(c, 1000);   // CDSG, 2026 thresholds
      b += I <= 38237 ? 1000 : I < 58523 ? 1000 * (58523 - I) / (58523 - 38237) : 0;                     // CDSB, no contribution needed
    }
    C.ben += g + b;
    X.say(`Grant ${fmt(g)}${b ? `, bond ${fmt(b)}` : ""}, paid into the RDSP. ESDC uses family income from two years earlier (2024 returns for 2026), so this uses your 2026 income as an estimate.`);
  }
},
{
  id: "cpp_timing", cat: "savings", kind: "tip",
  q: "I'm 60 to 70 and deciding when to start my CPP pension",
  name: "Timing your CPP retirement pension",
  lines: "L11400 · T4A(P)",
  hint: "Each month you delay CPP after 65 adds 0.7% for life (42% more at 70); each month you start before 65 cuts it by 0.6%. While you still earn a salary, CPP is taxed at your top rate.",
  tip: "If you're still working and don't need the income, delaying CPP keeps it from being taxed on top of your salary and raises the pension for life. Starting early can make sense with poor health or no other savings. Apply through My Service Canada Account up to 12 months ahead. Pension sharing with a partner can also shift CPP to the lower-income spouse.",
  tags: "cpp canada pension plan start early defer delay 60 65 70 retirement pension timing",
  src: ["cpp_start_timing"],
  fields: [
    { k: "age", label: "My age on Dec 31, 2026", type: "int", def: 63, min: 60, max: 70 },
    { k: "amt", label: "CPP I'd receive in 2026 if I start now", type: "money", def: 12000 }
  ],
  post(v, C, X) {
    const age = clamp(num(v.age), 60, 70), amt = num(v.amt);
    if (!amt) return;
    const tax = HSFO.extra(X, amt);
    X.say(`Starting now, ${fmt(amt)} of CPP would cost about ${fmt(tax)} in tax at your income, leaving ${fmt(amt - tax)}.`);
    if (age < 65) X.say(`Starting at ${age} instead of 65 cuts the pension by about ${HSFO.pct((65 - age) * 7.2)} for life.`);
    else if (age < 70) X.say(`Waiting until 70 would raise it by about ${HSFO.pct(Math.round(1000 * (1.42 / (1 + .084 * (age - 65)) - 1)) / 10)} for life.`);   // 0.7% a month after 65
  }
},
{
  id: "oas_clawback_deferral", cat: "savings", kind: "tip",
  q: "I'm 65 or older and eligible for Old Age Security",
  name: "OAS clawback (recovery tax) and deferring OAS",
  lines: "L11300 · L23500 · L42200",
  hint: "OAS is clawed back at 15% of net income over $95,323, so all of it is repaid at around $155,000 of income. You can defer it up to 5 years for 0.6% more a month (36% more at 70).",
  tip: "While your salary is high, delaying OAS costs little because most or all of it would be repaid. If you've already started, you can cancel within 6 months of starting and pay back what you received. RRSP, FHSA and pension deductions lower net income and the clawback. After a big income drop, ask CRA to reduce the clawback withheld from your payments with Form T1213(OAS).",
  tags: "oas old age security clawback recovery tax defer delay 65 70 pension senior",
  src: ["oas_recovery_tax", "oas_deferral"],
  fields: [{ k: "amt", label: "OAS I'd receive in 2026", type: "money", def: 9000 }],
  post(v, C, X) {
    const oas = num(v.amt);
    if (!oas) return;
    const repay = Math.min(oas, .15 * pos(X.ni + oas - 95323));   // 2026 recovery threshold $95,323
    const tax = HSFO.extra(X, oas - repay);
    const ageF = n => pos(P.fed.age - .15 * pos(n - P.fed.ageThr)), ageO = n => pos(P.on.age - .15 * pos(n - P.on.ageThr));
    const n2 = X.ni + oas - repay;
    const lostAge = .14 * (ageF(X.ni) - ageF(n2)) + P.on.rate * HSFO.sf(X.R.basicOn) * (ageO(X.ni) - ageO(n2));
    const keep = oas - repay - tax - lostAge;
    X.say(`At your net income, ${fmt(repay)} of ${fmt(oas)} would be clawed back, and tax on the rest (including any lost age amount) is about ${fmt(tax + lostAge)}, leaving ${fmt(keep)}.` +
      (keep < .15 * oas ? " Deferring costs almost nothing this year." : ""));
  }
},
{
  id: "rrif_minimum", cat: "savings", kind: "tip",
  q: "I have a RRIF and want to keep the required withdrawals low",
  name: "RRIF minimums: younger-spouse election and ALDA",
  lines: "L11500 · L13000 · T4RIF",
  hint: "An RRSP must become a RRIF by the end of the year you turn 71, and a minimum comes out each year. Basing the minimum on a younger spouse's age lowers it, as does an advanced life deferred annuity (ALDA).",
  tip: "Elect to use your younger spouse's age when you open the RRIF, before the first payment; you can't change it later. An ALDA lets you move up to 25% of your registered savings (lifetime limit $180,000) out of the minimums, with payments starting as late as 85. In the year you turn 71, a December RRSP contribution based on that year's earned income can still be deducted the next year. RRIF income at 65+ also qualifies for the pension credit and pension splitting.",
  tags: "rrif minimum withdrawal younger spouse age alda advanced life deferred annuity 71 convert rrsp retirement",
  src: ["rrif_minimum_and_alda"],
  fields: [
    { k: "fmv", label: "RRIF value on Jan 1, 2026", type: "money", def: 500000 },
    { k: "age", label: "My age on Jan 1, 2026", type: "int", def: 72, min: 50, max: 100 },
    { k: "sage", label: "My younger spouse's age on Jan 1, 2026", type: "int", def: 65, min: 40, max: 100 }
  ],
  post(v, C, X) {
    // Prescribed RRIF factors: 1/(90 - age) to 70, then the table from 71 (95+ = 20%)
    const T = [.0528, .0540, .0553, .0567, .0582, .0598, .0617, .0636, .0658, .0682, .0708, .0738, .0771, .0808, .0851, .0899, .0955, .1021, .1099, .1192, .1306, .1449, .1634, .1879];
    const fac = a => a <= 70 ? 1 / (90 - a) : a >= 95 ? .2 : T[a - 71];
    const fmv = num(v.fmv), a = clamp(Math.round(num(v.age)), 50, 100), s = Math.min(a, clamp(Math.round(num(v.sage)), 40, 100));
    const own = fmv * fac(a), sp = fmv * fac(s);
    if (own <= sp) return X.say(`Minimum at your age: ${fmt(own)}. Your spouse isn't younger, so the election doesn't lower it.`);
    const save = HSFO.extra(X, own) - HSFO.extra(X, sp);
    X.say(`Minimum at your age: ${fmt(own)}; using your spouse's age: ${fmt(sp)}. Taking ${fmt(own - sp)} less saves about ${fmt(save)} of tax this year.`);
  }
},
{
  id: "exempt_life_insurance_tip", cat: "savings", kind: "tip",
  q: "I have or am considering permanent life insurance for savings",
  name: "Tax-exempt permanent life insurance",
  lines: "ITA 148 · 12.2 (exempt policy)",
  hint: "Investment growth inside an exempt whole or universal life policy isn't taxed each year, and the death benefit is tax-free. Premiums aren't deductible.",
  tip: "Consider it only after your TFSA and RRSP are full, and compare the insurance costs and fees with the tax saved, since they often outweigh it. Withdrawals, policy loans or cancelling the policy can create taxable income on the gain. It works best for long-term estate planning or leaving a tax-free amount to your heirs.",
  tags: "whole life universal life permanent insurance cash value exempt policy estate tax-free death benefit",
  src: ["exempt_life_insurance"],
  fields: [
    { k: "g", label: "Yearly investment growth inside the policy", type: "money", def: 5000 },
    { k: "type", label: "What it would be in a taxable account", type: "select", def: "interest", opts: [["interest", "Interest"], ["gains", "Capital gains"], ["div", "Canadian eligible dividends"]] }
  ],
  post(v, C, X) {
    const g = num(v.g);
    if (g) X.say(`Sheltering ${fmt(g)} of yearly growth avoids about ${fmt(HSFO.invTax(X, g, v.type))} of tax a year at your income, before insurance costs.`);
  }
},
{
  id: "foreign_plan_contributions", cat: "savings", kind: "calc",
  q: "I pay into a US 401(k) or other foreign workplace pension",
  name: "Contributions to a foreign pension plan",
  lines: "L20700 · RC267 · RC268 · RC269",
  hint: "Cross-border commuters and people on assignment in Canada can deduct contributions to a US or other foreign employer plan for work done in 2026, usually up to their unused RRSP room.",
  tags: "401k 403b us pension foreign pension plan cross-border commuter rc267 rc268 rc269 treaty",
  src: ["foreign_pension_plan_contributions"],
  fields: [
    { k: "form", label: "My situation", type: "select", def: "rc268", opts: [["rc268", "I live in Canada and commute to a US job (RC268)"], ["rc267", "I'm on a temporary assignment in Canada from the US (RC267)"], ["rc269", "It's a non-US foreign plan (RC269)"]] },
    { k: "amt", label: "My 2026 contributions for 2026 work (CAD)", type: "money", def: 15000 },
    { k: "room", label: "RRSP deduction limit left after my RRSP deduction", type: "money", def: 20000 }
  ],
  ded(v, C, X) {
    const d = Math.min(num(v.amt), num(v.room));
    C.ded += d;
    X.say(`Deducting ${fmt(d)}. It uses the same room as your RRSP.` + (v.form !== "rc268" ? " Check the limit on your form, which follows the tax treaty." : ""));
    X.say("The foreign job's pay isn't one of your T4 jobs here, so add it separately when you file.");
  }
},
{
  id: "us_social_security", cat: "savings", kind: "calc",
  q: "I receive US Social Security benefits",
  name: "US Social Security deduction",
  lines: "L11500 · L25600",
  hint: "Report the full benefit in Canadian dollars (including Medicare premiums withheld), then deduct 15% of it, or 50% if you've lived in Canada and received it continuously since before 1996.",
  tags: "us social security american pension treaty 15% 50% medicare line 25600",
  src: ["us_social_security_deduction"],
  fields: [
    { k: "amt", label: "US Social Security received in 2026 (CAD)", type: "money", def: 20000 },
    { k: "pre96", label: "I've lived in Canada and received it since before 1996", type: "bool", def: false }
  ],
  inc(v, C, X) { C.income += num(v.amt); },
  ded(v, C, X) {
    const d = (v.pre96 ? .5 : .15) * num(v.amt);
    C.dedTI += d;
    X.say(`Deducting ${fmt(d)} from taxable income. Net income still includes the full benefit, so benefits and the OAS clawback see all of it. US Medicare premiums withheld count as medical expenses.`);
  }
},
{
  id: "foreign_pension_to_rrsp", cat: "savings", kind: "calc",
  q: "I moved a foreign pension lump sum or US IRA into my RRSP",
  name: "Transfer of a foreign pension or IRA lump sum to an RRSP",
  lines: "L13000 · L20800 · Schedule 7 (ITA 60(j))",
  hint: "A lump sum from a foreign pension for work done while not resident in Canada, or from your own US IRA, can go into your RRSP without using room, by March 1, 2027. It's income, and the transfer is deducted.",
  tags: "foreign pension lump sum us ira 401k rollover rrsp transfer newcomer returning resident 60(j)",
  src: ["foreign_retirement_lump_sum_rrsp_transfer"],
  fields: [
    { k: "amt", label: "Lump sum received in 2026 (CAD)", type: "money", def: 50000 },
    { k: "elig", label: "Eligible part (non-resident service, or IRA contributions by you or your spouse)", type: "money", def: 50000 },
    { k: "put", label: "Amount put into my RRSP by March 1, 2027", type: "money", def: 50000 }
  ],
  inc(v, C, X) { C.income += num(v.amt); },
  ded(v, C, X) {
    const L = num(v.amt), d = Math.min(num(v.put), num(v.elig), L);
    C.ded += d;
    X.say(`Deducting ${fmt(d)} without using RRSP room.${L > d ? ` ${fmt(L - d)} stays taxable.` : ""} Foreign tax withheld is mostly not recoverable once the transfer is deducted.`);
  }
},
{
  id: "prescribed_annuity_tip", cat: "savings", kind: "tip",
  q: "I'm buying an annuity with non-registered savings",
  name: "Prescribed annuity",
  lines: "L11500 · L13000 · T4A box 24",
  hint: "A prescribed annuity spreads the taxable interest evenly over the payments instead of front-loading it, so more of each early payment is a tax-free return of your money.",
  tip: "Ask the insurer to issue the annuity as prescribed; it must be bought with non-registered money and pay level amounts. The same taxable amount is reported every year, which keeps early-year tax low. From 65, the taxable part qualifies for the pension credit and pension splitting with a spouse. It's often used by retirees who want steady income from a lump sum.",
  tags: "prescribed annuity life annuity insurance retirement income capital interest non-registered",
  src: ["prescribed_annuity"],
  fields: [
    { k: "cap", label: "Amount used to buy it", type: "money", def: 200000 },
    { k: "pay", label: "Yearly payment", type: "money", def: 15000 },
    { k: "yrs", label: "Years of payments", type: "int", def: 20, min: 1 }
  ],
  post(v, C, X) {
    const pay = num(v.pay), yrs = Math.max(1, num(v.yrs)), taxable = pos(pay - num(v.cap) / yrs);
    if (!pay) return;
    X.say(`Each year ${fmt(taxable)} of the ${fmt(pay)} payment is taxable, about ${fmt(HSFO.extra(X, taxable))} of tax at your current income. The other ${fmt(pay - taxable)} is a tax-free return of your money.`);
  }
},
{
  id: "gis_gains", cat: "savings", kind: "tip",
  q: "I'm 65 or older, get OAS, and my other income is low",
  name: "Guaranteed Income Supplement and Ontario GAINS",
  lines: "L14600 · L25000",
  hint: "A tax-free monthly top-up to OAS for seniors with low income, based on last year's income without OAS. A single senior qualifies below about $23,112, and Ontario GAINS adds up to $92 a month.",
  tip: "Service Canada usually enrols you automatically with OAS; file a return every year to keep it. The first $5,000 of employment income, and half of the next $10,000, don't count. GIS and GAINS aren't taxed: they're reported on line 14600 and deducted on line 25000. A large RRSP or RRIF withdrawal can cut next year's GIS, so plan withdrawals.",
  tags: "gis guaranteed income supplement gains ontario guaranteed annual income system low income senior oas",
  src: ["gis_and_gains"],
  post(v, C, X) {
    const test = pos(X.ni - Math.min(X.emp, 5000) - .5 * Math.min(pos(X.emp - 5000), 10000));
    X.say(test >= 23112 ? `$0 at your income: income counted for GIS is about ${fmt(test)}, over the $23,112 limit.` : "You may qualify. Check the Service Canada benefits estimator.");
  }
},

// ---------------- FAMILY ----------------
{
  id: "spousal_rrsp_split", cat: "family", kind: "tip",
  q: "I could put RRSP money in my lower-income partner's name",
  name: "Spousal RRSP",
  lines: "L20800 · Schedule 7 · T2205",
  hint: "You contribute and deduct it from your own RRSP room, but the money is your partner's and is taxed to them when withdrawn. You can contribute until the end of the year your partner turns 71.",
  tip: "Enter the contribution under RRSP (Savings) as a spousal RRSP; the deduction is the same as for your own. The gain comes in retirement, when withdrawals are taxed at your partner's lower rate. Leave the money in for the year you contribute and the next two calendar years, or withdrawals are taxed back to you. Pension splitting does some of this at 65+, but a spousal RRSP also works earlier and for any withdrawal.",
  tags: "spousal rrsp spouse partner income splitting retirement attribution t2205",
  src: ["spousal_rrsp"],
  fields: [
    { k: "amt", label: "Contribution to a spousal RRSP", type: "money", def: 10000 },
    { k: "mine", label: "My expected tax rate in retirement (%)", type: "pct", def: 43 },
    { k: "theirs", label: "My partner's expected tax rate in retirement (%)", type: "pct", def: 20 }
  ],
  post(v, C, X) {
    const amt = num(v.amt);
    if (!amt) return;
    const later = amt * pos(num(v.mine) - num(v.theirs)) / 100;
    X.say(`Deducting ${fmt(amt)} saves about ${fmt(HSFO.ded(X, amt))} this year, the same as your own RRSP. When your partner withdraws it, the rate gap saves about ${fmt(later)} more.`);
  }
},
{
  id: "family_investing_shift", cat: "family", kind: "tip",
  q: "I want investment income taxed to my partner or adult children",
  name: "Having lower-income family members do the investing",
  lines: "Attribution rules (ITA 74.1)",
  hint: "Money you give your partner to invest is taxed back to you, except inside their TFSA or FHSA. Paying the household bills so your partner can invest their own pay, or gifting to adult children, avoids that.",
  tip: "Give your partner cash to fill their TFSA ($7,000 for 2026 plus unused room) or FHSA; growth there isn't taxed back to you. Pay the household costs and your partner's tax bill from your income, so their own earnings go into investments taxed at their rate. Gifts (not loans) to children 18 or older are theirs to invest. A partner's FHSA deduction also lowers their income and can raise your spouse amount.",
  tags: "income splitting attribution spouse tfsa gift fhsa gift adult children gift household expenses investing",
  src: ["shift_investing_to_family"],
  fields: [
    { k: "how", label: "How", type: "select", def: "tfsa", opts: [["tfsa", "Gift to my partner's TFSA or FHSA"], ["bills", "I pay the bills so my partner invests their pay"], ["adult", "Gift to an adult child with little income"]] },
    { k: "amt", label: "Amount", type: "money", def: 7000 },
    { k: "ret", label: "Expected yearly return, taxed as interest (%)", type: "pct", def: 5 },
    { k: "sni", label: "My partner's 2026 net income", type: "money", def: 40000, show: (v, R) => v.how === "bills" && !(R && R.hh && R.hh.spouse) }
  ],
  post(v, C, X) {
    const I = num(v.amt) * num(v.ret) / 100;
    if (!I) return;
    const mine = HSFO.extra(X, I);
    // Paying the bills: the partner's own investment income raises their net income, which can shrink your spouse amount
    const sni = X.hh.spouse ? X.spouseNI : num(v.sni);
    const theirs = v.how === "tfsa" ? 0 : v.how === "bills" ? HSFO.other(sni, I, true) : HSFO.other(0, I, false);
    const loss = v.how === "bills" ? HSFO.spLoss(X, sni, I) : 0;
    X.say(`${fmt(I)} of yearly income taxed to them instead of you saves about ${fmt(mine - theirs - loss)} a year, growing with the balance` +
      (loss ? `, after ${fmt(loss)} of spouse amount you'd lose.` : "."));
  }
},
{
  id: "prescribed_rate_loan", cat: "family", kind: "tip",
  q: "I could lend money to my lower-income partner to invest",
  name: "Prescribed-rate loan to a spouse",
  lines: "L12100 (your interest) · L22100 (their deduction)",
  hint: "Lend your partner money at CRA's prescribed rate (3% for loans made October to December 2026) and the investment income is taxed to them. The rate stays locked for the life of the loan.",
  tip: "Put the loan in writing at the prescribed rate when it's made, and have your partner invest the money in their own account. They must pay you each year's interest by January 30 of the next year, every year, or all future income is taxed back to you. You report the interest as income and they deduct it. It pays off when the investments earn well above the loan rate; a family trust can do the same for children.",
  tags: "prescribed rate loan spousal loan income splitting family trust attribution 3%",
  src: ["prescribed_rate_spousal_loan"],
  fields: [
    { k: "loan", label: "Amount lent to my partner", type: "money", def: 200000 },
    { k: "ret", label: "Expected yearly return, taxed as interest (%)", type: "pct", def: 6 },
    { k: "sni", label: "My partner's other net income", type: "money", def: 0, show: (v, R) => !(R && R.hh && R.hh.spouse) }
  ],
  post(v, C, X) {
    const loan = num(v.loan), I = loan * num(v.ret) / 100, intr = loan * .03;   // 3% prescribed rate, Q4 2026
    if (!loan) return;
    const net = I - intr;
    if (net <= 0) return X.say("At this return the interest you charge is more than the income, so the loan doesn't help.");
    const sni = X.hh.spouse ? X.spouseNI : num(v.sni);
    const you = HSFO.extra(X, I) - HSFO.extra(X, intr);
    const them = HSFO.other(sni, net, true), loss = HSFO.spLoss(X, sni, net);
    X.say(`On ${fmt(loan)} earning ${HSFO.pct(num(v.ret))}, your family saves about ${fmt(you - them - loss)} a year: ${fmt(you)} less tax for you, ${fmt(them)} more for your partner${loss ? `, and ${fmt(loss)} of spouse amount lost` : ""}.`);
  }
},
{
  id: "kids_investing", cat: "family", kind: "tip",
  q: "I invest money for my children under 18 in their names",
  name: "Investing for minor children (CCB money and in-trust accounts)",
  lines: "Attribution rules (ITA 74.1(2))",
  hint: "Interest and dividends on money you give a child under 18 are taxed to you, but capital gains aren't. Canada Child Benefit payments saved in the child's own account are fully the child's income.",
  tip: "Deposit CCB payments straight into a separate account in the child's name and don't mix in other money; all income on it is the child's, and a child owes no tax on about $16,452 of income. For money you gift, choose growth investments, since capital gains are taxed to the child while interest and dividends come back to you. Income earned on income that was taxed to you belongs to the child. An RESP usually comes first for education savings because of the grants.",
  tags: "in trust account minor children kids ccb canada child benefit attribution capital gains gift investing",
  src: ["minor_children_capital_gains", "ccb_invested_in_childs_name"],
  fields: [
    { k: "from", label: "Money invested", type: "select", def: "ccb", opts: [["ccb", "Saved Canada Child Benefit payments"], ["gift", "Money I gifted (only gains are the child's)"]] },
    { k: "bal", label: "Amount invested", type: "money", def: 20000 },
    { k: "ret", label: "Expected yearly return (%)", type: "pct", def: 5 }
  ],
  post(v, C, X) {
    const I = num(v.bal) * num(v.ret) / 100;
    if (!I) return;
    const s = v.from === "gift" ? HSFO.extra(X, .5 * I) : HSFO.extra(X, I);   // gift: only the taxable half of gains moves
    X.say(`Taxed to your child instead of you, ${fmt(I)} of yearly ${v.from === "gift" ? "capital gains" : "income"} saves about ${fmt(s)} a year.`);
  }
},
{
  id: "pay_family_members", cat: "family", kind: "tip",
  q: "I pay a family member for babysitting or for work",
  name: "Paying family members",
  lines: "L21400 · L22900 (T2200) · T2125",
  hint: "Paying an adult relative a fair rate for real work moves income to them. It only counts as child care (babysitting by someone 18+), as an assistant your job requires you to pay, or as wages from your own business.",
  tip: "Babysitting by your own child or relative 18 or older (not one you claim as a dependant) counts as child care: enter it under Children and get a receipt with their SIN. If your employer requires you to pay an assistant (Form T2200), or you run a business, a reasonable wage for real work is deductible and taxed at the family member's lower rate. Keep time records and pay by cheque or transfer. With only regular T4 jobs and none of these, paying family saves nothing.",
  tags: "pay family members wages babysitting adult child relative assistant t2200 business salary income splitting",
  src: ["paying_family_members"],
  fields: [
    { k: "kind", label: "What for", type: "select", def: "care", opts: [["care", "Babysitting by my adult child or relative"], ["assistant", "Assistant my employer requires me to pay (T2200)"], ["business", "Wages from my own business"], ["none", "None of these"]] },
    { k: "amt", label: "Amount paid in 2026", type: "money", def: 5000 },
    { k: "rate", label: "Their tax rate on it (%)", type: "pct", def: 0, show: v => v.kind === "assistant" || v.kind === "business" }
  ],
  post(v, C, X) {
    const amt = num(v.amt);
    if (v.kind === "none") return X.say("With only T4 jobs and no required assistant, paying family members doesn't lower your tax.");
    if (!amt) return;
    const val = HSFO.ded(X, amt);
    if (v.kind === "care") return X.say(`If you can claim it as child care, ${fmt(amt)} saves about ${fmt(val)}. Enter it under Children so the limits apply.`);
    X.say(`A ${fmt(amt)} wage saves your family about ${fmt(val - amt * clamp(num(v.rate), 0, 100) / 100)}, before CPP and EI on the wage.`);
  }
},
{
  id: "separation_rrsp_division", cat: "family", kind: "tip",
  q: "I'm separating and need to divide RRSPs or pensions",
  name: "Tax-free RRSP, RRIF and pension division on separation",
  lines: "T2220 · Family Law Act pension division",
  hint: "RRSPs, RRIFs and pensions can move straight to an ex-partner's plan with no tax, under a court order or written separation agreement. Cashing out first would be taxed.",
  tip: "Use Form T2220 for a direct RRSP or RRIF transfer; it doesn't use RRSP room and nothing is reported as income. Ontario pensions are divided through the plan administrator into a LIRA or other locked-in account. The spousal RRSP three-year rule doesn't apply while you live apart because of the breakdown. Spousal support and related legal fees are separate items under Family.",
  tags: "separation divorce marriage breakdown rrsp division t2220 pension division lira ex-spouse",
  src: ["marriage_breakdown_rrsp_pension_transfer"],
  fields: [{ k: "amt", label: "Amount being divided", type: "money", def: 50000 }],
  post(v, C, X) {
    const amt = num(v.amt);
    if (amt) X.say(`Cashing out ${fmt(amt)} instead of transferring it would cost about ${fmt(HSFO.extra(X, amt))} in tax at your income.`);
  }
},
{
  id: "child_care_fee_subsidy", cat: "family", kind: "tip",
  q: "My child is in licensed child care and I might get a fee subsidy",
  name: "Ontario child care fee subsidy",
  lines: "No return line · based on family net income",
  hint: "Your municipality pays part of licensed child care fees when family net income is low. Your share is about 10% of family net income between $20,000 and $40,000, plus 30% of income above $40,000.",
  tip: "Apply through your municipal or district service manager, such as Toronto Children's Services. The subsidy uses both partners' net incomes from the latest notices of assessment, so RRSP and FHSA deductions can raise it. Only the part of the fees you pay yourself counts for the child care deduction and the Ontario CARE credit. Most licensed centres already charge reduced fees under the Canada-wide child care plan, which isn't income-tested.",
  tags: "child care fee subsidy daycare municipal cwelcc licensed child care ontario",
  src: ["ontario_child_care_fee_subsidy"],
  fields: [{ k: "fees", label: "Yearly licensed child care fees (after the Canada-wide reduction)", type: "money", def: 11000 }],
  post(v, C, X) {
    const A = X.afni, fees = num(v.fees);
    const share = A <= 20000 ? 0 : A <= 40000 ? .1 * (A - 20000) : 2000 + .3 * (A - 40000);   // O. Reg. 138/15 parental contribution
    X.say(`At family net income of ${fmt(A)}, your expected share of fees is about ${fmt(share)} a year, so the subsidy would be about ${fmt(pos(fees - share))}. Service managers set the final amount.`);
  }
},
{
  id: "spouse_dividend_election_tip", cat: "family", kind: "tip",
  q: "My partner's only real income is Canadian dividends",
  name: "Reporting your spouse's dividends on your return (s.82(3) election)",
  lines: "L12000 · L30300 · ON 58120",
  hint: "You can report all of your partner's Canadian dividends on your return if that creates or increases your spouse amount. It usually helps only at moderate incomes.",
  tip: "It's all or nothing: you report every taxable Canadian dividend your partner received, and they report none. It's allowed only when it creates or increases your spouse amount, so it suits a partner whose income is mostly dividends. Compare the tax on the dividends at your rate with the larger spouse amount before electing. There's no form: you make the election by reporting the dividends on your return.",
  tags: "spouse dividends election 82(3) spouse amount transfer dividends eligible dividends",
  src: ["spouse_dividend_election"],
  fields: [
    { k: "elig", label: "Partner's eligible dividends (actual amount)", type: "money", def: 5000 },
    { k: "other", label: "Partner's other dividends (actual amount)", type: "money", def: 0 },
    { k: "sni", label: "Partner's net income, including grossed-up dividends", type: "money", def: 6900, show: (v, R) => !(R && R.hh && R.hh.spouse) }
  ],
  post(v, C, X) {
    const el = P.div.eligGross * num(v.elig), ne = P.div.nonGross * num(v.other), G = el + ne;
    if (!G) return;
    let sni = X.hh.spouse ? X.spouseNI : num(v.sni);
    if (sni < G) { X.say(`Your partner's net income should include the grossed-up dividends (${fmt(G)}); using that.`); sni = G; }
    const after = sni - G, n1 = X.ni + G;
    const [f0, o0] = HSFO.mine(X, X.ni), [f1, o1] = HSFO.mine(X, n1);
    const a0 = pos(P.fedBpa(X.ni) - sni), a1 = pos(P.fedBpa(n1) - after);
    if (a1 <= a0) return X.say("Not allowed here: it wouldn't create or increase your spouse amount.");
    const youCost = HSFO.tax(X.ti + G, f1 + a1, o1 + HSFO.spOn(after), { el, ne }).total - HSFO.tax(X.ti, f0 + a0, o0 + HSFO.spOn(sni)).total;
    const theirSave = HSFO.other(after, 0, false, el, ne);
    const gain = theirSave - youCost;
    X.say(gain > 0
      ? `Electing saves your family about ${fmt(gain)}: the larger spouse amount outweighs the tax on the dividends at your rate.`
      : `Electing would cost your family about ${fmt(-gain)}, so don't elect.`);
  }
},
{
  id: "cpp_sharing", cat: "family", kind: "tip",
  q: "My partner and I are both 60+ and one of us gets a CPP pension",
  name: "CPP retirement pension sharing",
  lines: "L11400 · Service Canada application",
  hint: "Couples 60 or older can share the CPP pensions earned while together, so each reports part of it. It moves income to the lower-income partner, even though CPP can't be split through pension splitting.",
  tip: "Apply through Service Canada; if you both contributed, both pensions are pooled and split by the months you lived together. Each of you then gets a T4A(P) for your share. It helps most when one partner has a much higher tax rate, but it can shrink the spouse amount. Sharing ends if you separate or one of you dies.",
  tags: "cpp pension sharing assignment spouse split canada pension plan retirement",
  src: ["cpp_pension_sharing"],
  fields: [
    { k: "amt", label: "CPP moved to my partner each year", type: "money", def: 4000 },
    { k: "sni", label: "My partner's 2026 net income before sharing", type: "money", def: 0, show: (v, R) => !(R && R.hh && R.hh.spouse) }
  ],
  post(v, C, X) {
    const amt = num(v.amt);
    if (!amt) return;
    const sni = X.hh.spouse ? X.spouseNI : num(v.sni), you = HSFO.extra(X, amt), them = HSFO.other(sni, amt, false), loss = HSFO.spLoss(X, sni, amt);
    X.say(`Moving ${fmt(amt)} of CPP to your partner saves about ${fmt(you - them - loss)} a year: ${fmt(you)} less tax for you, ${fmt(them)} more for your partner${loss ? `, ${fmt(loss)} of spouse amount lost` : ""}.`);
  }
},
{
  id: "death_benefit", cat: "family", kind: "calc",
  q: "I received a death benefit from a late relative's employer",
  name: "Death benefit exemption",
  lines: "L13000 · T4A box 106",
  hint: "Up to $10,000 of a death benefit paid by the deceased's employer for their service is tax-free, and the surviving spouse uses it first. The CPP death benefit doesn't qualify.",
  tags: "death benefit employer t4a box 106 surviving spouse bereavement estate",
  src: ["death_benefit_exemption"],
  fields: [
    { k: "amt", label: "Death benefit received (T4A box 106)", type: "money", def: 10000 },
    { k: "used", label: "Exemption already used by others for the same death", type: "money", def: 0 }
  ],
  inc(v, C, X) { C.income += num(v.amt); },
  ded(v, C, X) {
    const amt = num(v.amt), ex = Math.min(amt, pos(10000 - num(v.used)));   // $10,000 per death, not indexed
    C.ded += ex;
    X.say(`${fmt(ex)} is tax-free${amt > ex ? `; ${fmt(amt - ex)} is taxable` : ""}.`);
  }
},
{
  id: "rrsp_rollover_on_death", cat: "family", kind: "calc",
  q: "I inherited my late spouse's RRSP, RRIF or pension",
  name: "Rollover of a deceased spouse's RRSP, RRIF or pension",
  lines: "L12900 · L11500 · L20800 · Schedule 7",
  hint: "A surviving spouse, or a child or grandchild who depended on the deceased, can move the plan into their own RRSP, RRIF or an annuity tax-free, without RRSP room, by March 1, 2027.",
  tags: "inherit rrsp rrif refund of premiums rollover surviving spouse beneficiary death dependent child rdsp",
  src: ["surviving_spouse_rrsp_rrif_rollover"],
  fields: [
    { k: "amt", label: "Refund of premiums or eligible amount received", type: "money", def: 100000 },
    { k: "roll", label: "Amount put into my RRSP, RRIF or annuity", type: "money", def: 100000 }
  ],
  inc(v, C, X) { C.income += num(v.amt); },
  ded(v, C, X) {
    const amt = num(v.amt), d = Math.min(amt, num(v.roll));
    C.ded += d;
    X.say(`Deducting ${fmt(d)} without using RRSP room.${amt > d ? ` ${fmt(amt - d)} stays taxable.` : ""} A direct plan-to-plan transfer gives the same result.`);
  }
},
{
  id: "final_return_planning", cat: "family", kind: "tip",
  q: "My spouse or partner died in 2026 or late 2025",
  name: "Final and optional returns for a spouse who died",
  lines: "Final T1 · optional returns · T3",
  hint: "Your partner's income can be split across the final return and optional returns that each get the basic personal amount and other credits again. The donation limit is 100% of income in the year of death and the year before.",
  tip: "Report unpaid salary, vacation pay and declared but unpaid dividends (rights or things) on a separate optional return to use a second set of credits and the low brackets again. Medical expenses can use any 24-month period that includes the date of death. The executor can contribute to a spousal RRSP for you using your partner's room within 60 days after the year ends. On your own return you can still claim the spouse amount using your partner's income for the year.",
  tags: "death of spouse final return optional return rights or things estate t3 cpp death benefit widow widower",
  src: ["deceased_spouse_final_return_planning"],
  post(v, C, X) {
    X.say(`Having the $2,500 CPP death benefit taxed on the estate's return instead of yours saves up to about ${fmt(HSFO.extra(X, 2500))} at your income.`);
  }
},
{
  id: "oas_allowance", cat: "family", kind: "tip",
  q: "I'm 60 to 64 and widowed, or my partner gets OAS and GIS",
  name: "OAS Allowance and Allowance for the Survivor",
  lines: "L14600 · L25000",
  hint: "Low-income people aged 60 to 64 can get up to $1,448 a month if their partner gets OAS and GIS, or up to $1,726 a month if widowed. It stops at combined income of $42,768 ($31,152 if widowed).",
  tip: "Apply through Service Canada; the payment is tax-free and based on last year's income, not counting OAS and GIS. For each person, the first $5,000 of employment income and half of the next $10,000 don't count. RRSP deductions can lower the income test. The allowance ends at 65, when OAS and GIS can start.",
  tags: "oas allowance survivor widow widower 60 64 gis low income senior spouse",
  src: ["oas_allowance_and_survivor"],
  post(v, C, X) {
    // Oct-Dec 2026 cut-offs: $42,768 combined (spouse of a GIS pensioner), $31,152 for a survivor
    const lim = X.hh.spouse ? 42768 : 31152;
    const test = pos(X.afni - Math.min(X.emp, 5000) - .5 * Math.min(pos(X.emp - 5000), 10000));
    X.say(test >= lim ? `$0 at your income: income counted is about ${fmt(test)}, over the ${fmt(lim)} limit${X.hh.spouse ? "" : " for a survivor"}.` : "You may qualify. Check the Service Canada benefits estimator.");
  }
},

// ---------------- OTHER ----------------
{
  id: "repaid_income", cat: "other", kind: "calc",
  q: "I repaid benefits or income I reported in an earlier year",
  name: "Repayment of amounts previously included in income",
  lines: "L23200",
  hint: "COVID benefits (CERB, CRB), EI or OAS overpayments, CPP, scholarships, support you received and similar amounts you paid back in 2026 are deducted in the year you repay them.",
  tags: "repay repayment cerb crb cesb covid benefit ei overpayment oas overpayment cpp scholarship support line 23200",
  src: ["repayment_of_amounts_previously_included"],
  fields: [
    { k: "kind", label: "What I repaid", type: "select", def: "covid", opts: [["covid", "COVID benefit (CERB, CRB, CESB, CRSB, CRCB)"], ["ei", "EI benefit overpayment"], ["oas", "OAS pension overpayment"], ["cpp", "CPP, QPP or pension overpayment"], ["school", "Scholarship, bursary or research grant"], ["support", "Support received, repaid by court order"], ["other", "Other amount taxed in an earlier year"]] },
    { k: "amt", label: "Total repaid in 2026", type: "money", def: 5000 }
  ],
  ded(v, C, X) {
    const d = num(v.amt);
    C.ded += d;
    const note = {
      ei: " This is for EI you paid back after an overpayment; the EI benefit repayment (clawback) on your return is separate.",
      oas: " This is for OAS paid to you by mistake; the OAS recovery tax (clawback) is separate.",
      support: " Only support you reported as income and repaid under a court order counts.",
      other: " Shareholder loan repayments have their own item under Other."
    }[v.kind] || "";
    X.say(`Deducting ${fmt(d)} repaid in 2026.${note} Repaid salary is a separate item under Work.`);
  }
},
{
  id: "tax_appeal_fees", cat: "other", kind: "calc",
  q: "I paid fees to deal with a CRA review, objection or appeal",
  name: "Fees for a tax objection or appeal",
  lines: "L23200",
  hint: "Fees for help responding to a CRA review, or objecting to or appealing an income tax, EI or CPP assessment or decision, are deductible. Regular tax-preparation fees aren't, for employees.",
  tags: "accountant lawyer fees objection appeal cra review audit tax court ei cpp decision",
  src: ["tax_objection_appeal_fees"],
  fields: [
    { k: "fees", label: "Fees paid in 2026", type: "money", def: 3000 },
    { k: "reimb", label: "Amount reimbursed or awarded to me", type: "money", def: 0 }
  ],
  ded(v, C, X) {
    const d = pos(num(v.fees) - num(v.reimb));
    C.ded += d;
    X.say(`Deducting ${fmt(d)}. If you're reimbursed later, include that amount in income for that year.`);
  }
},
{
  id: "part_year_resident", cat: "other", kind: "tip",
  q: "I moved to Canada or left Canada in 2026",
  name: "Part-year residents",
  lines: "T1 page 1 (entry or departure date) · Schedule 1 · ON428",
  hint: "In the year you arrive or leave, the basic personal amount and family credits are prorated by the days you were resident, and there's no Ontario tax reduction or LIFT credit.",
  tip: "Report world income for the days you were resident, and only Canadian job or business income for the rest of the year. CPP, EI, medical, donation and tuition credits are claimed in full for the resident period, while the basic, age, spouse, dependant, caregiver and disability amounts are prorated. If 90% or more of your income for the non-resident part is from Canada, nothing is prorated. Newcomers apply for the GST/HST credit with Form RC151 and child benefits with Form RC66.",
  tags: "newcomer immigrant emigrant moved to canada left canada part year resident departure arrival rc151 rc66",
  src: ["part_year_residency"],
  fields: [{ k: "days", label: "Days I was resident in Canada in 2026", type: "int", def: 183, min: 1, max: 365 }],
  post(v, C, X) {
    const frac = 1 - clamp(num(v.days), 1, 365) / 365;
    const lost = .14 * P.fedBpa(X.ni) * frac + P.on.rate * HSFO.sf(X.R.basicOn) * P.on.bpa * frac;
    const red = X.R.onRed + X.R.lift;
    X.say(`Prorating the basic personal amounts adds about ${fmt(lost)} of tax${red ? `, and losing the Ontario tax reduction and LIFT another ${fmt(red)}` : ""}. The dashboard doesn't prorate, so treat its totals as a full-year resident's.`);
  }
},
{
  id: "wsib_social_assistance", cat: "other", kind: "calc",
  q: "I received WSIB, social assistance or the GIS in 2026",
  name: "Workers' compensation, social assistance and net federal supplements",
  lines: "L14400 · L14500 · L14600 · L25000",
  hint: "These are added to net income and then deducted to get taxable income, so they aren't taxed. They still count for income-tested benefits and credits.",
  tags: "wsib workers compensation social assistance ontario works odsp gis net federal supplements t5007 line 25000",
  src: ["workers_comp_social_assistance_deduction"],
  fields: [
    { k: "wsib", label: "Workers' compensation (T5007 box 10)", type: "money", def: 10000 },
    { k: "sa", label: "Social assistance (T5007 box 11)", type: "money", def: 0 },
    { k: "nfs", label: "Net federal supplements (T4A(OAS) box 21)", type: "money", def: 0 }
  ],
  inc(v, C, X) { C.income += num(v.wsib) + num(v.sa) + num(v.nfs); },
  ded(v, C, X) {
    const t = num(v.wsib) + num(v.sa) + num(v.nfs);
    C.dedTI += t;
    X.say(`Deducting ${fmt(t)} from taxable income, so these benefits aren't taxed. They still raise net income, which can lower benefits and credits based on it. If your employer topped up WSIB through payroll, that part is already on your T4.`);
  }
},
{
  id: "shareholder_loan_repaid", cat: "other", kind: "calc",
  q: "I repaid a loan from my corporation that was taxed as my income",
  name: "Repayment of a shareholder loan",
  lines: "L23200 · ITA 20(1)(j)",
  hint: "If a loan from your own corporation was added to your income in an earlier year because it wasn't repaid in time, you can deduct it in the year you repay it.",
  tags: "shareholder loan repayment corporation 15(2) 20(1)(j) owner manager t4a box 117",
  src: ["shareholder_loan_repayment_deduction"],
  fields: [
    { k: "amt", label: "Amount repaid to my corporation in 2026", type: "money", def: 30000 },
    { k: "prev", label: "Part of that loan taxed in earlier years and not yet deducted", type: "money", def: 30000 },
    { k: "series", label: "Part of a series of loans and repayments", type: "bool", def: false },
    { k: "dec", label: "Net decrease in my shareholder loan balance in 2026", type: "money", def: 10000, show: v => !!v.series }
  ],
  ded(v, C, X) {
    const d = Math.min(v.series ? num(v.dec) : num(v.amt), num(v.prev));
    C.ded += d;
    X.say(`Deducting ${fmt(d)}.`);
  }
},
{
  id: "bankruptcy_year", cat: "other", kind: "tip",
  q: "I went bankrupt in 2026",
  name: "Bankruptcy year: two tax returns",
  lines: "Pre-bankruptcy and post-bankruptcy T1 returns",
  hint: "The year you go bankrupt is split into two tax years, each with its own tax brackets, so the lower rates are used twice. Several Ontario credits can't be claimed that year.",
  tip: "Your trustee files one return for January 1 to the day before the bankruptcy and another for the rest of the year. Personal credits are split between the two but can't exceed the full-year amounts, while medical, donation and tuition credits go on the return for the period they relate to. The Ontario tax reduction, LIFT, CARE, fertility, seniors' and political credits can't be claimed, and the Ontario Health Premium uses the total from both returns. Any refund on the pre-bankruptcy return goes to your creditors.",
  tags: "bankruptcy bankrupt trustee insolvency two returns pre-bankruptcy post-bankruptcy",
  src: ["bankruptcy_year_split_returns"],
  fields: [{ k: "share", label: "Share of my 2026 income earned before the bankruptcy date (%)", type: "pct", def: 67 }],
  post(v, C, X) {
    const ti = X.ti, a = ti * clamp(num(v.share), 0, 100) / 100, b = ti - a;
    const [f, o] = HSFO.mine(X, X.ni), opt = { noRed: true, noOhp: true };   // OHP uses total income either way
    const t = (x, withCr) => HSFO.tax(x, withCr ? f : 0, withCr ? o : 0, opt).total;
    const full = t(ti, true), split = Math.min(t(a, true) + t(b, false), t(a, false) + t(b, true));
    const lost = X.R.onRed + X.R.lift;
    X.say(`Splitting ${fmt(ti)} into two tax years could lower tax by about ${fmt(full - split - lost)}, before the refund goes to creditors.`);
  }
}
);
