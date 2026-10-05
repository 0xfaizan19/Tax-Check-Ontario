// Investing and Giving items: gifts of property in kind, capital gains and losses, dividends,
// investment deductions and credits, loss carryforwards, minimum tax, and investment strategies.
// Research bucket: invest_giving. Cash donations and political credits are in core.js.

// ---------- helpers (prefixed ig to stay clear of other items files) ----------

// Federal Schedule 9 credit on total gifts g: 14% on the first $200, 33% on the part matched by
// taxable income over $258,482, 29% on the rest (same tiers as engine.js)
function igDonCr(g, ti) {
  const g1 = Math.min(pos(g), 200), rest = pos(g - 200), top = Math.min(rest, pos(ti - P.fed.topThr));
  return .14 * g1 + .33 * top + .29 * (rest - top);
}

// Cr-phase estimate of this return's federal and Ontario tax from the claims gathered so far
// (no medical or top-up credit yet). Used to size gifts and non-refundable credits.
function igTaxEst(X, C) {
  const c = X.cppEi, ti = X.ti;
  const fedAmt = P.fedBpa(X.ni) + c.cppBase + c.ei + Math.min(P.fed.cea, X.emp) + C.fed;
  const g = Math.min(C.gifts, .75 * X.ni) + C.giftsFull;
  const divFed = C.eligDiv * P.div.eligGross * P.div.fedElig + C.nonEligDiv * P.div.nonGross * P.div.fedNon;
  const divOn = C.eligDiv * P.div.eligGross * P.div.onElig + C.nonEligDiv * P.div.nonGross * P.div.onNon;
  const donFed = igDonCr(g, ti);
  const fedPre = pos(brk(ti, P.fed.b) - P.fed.rate * fedAmt - divFed);   // federal tax a donation credit can use
  const fed = pos(fedPre - donFed);                                       // about line 42900 basic federal tax
  const basicOn = pos(brk(ti, P.on.b) - P.on.rate * (P.on.bpa + c.cppBase + c.ei + C.on)
    - (.0505 * Math.min(g, 200) + .1116 * pos(g - 200)) - C.onCr);
  const on = pos(basicOn + .2 * pos(basicOn - P.on.s1) + .36 * pos(basicOn - P.on.s2) - divOn);   // about ON428 line 81
  return { fedAmt, g, donFed, divOn, fedPre, fed, basicOn, on };
}

// Adds a gift to the Schedule 9 claim (cr phase). Claims only what 2026 federal tax can absorb,
// within the 75% net income limit (raised by o.extra); the rest carries forward.
// o.full = certified cultural or ecological gift (no income limit).
function igGive(C, X, amt, o) {
  o = o || {}; amt = pos(amt);
  const E = igTaxEst(X, C), room = pos(E.fedPre - E.donFed);
  const used = x => igDonCr(E.g + x, X.ti) - E.donFed;
  let claim = amt;
  if (used(amt) > room + .5) { let lo = 0, hi = amt; for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (used(m) <= room) lo = m; else hi = m; } claim = lo; }
  if (!o.full) claim = Math.min(claim, pos(.75 * X.ni + (o.extra || 0) - C.gifts));
  const normal = o.full ? 0 : Math.min(claim, pos(.75 * X.ni - C.gifts));
  C.gifts += normal; C.giftsFull += claim - normal;   // the part allowed by o.extra goes past the engine's 75% cap
  if (amt - claim >= 1) X.say(`Your 2026 tax and income limits let you claim ${fmt(claim)} of this gift now. Carry the other ${fmt(amt - claim)} forward up to ${o.years || 5} years.`);
  return claim;
}

// Post-phase federal + Ontario tax at another taxable income, rebuilding this return's credits
// the way engine.js does. noGift leaves out donation credits (to price the tax on a gift's own gain).
// For estimates only, never added to the claims.
function igTaxAt(X, ti, noGift) {
  const R = X.R, C = X.C, c = R.cppEi;
  ti = pos(ti);
  const ni = pos(R.ni + ti - R.ti);
  const divFed = C.eligDiv * P.div.eligGross * P.div.fedElig + C.nonEligDiv * P.div.nonGross * P.div.fedNon;
  const divOn = C.eligDiv * P.div.eligGross * P.div.onElig + C.nonEligDiv * P.div.nonGross * P.div.onNon;
  const fed = pos(brk(ti, P.fed.b) - P.fed.rate * (P.fedBpa(ni) + c.cppBase + c.ei + Math.min(P.fed.cea, R.emp) + C.fed + R.fedMedNet)
    - (noGift ? 0 : R.donFed) - R.topup - divFed - C.fedCr);
  const b = pos(brk(ti, P.on.b) - P.on.rate * (P.on.bpa + c.cppBase + c.ei + C.on + R.onMedNet) - (noGift ? 0 : R.donOn) - C.onCr);
  const l73 = pos(b + .2 * pos(b - P.on.s1) + .36 * pos(b - P.on.s2) - divOn);
  const red = Math.min(l73, pos(2 * (P.on.redBasic + P.on.redDep * C.redDeps) - l73));
  return fed + pos(l73 - red - C.onCrPost) + ohp(ti);
}
function igMore(X, add, noGift) { return igTaxAt(X, X.R.ti + pos(add), noGift) - igTaxAt(X, X.R.ti, noGift); }   // tax on extra income
function igLess(X, sub, noGift) { return igTaxAt(X, X.R.ti, noGift) - igTaxAt(X, X.R.ti - Math.min(pos(sub), X.R.ti), noGift); }   // tax on the top slice

// Taxable LCGE deduction before the annual gains limit: 2026 room of $1,275,000 of gains less earlier use, less CNIL
function igLcge(v) { return Math.min(.5 * pos(1275000 - num(v.used)), pos(.5 * num(v.gain) - num(v.cnil))); }

// Gift of other capital property: designated amount a (ACB to FMV, 0 = FMV), deemed-cost rule dc
// (held under 3 years, not Canadian real estate: s.248(35) sets value and proceeds at cost),
// non-qualifying private shares nq (s.118.1(13)), taxable gain tg and eligible gift amount elig.
function igOther(v) {
  const fmv = num(v.fmv), acb = num(v.acb), a = num(v.amt) ? clamp(num(v.amt), acb, fmv) : fmv;
  const dc = !!v.recent && v.type !== "real", nq = v.type === "private" && !!v.nq;
  const p = dc ? Math.min(a, acb) : a;
  return { fmv, acb, a, dc, nq, elig: p, tg: nq ? 0 : .5 * pos(p - acb) };
}

// Items record their minimum-tax preference amounts (extra adjusted taxable income) in prof
function igPref(X, amt) { X.hh.amtPref = (X.hh.amtPref || 0) + pos(amt); }

// Post-phase federal minimum tax (T691) estimate with an optional extra capital gain g.
// 2026: 20.5% of adjusted taxable income over $181,440, less 50% of line 33800 credits and 80% of the
// donation credit; Ontario adds 24.63% of the federal excess.
function igAmt(X, C, g) {
  const R = X.R, c = R.cppEi;
  const cr338 = P.fed.rate * (R.bpa + c.cppBase + c.ei + Math.min(P.fed.cea, R.emp) + C.fed + R.fedMedNet);
  const ati = R.ti - (P.div.eligGross - 1) * C.eligDiv - (P.div.nonGross - 1) * C.nonEligDiv + (X.hh.amtPref || 0);
  const reg0 = R.fedTax + R.fedPolCr + C.fedCr;
  const at = x => {
    const minAmt = pos(.205 * pos(ati + x - 181440) - .5 * cr338 - .8 * R.donFed);
    const reg = reg0 + brk(R.ti + .5 * x, P.fed.b) - brk(R.ti, P.fed.b);
    return { minAmt, reg, fed: pos(minAmt - reg) };
  };
  const r = at(pos(g));
  r.on = .2463 * r.fed;
  if (at(0).fed > 0) r.room = 0;
  else if (at(5e7).fed <= 0) r.room = Infinity;
  else { let lo = 0, hi = 5e7; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (at(m).fed > 0) hi = m; else lo = m; } r.room = lo; }
  return r;
}
function igAmtSay(X, C) {
  const a = igAmt(X, C, 0);
  if (a.fed > 0) X.say(`Minimum tax (AMT) likely applies: about ${fmt(a.fed + a.on)} more this year, not shown in the totals. You get it back over the next 7 years when regular tax is higher.`);
}

// Research ids already built as items in other files (one switch each, no double counting)
SKIPPED.push(
  ["ontario_focused_flow_through_credit", "covered by on_focused_flow_through (items/ontario_ended.js); the flow-through item here handles the federal deduction and exploration credit"],
  ["ontario_farmer_food_donation", "covered by on_farmer_food_donation (items/ontario_ended.js), which adds the 25% Ontario credit; the gift itself goes under charitable donations"],
  ["donate_option_shares", "covered by stock_options (items/work.js), whose donated-shares field adds the extra 50% deduction (s.110(1)(d.01)); the shares' value goes under charitable donations"],
  ["gift_to_adult_family_income_split", "duplicate of family_investing_shift (gift to an adult child) and kids_investing (minor children, capital gains only) in items/health_savings_family_other.js"]
);

ITEMS.push(
// ---------------- GIVING ----------------
{
  id: "gift_listed_securities", cat: "giving", kind: "calc",
  q: "I donated shares, ETFs or mutual funds directly to a charity",
  name: "Gift of publicly listed securities in kind",
  lines: "T1170 · Schedule 3 · Schedule 9 · L34900 · ON 58969",
  hint: "Transfer them to the charity instead of selling first: the receipt is for their full value and the gain is tax-free. If they're worth less than you paid, sell first so you can use the loss.",
  tags: "donate stock in kind shares etf mutual fund units appreciated securities t1170 capital gain exempt charity",
  src: ["donate_listed_securities"],
  fields: [
    { k: "fmv", label: "Value of the securities on the day they were transferred", type: "money", def: 10000 },
    { k: "acb", label: "What I paid for them (adjusted cost base)", type: "money", def: 4000 }
  ],
  prof(v, C, X) { igPref(X, .3 * pos(num(v.fmv) - num(v.acb))); },   // 30% of the exempt gain enters the AMT base
  cr(v, C, X) { igGive(C, X, num(v.fmv)); },                         // receipt at fair market value, 0% gain inclusion
  post(v, C, X) {
    const fmv = num(v.fmv), acb = num(v.acb), gain = pos(fmv - acb);
    if (gain) X.say(`The ${fmt(gain)} gain is tax-free. Selling first and donating the cash would have cost about ${fmt(igMore(X, .5 * gain, true))} more tax.`);
    else if (acb > fmv) X.say(`These are worth ${fmt(acb - fmv)} less than you paid. Sell them and donate the cash instead: same receipt, and you can use the capital loss.`);
    igAmtSay(X, C);
  }
},
{
  id: "gift_us_charity", cat: "giving", kind: "calc",
  q: "I donated to a charity in the United States",
  name: "Gifts to U.S. charities (Canada-U.S. tax treaty)",
  lines: "Schedule 9 · L34900 · ON 58969",
  hint: "You can claim U.S. gifts up to 75% of the U.S. income on your Canadian return, such as U.S. dividends or wages. Gifts to a U.S. college or university you or a family member attended use the normal limit.",
  tags: "united states usa american charity treaty 501c3 foreign donation university college",
  src: ["us_charity_gift"],
  fields: [
    { k: "amt", label: "Gifts to U.S. charities in 2026 (Canadian dollars)", type: "money", def: 1000 },
    { k: "usInc", label: "Net U.S. income on my return (dividends, interest, wages)", type: "money", def: 2000 },
    { k: "school", label: "It's a U.S. college or university my family or I attended", type: "bool", def: false }
  ],
  cr(v, C, X) {
    const amt = num(v.amt), elig = v.school ? amt : Math.min(amt, .75 * num(v.usInc));   // treaty: 75% of U.S.-source income
    igGive(C, X, elig);
    if (elig < amt) X.say(`${elig ? `Only ${fmt(elig)} qualifies (75% of your U.S. income).` : "With no U.S. income on your return, these gifts get no Canadian credit."} Foreign universities and charities registered with the CRA count like Canadian gifts; enter those under charitable donations.`);
  }
},
{
  id: "gift_life_insurance", cat: "giving", kind: "calc",
  q: "I gave a life insurance policy to a charity, or pay its premiums",
  name: "Gift of a life insurance policy",
  lines: "Schedule 9 · L34900 · L13000 · ON 58969",
  hint: "When the charity becomes owner and beneficiary, you get a receipt for the policy's value, and premiums you pay after that are gifts too. Naming a charity only as beneficiary gives a credit at death, not now.",
  tags: "life insurance policy charity owner beneficiary premiums cash surrender value planned giving",
  src: ["gift_life_insurance_policy"],
  fields: [
    { k: "fmv", label: "Policy value on the receipt (cash value less any policy loan)", type: "money", def: 20000 },
    { k: "acb", label: "Adjusted cost basis of the policy (ask the insurer)", type: "money", def: 15000 },
    { k: "prem", label: "Premiums I paid in 2026 on a policy the charity owns", type: "money", def: 0 }
  ],
  inc(v, C, X) { C.income += pos(num(v.fmv) - num(v.acb)); },   // policy gain on transfer is fully taxable (line 13000)
  cr(v, C, X) { igGive(C, X, num(v.fmv) + num(v.prem)); },
  post(v, C, X) {
    const gain = pos(num(v.fmv) - num(v.acb));
    if (gain) X.say(`The ${fmt(gain)} policy gain is taxable income, about ${fmt(igLess(X, gain, true))} of tax, which offsets part of the credit.`);
  }
},
{
  id: "gift_other_property", cat: "giving", kind: "calc",
  q: "I donated real estate, art or private company shares",
  name: "Gift of other capital property",
  lines: "Schedule 3 · L12700 · Schedule 9 · L34900 · ON 58969",
  hint: "You get a receipt for the value but pay tax on half the gain, and your donation limit rises to cover it. You can choose a lower amount, not below your cost, as both the sale price and the gift.",
  tags: "donate land building cottage real estate artwork collectibles private shares in kind designated amount 118.1(6)",
  src: ["gift_other_capital_property"],
  fields: [
    { k: "fmv", label: "Fair market value of the property", type: "money", def: 50000 },
    { k: "acb", label: "What I paid for it (adjusted cost base)", type: "money", def: 30000 },
    { k: "amt", label: "Amount to designate as sale price and gift (0 = full value)", type: "money", def: 0 },
    { k: "type", label: "Type of property", type: "select", def: "real", opts: [["real", "Real estate in Canada"], ["art", "Art or collectibles"], ["private", "Private company shares"], ["other", "Other capital property"]] },
    { k: "recent", label: "I got it within the last 3 years", type: "bool", def: false, show: v => v.type !== "real" },
    { k: "nq", label: "My family or I control the company", type: "bool", def: false, show: v => v.type === "private" }
  ],
  prof(v, C, X) { igPref(X, igOther(v).tg); },   // minimum tax counts the untaxed half of the gain too
  inc(v, C, X) { C.tcg += igOther(v).tg; },       // designated amount is the proceeds
  cr(v, C, X) {
    const o = igOther(v);
    if (o.nq) return;   // non-qualifying security: no gift until the charity sells it (s.118.1(13))
    igGive(C, X, o.elig, { extra: .25 * o.tg });   // limit rises by 25% of the taxable gain
  },
  post(v, C, X) {
    const o = igOther(v);
    if (o.nq) return X.say("Shares of a company you or your family control are not a gift yet. You get the credit, and report the gain, in the year the charity sells them, if it sells within 5 years.");
    if (o.tg) X.say(`Half of the ${fmt(2 * o.tg)} gain is taxed, about ${fmt(igLess(X, o.tg, true))}, which offsets part of the credit.`);
    if (o.dc && o.a > o.acb) X.say(`Held under 3 years, so the receipt and the sale price are both limited to your ${fmt(o.acb)} cost. There is no taxable gain.`);
  }
},
{
  id: "gift_flow_through_shares", cat: "giving", kind: "calc",
  q: "I donated flow-through shares to a charity",
  name: "Gift of flow-through shares",
  lines: "T1170 · Schedule 3 · Schedule 9",
  hint: "Only the part of the gain above what you first paid for the shares is tax-free when you donate them. Their cost base is usually $0, so a gain up to your original cost is taxed at the normal 50%.",
  tags: "flow-through shares donate in kind mining resource t1170 exemption threshold",
  src: ["donate_flow_through_shares"],
  fields: [
    { k: "fmv", label: "Value of the flow-through shares donated", type: "money", def: 10000 },
    { k: "acb", label: "Their adjusted cost base (usually $0)", type: "money", def: 0 },
    { k: "cost", label: "What I originally paid for them", type: "money", def: 10000 }
  ],
  prof(v, C, X) { const g = pos(num(v.fmv) - num(v.acb)); igPref(X, .3 * (g - Math.min(num(v.cost), g))); },
  inc(v, C, X) { const g = pos(num(v.fmv) - num(v.acb)); C.tcg += .5 * Math.min(pos(num(v.cost)), g); },   // gain up to original cost is taxed at 50%
  cr(v, C, X) { igGive(C, X, num(v.fmv)); },
  post(v, C, X) {
    const g = pos(num(v.fmv) - num(v.acb)), taxed = Math.min(pos(num(v.cost)), g);
    const t = fmt(igLess(X, .5 * taxed, true));
    X.say(g - taxed >= 1 ? `${fmt(taxed)} of the ${fmt(g)} gain is taxed at 50% (about ${t}); the other ${fmt(g - taxed)} is tax-free.`
      : `Your original cost covers the whole ${fmt(g)} gain, so it is taxed at 50% like a sale (about ${t}). Only growth above what you paid is tax-free.`);
  }
},
{
  id: "gift_certified_property", cat: "giving", kind: "calc",
  q: "I donated certified cultural property or ecologically sensitive land",
  name: "Certified cultural or ecological gift",
  lines: "Schedule 9 L34200 · T871 · T1170 · ON 58969",
  hint: "Gifts certified by the Cultural Property Export Review Board or Environment and Climate Change Canada have no income limit and no tax on the gain. Unused amounts carry forward 5 years (ecological gifts 10).",
  tags: "cultural property ccperb t871 ecological gift eco gift conservation easement covenant land trust museum",
  src: ["cultural_property_gift", "ecological_gift"],
  fields: [
    { k: "type", label: "What I gave", type: "select", def: "cultural", opts: [["cultural", "Certified cultural property"], ["eco", "Ecologically sensitive land or easement"]] },
    { k: "fmv", label: "Certified fair market value", type: "money", def: 25000 },
    { k: "acb", label: "What I paid for it", type: "money", def: 10000 },
    { k: "claim", label: "Amount to claim this year (0 = as much as my tax can use)", type: "money", def: 0 },
    { k: "shelter", label: "I got it through a gifting arrangement tax shelter", type: "bool", def: false, show: v => v.type === "cultural" }
  ],
  prof(v, C, X) { if (v.type === "eco") igPref(X, .3 * pos(num(v.fmv) - num(v.acb))); },
  cr(v, C, X) {
    const fmv = num(v.fmv), elig = v.type === "cultural" && v.shelter ? Math.min(fmv, num(v.acb)) : fmv;   // shelter: limited to cost
    igGive(C, X, num(v.claim) ? Math.min(num(v.claim), elig) : elig, { full: true, years: v.type === "eco" ? 10 : 5 });
    if (elig < fmv) X.say(`Bought through a tax shelter, so the gift is limited to your ${fmt(elig)} cost.`);
  },
  post(v, C, X) {
    const gain = pos(num(v.fmv) - num(v.acb));
    if (gain) X.say(`No tax on the ${fmt(gain)} gain, about ${fmt(igMore(X, .5 * gain, true))} less than if you had sold it.`);
  }
},

// ---------------- INVESTING ----------------
{
  id: "inv_capital_gains", cat: "investing", kind: "calc",
  q: "I sold stocks, funds or other investments in 2026",
  name: "Capital gains and losses, net capital losses of other years",
  lines: "Schedule 3 · L12700 · L25300 · T1A",
  hint: "Only half of a capital gain is taxed. Losses you realize in 2026 offset your gains first, then net capital losses from earlier years (on your notice of assessment) can offset what's left.",
  tags: "capital gains stocks etf mutual fund sale schedule 3 inclusion rate half capital loss carryforward net capital loss t1a",
  src: ["capital_gains_inclusion", "net_capital_losses_other_years"],
  fields: [
    { k: "gains", label: "Capital gains in 2026 (sale price less cost and fees)", type: "money", def: 20000 },
    { k: "losses", label: "Capital losses realized in 2026", type: "money", def: 0 },
    { k: "ncl", label: "Net capital losses from earlier years (notice of assessment)", type: "money", def: 4000 }
  ],
  prof(v, C, X) { igPref(X, pos(.5 * pos(num(v.gains) - num(v.losses)) - num(v.ncl))); },   // AMT taxes 100% of gains, less losses at 100%
  inc(v, C, X) { C.tcg += .5 * num(v.gains); },   // one-half inclusion for 2026
  ded(v, C, X) {
    const al = .5 * num(v.losses), used = Math.min(al, C.tcg);
    C.tcg -= used;              // 2026 allowable capital losses net against gains
    C.capLoss += num(v.ncl);    // line 25300; engine limits it to taxable gains
    if (al - used >= 1) X.say(`Unused 2026 loss of ${fmt(2 * (al - used))}: carry it back to gains taxed in 2023 to 2025 (Form T1A) or forward with no time limit.`);
  },
  post(v, C, X) {
    const ncl = num(v.ncl), usedNcl = Math.min(ncl, C.tcg), taxable = pos(C.tcg - Math.min(C.capLoss, C.tcg));
    X.say(!taxable ? "No taxable gains are left after your losses."
      : C.dedTI > 0 ? `Taxable after losses: ${fmt(taxable)}, before any capital gains exemption.`   // LCGE or EOT may shelter part
      : `Taxable after losses: ${fmt(taxable)}, about ${fmt(igLess(X, taxable))} of tax.`);
    if (ncl) X.say(`Earlier losses used: ${fmt(usedNcl)}.${ncl > usedNcl ? ` ${fmt(ncl - usedNcl)} stays available for future years.` : ""}`);
    igAmtSay(X, C);
  }
},
{
  id: "inv_dividends", cat: "investing", kind: "calc",
  q: "I get dividends from Canadian companies outside my RRSP or TFSA",
  name: "Dividend tax credit",
  lines: "L12000 · L12010 · L40425 · ON428 line 61520",
  hint: "Canadian dividends are grossed up (38% for eligible, 15% for other dividends) and taxed, then the dividend tax credit gives most of it back. Use the actual amounts in T5 box 24 and box 10.",
  tags: "dividends t5 t3 eligible dividend non-eligible gross-up dividend tax credit dtc canadian stocks",
  src: ["dividend_tax_credit"],
  fields: [
    { k: "elig", label: "Eligible dividends received (T5 box 24, T3 box 49)", type: "money", def: 10000 },
    { k: "non", label: "Other than eligible dividends (T5 box 10, T3 box 23)", type: "money", def: 0 }
  ],
  // The grossed-up amount is income. The dividend tax credit is this item's claim: the ded step turns
  // that income into dividends so the engine applies the federal and Ontario credits (Ontario after surtax).
  inc(v, C, X) { C.income += P.div.eligGross * num(v.elig) + P.div.nonGross * num(v.non); },
  ded(v, C, X) {
    const e = num(v.elig), n = num(v.non);
    C.income -= P.div.eligGross * e + P.div.nonGross * n;
    C.eligDiv += e; C.nonEligDiv += n;
  },
  post(v, C, X) {
    const e = num(v.elig), n = num(v.non), gross = P.div.eligGross * e + P.div.nonGross * n;
    const fed = e * P.div.eligGross * P.div.fedElig + n * P.div.nonGross * P.div.fedNon;   // 15.0198% / 9.0301% of grossed-up
    const on = e * P.div.eligGross * P.div.onElig + n * P.div.nonGross * P.div.onNon;      // 10% / 2.9863% of grossed-up
    const tax = pos(igLess(X, gross) - fed - on), asInt = igTaxAt(X, X.R.ti - gross + e + n) - igTaxAt(X, X.R.ti - gross);
    X.say(`Dividend tax credit: ${fmt(fed)} federal, ${fmt(on)} Ontario.`);
    if (e + n) X.say(`Tax on these dividends is about ${fmt(tax)} (${Math.round(100 * tax / (e + n))}%), versus about ${fmt(asInt)} on the same amount of interest.`);
  }
},
{
  id: "inv_rental", cat: "investing", kind: "calc",
  q: "I rent out a property or part of my home",
  name: "Rental income and expenses, including rental losses",
  lines: "T776 · L12599 · L12600",
  hint: "Mortgage interest, property tax, insurance, utilities and repairs come off the rent, and a loss lowers your other income. For part of your home, deduct only the rented share; depreciation (CCA) can't create a loss.",
  tags: "rental property landlord basement apartment t776 rental loss cca mortgage interest airbnb tenant",
  src: ["rental_property_loss"],
  rows: { label: "Property", add: "Add a property", max: 6, fields: [
    { k: "rent", label: "Rent received in 2026", type: "money", def: 18000 },
    { k: "exp", label: "Expenses (mortgage interest, property tax, insurance, utilities, repairs)", type: "money", def: 21000 },
    { k: "pct", label: "Share of the property that is rented (%)", type: "pct", def: 100 },
    { k: "cca", label: "Capital cost allowance I want to claim", type: "money", def: 0 }
  ] },
  inc(v, C, X) { for (const r of v.rows || []) C.income += num(r.rent); },   // gross rent (line 12599)
  ded(v, C, X) {
    let before = 0, want = 0;
    for (const r of v.rows || []) {
      const e = num(r.exp) * clamp(num(r.pct), 0, 100) / 100;
      before += num(r.rent) - e; want += pos(num(r.cca)); C.income -= e;
    }
    const cca = Math.min(want, pos(before)), net = before - cca;   // CCA can't create or increase the net loss of all rentals
    C.income -= cca;
    X.say(net < 0 ? `Net rental loss: ${fmt(-net)}. It lowers your other income. Charge market rent and expect a profit over time, or the loss can be denied.`
      : `Net rental income: ${fmt(net)}${cca ? ` after ${fmt(cca)} of CCA` : ""}.`);
    if (cca && (v.rows || []).some(r => num(r.pct) < 100 && num(r.cca) > 0)) X.say("Claiming CCA on part of your own home can cost you part of the principal residence exemption.");
  }
},
{
  id: "inv_tax_loss_selling", cat: "investing", kind: "tip",
  q: "I have investments worth less than I paid, outside my RRSP or TFSA",
  name: "Tax-loss selling before year-end",
  lines: "Schedule 3 · L12700 · T1A",
  hint: "Selling turns a paper loss into a capital loss that offsets this year's gains or gains from the past 3 years. The trade must settle by December 31, 2026, so sell by December 30.",
  tip: "Half of a realized loss cancels an equal amount of taxable gains, and any unused loss carries back to 2023 to 2025 (Form T1A) or forward with no time limit. Don't buy the same investment back within 30 days before or after the sale, in any account you, your spouse or your company control, or the superficial loss rule denies the loss. Buying a similar but not identical fund keeps you invested.",
  tags: "tax loss harvesting selling superficial loss december year-end capital loss carry back t1a",
  src: ["tax_loss_harvesting"],
  fields: [
    { k: "loss", label: "Loss I could realize by selling", type: "money", def: 20000 },
    { k: "past", label: "Taxable capital gains I reported in 2023 to 2025", type: "money", def: 0 }
  ],
  post(v, C, X) {
    const al = .5 * num(v.loss), remain = pos(C.tcg - Math.min(C.capLoss, C.tcg)), use = Math.min(al, remain);
    if (use) X.say(`Against the 2026 gains you entered, it would save about ${fmt(igLess(X, use))} this year.`);
    else X.say("You have no 2026 taxable gains entered for it to offset.");
    const rest = al - use;
    if (rest > 0) X.say(num(v.past) ? `The other ${fmt(2 * rest)} of loss can be carried back to recover tax on up to ${fmt(Math.min(rest, num(v.past)))} of taxable gains from 2023 to 2025.`
      : `The other ${fmt(2 * rest)} of loss would carry forward to future gains.`);
  }
},
{
  id: "inv_asset_location", cat: "investing", kind: "tip",
  q: "I hold investments in both registered and taxable accounts",
  name: "Tax-efficient asset location",
  lines: "L12100 · L12000 · L12700",
  hint: "Interest is taxed at your full rate, so hold bonds and GICs in your RRSP or TFSA and keep Canadian stocks in your taxable account. U.S. stocks fit best in an RRSP.",
  tip: "Interest is fully taxed, only half of a capital gain is taxed, and Canadian eligible dividends get the dividend tax credit. Holding interest-paying investments in registered accounts and stocks in the taxable account cuts the yearly tax bill without changing what you own. U.S. dividends escape the 15% U.S. withholding only in an RRSP or RRIF, not a TFSA.",
  tags: "asset location tax efficient investing bonds gic interest rrsp tfsa non-registered dividends capital gains",
  src: ["tax_efficient_asset_location"],
  fields: [
    { k: "amt", label: "Interest earned each year in my taxable account", type: "money", def: 2000 },
    { k: "alt", label: "What that account could earn instead", type: "select", def: "cg", opts: [["cg", "Capital gains"], ["elig", "Canadian eligible dividends"], ["non", "Other Canadian dividends"]] }
  ],
  post(v, C, X) {
    const a = num(v.amt), fr = rateAt(X.ti, P.fed.b), orr = X.marg - fr;   // Ontario rate including surtax
    const d = P.div, int = a * X.marg;
    const alt = v.alt === "cg" ? .5 * a * X.marg
      : v.alt === "elig" ? d.eligGross * a * (fr - d.fedElig + orr - d.onElig)
      : d.nonGross * a * (fr - d.fedNon + orr - d.onNon);
    const label = { cg: "capital gains", elig: "eligible dividends", non: "other dividends" }[v.alt];
    X.say(`At your rate, ${fmt(a)} of interest costs about ${fmt(int)} in tax. The same amount as ${label} would cost about ${fmt(alt)}, saving about ${fmt(int - alt)} a year.`);
  }
},
{
  id: "inv_carrying_charges", cat: "investing", kind: "calc",
  q: "I pay interest or fees to earn investment income",
  name: "Carrying charges, interest and investment fees",
  lines: "L22100",
  hint: "Deduct interest on money borrowed to invest in a taxable account, and fees for managing that account. Not for RRSP, TFSA or FHSA accounts, trading commissions, or investments that can only earn capital gains.",
  tags: "carrying charges interest expense investment loan margin interest management fees counsel fees line 22100 leverage",
  src: ["carrying_charges"],
  fields: [
    { k: "int", label: "Interest on money borrowed to invest (taxable accounts)", type: "money", def: 1500 },
    { k: "fees", label: "Investment management or advice fees (taxable accounts)", type: "money", def: 500 }
  ],
  prof(v, C, X) { igPref(X, .5 * (num(v.int) + num(v.fees))); },   // AMT adds back half
  ded(v, C, X) { C.ded += pos(num(v.int)) + pos(num(v.fees)); X.say(`Deducting ${fmt(pos(num(v.int)) + pos(num(v.fees)))}.`); }
},
{
  id: "inv_foreign_tax_credit", cat: "investing", kind: "calc",
  q: "Foreign tax was withheld from my foreign dividends or interest",
  name: "Foreign tax credit on investment income",
  lines: "L40500 · T2209 · T2036 · L23200",
  hint: "Tax withheld abroad, usually 15% on U.S. dividends, comes off your Canadian tax so you aren't taxed twice. Withholding in a TFSA or RESP can't be recovered, and U.S. dividends in an RRSP aren't withheld.",
  tags: "foreign tax credit us dividends withholding tax t2209 t2036 foreign income treaty 15%",
  src: ["foreign_tax_credit"],
  fields: [
    { k: "inc", label: "Foreign dividends and interest (Canadian dollars)", type: "money", def: 1000 },
    { k: "tax", label: "Foreign tax withheld (Canadian dollars)", type: "money", def: 150 }
  ],
  inc(v, C, X) { C.income += num(v.inc); },
  ded(v, C, X) { C.ded += pos(num(v.tax) - .15 * num(v.inc)); },   // withholding above 15% is deducted instead (s.20(11))
  cr(v, C, X) {
    const inc = num(v.inc), tax = num(v.tax), elig = Math.min(tax, .15 * inc), netF = inc - pos(tax - .15 * inc);
    const E = igTaxEst(X, C), ratio = X.ti > 0 ? clamp(netF / X.ti, 0, 1) : 0;
    const fed = Math.min(elig, ratio * E.fed);                // federal limit: foreign share of basic federal tax
    const on = Math.min(pos(elig - fed), ratio * E.on);       // Ontario takes the rest, up to its own limit
    C.fedCr += fed; C.onCrPost += on;
    X.say(`Foreign tax credit: ${fmt(fed)} federal, ${fmt(on)} Ontario.`);
    if (tax > elig) X.say(`${fmt(tax - elig)} withheld above 15% is deducted instead of credited.`);
    if (elig - fed - on >= 1) X.say(`${fmt(elig - fed - on)} can't be recovered because your Canadian tax on this income is lower.`);
  }
},
{
  id: "inv_debt_swap", cat: "investing", kind: "tip",
  q: "I could restructure my debt so the interest is tax-deductible",
  name: "Making borrowing interest deductible (debt swap, Smith manoeuvre)",
  lines: "L22100",
  hint: "Interest is deductible only when the borrowed money earns income. Using cash investments to pay down your mortgage, then borrowing to invest, can turn non-deductible interest into a deduction.",
  tip: "Keep the borrowed money traceable to the investment, for example through a separate loan or line of credit used only to invest. Selling investments to pay the mortgage can trigger capital gains, and buying the same ones back within 30 days denies any loss. The Smith manoeuvre does this gradually by re-borrowing each mortgage payment's principal to invest.",
  tags: "smith manoeuvre debt swap deductible interest mortgage heloc leverage borrow to invest",
  src: ["deductible_debt_restructuring"],
  fields: [
    { k: "amt", label: "Debt I could re-borrow to invest", type: "money", def: 100000 },
    { k: "rate", label: "Interest rate on that debt (%)", type: "pct", def: 5 }
  ],
  post(v, C, X) {
    const i = num(v.amt) * num(v.rate) / 100;
    X.say(`About ${fmt(i)} of interest a year would become deductible, saving about ${fmt(igLess(X, i))} a year at your rate.`);
  }
},
{
  id: "inv_loss_carryforwards", cat: "investing", kind: "calc",
  q: "I have unused business, rental or partnership losses from past years",
  name: "Non-capital and limited partnership losses of other years",
  lines: "L25200 · L25100 · T5013",
  hint: "Non-capital losses from the last 20 years, and limited partnership losses up to your at-risk amount, lower taxable income by as much as you choose to claim. Enter capital losses under selling investments.",
  tags: "non-capital loss carryforward business loss limited partnership loss at-risk amount t5013 line 25200 line 25100",
  src: ["non_capital_losses_other_years", "limited_partnership_losses_other_years"],
  fields: [
    { k: "ncl", label: "Non-capital losses I want to claim in 2026", type: "money", def: 10000 },
    { k: "lp", label: "Limited partnership losses carried forward", type: "money", def: 0 },
    { k: "risk", label: "My at-risk amount in that partnership (T5013)", type: "money", def: 0, show: v => num(v.lp) > 0 }
  ],
  prof(v, C, X) { igPref(X, .5 * (num(v.ncl) + Math.min(num(v.lp), num(v.risk)))); },   // AMT allows only half
  ded(v, C, X) { C.dedTI += pos(num(v.ncl)) + Math.min(pos(num(v.lp)), pos(num(v.risk))); },   // LP losses limited to at-risk amount
  post(v, C, X) {
    if (num(v.lp) > num(v.risk)) X.say(`Only ${fmt(pos(num(v.risk)))} of the partnership losses can be used this year (your at-risk amount). The rest carries forward.`);
    X.say(X.R.ti <= 0 ? "This takes taxable income to $0. Claim less and keep the rest for a later year."
      : "These lower taxable income only, so benefits based on net income don't change.");
  }
},
{
  id: "inv_min_tax_carryover", cat: "investing", kind: "calc",
  q: "I have minimum tax (AMT) from 2019 to 2025 I haven't recovered",
  name: "Minimum tax carryover",
  lines: "L40427 · T691 · ON428 line 61540",
  hint: "Alternative minimum tax paid in the last 7 years comes back as a credit in a year when your regular tax is above the minimum tax. The unused amount is on your notice of assessment.",
  tags: "amt alternative minimum tax carryover carryforward t691 recover credit",
  src: ["minimum_tax_carryover"],
  fields: [{ k: "cf", label: "Unused minimum tax carryover (federal)", type: "money", def: 5000 }],
  cr(v, C, X) {
    const E = igTaxEst(X, C), cf = num(v.cf);
    const ati = X.ti - (P.div.eligGross - 1) * C.eligDiv - (P.div.nonGross - 1) * C.nonEligDiv + (X.hh.amtPref || 0);
    const minAmt = pos(.205 * pos(ati - 181440) - .5 * P.fed.rate * E.fedAmt - .8 * E.donFed);   // 2026 minimum amount
    const fed = Math.min(cf, pos(E.fed - minAmt));
    const on = Math.min(pos(E.basicOn - E.divOn), .2463 * fed);   // Ontario: 24.63% of the federal amount, before surtax
    C.fedCr += fed; C.onCr += on;
    X.say(`Recovered this year: ${fmt(fed)} federal, ${fmt(on)} Ontario.`);
    if (cf - fed >= 1) X.say(`${fmt(cf - fed)} stays available until it's 7 years old.`);
  }
},
{
  id: "inv_amt_planning", cat: "investing", kind: "tip",
  q: "I have a large capital gain, gift of shares or stock option deduction",
  name: "Avoiding the alternative minimum tax (AMT)",
  lines: "T691 · ON428",
  hint: "Minimum tax can apply in a year with big capital gains, gifts of shares, stock option deductions or tax shelter write-offs. It taxes all of a gain at 20.5% federal above a $181,440 exemption.",
  tip: "AMT is 20.5% federal plus 5.05% Ontario on adjusted taxable income above $181,440, with fewer credits allowed. Spreading a big sale or gift over two tax years, claiming a capital gains reserve, or timing an option exercise can keep you under it. AMT you pay comes back over the next 7 years when your regular tax is higher.",
  tags: "amt alternative minimum tax t691 large capital gain donation securities stock options exemption 181440",
  src: ["amt_avoidance_planning"],
  fields: [{ k: "g", label: "Extra capital gain I'm thinking of realizing in 2026", type: "money", def: 500000 }],
  post(v, C, X) {
    const g = num(v.g), now = igAmt(X, C, 0), a = igAmt(X, C, g);
    if (now.fed > 0) X.say(`With what you've entered, minimum tax (${fmt(now.minAmt)}) is above your regular federal tax (${fmt(now.reg)}): about ${fmt(now.fed + now.on)} of AMT.`);
    else if (g) X.say(a.fed > 0 ? `Adding a ${fmt(g)} gain would bring about ${fmt(a.fed + a.on)} of AMT, recoverable later.` : `Adding a ${fmt(g)} gain would not trigger AMT.`);
    if (!now.fed && isFinite(now.room)) X.say(`About ${fmt(now.room)} of extra capital gains fits in 2026 before AMT starts.`);
  }
},
{
  id: "inv_flow_through", cat: "investing", kind: "calc",
  q: "I bought flow-through shares of a resource exploration company",
  name: "Flow-through shares: exploration deduction and federal credit",
  lines: "L22400 · T1229 · L41200 · T2038(IND)",
  hint: "Exploration costs renounced to you (T101 or T5013) are deducted in full, and mining exploration adds a 15% or 30% federal credit. The shares' cost base becomes $0, so a later sale is all capital gain.",
  tags: "flow-through shares cee cde t101 t5013 t1229 mineral exploration tax credit metc cmetc critical minerals mining",
  src: ["flow_through_shares"],
  fields: [
    { k: "cee", label: "Canadian exploration expense renounced to me", type: "money", def: 10000 },
    { k: "cde", label: "Canadian development expense renounced to me", type: "money", def: 0 },
    { k: "itc", label: "Exploration credit", type: "select", def: "metc", opts: [["none", "None (for example oil and gas)"], ["metc", "Mineral exploration credit, 15%"], ["cmetc", "Critical mineral exploration credit, 30%"]] }
  ],
  prof(v, C, X) { igPref(X, num(v.cee) + .3 * num(v.cde)); },   // resource deductions are added back for AMT
  ded(v, C, X) { C.ded += pos(num(v.cee)) + .3 * pos(num(v.cde)); },   // CEE 100%, CDE 30% of the pool per year
  cr(v, C, X) {
    const rate = { none: 0, metc: .15, cmetc: .30 }[v.itc] || 0, itc = rate * pos(num(v.cee));
    C.fedCr += itc;   // non-refundable; unused carries back 3 and forward 20 years
    X.say(`Deduction ${fmt(pos(num(v.cee)) + .3 * pos(num(v.cde)))}${itc ? `, federal credit ${fmt(itc)}. The credit reduces next year's pool, which adds some income in 2027` : ""}.`);
    X.say("If the exploration was in Ontario, also turn on the Ontario focused flow-through credit (Ontario tab).");
  }
},
{
  id: "inv_collectibles", cat: "investing", kind: "calc",
  q: "I sold art, jewellery, coins, stamps or rare books",
  name: "Listed personal property gains and losses",
  lines: "Schedule 3 · L12700",
  hint: "Losses on collectibles only offset collectible gains (this year, the past 3 years or the next 7), and each item's cost and price count as at least $1,000. Losses on cars, boats or furniture never count.",
  tags: "listed personal property lpp art jewellery coins stamps rare books collectibles loss",
  src: ["listed_personal_property_losses"],
  fields: [
    { k: "g", label: "Gains on collectibles sold in 2026", type: "money", def: 5000 },
    { k: "l", label: "Losses on collectibles (2026 plus unused from 2019 to 2025)", type: "money", def: 3000 }
  ],
  inc(v, C, X) { C.tcg += .5 * num(v.g); },
  ded(v, C, X) { C.tcg -= Math.min(.5 * Math.min(num(v.l), num(v.g)), C.tcg); },   // LPP losses offset LPP gains only
  post(v, C, X) {
    const used = Math.min(num(v.l), num(v.g));
    X.say(`Losses used against collectible gains: ${fmt(used)}.${num(v.l) > used ? ` ${fmt(num(v.l) - used)} carries to collectible gains in the 3 years before or 7 years after.` : ""}`);
  }
},
{
  id: "inv_abil", cat: "investing", kind: "calc",
  q: "I lost money on shares or loans in a Canadian small business",
  name: "Allowable business investment loss (ABIL)",
  lines: "L21699 · L21700",
  hint: "Half of a loss on shares or debt of a small business corporation (sold at arm's length, or the company is bankrupt or insolvent) comes off any income, not just gains. Past use of the capital gains exemption reduces it.",
  tags: "abil business investment loss small business corporation bankrupt insolvent bad debt private company shares",
  src: ["allowable_business_investment_loss"],
  fields: [
    { k: "bil", label: "Business investment loss (full amount)", type: "money", def: 20000 },
    { k: "lcge", label: "Gains I exempted with the capital gains exemption before", type: "money", def: 0 }
  ],
  ded(v, C, X) {
    const bil = pos(num(v.bil)), red = Math.min(bil, pos(num(v.lcge)));
    C.ded += .5 * (bil - red);                         // ABIL: 50% of the loss, against any income
    C.tcg -= Math.min(.5 * red, C.tcg);                // the reduced part is an ordinary capital loss
    X.say(`Deducting ${fmt(.5 * (bil - red))} from your income.${red ? ` ${fmt(red)} becomes an ordinary capital loss because of your past exemption.` : ""}`);
  }
},
{
  id: "inv_lcge", cat: "investing", kind: "calc",
  q: "I sold qualified small business shares or farm or fishing property",
  name: "Lifetime capital gains exemption",
  lines: "L25400 · T657 · Schedule 3",
  hint: "Up to $1,275,000 of lifetime gains on qualified small business corporation shares or qualified farm or fishing property is tax-free in 2026. Past use and a cumulative net investment loss (CNIL) reduce it.",
  tags: "lcge lifetime capital gains exemption qsbc qualified small business corporation shares farm fishing property t657 cnil",
  src: ["lifetime_capital_gains_exemption"],
  fields: [
    { k: "gain", label: "Capital gain on the qualifying sale", type: "money", def: 500000 },
    { k: "used", label: "Exemption used in earlier years (gains exempted)", type: "money", def: 0 },
    { k: "cnil", label: "Cumulative net investment loss (notice of assessment)", type: "money", def: 0 }
  ],
  // 2026 limit $1,275,000 of gains ($637,500 taxable); CNIL reduces the deduction dollar for dollar
  prof(v, C, X) { const d = igLcge(v); igPref(X, .3 * 2 * d + .5 * pos(num(v.gain) - 2 * d)); },   // 30% of the sheltered gain, 100% of the rest
  inc(v, C, X) { C.tcg += .5 * num(v.gain); },
  // Annual gains limit: only taxable gains left after 2026 losses and net capital losses of other years
  ded(v, C, X) { C.dedTI += Math.min(igLcge(v), pos(C.tcg - C.capLoss)); },
  post(v, C, X) {
    const d = Math.min(igLcge(v), pos(C.tcg - C.capLoss));
    X.say(`Exempting ${fmt(2 * d)} of the gain. Exemption left: ${fmt(pos(1275000 - num(v.used) - 2 * d))}.`);
    igAmtSay(X, C);
  }
},
{
  id: "inv_cg_reserve", cat: "investing", kind: "tip",
  q: "I sold property and will be paid part of the price in later years",
  name: "Capital gains reserve",
  lines: "T2017 · Schedule 3",
  hint: "When part of the price is due after 2026, you can spread the gain over up to 5 years, or 10 for farm, fishing or small business sales to your child or sales to an employee ownership trust or worker co-op.",
  tip: "You must report at least one-fifth of the gain each year (one-tenth for the 10-year reserve), so it's all taxed by the end of the period. Spreading a large gain keeps more of it in lower brackets and can avoid minimum tax. Claim it on Form T2017 each year; each year's reserve comes back into income the next year.",
  tags: "capital gains reserve t2017 vendor take-back mortgage instalment sale deferral 5 year 10 year",
  src: ["capital_gains_reserve"],
  fields: [
    { k: "gain", label: "Total capital gain on the sale", type: "money", def: 100000 },
    { k: "price", label: "Total sale price", type: "money", def: 250000 },
    { k: "unpaid", label: "Part of the price due after 2026", type: "money", def: 200000 },
    { k: "ten", label: "It qualifies for the 10-year reserve", type: "bool", def: false }
  ],
  post(v, C, X) {
    const g = pos(num(v.gain)), p = num(v.price);
    const res = p > 0 ? Math.min(g * clamp(num(v.unpaid) / p, 0, 1), g * (v.ten ? .9 : .8)) : 0;   // year of sale: at most 80% (90%)
    X.say(`You can hold back up to ${fmt(res)} of the gain in 2026, deferring about ${fmt(igMore(X, .5 * res))} of tax at your rates.`);
  }
},
{
  id: "inv_part_xii2", cat: "investing", kind: "calc",
  q: "My T3 slip shows an amount in box 38",
  name: "Part XII.2 trust tax credit",
  lines: "L45600",
  hint: "Some mutual fund trusts pay a special tax on income passed to non-residents and give Canadian unitholders a refundable credit for it in T3 box 38 (or T5013 box 209). It's usually under $100.",
  tags: "t3 box 38 t5013 box 209 part xii.2 mutual fund trust refundable credit",
  src: ["part_xii2_trust_tax_credit"],
  fields: [{ k: "amt", label: "T3 box 38 plus T5013 box 209", type: "money", def: 50 }],
  cr(v, C, X) { C.fedRef += pos(num(v.amt)); }   // refundable, dollar for dollar
},
{
  id: "inv_sbc_rollover", cat: "investing", kind: "tip",
  q: "I sold small business shares and will reinvest in another one",
  name: "Small business share rollover",
  lines: "Schedule 3 · s.44.1",
  hint: "Selling shares of an eligible Canadian small business held over 185 days and buying other eligible small business shares in 2026 or 2027 lets you defer the gain. The deferral lowers the new shares' cost.",
  tip: "The gain you can defer is the gain times the replacement cost divided by the sale price. The company must be a Canadian-controlled private corporation with assets of $100 million or less, running an active business mainly in Canada. It's a deferral, not an exemption: the gain is taxed when you sell the new shares.",
  tags: "small business investment rollover 44.1 eligible small business corporation shares reinvest deferral ccpc",
  src: ["small_business_share_rollover"],
  fields: [
    { k: "price", label: "Sale price of the shares", type: "money", def: 150000 },
    { k: "acb", label: "What I paid for them", type: "money", def: 50000 },
    { k: "repl", label: "Cost of the new small business shares", type: "money", def: 150000 }
  ],
  post(v, C, X) {
    const p = num(v.price), g = pos(p - num(v.acb)), def = p > 0 ? g * Math.min(num(v.repl), p) / p : 0;
    X.say(`You could defer ${fmt(def)} of the ${fmt(g)} gain, about ${fmt(igMore(X, .5 * def))} of 2026 tax.`);
  }
},
{
  id: "inv_family_transfer", cat: "investing", kind: "tip",
  q: "I'm passing my farm, fishing property or small business to my child",
  name: "Tax-deferred intergenerational transfer",
  lines: "Schedule 3 · s.73(3) to (4.1) · s.40(1.1) · s.84.1",
  hint: "Farm or fishing property, and shares of a family farm, fishing or small business corporation, can pass to your child at any price between your cost and market value. Payments over time get a 10-year reserve.",
  tip: "Choose a transfer price that uses your lifetime capital gains exemption ($1,275,000 in 2026) and defers the rest; your child takes over the lower cost. Since 2024, a genuine sale of shares to your child's corporation can be taxed as a capital gain rather than a dividend if the conditions are met. These transfers need a tax adviser and usually a valuation.",
  tags: "intergenerational transfer farm fishing family business succession rollover 73(3) 84.1 child reserve",
  src: ["intergenerational_farm_business_transfer"],
  fields: [
    { k: "fmv", label: "Market value of what I'm transferring", type: "money", def: 1500000 },
    { k: "cost", label: "My cost (adjusted cost base or UCC)", type: "money", def: 300000 },
    { k: "price", label: "Transfer price I'd choose", type: "money", def: 300000 }
  ],
  post(v, C, X) {
    const fmv = num(v.fmv), at = Math.max(num(v.price), num(v.cost)), g = pos(fmv - at);
    X.say(`Transferring at ${fmt(at)} instead of ${fmt(fmv)} defers tax on a ${fmt(g)} gain, about ${fmt(igMore(X, .5 * g))} at your 2026 rates.`);
  }
},
{
  id: "inv_eot_exemption", cat: "investing", kind: "calc",
  q: "I sold my business to an employee ownership trust or worker co-op",
  name: "Employee ownership trust and worker co-op exemption",
  lines: "L25395 · Schedule 3",
  hint: "Up to $10 million of gains, shared by all sellers, is exempt on a qualifying sale in 2024 to 2026. You or your spouse must have worked in the business for 24 months, and it can be clawed back if it stops qualifying within 10 years.",
  tags: "employee ownership trust eot worker cooperative co-op business sale exemption 110.61 10 million",
  src: ["eot_coop_capital_gains_exemption"],
  fields: [
    { k: "gain", label: "Capital gain on the qualifying sale", type: "money", def: 2000000 },
    { k: "share", label: "My share of the $10 million exemption", type: "money", def: 2000000 }
  ],
  prof(v, C, X) { igPref(X, .5 * pos(num(v.gain) - Math.min(pos(num(v.share)), 10000000))); },   // exempt gain is outside AMT; the rest counts in full
  inc(v, C, X) { C.tcg += .5 * num(v.gain); },
  ded(v, C, X) { C.dedTI += .5 * Math.min(pos(num(v.gain)), pos(num(v.share)), 10000000); },   // line 25395; not in the AMT base
  post(v, C, X) {
    const ex = Math.min(pos(num(v.gain)), pos(num(v.share)), 10000000);
    X.say(`Exempt gain: ${fmt(ex)}.${num(v.gain) > ex ? ` The other ${fmt(num(v.gain) - ex)} is taxed normally; a 10-year reserve can spread it.` : ""}`);
  }
},
{
  id: "inv_lsvcc", cat: "investing", kind: "calc",
  q: "I bought shares of a labour-sponsored venture capital fund",
  name: "Labour-sponsored funds tax credit",
  lines: "L41300 · L41400",
  hint: "The federal credit is 15% of up to $5,000 of shares in a provincially registered fund, $750 at most. Ontario's own credit ended in 2011, and most provincial funds sell only to their own residents.",
  tags: "lsvcc labour-sponsored venture capital corporation fund credit fonds ftq",
  src: ["labour_sponsored_funds_credit"],
  fields: [
    { k: "cost", label: "Net cost of shares bought in 2026 or early 2027", type: "money", def: 5000 },
    { k: "prov", label: "The fund is registered with a province", type: "bool", def: true }
  ],
  cr(v, C, X) {
    if (!v.prov) return X.say("The credit for federally registered funds ended after 2016, so this is $0.");
    C.fedCr += .15 * Math.min(pos(num(v.cost)), 5000);   // 15% of up to $5,000, non-refundable
  }
},
{
  id: "inv_journalism_credit", cat: "investing", kind: "calc",
  q: "I'm a partner in a qualifying journalism organization",
  name: "Canadian journalism labour tax credit (partners)",
  lines: "L47555 · T5013 box 236",
  hint: "Partners in a qualifying Canadian journalism organization claim the refundable credit shown in T5013 box 236. The partnership income on your T5013 already reflects it, so don't add it to income again.",
  tags: "journalism labour tax credit qcjo newsroom partnership t5013 box 236",
  src: ["journalism_labour_credit_partner"],
  fields: [{ k: "amt", label: "T5013 box 236", type: "money", def: 3000 }],
  cr(v, C, X) { C.fedRef += pos(num(v.amt)); }   // refundable, dollar for dollar
}
);
