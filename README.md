# X-O Gridiron

A fast, iPad-friendly app for Year 5–6 students to design, animate and save gridiron plays,
with class/team sign-in (picture codes) and a teacher dashboard. See [SPEC.md](SPEC.md).

## How it fits together
- Plain HTML/CSS/JS, no build step. `js/vendor/firebase.js` is a pre-built bundle of the Firebase SDK
  and a QR code library (rebuild with `tools/build-vendor.sh` only when upgrading Firebase).
- Firebase project: `xandogridiron-72930` (Auth: Google, Email/Password, Anonymous; Cloud Firestore).
- Security rules live in `firestore.rules` — paste them into Firebase console → Firestore → Rules → Publish
  whenever they change.

## Routes
| Address | Screen |
| --- | --- |
| `#/` | Start: continue as team, type class code, teacher, just try it |
| `#/join/CODE` | Class QR code target: pick team, enter picture code, or make a new team |
| `#/t/CLASS/TEAM/CODE` | Printed team card QR: straight into the team |
| `#/team` | Team's plays + class playbook |
| `#/teacher` | Teacher sign-in / classes / teams / codes / present / print |
| `#/try` | Plays saved on this device only |

## Run locally
```bash
python3 -m http.server 8000
```
Open http://localhost:8000. To test against the Firebase emulator instead of the live project, run
`firebase emulators:start --only auth,firestore` and open http://localhost:8000/?emulator

## Deploy
GitHub Pages serves the repository root. After changing app files, bump `VERSION` in `sw.js`
so installed copies pick up the update.
