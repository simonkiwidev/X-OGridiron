# X-O Gridiron — Play Designer for Years 5–6

A fast, iPad-friendly app for students to design, animate and save gridiron plays.
Teachers manage classes, teams and a shared class playbook.

## Platform
- Web app that is also installable (PWA): "Add to Home Screen" on iPad, "Install" from Chrome/Edge on Windows.
- One codebase for students and teachers.
- Must load fast and run smoothly in iPad Safari.
- **Offline-first**: Wi-Fi is patchy. Once loaded, the app works fully offline and syncs when the connection returns.
- Backend: **Google Firebase**, free Spark plan: Cloud Firestore (Standard, `australia-southeast1`, production-mode rules) + Auth (Google, Email/Password, Anonymous). No Google Analytics.
- Hosting: free static hosting (GitHub Pages or Firebase Hosting).
- NZ English spelling. Field marked in **metres**.

## Users & sign-in

### Teachers
- Sign-in options: **Google**, **email + password** (with a show/hide password button), or **continue as guest**.
- Guest mode is fully usable so people can try the app with no sign-up. Guest data stays on that device; a gentle, non-blocking prompt offers to upgrade to a Google/email account (keeping their data) to use it across devices.
- Many teachers; each teacher can have many classes.

### Students (team-based, no student names stored)
1. Teacher shows the **class QR code** (or a short class code).
2. Students scan it → see that class's team list.
3. Tap their team (or **New team**) → enter their **3-picture code** (e.g. 🦈 🍕 🚀).
4. Alternative: scan a **printed team QR card** to go straight into their team.
- New team names are checked against a bad-word filter; teacher can rename or remove teams.
- Device remembers the team for the lesson so re-entry is instant.
- Teams can't see other teams' plays (except the shared class playbook).

## Play designer
- Choose number of attacking players: **2–11, default 5**.
- No blockers (PE flag style): the QB starts a few metres back with the ball and everyone else is spread evenly along the line; drag to reposition.
- Players are labelled with letters (QB, X, Z, Y, H…) and can be renamed to any 1–2 letters or numbers.
- Optional **defenders** (stationary) can be placed.
- **Quick workflow:** tap a route from the route bar → tap a player (or a spot on the field) to apply it.
- Routes can be **flipped left/right** and set **short / medium / deep**.
- **Draw my own**: finger-draw a custom route.
- Ball carrier shown. Running-play options:
  - **QB run**: QB runs from behind the line.
  - **Handoff**: QB gives the ball to a player running past.
  - **Pitch**: QB tosses the ball backwards to another player behind the line.

### Preloaded routes
Go/Fly, Slant, Button Hook/Curl, Out, In, Post, Corner, Flat, Comeback, Wheel, Hitch, Drag,
plus running: QB Run, Handoff, Pitch.

### Play button
- Players animate along their routes (no forward pass yet).
- Ball moves to new carrier on handoff/pitch.
- Normal and **slow-motion** speeds; replay.

### Saving
- Name and save plays to the team's playbook (synced to the class space).
- Duplicate / edit / delete plays.
- Open plays from the **class playbook** and save a copy.

## Teacher dashboard
- Create / manage multiple classes; each has a QR code + class code.
- Create / rename / delete teams; see and reset picture codes; **print team QR cards**.
- See every team's plays; **present** a play full-screen on the projector (with animation).
- Share a play to the **class playbook**.
- **Print / export** a team playbook as PDF.
- Reset a class for a new term.

## Defence
- Defenders have names (2 letters/numbers) and a one-tap job: **Stay**, **Zone** or **Mark**.
- Four PE zones beyond the line (2 × 2): 1 short-left, 2 short-right, 3 deep-left, 4 deep-right, drawn faintly on the field.
  Zone defenders guard the square they stand in (drag to re-tag, or tap 1–4) and chase attackers who enter it.
- Mark defenders follow the nearest free attacker, or one chosen by tapping their letter (marking the QB = rusher).
- "Whole defence" buttons: all stay / all zone / all mark.
- **Defence set-ups** are their own kind of play (section under the attack plays, "＋ New defence").
  They're tried against a chosen attack play (or a sample attack); attack plays can be tried against a chosen defence.

## Simulate
- 🎯 Simulate runs the play against the defence (or a sample 4-zone defence) and shows a result banner.
- Tap a receiver → "🎯 Throw here": the QB throws ~1.6 s after the hike. Covered (defender within ~2 m of the catch),
  Complete (then run-after-catch until tagged or touchdown), or Sacked (rusher tags the QB first).
- Running plays: defenders chase the runner; result is "Tagged after X m" or touchdown.
- No receiver chosen: shows who was open / covered at the moment of the throw.
- Defence set-ups get the same results from the defence's point of view.

## The four lines
- Four bold numbered lines across the field in front of the line of scrimmage (evenly spaced). No distances shown.
- Simulate results count lines crossed ("tagged after crossing 2 lines"); crossing line 4 is a touchdown.
- Short zones run from the line of scrimmage to line 2, deep zones from line 2 to line 4.

## Field size
- Teacher sets the real field size per class (presets or custom width × length in front of the line); default 30 × 20 m.
- "Just try it" has its own field size on the device. Routes and zones scale to fit.

## Later ideas (not in v1)
- Forward passes with ball flight.
- Moving defenders and "Complete / Covered" results.
