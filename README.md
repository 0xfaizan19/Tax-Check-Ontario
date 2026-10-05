# Three-Job Tax Check

Ontario 2026 tax estimator for people with more than one job: tax withheld, tax owed, CPP/EI refunds, RRSP/TFSA room, and about 200 on/off tax-saving situations.

- **index.html** is the whole site in one file. Upload it to GitHub Pages (or open it in any browser).
- Visitors' entries, notes and favorites are saved in their own browser only. Nothing is sent anywhere.
- Rates and benefit amounts are for the 2026 tax year.

## Changing it

The source is in `src/`:

| File | What it holds |
|---|---|
| `engine.js` | 2026 federal and Ontario tax rules |
| `items/*.js` | the on/off tax-saving options |
| `ui.js`, `shell.html`, `style.css` | the page |

After editing, rebuild and test:

```
cd src
node test.js        # must end with "0 errors"
python3 build.py    # rewrites ../index.html
```

Then upload the new `index.html` to GitHub.
