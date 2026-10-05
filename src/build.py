# Builds the single-file page.
#   python3 build.py              -> ../index.html (full page for GitHub Pages)
#   python3 build.py --artifact X -> X (body-only version for the Claude artifact)
import os, sys
here = os.path.dirname(os.path.abspath(__file__))
order = ["core.js", "health_savings_family_other.js", "work.js", "home_learning.js", "invest_giving.js", "ontario_ended.js"]
items = [f for f in order if os.path.exists(os.path.join(here, "items", f))]
items += sorted(f for f in os.listdir(os.path.join(here, "items")) if f.endswith(".js") and f not in order)
js = [open(os.path.join(here, "engine.js")).read()]
js += [f"// ---- items/{f} ----\n" + open(os.path.join(here, "items", f)).read() for f in items]
js.append(open(os.path.join(here, "ui.js")).read())
js = "\n".join(js)
assert "</script" not in js.lower(), "script terminator inside JS"
page = open(os.path.join(here, "shell.html")).read()
page = page.replace("/*__CSS__*/", open(os.path.join(here, "style.css")).read()).replace("/*__JS__*/", js)
if "--artifact" in sys.argv:
    dst = sys.argv[sys.argv.index("--artifact") + 1]
else:
    cut = page.index("</style>") + len("</style>")
    page = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
            '<meta name="description" content="Ontario 2026 tax estimator for people with more than one job: tax withheld, tax owed, refunds and about 200 tax-saving situations.">\n'
            + page[:cut] + '\n<style>[hidden]{display:none!important}</style>\n</head>\n<body>\n' + page[cut:] + '\n</body>\n</html>\n')
    dst = os.path.join(here, "..", "index.html")
open(dst, "w").write(page)
print("wrote", os.path.abspath(dst), round(len(page) / 1024), "KB from", len(items), "item files")
