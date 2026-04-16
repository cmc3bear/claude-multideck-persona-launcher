// MultiDeck Audio Feed page renderer.
// Serves a cyberpunk-themed auto-playing browser page that polls /audio-feed/list
// and plays new Kokoro MP3 files as they appear in dispatch/tts-output/.

function renderAudioFeedPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>// MULTIDECK AUDIO FEED //</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #0a0014;
    color: #c0e0ff;
    font-family: 'VT323', monospace;
    min-height: 100vh;
    padding: 20px;
    overflow-x: hidden;
  }
  body::before {
    content: '';
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: repeating-linear-gradient(0deg, rgba(0,255,204,0.03) 0, rgba(0,255,204,0.03) 1px, transparent 1px, transparent 3px);
    pointer-events: none; z-index: 9999;
  }
  h1 {
    font-family: 'Press Start 2P', monospace;
    font-size: 22px;
    color: #00FFCC;
    text-shadow: 0 0 10px #00FFCC;
    letter-spacing: 3px;
    margin-bottom: 4px;
  }
  .sub {
    font-size: 14px;
    color: #607090;
    letter-spacing: 2px;
    margin-bottom: 30px;
  }
  .now-playing {
    border: 2px solid #00FFCC;
    padding: 20px;
    margin-bottom: 20px;
    box-shadow: 0 0 30px rgba(0,255,204,0.25);
    min-height: 100px;
  }
  .now-playing.idle { border-color: #607090; box-shadow: none; }
  .np-label {
    font-family: 'Press Start 2P', monospace;
    font-size: 11px;
    color: #00FFCC;
    letter-spacing: 2px;
    margin-bottom: 10px;
  }
  .now-playing.idle .np-label { color: #607090; }
  .np-file { font-size: 20px; color: #c0e0ff; margin-bottom: 12px; }
  .queue-label {
    font-family: 'Press Start 2P', monospace;
    font-size: 11px;
    color: #FF00AA;
    letter-spacing: 2px;
    margin-top: 30px;
    margin-bottom: 10px;
    text-shadow: 0 0 6px #FF00AA;
  }
  ul { list-style: none; }
  li {
    padding: 8px 12px;
    border-left: 2px solid #607090;
    margin-bottom: 4px;
    font-size: 16px;
    color: #90a0c0;
  }
  li.played {
    border-left-color: #22C55E;
    color: #607090;
    text-decoration: line-through;
  }
  li.current {
    border-left-color: #00FFCC;
    color: #00FFCC;
    text-shadow: 0 0 6px #00FFCC;
  }
  .controls { display: flex; gap: 12px; margin-top: 20px; flex-wrap: wrap; }
  button {
    font-family: 'Press Start 2P', monospace;
    font-size: 11px;
    padding: 10px 18px;
    background: transparent;
    border: 2px solid #607090;
    color: #c0e0ff;
    cursor: pointer;
    letter-spacing: 2px;
  }
  button:hover {
    border-color: #00FFCC;
    color: #00FFCC;
    text-shadow: 0 0 6px #00FFCC;
  }
  button.on {
    background: rgba(0,255,204,0.1);
    border-color: #00FFCC;
    color: #00FFCC;
  }
  .status {
    position: fixed;
    top: 20px;
    right: 20px;
    font-size: 13px;
    color: #607090;
    letter-spacing: 1px;
    font-family: 'VT323', monospace;
  }
  .status .dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #22C55E;
    margin-right: 6px;
    box-shadow: 0 0 6px #22C55E;
    animation: pulse 2s infinite;
  }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
  audio { display: none; }
  .hint {
    color: #607090;
    font-size: 14px;
    margin-top: 10px;
    line-height: 1.5;
  }
</style>
</head>
<body>
  <div class="status"><span class="dot"></span>POLLING</div>
  <h1>// MULTIDECK AUDIO FEED //</h1>
  <div class="sub">// auto-play Kokoro TTS messages from your stream</div>

  <div class="now-playing idle" id="now-playing">
    <div class="np-label">NOT PLAYING</div>
    <div class="np-file" id="np-file">Leave this tab open. New audio will play automatically.</div>
    <audio id="player" preload="none"></audio>
    <div class="hint">Browsers may block autoplay until you interact with the page once. Click RESUME or any button to unlock.</div>
  </div>

  <div class="controls">
    <button id="autoplay-toggle" class="on" onclick="toggleAutoplay()">AUTOPLAY: ON</button>
    <button onclick="markAllPlayed()">SKIP ALL</button>
    <button onclick="document.getElementById('player').pause()">PAUSE</button>
    <button onclick="resumePlayback()">RESUME</button>
  </div>

  <div class="queue-label">// FEED HISTORY</div>
  <ul id="history"></ul>

<script>
  const player = document.getElementById('player');
  const npEl = document.getElementById('now-playing');
  const npFile = document.getElementById('np-file');
  const historyEl = document.getElementById('history');
  const autoplayBtn = document.getElementById('autoplay-toggle');

  let playedFiles = new Set(JSON.parse(sessionStorage.getItem('multideck-audio-played') || '[]'));
  let playQueue = [];
  let allFiles = [];
  let autoplayEnabled = true;
  let currentFile = null;

  function savePlayed() {
    sessionStorage.setItem('multideck-audio-played', JSON.stringify(Array.from(playedFiles)));
  }

  function renderHistory() {
    historyEl.innerHTML = allFiles.slice().reverse().map((f) => {
      let cls = 'pending';
      if (f.filename === currentFile) cls = 'current';
      else if (playedFiles.has(f.filename)) cls = 'played';
      return '<li class="' + cls + '">' + f.filename + '</li>';
    }).join('');
  }

  function markPlaying(filename) {
    currentFile = filename;
    npEl.classList.remove('idle');
    npEl.querySelector('.np-label').textContent = 'NOW PLAYING';
    npFile.textContent = filename;
    renderHistory();
  }

  function markIdle() {
    currentFile = null;
    npEl.classList.add('idle');
    npEl.querySelector('.np-label').textContent = 'NOT PLAYING';
    npFile.textContent = 'Waiting for next audio...';
    renderHistory();
  }

  function playNext() {
    if (!autoplayEnabled) return;
    if (playQueue.length === 0) {
      markIdle();
      return;
    }
    const next = playQueue.shift();
    markPlaying(next);
    player.src = '/audio-feed/mp3/' + encodeURIComponent(next);
    player.play().catch((err) => {
      console.warn('Autoplay blocked:', err);
      playedFiles.add(next);
      savePlayed();
      setTimeout(playNext, 1000);
    });
  }

  player.addEventListener('ended', () => {
    if (currentFile) { playedFiles.add(currentFile); savePlayed(); }
    playNext();
  });

  player.addEventListener('error', () => {
    if (currentFile) { playedFiles.add(currentFile); savePlayed(); }
    playNext();
  });

  async function poll() {
    try {
      const r = await fetch('/audio-feed/list');
      const data = await r.json();
      allFiles = data.files || [];
      const newFiles = allFiles
        .filter((f) => !playedFiles.has(f.filename) && !playQueue.includes(f.filename) && f.filename !== currentFile)
        .map((f) => f.filename);
      if (newFiles.length > 0) {
        playQueue.push(...newFiles);
        if (player.paused && !currentFile) {
          playNext();
        }
      }
      renderHistory();
    } catch (e) {
      console.warn('Poll error:', e);
    }
  }

  function toggleAutoplay() {
    autoplayEnabled = !autoplayEnabled;
    autoplayBtn.textContent = 'AUTOPLAY: ' + (autoplayEnabled ? 'ON' : 'OFF');
    autoplayBtn.classList.toggle('on', autoplayEnabled);
    if (autoplayEnabled && player.paused && playQueue.length > 0 && !currentFile) {
      playNext();
    }
  }

  function markAllPlayed() {
    allFiles.forEach((f) => playedFiles.add(f.filename));
    playQueue = [];
    player.pause();
    savePlayed();
    markIdle();
  }

  function resumePlayback() {
    if (currentFile) {
      player.play();
    } else if (playQueue.length > 0) {
      playNext();
    }
  }

  poll();
  setInterval(poll, 4000);
</script>
</body>
</html>`;
}

module.exports = { renderAudioFeedPage };
