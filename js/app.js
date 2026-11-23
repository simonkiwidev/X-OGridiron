// App start-up, screen routing and every screen except the designer.
import { $, esc, toast, showScreen, ago, go, newId, clone } from './ui.js';
import { openDesigner, closeDesigner, renderActions } from './designer.js';
import { renderPlay, svgOpen } from './field.js';
import { newPlay } from './formation.js';
import * as local from './storage.js';
import { PICS, PIC_NAMES, codeToPics, codeLabel, CODE_LEN } from './pictures.js';
import { checkTeamName, cleanName } from './names.js';

/* ---------------- shared bits ---------------- */
let cloudPromise = null;
const cloud = () => (cloudPromise ||= import('./cloud.js'));
const APP_URL = location.origin + location.pathname;

let unsubs = [];
const track = (u) => (u && unsubs.push(u), u);
function cleanup() {
  unsubs.forEach((u) => {
    try {
      u();
    } catch {}
  });
  unsubs = [];
}

const page = $('page');
function setPage(html) {
  closeDesigner();
  closeOverlay();
  showScreen('page');
  page.innerHTML = html;
  page.onclick = null;
  page.onsubmit = null;
}

function overlay(html, { full = false, onClick } = {}) {
  const o = $('overlay');
  o.className = 'overlay' + (full ? ' full' : '');
  o.innerHTML = `<div class="ov-box">${html}</div>`;
  o.hidden = false;
  o.onclick = (e) => {
    if (e.target === o) return closeOverlay();
    onClick?.(e);
  };
  return o;
}
function closeOverlay() {
  const o = $('overlay');
  o.hidden = true;
  o.innerHTML = '';
  o.onclick = null;
}

function loading(msg = 'Loading…') {
  setPage(`<div class="center-msg"><div class="spinner"></div><p>${esc(msg)}</p></div>`);
}
function problem(msg, backHash = '#/', backLabel = 'Back') {
  setPage(`<div class="center-msg"><p class="big-emoji">🤔</p><p>${esc(msg)}</p>
    <button class="btn primary big" onclick="location.hash='${backHash}'">${esc(backLabel)}</button></div>`);
}
const offlineMsg = (e) =>
  e?.code === 'timeout' || e?.code === 'unavailable' ? 'You need internet for this. Check the Wi-Fi and try again.' : '';

const header = (title, backHash, extra = '') => `
  <header class="page-head">
    ${backHash ? `<a class="btn icon" href="${backHash}" aria-label="Back">‹</a>` : ''}
    <h1>${title}</h1><span class="spacer"></span>${extra}
  </header>`;

const TEAM_COLOURS = ['#4dabf7', '#ff922b', '#da77f2', '#f783ac', '#3bc9db', '#ffd43b', '#69db7c', '#ff8787', '#748ffc', '#e599f7'];
const teamColour = (name) => TEAM_COLOURS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % TEAM_COLOURS.length];

function playCards(list, acts = ['copy', 'delete']) {
  const labels = { copy: 'Copy', delete: 'Delete', remove: 'Remove', share: '⭐ Share' };
  return list
    .map(
      (p) => `
    <article class="card" data-id="${esc(p.id)}">
      <button class="thumb" data-act="open" aria-label="Open ${esc(p.name)}">${svgOpen('tsvg')}${renderPlay(p, { thumb: true })}</svg></button>
      <div class="card-info">
        <div class="card-name">${esc(p.name)}</div>
        <div class="card-meta">${p.fromTeam ? `From ${esc(p.fromTeam)} · ` : ''}${p.players.length} players · ${ago(p.updated)}</div>
      </div>
      ${acts.length ? `<div class="card-acts">${acts.map((a) => `<button class="btn small ${a === 'delete' || a === 'remove' ? 'danger' : ''}" data-act="${a}">${labels[a]}</button>`).join('')}</div>` : ''}
    </article>`,
    )
    .join('');
}
const cardAction = (e) => {
  const btn = e.target.closest('[data-act]');
  const card = btn?.closest('.card');
  return btn && card ? { act: btn.dataset.act, id: card.dataset.id } : null;
};

function copyOf(p, name) {
  const c = clone(p);
  c.id = newId();
  c.name = (name || p.name + ' copy').slice(0, 30);
  c.created = c.updated = Date.now();
  delete c.fromTeam;
  return c;
}

function qrSvg(qrcode, text) {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}

/* ---------------- student session ---------------- */
const SKEY = 'xog.session';
const getSession = () => {
  try {
    return JSON.parse(localStorage.getItem(SKEY)) || null;
  } catch {
    return null;
  }
};
const setSession = (s) => localStorage.setItem(SKEY, JSON.stringify(s));
const clearSession = () => localStorage.removeItem(SKEY);

/* ================= START PAGE ================= */
function landing() {
  const s = getSession();
  setPage(`
  <div class="landing">
    <div class="brand big">
      <img src="icons/icon-192.png" alt="" class="logo">
      <div><h1>X-O Gridiron</h1><p class="sub">Design a play. Try it. Save it.</p></div>
    </div>
    ${
      s
        ? `<a class="continue" href="#/team"><span class="team-dot" style="background:${teamColour(s.teamName)}"></span>
             <span><small>Continue as</small><b>${esc(s.teamName)}</b><small>${esc(s.className)}</small></span><span class="go">▶</span></a>`
        : ''
    }
    <form class="panel-card" id="join-form">
      <h2>Join your class</h2>
      <p class="muted">Scan your class QR code, or type the class code.</p>
      <div class="join-row">
        <input id="class-code" class="code-input" maxlength="6" placeholder="ABC123" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Class code">
        <button class="btn primary big">Go</button>
      </div>
    </form>
    <div class="landing-row">
      <a class="btn big" href="#/teacher">🧑‍🏫 I’m a teacher</a>
      <a class="btn big ghost" href="#/try">Just try it</a>
    </div>
  </div>`);
  page.onsubmit = (e) => {
    e.preventDefault();
    const code = $('class-code').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length < 6) return toast('Class codes have 6 letters and numbers');
    go('#/join/' + code);
  };
}

/* ================= TRY (no class, saved on this device) ================= */
function localHome() {
  const list = local.listPlays();
  setPage(`
    ${header('Just try it', '#/', `<button class="btn primary" data-new>＋ New play</button>`)}
    <main class="page-main">
      <p class="muted">These plays are saved on this device only. Join a class to share them with your teacher.</p>
      <div class="play-list">${playCards(list)}</div>
      ${list.length ? '' : `<p class="empty">No plays yet. Tap <b>＋ New play</b> to make your first one!</p>`}
    </main>`);
  page.onclick = (e) => {
    if (e.target.closest('[data-new]')) {
      const p = newPlay(`Play ${list.length + 1}`);
      local.savePlay(p);
      return go('#/try/play/' + p.id);
    }
    const a = cardAction(e);
    if (!a) return;
    const p = local.getPlay(a.id);
    if (!p) return;
    if (a.act === 'open') go('#/try/play/' + a.id);
    if (a.act === 'copy') local.savePlay(copyOf(p)), localHome(), toast('Copied!');
    if (a.act === 'delete' && confirm(`Delete "${p.name}"?`)) local.deletePlay(a.id), localHome();
  };
}

function localPlay(id) {
  const p = local.getPlay(id);
  if (!p) return go('#/try');
  openDesigner(p, { save: (pl) => local.savePlay(pl), back: () => go('#/try') });
}

/* ================= JOIN A CLASS ================= */
async function joinClass(code) {
  loading('Finding your class…');
  let cls;
  try {
    const c = await cloud();
    cls = await c.findClassByCode(code);
  } catch (e) {
    console.error(e);
    return problem(offlineMsg(e) || 'Something went wrong finding that class. Try again.', '#/');
  }
  if (!cls) return problem(`We couldn’t find a class with the code ${code}. Check the code with your teacher.`, '#/');
  const c = await cloud();
  let teams = [];
  const draw = () => {
    setPageKeep(`
      ${header(esc(cls.name), '#/')}
      <main class="page-main">
        <h2 class="tap-title">Tap your team</h2>
        <div class="team-grid">
          ${teams
            .map((t) => `<button class="team-tile" data-team="${esc(t.id)}" style="--tc:${teamColour(t.name)}"><span class="team-dot"></span>${esc(t.name)}</button>`)
            .join('')}
          <button class="team-tile new" data-newteam>＋ New team</button>
        </div>
      </main>`);
  };
  setPage('');
  draw();
  track(
    c.watchTeams(cls.id, (list) => {
      if (!list) return;
      teams = list;
      if (!$('overlay').hidden) return; // don't redraw under the keypad
      draw();
    }),
  );
  page.onclick = (e) => {
    const tb = e.target.closest('[data-team]');
    if (tb) {
      const team = teams.find((t) => t.id === tb.dataset.team);
      return pictureKeypad(team.name, async (pcode) => {
        await c.joinTeam(cls.id, team.id, pcode);
        enterTeam(cls, team);
      });
    }
    if (e.target.closest('[data-newteam]')) newTeamForm(cls);
  };
}

function setPageKeep(html) {
  page.innerHTML = html; // redraw without resetting handlers
}

function enterTeam(cls, team) {
  setSession({ classId: cls.id, className: cls.name, classCode: cls.code, teamId: team.id, teamName: team.name });
  closeOverlay();
  go('#/team');
}

function pictureKeypad(teamName, onComplete) {
  let entered = [];
  let busy = false;
  const o = overlay(
    `<h2>${esc(teamName)}</h2>
     <p class="muted">Tap your ${CODE_LEN} team pictures</p>
     <div class="slots" id="slots"></div>
     <div class="keypad">${PICS.map((p, i) => `<button class="key" data-k="${i}" aria-label="${PIC_NAMES[i]}">${p}</button>`).join('')}</div>
     <p class="kp-msg" id="kp-msg">Forgot? Ask your teacher.</p>
     <div class="kp-row"><button class="btn" data-kp="back">⌫ Back</button><button class="btn" data-kp="cancel">Cancel</button></div>`,
    {
      onClick: async (e) => {
        if (busy) return;
        const k = e.target.closest('[data-k]');
        const kp = e.target.closest('[data-kp]')?.dataset.kp;
        if (kp === 'cancel') return closeOverlay();
        if (kp === 'back') entered.pop();
        if (k && entered.length < CODE_LEN) entered.push(+k.dataset.k);
        drawSlots();
        if (entered.length === CODE_LEN) {
          busy = true;
          $('kp-msg').textContent = 'Checking…';
          try {
            await onComplete(entered.join('-'));
          } catch (err) {
            console.error(err);
            const slots = $('slots');
            if (!slots) return;
            slots.classList.remove('shake');
            void slots.offsetWidth;
            slots.classList.add('shake');
            $('kp-msg').textContent = offlineMsg(err) || 'Not quite! Try again. (Ask your teacher if you forgot.)';
            entered = [];
            drawSlots();
          }
          busy = false;
        }
      },
    },
  );
  function drawSlots() {
    const el = o.querySelector('#slots');
    if (el) el.innerHTML = Array.from({ length: CODE_LEN }, (_, i) => `<span class="slot">${entered[i] != null ? PICS[entered[i]] : ''}</span>`).join('');
  }
  drawSlots();
}

function newTeamForm(cls) {
  overlay(
    `<h2>Make a new team</h2>
     <form id="nt-form">
       <input id="nt-name" class="text-input" maxlength="20" placeholder="Team name" autocomplete="off" aria-label="Team name">
       <p class="kp-msg" id="nt-msg"></p>
       <div class="kp-row"><button type="button" class="btn" data-kp="cancel">Cancel</button><button class="btn primary">Create team</button></div>
     </form>`,
    { onClick: (e) => e.target.closest('[data-kp=cancel]') && closeOverlay() },
  );
  $('nt-name').focus();
  $('nt-form').onsubmit = async (e) => {
    e.preventDefault();
    const name = cleanName($('nt-name').value);
    const err = checkTeamName(name);
    if (err) return ($('nt-msg').textContent = err);
    $('nt-msg').textContent = 'Making your team…';
    try {
      const c = await cloud();
      const team = await c.studentCreateTeam(cls.id, name);
      overlay(
        `<h2>Welcome, ${esc(name)}!</h2>
         <p>Your team code is:</p>
         <div class="slots big">${codeToPics(team.code).map((p) => `<span class="slot">${p}</span>`).join('')}</div>
         <p class="muted">${esc(codeLabel(team.code))}</p>
         <p><b>Remember these 3 pictures!</b> You’ll need them to get back in. Your teacher can see them too.</p>
         <button class="btn primary big" data-kp="go">Let’s go!</button>`,
        { onClick: (ev) => ev.target.closest('[data-kp=go]') && enterTeam(cls, { id: team.id, name }) },
      );
    } catch (ex) {
      console.error(ex);
      $('nt-msg').textContent = offlineMsg(ex) || 'Could not make the team. Try again.';
    }
  };
}

async function cardJoin(classId, teamId, code) {
  loading('Joining your team…');
  try {
    const c = await cloud();
    const cls = await c.getClass(classId);
    if (!cls) return problem('This team card is for a class that no longer exists.');
    await c.joinTeam(classId, teamId, code);
    const team = await c.getTeam(classId, teamId);
    if (!team) return problem('This team no longer exists. Ask your teacher.');
    enterTeam(cls, team);
  } catch (e) {
    console.error(e);
    problem(offlineMsg(e) || 'This team card doesn’t work any more. Ask your teacher for a new one.');
  }
}

/* ================= TEAM HOME ================= */
let teamPlays = [];
let bookPlays = [];
let teamTab = 'ours';

async function teamHome() {
  const s = getSession();
  if (!s) return go('#/');
  teamPlays = [];
  bookPlays = [];
  const c = await cloud();
  try {
    await c.ensureUser();
  } catch (e) {
    console.error(e);
  }
  let err = '';
  const draw = () => {
    const list = teamTab === 'ours' ? teamPlays : bookPlays;
    setPageKeep(`
      <header class="page-head">
        <a class="btn icon" href="#/" aria-label="Home">‹</a>
        <span class="team-dot lg" style="background:${teamColour(s.teamName)}"></span>
        <div class="titles"><h1>${esc(s.teamName)}</h1><div class="muted">${esc(s.className)}</div></div>
        <span class="spacer"></span>
        <button class="btn" data-switch>Switch team</button>
      </header>
      <main class="page-main">
        <div class="tabs-row">
          <div class="tabs">
            <button class="tab ${teamTab === 'ours' ? 'on' : ''}" data-tab="ours">Our plays</button>
            <button class="tab ${teamTab === 'book' ? 'on' : ''}" data-tab="book">⭐ Class playbook</button>
          </div>
          ${teamTab === 'ours' ? `<button class="btn primary big" data-new>＋ New play</button>` : ''}
        </div>
        ${err ? `<p class="warn">${esc(err)}</p>` : ''}
        <div class="play-list">${playCards(list, teamTab === 'ours' ? ['copy', 'delete'] : ['copy'])}</div>
        ${
          list.length
            ? ''
            : `<p class="empty">${teamTab === 'ours' ? 'No plays yet. Tap <b>＋ New play</b> to make your first one!' : 'Your teacher hasn’t shared any plays yet.'}</p>`
        }
      </main>`);
  };
  setPage('');
  draw();
  track(
    c.watchPlays(s.classId, s.teamId, (list, e) => {
      if (e) {
        console.error(e);
        if (e.code === 'permission-denied') {
          clearSession();
          return problem('Your team code was changed by your teacher. Please join your team again.', `#/join/${s.classCode}`, 'Join again');
        }
        return;
      }
      teamPlays = list;
      draw();
    }),
  );
  track(
    c.watchPlaybook(s.classId, (list) => {
      if (!list) return;
      bookPlays = list;
      draw();
    }),
  );
  page.onclick = (e) => {
    if (e.target.closest('[data-switch]')) {
      clearSession();
      return go(s.classCode ? '#/join/' + s.classCode : '#/');
    }
    const tab = e.target.closest('[data-tab]');
    if (tab) return (teamTab = tab.dataset.tab), draw();
    if (e.target.closest('[data-new]')) {
      const p = newPlay(`Play ${teamPlays.length + 1}`);
      c.savePlay(s.classId, s.teamId, p);
      teamPlays = [p, ...teamPlays];
      return go('#/team/play/' + p.id);
    }
    const a = cardAction(e);
    if (!a) return;
    if (teamTab === 'book') {
      const p = bookPlays.find((x) => x.id === a.id);
      if (!p) return;
      if (a.act === 'open') go('#/team/book/' + a.id);
      if (a.act === 'copy') {
        const cp = copyOf(p, p.name);
        c.savePlay(s.classId, s.teamId, cp);
        teamTab = 'ours';
        toast('Copied to Our plays!');
      }
      return;
    }
    const p = teamPlays.find((x) => x.id === a.id);
    if (!p) return;
    if (a.act === 'open') go('#/team/play/' + a.id);
    if (a.act === 'copy') c.savePlay(s.classId, s.teamId, copyOf(p)), toast('Copied!');
    if (a.act === 'delete' && confirm(`Delete "${p.name}"?`)) c.deletePlay(s.classId, s.teamId, p.id);
  };
}

async function waitForList(getter, id, watch) {
  let p = getter().find((x) => x.id === id);
  if (p) return p;
  return new Promise((resolve) => {
    const timer = setTimeout(() => (u?.(), resolve(null)), 8000);
    const u = watch((list) => {
      const f = list?.find((x) => x.id === id);
      if (f || list) {
        clearTimeout(timer);
        setTimeout(() => u?.());
        resolve(f || null);
      }
    });
  });
}

async function teamPlay(id) {
  const s = getSession();
  if (!s) return go('#/');
  const c = await cloud();
  await c.ensureUser().catch(() => {});
  const p = await waitForList(() => teamPlays, id, (cb) => c.watchPlays(s.classId, s.teamId, cb));
  if (!p) return go('#/team');
  openDesigner(clone(p), {
    save: (pl) => {
      c.savePlay(s.classId, s.teamId, pl);
      const i = teamPlays.findIndex((x) => x.id === pl.id);
      if (i >= 0) teamPlays[i] = clone(pl);
    },
    back: () => go('#/team'),
  });
}

async function teamBookPlay(id) {
  const s = getSession();
  if (!s) return go('#/');
  const c = await cloud();
  await c.ensureUser().catch(() => {});
  const p = await waitForList(() => bookPlays, id, (cb) => c.watchPlaybook(s.classId, cb));
  if (!p) return go('#/team');
  openDesigner(clone(p), {
    readOnly: true,
    subtitle: p.fromTeam ? `From ${p.fromTeam}` : 'Class playbook',
    back: () => go('#/team'),
    actions: [
      {
        label: '＋ Copy to our plays',
        cls: 'primary',
        onClick: (pl) => {
          const cp = copyOf(pl, pl.name);
          c.savePlay(s.classId, s.teamId, cp);
          teamPlays = [cp, ...teamPlays];
          toast('Copied! You can change it now.');
          go('#/team/play/' + cp.id);
        },
      },
    ],
  });
}

/* ================= TEACHER ================= */
const TKEY = 'xog.teacher';
const isTeacherDevice = () => localStorage.getItem(TKEY) === '1';

async function teacherHome() {
  loading();
  const c = await cloud();
  const u = await c.getUser();
  if (!u || (u.isAnonymous && !isTeacherDevice())) return teacherSignIn();
  localStorage.setItem(TKEY, '1');
  teacherDashboard(c, u);
}

function passwordField(id, placeholder = 'Password', autocomplete = 'current-password') {
  return `<div class="pw-wrap">
    <input id="${id}" class="text-input" type="password" placeholder="${placeholder}" autocomplete="${autocomplete}" aria-label="${placeholder}">
    <button type="button" class="pw-eye" data-eye="${id}" aria-label="Show password">👁</button></div>`;
}
function wireEyes(root) {
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-eye]');
    if (!b) return;
    const inp = document.getElementById(b.dataset.eye);
    const show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    b.textContent = show ? '🙈' : '👁';
    b.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  });
}

function teacherSignIn() {
  setPage(`
    ${header('Teacher sign in', '#/')}
    <main class="page-main narrow">
      <div class="panel-card">
        <button class="btn big google" data-google><span class="g">G</span> Sign in with Google</button>
        <div class="or"><span>or</span></div>
        <form id="email-form">
          <input id="t-email" class="text-input" type="email" placeholder="Email" autocomplete="email" aria-label="Email">
          ${passwordField('t-pass')}
          <div class="kp-row">
            <button class="btn primary big" data-mode="in">Sign in</button>
            <button class="btn big" data-mode="create">Create account</button>
          </div>
          <button type="button" class="linklike" data-forgot>Forgot password?</button>
        </form>
        <p class="warn" id="t-msg" hidden></p>
        <div class="or"><span>or</span></div>
        <button class="btn big ghost" data-guest>Continue as guest</button>
        <p class="muted small">Try it out without an account. Your classes stay on this device until you save your account.</p>
      </div>
    </main>`);
  wireEyes(page);
  const msg = (t) => {
    const m = $('t-msg');
    m.hidden = !t;
    m.textContent = t;
  };
  const done = () => {
    localStorage.setItem(TKEY, '1');
    go('#/teacher');
  };
  let mode = 'in';
  cloud(); // load now so the Google pop-up opens straight from the tap
  page.onclick = async (e) => {
    const m = e.target.closest('[data-mode]');
    if (m) return (mode = m.dataset.mode);
    const c = await cloud();
    try {
      if (e.target.closest('[data-google]')) {
        msg('');
        await c.signInGoogle();
        return done();
      }
      if (e.target.closest('[data-guest]')) {
        msg('');
        await c.teacherGuest();
        return done();
      }
      if (e.target.closest('[data-forgot]')) {
        const email = $('t-email').value.trim();
        if (!email) return msg('Type your email first, then tap “Forgot password?”.');
        await c.resetPassword(email);
        return msg('We’ve emailed you a link to reset your password.');
      }
    } catch (err) {
      console.error(err);
      msg(c.authMessage(err));
    }
  };
  page.onsubmit = async (e) => {
    e.preventDefault();
    const c = await cloud();
    const email = $('t-email').value.trim();
    const pass = $('t-pass').value;
    try {
      msg('');
      if (mode === 'create') await c.createEmailAccount(email, pass);
      else await c.signInEmail(email, pass);
      done();
    } catch (err) {
      console.error(err);
      msg(c.authMessage(err));
    }
  };
}

function upgradeEmailForm(c) {
  overlay(
    `<h2>Save your account</h2>
     <p class="muted">Keep your classes and use them on any device.</p>
     <form id="up-form">
       <input id="up-email" class="text-input" type="email" placeholder="Email" autocomplete="email" aria-label="Email">
       ${passwordField('up-pass', 'New password', 'new-password')}
       <p class="warn" id="up-msg" hidden></p>
       <div class="kp-row"><button type="button" class="btn" data-kp="cancel">Cancel</button><button class="btn primary">Save account</button></div>
     </form>`,
    { onClick: (e) => e.target.closest('[data-kp=cancel]') && closeOverlay() },
  );
  wireEyes($('overlay'));
  $('up-form').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await c.createEmailAccount($('up-email').value.trim(), $('up-pass').value);
      closeOverlay();
      toast('Account saved!');
      go('#/teacher');
    } catch (err) {
      const m = $('up-msg');
      m.hidden = false;
      m.textContent = c.authMessage(err);
    }
  };
}

function teacherDashboard(c, u) {
  let classes = null;
  const who = u.isAnonymous ? 'Guest' : esc(u.email || u.displayName || 'Teacher');
  const draw = () => {
    setPageKeep(`
      ${header('My classes', '#/', `<span class="who">${who}</span><button class="btn" data-signout>Sign out</button>`)}
      <main class="page-main">
        ${
          u.isAnonymous
            ? `<div class="banner">
                <div><b>You’re using a guest account.</b> Your classes are only saved on this device.
                Save your account to use them on your laptop and iPad.</div>
                <div class="banner-btns"><button class="btn" data-up="google">Save with Google</button><button class="btn" data-up="email">Save with email</button></div>
              </div>`
            : ''
        }
        <div class="tabs-row"><h2>Classes</h2><button class="btn primary big" data-newclass>＋ New class</button></div>
        ${
          classes === null
            ? `<div class="center-msg"><div class="spinner"></div></div>`
            : classes.length
              ? `<div class="class-list">${classes
                  .map(
                    (k) => `<a class="class-card" href="#/teacher/class/${esc(k.id)}">
                      <span class="class-name">${esc(k.name)}</span>
                      <span class="class-code">Code <b>${esc(k.code)}</b></span></a>`,
                  )
                  .join('')}</div>`
              : `<p class="empty">No classes yet. Tap <b>＋ New class</b> to make one.</p>`
        }
      </main>`);
  };
  setPage('');
  draw();
  track(
    c.watchMyClasses((list, e) => {
      if (e) {
        console.error(e);
        classes = [];
        draw();
        return toast('Could not load classes. Check the Firestore rules are published.');
      }
      classes = list;
      draw();
    }),
  );
  page.onclick = async (e) => {
    if (e.target.closest('[data-newclass]')) {
      const name = prompt('Class name (e.g. Room 12)');
      if (!name?.trim()) return;
      const id = c.createClass(name.trim().slice(0, 40));
      return go('#/teacher/class/' + id);
    }
    if (e.target.closest('[data-signout]')) {
      if (u.isAnonymous && !confirm('Sign out of the guest account? Guest classes can’t be opened again after signing out.')) return;
      await c.signOut();
      localStorage.removeItem(TKEY);
      return go('#/');
    }
    const up = e.target.closest('[data-up]')?.dataset.up;
    if (up === 'email') return upgradeEmailForm(c);
    if (up === 'google') {
      try {
        await c.signInGoogle();
        toast('Account saved!');
        go('#/teacher');
      } catch (err) {
        toast(c.authMessage(err), 4000);
      }
    }
  };
}

async function teacherClass(classId) {
  loading();
  const c = await cloud();
  const u = await c.getUser();
  if (!u) return go('#/teacher');
  let cls = null;
  let teams = [];
  let book = [];
  const secrets = {};
  const secretWatch = {};
  const joinUrl = () => `${APP_URL}#/join/${cls.code}`;

  const draw = () => {
    if (!cls) return;
    setPageKeep(`
      ${header(esc(cls.name), '#/teacher', `<button class="btn" data-rename-class>✎ Rename</button>`)}
      <main class="page-main">
        <section class="join-panel">
          <div class="qr-small">${qrSvg(c.qrcode, joinUrl())}</div>
          <div class="join-info">
            <div class="muted">Students scan the QR code, or go to the app and type:</div>
            <div class="big-code">${esc(cls.code)}</div>
            <div class="kp-row">
              <button class="btn primary" data-board>📺 Show on board</button>
              <a class="btn" href="#/teacher/cards/${esc(cls.id)}">🖨 Print team cards</a>
            </div>
          </div>
        </section>

        <div class="tabs-row"><h2>Teams</h2><button class="btn primary" data-addteam>＋ Add team</button></div>
        ${
          teams.length
            ? `<div class="team-table">${teams
                .map(
                  (t) => `<div class="team-row" data-tid="${esc(t.id)}">
                    <span class="team-dot" style="background:${teamColour(t.name)}"></span>
                    <span class="tname">${esc(t.name)}</span>
                    <span class="tcode" title="${esc(codeLabel(secrets[t.id]))}">${secrets[t.id] ? codeToPics(secrets[t.id]).join(' ') : '…'}</span>
                    <span class="tacts">
                      <a class="btn small primary" href="#/teacher/class/${esc(cls.id)}/team/${esc(t.id)}">Plays</a>
                      <button class="btn small" data-t="rename">Rename</button>
                      <button class="btn small" data-t="code">New code</button>
                      <button class="btn small danger" data-t="delete">Delete</button>
                    </span></div>`,
                )
                .join('')}</div>`
            : `<p class="empty">No teams yet. Students can make their own team when they join, or you can add them here.</p>`
        }

        <div class="tabs-row"><h2>⭐ Class playbook</h2></div>
        <p class="muted">Plays you share here can be opened and copied by every team. Open a team’s play and tap “Share to class playbook”.</p>
        <div class="play-list">${playCards(book, ['remove'])}</div>

        <details class="danger-zone">
          <summary>Reset or delete this class</summary>
          <p class="muted">Reset removes every team and their plays (for a new term). Delete removes the whole class.</p>
          <div class="kp-row"><button class="btn danger" data-reset>Reset class</button><button class="btn danger" data-delclass>Delete class</button></div>
        </details>
      </main>`);
  };

  setPage('');
  track(
    c.watchClass(classId, (k, e) => {
      if (e || !k) return problem(e ? 'Could not open this class.' : 'This class doesn’t exist any more.', '#/teacher');
      cls = k;
      draw();
    }),
  );
  track(
    c.watchTeams(classId, (list) => {
      if (!list) return;
      teams = list;
      for (const t of teams) {
        if (!secretWatch[t.id]) {
          secretWatch[t.id] = track(
            c.watchSecret(classId, t.id, (code) => {
              secrets[t.id] = code;
              draw();
            }),
          );
        }
      }
      draw();
    }),
  );
  track(
    c.watchPlaybook(classId, (list) => {
      if (!list) return;
      book = list;
      draw();
    }),
  );

  page.onclick = async (e) => {
    if (!cls) return;
    if (e.target.closest('[data-board]')) {
      return overlay(
        `<div class="board">
           <h1>${esc(cls.name)}</h1>
           <div class="qr-big">${qrSvg(c.qrcode, joinUrl())}</div>
           <p>Scan with your iPad camera, or open the app and type</p>
           <div class="big-code xl">${esc(cls.code)}</div>
           <button class="btn big" data-kp="close">Close</button>
         </div>`,
        { full: true, onClick: (ev) => ev.target.closest('[data-kp=close]') && closeOverlay() },
      );
    }
    if (e.target.closest('[data-rename-class]')) {
      const n = prompt('Class name', cls.name);
      if (n?.trim()) c.renameClass(cls.id, n.trim().slice(0, 40));
      return;
    }
    if (e.target.closest('[data-addteam]')) {
      const n = prompt('Team name');
      if (!n?.trim()) return;
      const name = cleanName(n).slice(0, 20);
      c.teacherCreateTeam(cls.id, name);
      return toast(`Added ${name}`);
    }
    const tb = e.target.closest('[data-t]');
    if (tb) {
      const t = teams.find((x) => x.id === tb.closest('[data-tid]').dataset.tid);
      if (!t) return;
      const act = tb.dataset.t;
      try {
        if (act === 'rename') {
          const n = prompt('Team name', t.name);
          if (n?.trim()) c.renameTeam(cls.id, t.id, cleanName(n).slice(0, 20));
        }
        if (act === 'code' && confirm(`Give ${t.name} a new picture code? They will need the new code to get back in.`)) {
          await c.newTeamCode(cls.id, t.id);
          toast('New code made');
        }
        if (act === 'delete' && confirm(`Delete ${t.name} and all of their plays?`)) {
          await c.deleteTeam(cls.id, t.id);
          toast('Team deleted');
        }
      } catch (err) {
        console.error(err);
        toast(offlineMsg(err) || 'That didn’t work. Check your internet and try again.');
      }
      return;
    }
    const a = cardAction(e);
    if (a) {
      if (a.act === 'open') go(`#/teacher/book/${cls.id}/${a.id}`);
      if (a.act === 'remove' && confirm('Remove this play from the class playbook?')) c.removeFromPlaybook(cls.id, a.id);
      return;
    }
    try {
      if (e.target.closest('[data-reset]') && confirm(`Reset ${cls.name}? This deletes every team and all their plays.`)) {
        await c.resetClass(cls.id);
        toast('Class reset');
      }
      if (e.target.closest('[data-delclass]') && confirm(`Delete ${cls.name} completely? This can’t be undone.`)) {
        cleanup();
        await c.deleteClass(cls.id, cls.code);
        toast('Class deleted');
        go('#/teacher');
      }
    } catch (err) {
      console.error(err);
      toast(offlineMsg(err) || 'That didn’t work. Check your internet and try again.');
    }
  };
}

async function teacherTeam(classId, teamId) {
  loading();
  const c = await cloud();
  await c.getUser();
  let team = null;
  let plays = null;
  let code = null;
  const draw = () => {
    setPageKeep(`
      ${header(team ? esc(team.name) : '…', `#/teacher/class/${esc(classId)}`, `<a class="btn" href="#/teacher/print/${esc(classId)}/${esc(teamId)}">🖨 Print / PDF</a>`)}
      <main class="page-main">
        <p class="muted">Picture code: <span class="tcode">${code ? codeToPics(code).join(' ') : '…'}</span> ${code ? `(${esc(codeLabel(code))})` : ''}</p>
        ${plays === null ? '<div class="center-msg"><div class="spinner"></div></div>' : ''}
        <div class="play-list">${playCards(plays || [], ['share'])}</div>
        ${plays && !plays.length ? `<p class="empty">This team hasn’t made any plays yet.</p>` : ''}
      </main>`);
  };
  setPage('');
  draw();
  track(c.watchTeams(classId, (list) => ((team = list?.find((t) => t.id === teamId) || team), draw())));
  track(c.watchSecret(classId, teamId, (k) => ((code = k), draw())));
  track(
    c.watchPlays(classId, teamId, (list, e) => {
      if (e) console.error(e);
      plays = list || [];
      teacherPlaysCache = plays;
      draw();
    }),
  );
  page.onclick = (e) => {
    const a = cardAction(e);
    if (!a) return;
    const p = (plays || []).find((x) => x.id === a.id);
    if (!p) return;
    if (a.act === 'open') go(`#/teacher/view/${classId}/${teamId}/${a.id}`);
    if (a.act === 'share') c.shareToPlaybook(classId, p, team?.name), toast('Shared to the class playbook ⭐');
  };
}
let teacherPlaysCache = [];

function fullscreenAction() {
  const el = document.documentElement;
  if (!el.requestFullscreen && !el.webkitRequestFullscreen) return [];
  return [
    {
      label: '⛶ Full screen',
      onClick: () => {
        if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
        else (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
      },
    },
  ];
}

async function teacherViewPlay(classId, teamId, playId) {
  const c = await cloud();
  await c.getUser();
  let teamName = '';
  const p = await waitForList(() => teacherPlaysCache, playId, (cb) => c.watchPlays(classId, teamId, cb));
  if (!p) return go(`#/teacher/class/${classId}/team/${teamId}`);
  track(c.watchTeams(classId, (list) => (teamName = list?.find((t) => t.id === teamId)?.name || teamName)));
  openDesigner(clone(p), {
    readOnly: true,
    back: () => go(`#/teacher/class/${classId}/team/${teamId}`),
    actions: [
      ...fullscreenAction(),
      {
        label: '⭐ Share to class playbook',
        cls: 'primary',
        onClick: (pl) => {
          c.shareToPlaybook(classId, pl, teamName);
          toast('Shared to the class playbook ⭐');
        },
      },
    ],
  });
}

async function teacherBookPlay(classId, playId) {
  const c = await cloud();
  await c.getUser();
  let cache = [];
  const p = await waitForList(() => cache, playId, (cb) => c.watchPlaybook(classId, cb));
  if (!p) return go(`#/teacher/class/${classId}`);
  openDesigner(clone(p), {
    readOnly: true,
    subtitle: p.fromTeam ? `From ${p.fromTeam}` : '',
    back: () => go(`#/teacher/class/${classId}`),
    actions: [
      ...fullscreenAction(),
      {
        label: 'Remove from playbook',
        cls: 'danger',
        onClick: () => {
          if (!confirm('Remove this play from the class playbook?')) return;
          c.removeFromPlaybook(classId, playId);
          go(`#/teacher/class/${classId}`);
        },
      },
    ],
  });
}

async function teacherCards(classId) {
  loading();
  const c = await cloud();
  await c.getUser();
  let cls = null;
  let teams = [];
  const secrets = {};
  const watched = {};
  const draw = () => {
    if (!cls) return;
    setPageKeep(`
      <div class="no-print">${header('Team cards', `#/teacher/class/${esc(classId)}`, `<button class="btn primary" onclick="print()">🖨 Print</button>`)}
      <p class="muted page-main">Cut these out and give one to each team. Scanning the card takes them straight into their team.</p></div>
      <div class="cards-print">
        ${teams
          .map((t) => {
            const code = secrets[t.id];
            const url = code ? `${APP_URL}#/t/${cls.id}/${t.id}/${code}` : '';
            return `<div class="team-card">
              <div class="tc-head"><span class="team-dot" style="background:${teamColour(t.name)}"></span><b>${esc(t.name)}</b></div>
              <div class="tc-qr">${code ? qrSvg(c.qrcode, url) : ''}</div>
              <div class="tc-pics">${code ? codeToPics(code).join(' ') : '…'}</div>
              <div class="tc-foot">${esc(cls.name)} · X-O Gridiron</div>
            </div>`;
          })
          .join('')}
      </div>
      ${teams.length ? '' : '<p class="empty page-main">No teams yet.</p>'}`);
  };
  setPage('');
  track(c.watchClass(classId, (k) => ((cls = k), draw())));
  track(
    c.watchTeams(classId, (list) => {
      teams = list || [];
      teams.forEach((t) => {
        if (watched[t.id]) return;
        watched[t.id] = track(c.watchSecret(classId, t.id, (code) => ((secrets[t.id] = code), draw())));
      });
      draw();
    }),
  );
}

async function teacherPrint(classId, teamId) {
  loading();
  const c = await cloud();
  await c.getUser();
  let team = null;
  let plays = [];
  const draw = () => {
    setPageKeep(`
      <div class="no-print">${header('Print playbook', `#/teacher/class/${esc(classId)}/team/${esc(teamId)}`, `<button class="btn primary" onclick="print()">🖨 Print / Save as PDF</button>`)}</div>
      <div class="print-book">
        <h1>${team ? esc(team.name) : ''} — Playbook</h1>
        <div class="print-grid">
          ${plays.map((p) => `<figure>${svgOpen('psvg')}${renderPlay(p)}</svg><figcaption>${esc(p.name)}</figcaption></figure>`).join('')}
        </div>
      </div>`);
  };
  setPage('');
  track(c.watchTeams(classId, (list) => ((team = list?.find((t) => t.id === teamId)), draw())));
  track(c.watchPlays(classId, teamId, (list) => ((plays = list || []), draw())));
}

/* ================= ROUTER ================= */
const routes = [
  [/^$|^#\/?$|^#\/join$/, landing],
  [/^#\/try$/, localHome],
  [/^#\/try\/play\/(.+)$/, localPlay],
  [/^#\/play\/(.+)$/, (id) => go('#/try/play/' + id)], // old links
  [/^#\/join\/([A-Za-z0-9]+)$/, (code) => joinClass(code.toUpperCase())],
  [/^#\/t\/([^/]+)\/([^/]+)\/([0-9-]+)$/, cardJoin],
  [/^#\/team$/, teamHome],
  [/^#\/team\/play\/(.+)$/, teamPlay],
  [/^#\/team\/book\/(.+)$/, teamBookPlay],
  [/^#\/teacher$/, teacherHome],
  [/^#\/teacher\/class\/([^/]+)$/, teacherClass],
  [/^#\/teacher\/class\/([^/]+)\/team\/([^/]+)$/, teacherTeam],
  [/^#\/teacher\/view\/([^/]+)\/([^/]+)\/([^/]+)$/, teacherViewPlay],
  [/^#\/teacher\/book\/([^/]+)\/([^/]+)$/, teacherBookPlay],
  [/^#\/teacher\/cards\/([^/]+)$/, teacherCards],
  [/^#\/teacher\/print\/([^/]+)\/([^/]+)$/, teacherPrint],
];

function route() {
  cleanup();
  closeOverlay();
  const h = location.hash;
  for (const [re, fn] of routes) {
    const m = h.match(re);
    if (m) {
      Promise.resolve(fn(...m.slice(1).map(decodeURIComponent))).catch((e) => {
        console.error(e);
        problem('Something went wrong. Check your internet and try again.');
      });
      return;
    }
  }
  go('#/');
}
window.addEventListener('hashchange', route);
route();

// Warm up Firebase in the background so joining feels instant.
if (getSession() || isTeacherDevice()) cloud().catch(() => {});

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

export { renderActions };
