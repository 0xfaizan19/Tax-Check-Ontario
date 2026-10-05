// Core household items: family, medical, disability, retirement savings, giving, and automatic credits.
// Reference implementation for the item API (see API.md).

ITEMS.push(
// ---------------- FAMILY ----------------
{
  id: "spouse", cat: "family", kind: "calc",
  q: "I have a spouse or common-law partner",
  name: "Spouse amount, caregiver top-up, credits moved from your partner",
  lines: "L30300 · L30425 · L32600 · ON 58120 · ON 58640",
  hint: "If your partner earns little or nothing, you claim a credit for them, and can use the age, pension, disability and tuition credits they can't. Their income also sets your family benefits.",
  tags: "married sole breadwinner husband wife partner common-law caregiver transfer schedule 2",
  fields: [
    { k: "ni", label: "Partner's 2026 net income", type: "money", def: 0 },
    { k: "infirm", label: "Partner depends on me because of an impairment", type: "bool", def: false },
    { k: "dtc", label: "Partner is approved for the disability tax credit", type: "bool", def: false },
    { k: "age65", label: "Partner is 65 or older", type: "bool", def: false },
    { k: "pension", label: "Partner's eligible pension income", type: "money", def: 0, show: v => v.age65 },
    { k: "tuition", label: "Partner's 2026 tuition they can't use", type: "money", def: 0 },
    { k: "sep", label: "We separated in 2026", type: "bool", def: false }
  ],
  prof(v, C, X) { X.hh.spouse = { ni: num(v.ni), niAdj: 0, infirm: !!v.infirm, dtc: !!v.dtc, age65: !!v.age65 }; },
  cr(v, C, X) {
    const sni = X.spouseNI;
    const a303 = pos(P.fedBpa(X.ni) + (v.infirm ? P.fed.caregiverTopup : 0) - sni);
    const a30425 = v.infirm ? pos(Math.min(P.fed.caregiverMax, P.fed.caregiverBase - sni) - a303) : 0;
    const aOn = pos(Math.min(P.on.spouseMax, P.on.spouseBase - sni));
    // Schedule 2 / ON(S2): partner's unused credits. Assumes their own income, other than pension
    // (and pension split to them), is employment income for CPP, EI and the Canada employment amount.
    const sEmp = pos(num(v.ni) - (v.age65 ? num(v.pension) : 0));
    const sc = contrib(sEmp);
    let tF = 0, tO = 0;
    if (v.age65) { tF += pos(P.fed.age - .15 * pos(sni - P.fed.ageThr)); tO += pos(P.on.age - .15 * pos(sni - P.on.ageThr)); }
    if (v.age65 && num(v.pension)) { tF += Math.min(P.fed.pension, num(v.pension)); tO += Math.min(P.on.pension, num(v.pension)); }
    if (v.dtc) { tF += P.fed.disability; tO += P.on.disability; }
    tF += Math.min(P.fed.tuitionTransfer, num(v.tuition));
    const testF = sni <= 58523 ? sni : brk(sni, P.fed.b) / .14;
    const usedF = pos(testF - (P.fedBpa(sni) + sc.cppBase + sc.ei + Math.min(P.fed.cea, sEmp)));
    const testO = sni <= 53891 ? sni : brk(sni, P.on.b) / .0505;
    const usedO = pos(testO - (P.on.bpa + sc.cppBase + sc.ei));
    const t326 = pos(tF - usedF), t586 = pos(tO - usedO);
    C.fed += a303 + a30425 + t326; C.on += aOn + t586;
    if (v.dtc && t586 > 0 && X.ni >= sni) C.redDeps += 1;
    X.say(`Spouse amount: ${fmt(a303 + a30425)} federal, ${fmt(aOn)} Ontario`);
    if (t326 || t586) X.say(`Credits moved from your partner: ${fmt(t326)} federal, ${fmt(t586)} Ontario`);
    if (!a303 && !aOn) X.say("Your partner's income is too high for the spouse amount. It still counts for family benefits.");
    if (v.sep) X.say("In the year you separate, claim either this or the spousal support deduction, not both.");
  }
},
{
  id: "eligible_dependant", cat: "family", kind: "calc",
  q: "I'm a single parent, or I support a relative on my own",
  name: "Amount for an eligible dependant",
  lines: "L30400 · L30425 · ON 58160 · ON 58185",
  hint: "With no spouse (or after separating), you can claim one child or relative who lives with you as if they were a spouse. Also known as the equivalent-to-spouse amount.",
  tags: "single parent divorced separated widowed equivalent to spouse dependant",
  fields: [
    { k: "ni", label: "Dependant's 2026 net income", type: "money", def: 0 },
    { k: "who", label: "Who is it?", type: "select", def: "child", opts: [["child", "My child under 18"], ["parent", "My parent or grandparent"], ["adult", "Adult child, sibling or other relative 18+"]] },
    { k: "infirm", label: "They depend on me because of an impairment", type: "bool", def: false },
    { k: "support", label: "I have to pay child support for this child", type: "bool", def: false }
  ],
  prof(v, C, X) { if (!X.hh.spouse) X.hh.single = true; },
  cr(v, C, X) {
    if (X.hh.spouse) return X.say("Not available while you claim a spouse or partner.");
    if (v.support) return X.say("Not available for a child you have to pay support for, unless both parents pay support and agree who claims.");
    // A parent or grandparent qualifies at any age; any other relative 18+ only with an impairment.
    if (v.who === "adult" && !v.infirm) return X.say("An adult child, sibling or other relative 18 or older qualifies only if they depend on you because of an impairment.");
    const dni = num(v.ni), adultInfirm = v.infirm && v.who !== "child";
    const a304 = pos(P.fedBpa(X.ni) + (adultInfirm ? P.fed.caregiverTopup : 0) - dni);
    const a30425 = adultInfirm ? pos(Math.min(P.fed.caregiverMax, P.fed.caregiverBase - dni) - a304) : 0;
    const aOn = pos(Math.min(P.on.spouseMax, P.on.spouseBase - dni));
    const cgOn = adultInfirm ? pos(Math.min(P.on.caregiverMax, P.on.caregiverBase - dni) - aOn) : 0;
    C.fed += a304 + a30425; C.on += aOn + cgOn;
    if (v.infirm) C.redDeps += 1;
    X.say(`Claimed: ${fmt(a304 + a30425)} federal, ${fmt(aOn + cgOn)} Ontario`);
    if (v.infirm && v.who === "child") X.say("For your own child under 18 with an impairment, the extra caregiver amount is claimed under Children.");
  }
},
{
  id: "children", cat: "family", kind: "calc",
  q: "I have children under 18",
  name: "Child care, child benefits, Ontario CARE, disability and caregiver credits",
  lines: "L21400 · L30500 · L31800 · ON 58480 · ON479-A · CCB · OCB",
  hint: "Covers the child care deduction, Ontario CARE credit, Canada Child Benefit, Child Disability Benefit, Ontario Child Benefit, caregiver and disability amounts for a child with an impairment, and the Ontario tax reduction.",
  tags: "kids daycare nanny camp ccb canada child benefit ontario child benefit ocb care credit cdb caregiver infirm child t778",
  rows: { label: "Child", add: "Add a child", max: 10, fields: [
    { k: "age", label: "Age on Dec 31, 2026", type: "int", def: 4, min: 0, max: 17 },
    { k: "care", label: "Child care paid in 2026 (daycare, nanny, day camps)", type: "money", def: 0 },
    { k: "dtc", label: "Approved for the disability tax credit", type: "bool", def: false }
  ] },
  fields: [
    { k: "shared", label: "Shared custody (about 50/50)", type: "bool", def: false },
    { k: "weeks", label: "Weeks my lower-income partner was in full-time school, hospital or couldn't care for the kids", type: "int", def: 0, min: 0, max: 52, show: (v, R) => !!(R && R.hh && R.hh.spouse) }
  ],
  prof(v, C, X) { X.hh.kids = (v.rows || []).map(r => ({ age: clamp(num(r.age), 0, 17), care: num(r.care), dtc: !!r.dtc })); X.hh.shared = !!v.shared; },
  ded(v, C, X) {
    const kids = X.hh.kids;
    const limit = kids.reduce((s, k) => s + (k.dtc ? 11000 : k.age <= 6 ? 8000 : k.age <= 16 ? 5000 : 0), 0);
    const paid = kids.reduce((s, k) => s + k.care, 0);
    if (!paid) return;
    const line7 = Math.min(limit, paid, 2 / 3 * X.earned);
    let d = line7;
    const sp = X.hh.spouse;
    if (sp && num(sp.ni) + num(sp.niAdj) < X.preNI) {
      d = Math.min(line7, limit * .025 * clamp(num(v.weeks), 0, 52));
      if (line7 > d) X.say(`Your partner has the lower income, so they claim ${fmt(line7 - d)} of child care on their return.`);
    }
    C.ded += d; C.childCare += d;
    if (d) X.say(`Child care deduction: ${fmt(d)} (limit ${fmt(limit)})`);
  },
  cr(v, C, X) {
    const kids = X.hh.kids, n = kids.length;
    if (!n) return;
    const higher = !X.hh.spouse || X.ni >= X.spouseNI;
    let fedA = 0, onA = 0, imp = 0;
    for (const k of kids) if (k.dtc) {
      imp++;
      fedA += P.fed.caregiverTopup + P.fed.disability + pos(P.fed.disSupp - pos(k.care - P.fed.disSuppThr));
      onA += P.on.disability + pos(P.on.disSupp - pos(k.care - P.on.disSuppThr));
    }
    C.fed += fedA; C.on += onA;
    if (higher) C.redDeps += n + imp;
    if (imp) X.say(`Caregiver and disability amounts for ${imp} child${imp > 1 ? "ren" : ""}: ${fmt(fedA)} federal, ${fmt(onA)} Ontario`);
    // Ontario CARE (refundable): rate on family adjusted income, applied to your line 21400
    if (C.childCare) {
      const fai = X.ni + C.childCare + X.spouseNI;
      const rate = fai <= 20000 ? .75 : fai <= 40000 ? .75 - .02 * Math.ceil((fai - 20000) / 2500)
        : fai <= 60000 ? .59 - .02 * Math.ceil((fai - 40000) / 5000) : fai <= 150000 ? Math.max(.01, .51 - .02 * Math.ceil((fai - 60000) / 3600)) : 0;
      const care = rate * C.childCare;
      C.onRef += care;
      X.say(care ? `Ontario CARE credit: ${fmt(care)}` : "Ontario CARE credit: $0 (family income over $150,000)");
    }
    // Benefits paid July 2027 to June 2028 from 2026 family net income; ages taken one year on
    const A = X.afni, elig = kids.filter(k => k.age + 1 < 18), m = elig.length;
    if (!m) return;
    const n6 = elig.filter(k => k.age + 1 < 6).length, i = Math.min(m, 4) - 1;
    const r1 = [.07, .135, .19, .23][i], b2 = [3123, 6022, 8476, 10260][i], r2 = [.032, .057, .08, .095][i];
    const red = A <= 38237 ? 0 : A <= 82847 ? r1 * (A - 38237) : b2 + r2 * (A - 82847);
    const share = v.shared ? .5 : 1;
    const ccb = pos(8157 * n6 + 6883 * (m - n6) - red) * share;
    const nd = elig.filter(k => k.dtc).length;
    const cdb = nd ? pos(3480 * nd - (nd > 1 ? .057 : .032) * pos(A - 82847)) * share : 0;
    const ocb = pos(1760 * m - .08 * pos(A - 26865)) * share;
    C.ben += ccb + cdb + ocb;
    X.say(`Canada Child Benefit ${fmt(ccb)}${nd ? ", Child Disability Benefit " + fmt(cdb) : ""}, Ontario Child Benefit ${fmt(ocb)} a year, paid July 2027 to June 2028`);
  }
},
{
  id: "adult_dependants", cat: "family", kind: "calc",
  q: "I support an adult relative with an impairment",
  name: "Canada caregiver, Ontario caregiver, disability transfer and their medical costs",
  lines: "L30450 · L31800 · L33199 · ON 58185 · ON 58480 · ON 58729",
  hint: "A parent, grandparent, adult child, sibling, aunt, uncle, niece or nephew 18+ who depends on you because of an impairment. Don't add someone you already claim as your eligible dependant. A parent without an impairment no longer qualifies.",
  tags: "elderly parent grandparent caregiver infirm dependant disabled adult child",
  rows: { label: "Dependant", add: "Add a dependant", max: 6, fields: [
    { k: "ni", label: "Their 2026 net income", type: "money", def: 12000 },
    { k: "dtc", label: "Approved for the disability tax credit", type: "bool", def: false },
    { k: "med", label: "Medical expenses I paid for them", type: "money", def: 0 },
    { k: "share", label: "My share of the claim (%)", type: "pct", def: 100 }
  ] },
  cr(v, C, X) {
    let f1 = 0, o1 = 0, n = 0;
    for (const r of v.rows || []) {
      const dni = num(r.ni), sh = clamp(num(r.share), 0, 100) / 100;
      const cg = Math.min(P.fed.caregiverMax, pos(P.fed.caregiverBase - dni)) * sh;
      const cgOn = Math.min(P.on.caregiverMax, pos(P.on.caregiverBase - dni)) * sh;
      let dF = 0, dO = 0;
      if (r.dtc) {
        dF = Math.min(P.fed.disability, pos(P.fed.disability + P.fed.bpaMax - dni)) * sh;
        dO = Math.min(P.on.disability, pos(P.on.disability + P.on.bpa - dni)) * sh;
      }
      C.fed += cg + dF; C.on += cgOn + dO; f1 += cg + dF; o1 += cgOn + dO;
      if (cgOn > 0 || dO > 0) n++;   // Ontario tax reduction counts dependants claimed on 58185 or 58480
      const med = num(r.med);
      if (med) { C.fedMedOther += pos(med - Math.min(P.fed.medCap, .03 * dni)); C.onMedOther += Math.min(P.on.otherDepMedCap, pos(med - Math.min(P.on.medCap, .03 * dni))); }
    }
    if (!X.hh.spouse || X.ni >= X.spouseNI) C.redDeps += n;
    X.say(`Caregiver and disability amounts: ${fmt(f1)} federal, ${fmt(o1)} Ontario`);
  }
},
{
  id: "adoption", cat: "family", kind: "calc",
  q: "I adopted a child (adoption finalized in 2026)",
  name: "Adoption expenses", lines: "L31300 · ON 58330",
  hint: "Agency, legal, travel and immigration costs for adopting a child under 18. Adoptive parents share one maximum per child: $19,972 federal, $15,846 Ontario.",
  tags: "adopt adoption",
  fields: [
    { k: "exp", label: "Eligible adoption expenses", type: "money", def: 20000 },
    { k: "reimb", label: "Reimbursements or grants", type: "money", def: 0 },
    { k: "share", label: "My share (%)", type: "pct", def: 100 }
  ],
  cr(v, C, X) {
    const e = pos(num(v.exp) - num(v.reimb)), sh = clamp(num(v.share), 0, 100) / 100;
    C.fed += Math.min(P.fed.adoption, e) * sh; C.on += Math.min(P.on.adoption, e) * sh;
  }
},
{
  id: "support_paid", cat: "family", kind: "calc",
  q: "I pay spousal support to a former partner",
  name: "Support payments deduction", lines: "L21999 · L22000",
  hint: "Periodic spousal support under a written agreement or court order is deductible. Child support under agreements made after April 1997 is not. Payments count toward child support first.",
  tags: "divorce separation alimony spousal support child support",
  fields: [
    { k: "total", label: "Total support paid in 2026", type: "money", def: 24000 },
    { k: "child", label: "Part that is child support", type: "money", def: 0 }
  ],
  ded(v, C, X) { const d = pos(num(v.total) - num(v.child)); C.ded += d; X.say(`Deductible spousal support: ${fmt(d)}`); }
},
{
  id: "support_legal", cat: "family", kind: "calc",
  q: "I paid legal fees to get or enforce support I receive",
  name: "Legal fees for support (recipient)", lines: "L23200",
  hint: "Fees to collect late support, establish support, or increase it are deductible for the person receiving support. The payer's legal fees are not.",
  tags: "legal fees lawyer support enforcement",
  fields: [
    { k: "fees", label: "Legal fees paid", type: "money", def: 5000 },
    { k: "reimb", label: "Amounts awarded back to me", type: "money", def: 0 }
  ],
  ded(v, C, X) { C.ded += pos(num(v.fees) - num(v.reimb)); }
},
{
  id: "tuition_from_child", cat: "family", kind: "calc",
  q: "My child or grandchild in college or university can transfer tuition to me",
  name: "Tuition transferred from a student", lines: "L32400",
  hint: "A student can transfer up to $5,000 of this year's tuition they don't need to a parent or grandparent. Carried-forward amounts can't be transferred. Federal only.",
  tags: "tuition transfer student university college t2202 schedule 11",
  rows: { label: "Student", add: "Add a student", max: 6, fields: [
    { k: "tuition", label: "Student's 2026 tuition (T2202)", type: "money", def: 8000 },
    { k: "ti", label: "Student's 2026 taxable income", type: "money", def: 6000 },
    { k: "cf", label: "Tuition they carried forward from earlier years", type: "money", def: 0 }
  ] },
  cr(v, C, X) {
    let tot = 0;
    for (const r of v.rows || []) {
      const ti = num(r.ti), sc = contrib(ti);
      // Schedule 11: taxable income, or federal tax / 14% once it passes the first bracket ($58,523)
      const test = ti <= P.fed.b[0][0] ? ti : brk(ti, P.fed.b) / P.fed.rate;
      const room = pos(test - (P.fedBpa(ti) + sc.cppBase + sc.ei + Math.min(P.fed.cea, ti)));
      const used = Math.min(num(r.tuition), pos(room - Math.min(num(r.cf), room)));
      tot += pos(Math.min(P.fed.tuitionTransfer, num(r.tuition)) - used);
    }
    C.fed += tot; X.say(`Tuition transferred to you: ${fmt(tot)}`);
  }
},
{
  id: "pension_split", cat: "family", kind: "calc",
  q: "I want to split my pension income with my spouse",
  name: "Pension income splitting", lines: "T1032 · L21000",
  hint: "Up to half of your eligible pension income can be reported by your spouse. Needs Pension income (Savings) turned on and a spouse. Your spouse's tax goes up by less than yours goes down when they're in a lower bracket.",
  tags: "pension split t1032 retirement spouse",
  fields: [{ k: "amt", label: "Amount to move to my spouse", type: "money", def: 10000 }],
  ded(v, C, X) {
    const pen = num(X.hh.pension);
    if (!X.hh.spouse) return X.say("Turn on the spouse item first.");
    if (!pen) return X.say("Turn on Pension income under Savings first.");
    const s = Math.min(num(v.amt), .5 * pen);
    C.ded += s; X.hh.spouse.niAdj += s;
    // Partner's tax before and after: split pension is not employment income (no CPP/EI change),
    // and it earns them the pension amount ($2,000 federal, $1,796 Ontario).
    const sni = num(X.hh.spouse.ni), sc = contrib(sni), cea = Math.min(P.fed.cea, sni);
    const spTax = (ni, pen) => {
      const fed = pos(brk(ni, P.fed.b) - P.fed.rate * (P.fedBpa(ni) + sc.cppBase + sc.ei + cea + Math.min(P.fed.pension, pen)));
      const b = pos(brk(ni, P.on.b) - P.on.rate * (P.on.bpa + sc.cppBase + sc.ei + Math.min(P.on.pension, pen)));
      const l73 = b + .2 * pos(b - P.on.s1) + .36 * pos(b - P.on.s2);
      return fed + l73 - Math.min(l73, pos(2 * P.on.redBasic - l73)) + ohp(ni);
    };
    const up = spTax(sni + s, s) - spTax(sni, 0);
    X.say(`Moves ${fmt(s)} to your spouse. Their tax rises by about ${fmt(up)}; the saving shown is on your return only, so subtract that for the family result.`);
  }
},

// ---------------- HEALTH ----------------
{
  id: "medical", cat: "health", kind: "calc",
  q: "My family paid medical, dental or vision costs",
  name: "Medical expenses (you, your partner, children under 18)", lines: "L33099 · ON 58689",
  hint: "Prescriptions, dental, glasses, therapy, fertility treatment, travel for care, and premiums you pay for private health or dental plans. Only the part above 3% of net income (at most $2,890 federal, $2,940 Ontario) counts. Use any 12-month period ending in 2026.",
  tags: "medical dental vision glasses prescriptions therapy physio premiums health plan fertility ivf hearing",
  fields: [
    { k: "gen", label: "Eligible expenses, not reimbursed", type: "money", def: 4000 },
    { k: "att", label: "Part-time attendant care", type: "money", def: 0 },
    { k: "van", label: "Cost of a wheelchair-accessible van", type: "money", def: 0 },
    { k: "move", label: "Moving to more accessible housing", type: "money", def: 0 }
  ],
  cr(v, C, X) {
    const g = num(v.gen), a = num(v.att), van = num(v.van), mv = num(v.move);
    C.fedMed += g + Math.min(a, 10000) + Math.min(.2 * van, 5000) + Math.min(mv, 2000);
    C.onMed += g + Math.min(a, 17962) + Math.min(.2 * van, 8980) + Math.min(mv, 3592);
  },
  post(v, C, X) {
    X.say(`Only costs above ${fmt(Math.min(P.fed.medCap, .03 * X.ni))} count. Claimed: ${fmt(X.R.fedMedNet)} federal, ${fmt(X.R.onMedNet)} Ontario.`);
    if (X.hh.spouse && X.spouseNI < X.ni) X.say("Your partner's threshold is lower (3% of their income). Compare claiming on their return.");
  }
},
{
  id: "disability_self", cat: "health", kind: "calc",
  q: "I'm approved for the disability tax credit",
  name: "Disability amount for yourself", lines: "L31600 · ON 58440",
  hint: "Needs an approved Form T2201 signed by a medical practitioner. You can apply for up to 10 past years. Also opens RDSP grants and other programs.",
  tags: "disability tax credit dtc t2201 impairment",
  prof(v, C, X) { X.hh.selfDtc = true; },
  cr(v, C, X) { C.fed += P.fed.disability; C.on += P.on.disability; }
},
{
  id: "rmes", cat: "health", kind: "calc",
  q: "Check the refundable medical expense supplement",
  name: "Refundable medical expense supplement", lines: "L45200",
  hint: "Extra refundable money for lower-income workers with medical costs. Needs Medical expenses turned on, at least $4,478 of working income, and family net income under about $64,640.",
  tags: "rmes low income medical supplement",
  post(v, C, X) {
    // Working income: employment plus net self-employment, less union dues and employment expenses
    if (pos(X.earned - C.workDed) < 4478) return X.say("Needs at least $4,478 of working income.");
    const r = pos(Math.min(1534, .25 * (C.disSupports + X.R.fedMedNet)) - .05 * pos(X.afni - 33960));
    C.fedRef += r;
    if (!r) X.say("Family net income is above $64,640, so this is $0.");
  }
},
{
  id: "fertility", cat: "health", kind: "calc",
  q: "I paid for fertility treatment in Ontario",
  name: "Ontario Fertility Treatment Tax Credit", lines: "ON479 61268",
  hint: "Refundable 25% of eligible fertility treatment costs, up to $5,000 a year. Not income-tested. Also enter the same costs under Medical expenses.",
  tags: "fertility ivf iui egg freezing surrogacy",
  fields: [{ k: "exp", label: "Eligible fertility treatment costs", type: "money", def: 15000 }],
  cr(v, C, X) { C.onRef += .25 * Math.min(20000, num(v.exp)); }
},
{
  id: "seniors_care_home", cat: "health", kind: "calc",
  q: "I'm 70 or older (or my spouse is) and we paid medical costs",
  name: "Ontario Seniors Care at Home Tax Credit", lines: "ON479 63095",
  hint: "Refundable 25% of up to $6,000 of medical costs above 3% of net income, for people 70+. It shrinks by 5% of family net income over $35,000 and is gone at $65,000. Needs Medical expenses turned on.",
  tags: "senior 70 home care ontario",
  post(v, C, X) {
    // ON428 line 58769: net medical after the threshold (lesser of 3% of net income or $2,940) plus other dependants
    const claim = X.R.onMedNet;
    const cr = pos(.25 * Math.min(6000, claim) - .05 * pos(X.afni - 35000));
    C.onRef += cr;
    if (!cr) X.say("$0 once family net income passes $65,000.");
  }
},

// ---------------- SAVINGS ----------------
{
  id: "rrsp", cat: "savings", kind: "calc",
  q: "I contribute to an RRSP (including spousal RRSP or PRPP)",
  name: "RRSP deduction", lines: "L20800 · Schedule 7",
  hint: "Your 2026 limit is on your 2025 notice of assessment (18% of 2025 earned income, max $33,810, plus unused room, minus pension adjustments). Contributions up to March 1, 2027 count for 2026.",
  tags: "rrsp retirement spousal rrsp prpp pooled pension deduction limit room",
  fields: [
    { k: "limit", label: "My RRSP deduction limit for 2026", type: "money", def: 25382 },
    { k: "own", label: "My RRSP contributions (Mar 3, 2026 – Mar 1, 2027)", type: "money", def: 10000 },
    { k: "spousal", label: "Contributions to a spousal RRSP", type: "money", def: 0 },
    { k: "prpp", label: "My PRPP contributions", type: "money", def: 0 },
    { k: "er", label: "Employer PRPP contributions for me", type: "money", def: 0 },
    { k: "prior", label: "Earlier contributions I haven't deducted yet", type: "money", def: 0 }
  ],
  ded(v, C, X) {
    const room = pos(num(v.limit) - num(v.er));
    const pool = num(v.own) + num(v.spousal) + num(v.prpp) + num(v.prior);
    const d = Math.min(pool, room);
    C.ded += d;
    X.say(`Deducting ${fmt(d)}. Room left: ${fmt(room - d)}.`);
    const over = pool + num(v.er) - num(v.limit) - 2000;   // employer PRPP contributions use the same limit
    if (over > 0) X.say(`Over-contributed by ${fmt(over)} beyond the $2,000 buffer: 1% a month penalty until withdrawn.`);
    else if (pool > room) X.say(`${fmt(pool - room)} can be carried forward and deducted in a later year.`);
  }
},
{
  id: "fhsa", cat: "savings", kind: "calc",
  q: "I'm a first-time home buyer with an FHSA",
  name: "First Home Savings Account deduction", lines: "L20805 · Schedule 15",
  hint: "Deduct up to $8,000 a year (plus up to $8,000 of unused room from last year), $40,000 lifetime. Withdrawals for a first home are tax-free. Contribute by December 31. Separate from RRSP room.",
  tags: "fhsa first home savings account house condo",
  fields: [
    { k: "room", label: "My 2026 FHSA room", type: "money", def: 8000 },
    { k: "contrib", label: "Contributions in 2026 (plus undeducted earlier ones)", type: "money", def: 8000 },
    { k: "used", label: "FHSA amounts deducted in earlier years", type: "money", def: 0 }
  ],
  ded(v, C, X) {
    const d = Math.min(num(v.contrib), Math.min(16000, num(v.room)), pos(40000 - num(v.used)));
    C.ded += d; X.say(`Deducting ${fmt(d)}.`);
  }
},
{
  id: "rpp", cat: "savings", kind: "calc",
  q: "I pay into a workplace pension plan",
  name: "Registered pension plan contributions", lines: "L20700 · T4 box 20",
  hint: "Contributions shown in box 20 of your T4s, including buy-backs for past service after 1989. Enter the total from all jobs.",
  tags: "rpp pension plan defined benefit contribution omers hoopp opseu teachers",
  fields: [{ k: "amt", label: "Total RPP contributions (T4 box 20)", type: "money", def: 5000 }],
  ded(v, C, X) { C.ded += num(v.amt); X.say("Pension contributions lower next year's RRSP room through the pension adjustment."); }
},
{
  id: "age_amount", cat: "savings", kind: "calc",
  q: "I'm 65 or older",
  name: "Age amount", lines: "L30100 · ON 58080",
  hint: "Up to $9,208 federal and $6,342 Ontario. It shrinks by 15% of net income above $46,432 (federal) and $47,210 (Ontario), so it's $0 at your income.",
  tags: "age amount senior 65 retired oas",
  cr(v, C, X) {
    const f = pos(P.fed.age - .15 * pos(X.ni - P.fed.ageThr)), o = pos(P.on.age - .15 * pos(X.ni - P.on.ageThr));
    C.fed += f; C.on += o;
    if (!f && !o) X.say("$0 at your income. It's gone above $107,819 federal and $89,490 Ontario net income. Your spouse may be able to use it instead.");
  }
},
{
  id: "pension_income", cat: "savings", kind: "calc",
  q: "I receive pension income",
  name: "Pension income amount", lines: "L31400 · ON 58360",
  hint: "Credit on the first $2,000 federal and $1,796 Ontario of eligible pension income. Workplace pension annuities qualify at any age; RRIF, annuity and LIF payments qualify from 65. This item also adds the pension to your income.",
  tags: "pension income rrif annuity lif retirement",
  fields: [
    { k: "amt", label: "Eligible pension income in 2026", type: "money", def: 2000 },
    { k: "type", label: "Type", type: "select", def: "rpp", opts: [["rpp", "Workplace pension annuity (any age)"], ["rrif65", "RRIF, annuity or LIF, and I'm 65+"], ["rrif", "RRIF or annuity, and I'm under 65"]] }
  ],
  prof(v, C, X) { X.hh.pension = v.type === "rrif" ? 0 : num(v.amt); },
  inc(v, C, X) { C.income += num(v.amt); },
  cr(v, C, X) {
    if (v.type === "rrif") return X.say("RRIF and annuity payments only qualify from age 65 (or on a spouse's death).");
    C.fed += Math.min(P.fed.pension, num(v.amt)); C.on += Math.min(P.on.pension, num(v.amt));
  }
},
{
  id: "union_dues", cat: "work", kind: "calc",
  q: "I pay union or professional dues",
  name: "Union, professional or like dues", lines: "L21200 · T4 box 44",
  hint: "Union dues (T4 box 44) and annual dues to keep a professional status recognized by law, such as CPA, engineer, nurse or lawyer. Not initiation fees or amounts your employer reimburses.",
  tags: "union dues professional association licence cpa peo nurse law society",
  fields: [{ k: "amt", label: "Dues paid in 2026, all jobs", type: "money", def: 1200 }],
  ded(v, C, X) { C.ded += num(v.amt); C.workDed += num(v.amt); }
},

// ---------------- GIVING ----------------
{
  id: "donations", cat: "giving", kind: "calc",
  q: "I donate to registered charities",
  name: "Charitable donations", lines: "L34900 · Schedule 9 · ON 58969",
  hint: "The first $200 gets 14% federal + 5.05% Ontario. Above that, 29% federal (33% on the part matching taxable income over $258,482) + 11.16% Ontario. Spouses can pool receipts on one return. Unused gifts carry forward 5 years. Limit: 75% of net income.",
  tags: "donation charity church mosque temple gift receipt",
  fields: [
    { k: "gifts", label: "My 2026 donations", type: "money", def: 5000 },
    { k: "spouse", label: "Partner's donations pooled onto my return", type: "money", def: 0 },
    { k: "cf", label: "Unused donations from 2021–2025 to claim now", type: "money", def: 0 }
  ],
  cr(v, C, X) { C.gifts += num(v.gifts) + num(v.spouse) + num(v.cf); },
  post(v, C, X) {
    const g = num(v.gifts) + num(v.spouse) + num(v.cf);
    if (g > .75 * X.ni) X.say(`Only ${fmt(.75 * X.ni)} (75% of net income) counts this year; carry the rest forward.`);
    else X.say(`Federal credit ${fmt(X.R.donFed)}, Ontario credit ${fmt(X.R.donOn)} before surtax.`);
  }
},
{
  id: "political_fed", cat: "giving", kind: "calc",
  q: "I donated to a federal political party or candidate",
  name: "Federal political contribution credit", lines: "L40900 · L41000",
  hint: "75% of the first $400, 50% of the next $350 and 33⅓% of the next $525. The maximum $650 credit is reached at $1,275.",
  tags: "political party donation federal candidate election",
  fields: [{ k: "amt", label: "Federal political contributions", type: "money", def: 1275 }],
  cr(v, C, X) { C.fedPol += num(v.amt); X.say(`Credit: ${fmt(polFed(num(v.amt)))}`); }
},
{
  id: "political_on", cat: "giving", kind: "calc",
  q: "I donated to an Ontario political party or candidate",
  name: "Ontario political contribution credit", lines: "ON479 63110",
  hint: "75% of the first $509.42, 50% of the next $1,188.66 and 33.33% of the next $2,165.25, up to $1,698.08. Refundable.",
  tags: "political party donation ontario provincial candidate election",
  fields: [{ k: "amt", label: "Ontario political contributions", type: "money", def: 1000 }],
  cr(v, C, X) { C.onRef += polOn(num(v.amt)); }
},

// ---------------- AUTOMATIC (always applied; shown as read-only rows) ----------------
{
  id: "auto_on_reduction", cat: "ontario", kind: "auto",
  q: "Ontario tax reduction", name: "Applied automatically", lines: "ON428 line 80",
  hint: "Cuts Ontario tax for lower incomes: twice ($300 + $554 per child 18 or under + $554 per dependant with an impairment) minus your Ontario tax. Children and dependants you enter under Family are counted.",
  tags: "ontario tax reduction dependants",
  val: R => ({ n: R.onRed, t: R.onRed ? fmt(R.onRed) : "$0 at your income" })
},
{
  id: "auto_lift", cat: "ontario", kind: "auto",
  q: "Ontario LIFT credit", name: "Applied automatically", lines: "ON428-A · line 62140",
  hint: "Up to $875 off Ontario tax for low-income workers (5.05% of employment income), reduced by 5% of net income over $32,500 (or family income over $65,000).",
  tags: "lift low income individuals families",
  val: R => ({ n: R.lift, t: R.lift ? fmt(R.lift) : "$0 at your income" })
},
{
  id: "auto_topup", cat: "other", kind: "auto",
  q: "Federal top-up tax credit", name: "Applied automatically", lines: "L34990",
  hint: "New for 2025–2030. Keeps a 15% value on credit amounts above $58,523, because the lowest federal rate fell to 14%. Only matters with very large credit claims.",
  tags: "top-up credit budget 2025",
  val: R => ({ n: R.topup, t: R.topup ? fmt(R.topup) : "$0 (credits under $58,523)" })
},
{
  id: "auto_ohp", cat: "ontario", kind: "auto",
  q: "Ontario Health Premium", name: "Charged automatically", lines: "ON428 line 90",
  hint: "Up to $900 a year, based on taxable income. The only way to lower it is to bring taxable income under one of its bands ($200,600, $72,600, $48,600, $38,500, $25,000).",
  tags: "ohp health premium",
  val: R => ({ n: -R.onHP, t: fmt(R.onHP) + " charged" })
},
{
  id: "auto_gst", cat: "ontario", kind: "auto",
  q: "GST/HST credit (Canada Groceries and Essentials Benefit)", name: "Paid automatically when you file", lines: "No return line",
  hint: "Up to $445 each for you and a spouse, plus $234 per child, reduced by 5% of family net income over $46,432. Paid quarterly from July 2027.",
  tags: "gst hst credit groceries essentials benefit",
  post(v, C, X) {
    const kids = (X.hh.kids || []).filter(k => k.age + 1 < 19).length, sp = !!X.hh.spouse, single = !sp;
    let max = 445 + (sp ? 445 : 0);
    let others = kids;
    if (single && kids) { max += 445; others = kids - 1; }
    max += 234 * others;
    if (single) max += kids ? 234 : Math.min(234, .02 * pos(X.ni - 11564));
    C.ben += pos(max - .05 * pos(X.afni - 46432));
  },
  val: (R, S) => ({ n: S, t: S ? fmt(S) + " a year" : "$0 at your family income" })
},
{
  id: "auto_ostc", cat: "ontario", kind: "auto",
  q: "Ontario Sales Tax Credit", name: "Paid automatically (Ontario Trillium Benefit)", lines: "ON-BEN",
  hint: "$378 for you, your spouse and each child, reduced by 4% of family net income over $36,309 ($29,047 if single). Paid from July 2027.",
  tags: "ostc ontario sales tax credit trillium",
  post(v, C, X) {
    const kids = (X.hh.kids || []).filter(k => k.age + 1 < 19).length, fam = !!X.hh.spouse || kids > 0;
    C.ben += pos(378 * (1 + (X.hh.spouse ? 1 : 0) + kids) - .04 * pos(X.afni - (fam ? 36309 : 29047)));
  },
  val: (R, S) => ({ n: S, t: S ? fmt(S) + " a year" : "$0 at your family income" })
},
{
  id: "auto_cwb", cat: "work", kind: "auto",
  q: "Canada workers benefit", name: "Applied automatically", lines: "L45300 · Schedule 6",
  hint: "Refundable top-up for low-income workers: up to $1,665 single or $2,869 for a family, reduced by 15% of net income over $27,392 (family $31,251). Disability supplement up to $860.",
  tags: "cwb canada workers benefit low income",
  post(v, C, X) {
    const sp = X.hh.spouse, fam = !!sp || (X.hh.kids || []).length > 0;
    const wi = X.earned;
    // Family: working income of both (partner's net income used as their working income), and the
    // lower earner's first $16,714 of working income is left out of adjusted family net income.
    const swi = sp ? X.spouseNI : 0;
    const afniCwb = sp ? pos(X.afni - Math.min(16714, wi, swi)) : X.ni;
    const base = fam ? pos(Math.min(2869, .27 * pos(wi + swi - 3000)) - .15 * pos(afniCwb - 31251))
      : pos(Math.min(1665, .27 * pos(wi - 3000)) - .15 * pos(X.ni - 27392));
    const dr = sp && sp.dtc ? .075 : .15;   // 7.5% when both partners get the disability tax credit
    const dis = X.hh.selfDtc ? pos(Math.min(860, .27 * pos(wi - 1150)) - dr * pos(afniCwb - (fam ? 50377 : 38495))) : 0;
    C.fedRef += base + dis;
  },
  val: (R, S) => ({ n: S, t: S ? fmt(S) : "$0 at your income" })
}
);
