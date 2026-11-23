# X-O Gridiron

A fast, iPad-friendly app for Year 5–6 students to design, animate and save gridiron plays.
See [SPEC.md](SPEC.md) for the full plan.

## Run locally
No build step — it's plain HTML/CSS/JS.

```bash
python3 -m http.server 8000
```
Then open http://localhost:8000.

## Deploy
Served by GitHub Pages straight from the repository root (`.nojekyll` is included).
After changing app files, bump `VERSION` in `sw.js` so installed copies update.
