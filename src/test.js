// node test.js : loads engine + all items, runs every item at $292,500 and $90,000, reports errors
const fs = require("fs"), path = require("path"), vm = require("vm");
const ctx = { console, Math, JSON, Number, String, Array, Object, isFinite, Infinity }; vm.createContext(ctx);
const load = f => vm.runInContext(fs.readFileSync(path.join(__dirname, f), "utf8"), ctx, { filename: f });
load("engine.js");
for (const f of fs.readdirSync(path.join(__dirname, "items")).filter(f => f.endsWith(".js"))) load("items/" + f);
const { ITEMS, compute } = vm.runInContext("({ ITEMS, compute })", ctx);
const defs = d => { const v = {}; for (const f of d.fields || []) v[f.k] = f.def; if (d.rows) v.rows = [Object.fromEntries(d.rows.fields.map(f => [f.k, f.def]))]; return v; };
const autos = ITEMS.filter(d => d.kind === "auto").map(d => ({ def: d, v: {} }));
let errs = 0, n = 0; const ids = new Set();
for (const d of ITEMS) {
  if (ids.has(d.id)) { errs++; console.log("duplicate id", d.id); } ids.add(d.id);
  if (d.kind !== "calc" && d.kind !== "tip") continue;
  for (const emp of [292500, 90000]) {
    try {
      const list = [...autos, { def: d, v: defs(d) }];
      const s = compute(emp, list, d.id).net - compute(emp, list, null).net;
      if (!isFinite(s)) throw new Error("non-finite saving");
    } catch (e) { errs++; console.log(`ERROR ${d.id} at ${emp}: ${e.message}`); }
  }
  n++;
}
const base = compute(292500, [], null).total;
console.log(`${ITEMS.length} items, ${n} exercised, ${errs} errors; base tax at $292,500 = ${Math.round(base)}`);
process.exit(errs || Math.round(base) !== 110079 ? 1 : 0);
