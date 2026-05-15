// ============ BOOT SEQUENCE ============
const BOOT_LINES = [
  { text: 'POST  ........................ ',                  result: 'OK',     cls: 'ok',   delay: 220 },
  { text: 'kernel ...................... ',                   result: 'LOADED', cls: 'ok',   delay: 180 },
  { text: 'memory check  16384 MB ....... ',                  result: 'OK',     cls: 'ok',   delay: 140 },
  { text: 'mount /dev/dispatch .......... ',                  result: 'OK',     cls: 'ok',   delay: 120 },
  { text: 'persona registry  11 entries . ',                  result: 'OK',     cls: 'ok',   delay: 140 },
  { text: 'state synchronization ........ ',                  result: 'OK',     cls: 'ok',   delay: 120 },
  { text: 'establishing uplink .......... ',                  result: 'LIVE',   cls: 'ok',   delay: 200 },
  { text: 'CRT calibration .............. ',                  result: 'OK',     cls: 'ok',   delay: 100 },
  { text: 'dangerous mode ............... ',                  result: 'ARMED',  cls: 'warn', delay: 220 },
  { text: '',                                                  result: '',       cls: 'dim',  delay: 120 },
  { text: 'SYSTEM READY',                                      result: '',       cls: 'ready', delay: 360 },
];

let bootSkipped = false;

function runBoot() {
  const log = document.getElementById('boot-log');
  const fill = document.getElementById('boot-bar-fill');
  const pct = document.getElementById('boot-bar-pct');
  const text = document.getElementById('boot-bar-text');
  let i = 0;
  let progress = 0;
  const total = BOOT_LINES.length;

  function step() {
    if (bootSkipped) { finishBoot(); return; }
    if (i >= total) { finishBoot(); return; }
    const line = BOOT_LINES[i];
    const span = document.createElement('div');
    if (line.result) {
      span.innerHTML = `<span class="${line.cls === 'warn' ? 'info' : 'info'}">${line.text}</span><span class="${line.cls}">[ ${line.result} ]</span>`;
    } else {
      span.innerHTML = `<span class="${line.cls}">${line.text || '&nbsp;'}</span>`;
    }
    log.appendChild(span);
    i++;
    progress = Math.round((i / total) * 100);
    fill.style.width = progress + '%';
    pct.textContent = progress + '%';
    if (i === total) text.textContent = 'BOOT COMPLETE';
    setTimeout(step, line.delay);
  }
  step();
}

function finishBoot() {
  if (state.bootDone) return;
  state.bootDone = true;
  bootSkipped = true;
  const fill = document.getElementById('boot-bar-fill');
  const pct = document.getElementById('boot-bar-pct');
  const text = document.getElementById('boot-bar-text');
  fill.style.width = '100%';
  pct.textContent = '100%';
  text.textContent = 'BOOT COMPLETE';
  setTimeout(() => showScreenRaw('studio-screen'), 250);
  setTimeout(() => runStudio(), 350);
}

// ============ STUDIO SPLASH ============
function runStudio() {
  // CSS animations carry the timing; total length ~3.0s (last animation ends ~2.8s)
  setTimeout(() => {
    if (state.studioDone) return;
    state.studioDone = true;
    showScreenRaw('title-screen');
  }, 3000);
}

function skipStudio() {
  if (state.studioDone) return;
  state.studioDone = true;
  showScreenRaw('title-screen');
}

// ============ TITLE GATE (PRESS START) ============
function openTitleGate() {
  if (state.titleGateOpen) return;
  state.titleGateOpen = true;
  // Lightning strike: flash overlay + electric arcs + logo materialize
  const flash = document.getElementById('lightning-flash');
  const logo  = document.getElementById('title-logo');
  const arcs  = document.getElementById('title-arcs');
  if (flash) {
    flash.classList.remove('fire');
    void flash.offsetWidth;
    flash.classList.add('fire');
  }
  if (logo) {
    logo.classList.remove('strike');
    logo.style.opacity = '';
    void logo.offsetWidth;
    logo.classList.add('strike');
    // Belt-and-suspenders: lock opacity to 1 once the strike settles, so the
    // infinite glow loop can't accidentally revert to the base opacity:0 state.
    setTimeout(() => { logo.style.opacity = '1'; }, 1600);
  }
  if (arcs) {
    arcs.classList.remove('fire');
    void arcs.offsetWidth;
    arcs.classList.add('fire');
  }
  // Hide press-start immediately, reveal menu after the strike crests (~700ms)
  document.getElementById('press-start').classList.add('hidden');
  setTimeout(() => {
    document.getElementById('title-menu').classList.remove('gated');
    setKbdIndex(0, '#title-menu .menu-item');
  }, 700);
}

function showScreenRaw(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  const t = document.getElementById(id);
  if (t) t.classList.remove('hidden');
  state.currentScreen = id;
}

// ============ CLICK HANDLERS FOR BOOT / STUDIO / PRESS START ============
document.getElementById('boot-screen').addEventListener('click', () => { tryStartAudio(); finishBoot(); });
document.getElementById('studio-screen').addEventListener('click', () => { tryStartAudio(); skipStudio(); });
document.getElementById('press-start').addEventListener('click', () => { tryStartAudio(); openTitleGate(); });
document.getElementById('title-screen').addEventListener('click', (e) => {
  if (!state.titleGateOpen && !e.target.closest('.menu-item')) { tryStartAudio(); openTitleGate(); }
});

// ============ AUDIO ============
const bgm = document.getElementById('bgm');
bgm.volume = 0.40;
const audioToggle = document.getElementById('audio-toggle');
let audioStarted = false;

function tryStartAudio() {
  if (audioStarted) return;
  audioStarted = true;
  bgm.play().then(() => {
    audioToggle.classList.remove('muted');
    audioToggle.innerHTML = '[ &#9834; MUSIC ON ]';
  }).catch((e) => {
    console.warn('audio autoplay blocked', e);
    audioStarted = false;
  });
}

// ============ PERSONA INTRO PLAYBACK ============
const introAudio = document.getElementById('intro-audio');
let bgmDuckedFromVolume = null;

// Track the currently-bound listeners so we can detach them before binding
// new ones. Avoids "single-deploy ended -> restore music" firing during a
// team-deploy queue.
let _introOnEnded = null;
let _introOnError = null;
function clearIntroListeners() {
  if (_introOnEnded) introAudio.removeEventListener('ended', _introOnEnded);
  if (_introOnError) introAudio.removeEventListener('error', _introOnError);
  _introOnEnded = null;
  _introOnError = null;
  introAudio.pause();
  try { introAudio.currentTime = 0; } catch {}
}

function duckBgm() {
  if (!bgm.paused && bgmDuckedFromVolume === null) {
    bgmDuckedFromVolume = bgm.volume;
    bgm.volume = Math.min(bgm.volume, 0.10);
  }
}

function playPersonaIntro(personaKey) {
  // Single-deploy: play the long intro (~15 sec dossier line)
  clearIntroListeners();
  introAudio.src = `/launcher/assets/intros/${personaKey}.mp3`;
  introAudio.volume = 1.0;
  duckBgm();
  _introOnEnded = restoreBgm;
  _introOnError = restoreBgm;
  introAudio.addEventListener('ended', _introOnEnded);
  introAudio.addEventListener('error', _introOnError);
  introAudio.play().catch((e) => {
    console.warn('[INTRO] playback failed', e);
    restoreBgm();
  });
}

function playTeamDeploySequence(personaKeys) {
  // Team-deploy: queue the short "<name> deployed" stubs back to back so the
  // user hears every operative announce themselves without any one of them
  // running long enough to drown the rest.
  if (!personaKeys || !personaKeys.length) return;
  clearIntroListeners();
  introAudio.volume = 1.0;
  duckBgm();
  const queue = personaKeys.map(k => `/launcher/assets/intros/${k}-deploy.mp3`);
  let i = 0;
  const playNext = () => {
    if (i >= queue.length) {
      restoreBgm();
      return;
    }
    introAudio.src = queue[i++];
    introAudio.play().catch(() => setTimeout(playNext, 50));
  };
  _introOnEnded = playNext;
  _introOnError = () => setTimeout(playNext, 50);
  introAudio.addEventListener('ended', _introOnEnded);
  introAudio.addEventListener('error', _introOnError);
  playNext();
}

function restoreBgm() {
  if (bgmDuckedFromVolume !== null) {
    // Smooth fade back up over 600ms
    const target = bgmDuckedFromVolume;
    bgmDuckedFromVolume = null;
    const start = bgm.volume;
    const steps = 12;
    let i = 0;
    const iv = setInterval(() => {
      i++;
      bgm.volume = start + (target - start) * (i / steps);
      if (i >= steps) { bgm.volume = target; clearInterval(iv); }
    }, 50);
  }
}

audioToggle.addEventListener('click', (e) => {
  e.stopPropagation();
  if (bgm.paused) {
    bgm.play().then(() => {
      audioStarted = true;
      audioToggle.classList.remove('muted');
      audioToggle.innerHTML = '[ &#9834; MUSIC ON ]';
    }).catch(() => {});
  } else {
    bgm.pause();
    audioToggle.classList.add('muted');
    audioToggle.innerHTML = '[ &#9834; MUSIC OFF ]';
  }
});
