// ===== 2026 federal + Ontario personal tax engine =====
// Pure functions, no DOM. Items (see items/*.js) plug in through five phases:
//   prof(v,C,X) household facts (always runs)   inc(v,C,X) extra income (always runs)
//   ded(v,C,X)  deductions                        cr(v,C,X)  credits, benefits (needs X.ni)
//   post(v,C,X) anything that needs final credit totals (X.R)
// When an item is "skipped" (to measure its saving), only prof and inc run for it.

const P = {
  fed: {
    b: [[58523, .14], [117045, .205], [181440, .26], [258482, .29], [Infinity, .33]],
    rate: .14, bpaMax: 16452, bpaMin: 14829, bpaLo: 181440, bpaHi: 258482, cea: 1501,
    medCap: 2890, topThr: 258482, topupThr: 8193.22,
    caregiverTopup: 2740, caregiverMax: 8773, caregiverBase: 29374,
    disability: 10341, disSupp: 6032, disSuppThr: 3533,
    age: 9208, ageThr: 46432, pension: 2000, adoption: 19972, tuitionTransfer: 5000
  },
  on: {
    b: [[53891, .0505], [107785, .0915], [150000, .1116], [220000, .1216], [Infinity, .1316]],
    rate: .0505, bpa: 12989, s1: 5818, s2: 7446, medCap: 2940, otherDepMedCap: 15846,
    spouseBase: 12132, spouseMax: 11029, caregiverBase: 27066, caregiverMax: 6122,
    disability: 10494, disSupp: 6121, disSuppThr: 3585,
    age: 6342, ageThr: 47210, pension: 1796, adoption: 15846,
    redBasic: 300, redDep: 554, liftMax: 875, liftRate: .0505, liftInd: 32500, liftFam: 65000
  },
  cpp: { ympe: 74600, yampe: 85000, ex: 3500, r: .0595, r2: .04 },
  ei: { mie: 68900, r: .0163 },
  div: { eligGross: 1.38, nonGross: 1.15, fedElig: .150198, fedNon: .090301, onElig: .10, onNon: .029863 }
};

const ITEMS = [];
const SKIPPED = [];   // [researchId, reason] for research items folded into another item
const CATS = ["family", "savings", "work", "health", "home", "learning", "giving", "investing", "ontario", "other", "ended"];

const pos = x => x > 0 ? x : 0;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const num = x => { const n = +x; return isFinite(n) ? n : 0; };
const fmt = n => (n < 0 ? "−" : "") + "$" + Math.round(Math.abs(n)).toLocaleString("en-CA");

function brk(x, b) { let t = 0, p = 0; for (const [c, r] of b) { if (x <= p) break; t += (Math.min(x, c) - p) * r; p = c; } return t; }
function rateAt(x, b) { for (const [c, r] of b) if (x < c) return r; return b[b.length - 1][1]; }
P.fedBpa = ni => ni <= P.fed.bpaLo ? P.fed.bpaMax : ni >= P.fed.bpaHi ? P.fed.bpaMin
  : P.fed.bpaMax - (P.fed.bpaMax - P.fed.bpaMin) * (ni - P.fed.bpaLo) / (P.fed.bpaHi - P.fed.bpaLo);

// Employee CPP / CPP2 / EI on one employment income
function contrib(i) {
  const base = Math.min(pos(i - P.cpp.ex), P.cpp.ympe - P.cpp.ex);
  const cpp = base * P.cpp.r, cpp2 = pos(Math.min(i, P.cpp.yampe) - P.cpp.ympe) * P.cpp.r2, ei = Math.min(pos(i), P.ei.mie) * P.ei.r;
  return { cppBase: base * .0495, cppEnh: base * .01, cpp, cpp2, ei, total: cpp + cpp2 + ei };
}

function ohp(x) {
  if (x <= 20000) return 0; if (x <= 36000) return Math.min(300, .06 * (x - 20000));
  if (x <= 48000) return Math.min(450, 300 + .06 * (x - 36000));
  if (x <= 72000) return Math.min(600, 450 + .25 * (x - 48000));
  if (x <= 200000) return Math.min(750, 600 + .25 * (x - 72000));
  return Math.min(900, 750 + .25 * (x - 200000));
}
function polFed(c) { c = pos(c); return Math.min(650, .75 * Math.min(c, 400) + .5 * Math.min(pos(c - 400), 350) + Math.min(pos(c - 750), 525) / 3); }
function polOn(c) { c = pos(c); return Math.min(1698.08, .75 * Math.min(c, 509.42) + .5 * Math.min(pos(c - 509.42), 1188.66) + .3333 * Math.min(pos(c - 1698.08), 2165.25)); }

function newClaims() {
  return {
    income: 0, earnedExtra: 0, eligDiv: 0, nonEligDiv: 0, tcg: 0,   // extra income (tcg = taxable half of gains)
    ded: 0, dedTI: 0, capLoss: 0,                                    // deductions
    fed: 0, on: 0,                                                   // credit AMOUNTS (x14% / x5.05%)
    fedMed: 0, onMed: 0, fedMedOther: 0, onMedOther: 0,              // medical (engine applies threshold to fedMed/onMed)
    gifts: 0, giftsFull: 0, fedPol: 0, onPol: 0,                     // donations, political contributions
    fedCr: 0, onCr: 0, onCrPost: 0,                                  // direct non-refundable credit dollars
    fedRef: 0, onRef: 0, ben: 0,                                     // refundable credits, benefits (dollars)
    redDeps: 0, childCare: 0, disSupports: 0, workDed: 0             // shared facts other items read
  };
}

// Tax for a person with only employment income and no claims (spouse comparisons, withholding)
function simpleTax(emp) { return compute(emp, [], null).total; }
// Combined marginal rate on the next dollar of taxable income (bracket rates, Ontario surtax tiers)
function margAt(ti, credits) {
  const c = contrib(ti);
  const basicOn = brk(ti, P.on.b) - P.on.rate * (credits != null ? credits : P.on.bpa + c.cppBase + c.ei);
  const m = basicOn > P.on.s2 ? 1.56 : basicOn > P.on.s1 ? 1.2 : 1;
  return rateAt(ti, P.fed.b) + rateAt(ti, P.on.b) * m;
}

/**
 * emp: employment income; list: [{def, v}] active items (auto items included);
 * skip: null | id | (id => boolean) — claims of skipped items are left out.
 */
function compute(emp, list, skip) {
  const skipped = typeof skip === "function" ? skip : (id => id === skip);
  const X = { emp, hh: { spouse: null, kids: [], deps: [], single: false }, says: {}, cur: null, P };
  X.say = t => { (X.says[X.cur] = X.says[X.cur] || []).push(t); };
  const C = newClaims();
  const run = (ph, all) => { for (const a of list) { const f = a.def[ph]; if (!f || (!all && skipped(a.def.id))) continue; X.cur = a.def.id; f(a.v, C, X); } X.cur = null; };

  const c = contrib(emp);
  X.cppEi = c;
  run("prof", true);
  run("inc", true);
  X.earned = emp + C.earnedExtra;
  X.preNI = pos(emp + C.income + C.eligDiv * P.div.eligGross + C.nonEligDiv * P.div.nonGross + C.tcg - c.cppEnh - c.cpp2);
  run("ded", false);

  const grossDiv = C.eligDiv * P.div.eligGross + C.nonEligDiv * P.div.nonGross;
  const totalInc = emp + C.income + grossDiv + C.tcg;
  const ni = pos(totalInc - c.cppEnh - c.cpp2 - C.ded);
  const capLoss = Math.min(C.capLoss, C.tcg);
  const ti = pos(ni - C.dedTI - capLoss);
  const spouseNI = X.hh.spouse ? num(X.hh.spouse.ni) + num(X.hh.spouse.niAdj) : 0;
  Object.assign(X, { totalInc, ni, ti, spouseNI, afni: ni + spouseNI, marg: margAt(ti) });
  run("cr", false);

  // ---- Federal (T1 / Schedule 1) ----
  const bpa = P.fedBpa(ni);
  const fedMedNet = pos(C.fedMed - Math.min(P.fed.medCap, .03 * ni)) + C.fedMedOther;
  const amt33500 = bpa + c.cppBase + c.ei + Math.min(P.fed.cea, emp) + C.fed + fedMedNet;
  const cr33800 = P.fed.rate * amt33500;
  const gifts = Math.min(C.gifts, .75 * ni) + C.giftsFull;
  const g1 = Math.min(gifts, 200), rest = gifts - g1, top = Math.min(rest, pos(ti - P.fed.topThr));
  const donFed = .14 * g1 + .33 * top + .29 * (rest - top);
  const topup = pos(cr33800 + .14 * g1 - P.fed.topupThr) / 14;
  const basicFed = brk(ti, P.fed.b);
  const divFed = C.eligDiv * P.div.eligGross * P.div.fedElig + C.nonEligDiv * P.div.nonGross * P.div.fedNon;
  const fedA = pos(basicFed - cr33800 - donFed - topup - divFed - C.fedCr);
  const fedPolCr = Math.min(fedA, polFed(C.fedPol));
  const fedTax = fedA - fedPolCr;

  // ---- Ontario (ON428) ----
  const onMedNet = pos(C.onMed - Math.min(P.on.medCap, .03 * ni)) + C.onMedOther;
  const onAmt = P.on.bpa + c.cppBase + c.ei + C.on + onMedNet;
  const donOn = .0505 * g1 + .1116 * rest;
  const basicOn = pos(brk(ti, P.on.b) - P.on.rate * onAmt - donOn - C.onCr);
  const surtax = .2 * pos(basicOn - P.on.s1) + .36 * pos(basicOn - P.on.s2);
  const divOn = C.eligDiv * P.div.eligGross * P.div.onElig + C.nonEligDiv * P.div.nonGross * P.div.onNon;
  const l73 = pos(basicOn + surtax - divOn);
  const redTotal = P.on.redBasic + P.on.redDep * C.redDeps;
  const onRed = Math.min(l73, pos(2 * redTotal - l73));
  const afterRed = pos(l73 - onRed - C.onCrPost);
  const liftFull = pos(Math.min(P.on.liftMax, P.on.liftRate * emp) - .05 * Math.max(0, ni - P.on.liftInd, X.afni - P.on.liftFam));
  const lift = Math.min(afterRed, liftFull);
  const onHP = ohp(ti);
  const onTax = afterRed - lift + onHP;

  const R = {
    emp, totalInc, ni, ti, bpa, fedTax, onTax, total: fedTax + onTax, basicFed, basicOn, surtax, onHP, onRed, lift, topup,
    donFed, donOn, fedMedNet, onMedNet, fedPolCr, gifts, cppEi: c, afni: X.afni,
    cash: emp + C.income + C.eligDiv + C.nonEligDiv + 2 * C.tcg
  };
  X.R = R; X.C = C;
  run("post", false);
  R.ref = C.fedRef + C.onRef; R.ben = C.ben;
  R.net = R.total - R.ref - R.ben;
  R.says = X.says; R.hh = X.hh; R.C = C;
  return R;
}

if (typeof module !== "undefined") module.exports = { ITEMS, SKIPPED, CATS, P, pos, clamp, num, fmt, brk, rateAt, contrib, ohp, polFed, polOn, compute, simpleTax, margAt, newClaims };
