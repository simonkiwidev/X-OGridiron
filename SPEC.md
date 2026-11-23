# X-O Gridiron — Play Designer for Years 5–6

A fast, iPad-friendly app for students to design, animate and save gridiron plays.
Teachers manage classes, teams and a shared class playbook.

## Platform
- Web app that is also installable (PWA): "Add to Home Screen" on iPad, "Install" from Chrome/Edge on Windows.
- One codebase for students and teachers.
- Must load fast and run smoothly in iPad Safari.
- **Offline-first**: Wi-Fi is patchy. Once loaded, the app works fully offline and syncs when the connection returns.
- Backend: **Google Firebase** (Firestore + Auth), free tier.
- Hosting: free static hosting (GitHub Pages or Firebase Hosting).
- NZ English spelling. Field marked in **metres**.

## Users & sign-in

### Teachers
- Sign-in options: **Google**, **email + password**, or **continue as guest** (guest data stays on that device until they create an account).
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
- Players start in a default formation; drag to reposition.
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

## Later ideas (not in v1)
- Forward passes with ball flight.
- Moving defenders and "Complete / Covered" results.
