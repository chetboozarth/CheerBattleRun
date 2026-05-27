const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const hudLevel = document.getElementById("hudLevel");
const hudLives = document.getElementById("hudLives");
const hudScore = document.getElementById("hudScore");

const GAME_WIDTH = canvas.width;
const GAME_HEIGHT = canvas.height;
const GROUND_Y = 600;

const difficultyMap = {
  "cake walk": { speed: 3.9, levelRamp: 0.2, enemyRate: 0.0025, wormRate: 0.007, bossHp: 3, bossDelay: 2300, projectileCadence: 130, lifeBonusEvery: 1100 },
  "pretty easy": { speed: 5.0, levelRamp: 0.35, enemyRate: 0.005, wormRate: 0.012, bossHp: 5, bossDelay: 2000, projectileCadence: 105, lifeBonusEvery: 1450 },
  "kinda hard": { speed: 6.3, levelRamp: 0.6, enemyRate: 0.009, wormRate: 0.017, bossHp: 8, bossDelay: 1750, projectileCadence: 86, lifeBonusEvery: 1800 },
  "this is definitely hard": { speed: 7.6, levelRamp: 0.8, enemyRate: 0.014, wormRate: 0.023, bossHp: 11, bossDelay: 1600, projectileCadence: 74, lifeBonusEvery: 2200 },
  "SUPER TOUGH": { speed: 9.2, levelRamp: 1.05, enemyRate: 0.02, wormRate: 0.031, bossHp: 14, bossDelay: 1450, projectileCadence: 62, lifeBonusEvery: 2800 }
};

const keys = { left: false, right: false, jump: false, tumble: false };
let soundOn = true;
let selectedDifficulty = "pretty easy";
let scene = "home";
let level = 1;
let score = 0;
let lives = 10;
let crowns = 0;
let frame = 0;
let levelTimer = 0;
let bossMode = false;
let boss = null;
let messageTimer = 0;
let softMessage = "";

const player = {
  x: 200,
  y: GROUND_Y - 130,
  w: 76,
  h: 130,
  vy: 0,
  onGround: true,
  facing: 1,
  action: "run",
  anim: 0,
  invuln: 0
};

let worms = [];
let enemies = [];
let collectibles = [];
let powerups = [];
let projectiles = [];

const menuItems = [
  { id: "start", label: "Start Game" },
  { id: "difficulty", label: "Difficulty" },
  { id: "sound", label: "Sound" },
  { id: "controls", label: "Controls" },
  { id: "restart", label: "Reset Progress" }
];
let menuIndex = 0;

let audioCtx = null;
let homeSongPlayed = false;
let homeSongTimeouts = [];
let gameplayBeatId = null;
let gameplayHarmonyId = null;

function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
}

function tone(freq, duration, type = "triangle", volume = 0.08, when = 0) {
  if (!soundOn || !audioCtx) return;
  const t = audioCtx.currentTime + when;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(volume, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

function voiceCheer(style = "go") {
  if (!soundOn || !audioCtx) return;
  if (style === "go") {
    tone(410, 0.08, "square", 0.1, 0);
    tone(520, 0.09, "triangle", 0.08, 0.06);
  } else if (style === "woo") {
    tone(360, 0.12, "sawtooth", 0.07, 0);
    tone(600, 0.15, "triangle", 0.08, 0.12);
  } else if (style === "hit") {
    tone(240, 0.07, "square", 0.1, 0);
  }
}

function playHomeSongOnce() {
  stopGameplayMusic();
  homeSongTimeouts.forEach(clearTimeout);
  homeSongTimeouts = [];
  if (!soundOn) return;
  ensureAudio();
  if (homeSongPlayed) return;
  homeSongPlayed = true;
  const seq = [523, 659, 784, 659, 880, 784, 659, 523, 659, 440];
  seq.forEach((n, i) => {
    const id = setTimeout(() => tone(n, 0.23, "square", 0.07), i * 240);
    homeSongTimeouts.push(id);
  });
}

function startGameplayMusic() {
  if (!soundOn) return;
  ensureAudio();
  stopGameplayMusic();
  const beat = () => {
    tone(100, 0.06, "square", 0.06);
    tone(140, 0.05, "square", 0.04, 0.15);
  };
  const harmony = () => {
    tone(392, 0.17, "triangle", 0.05);
    tone(494, 0.17, "triangle", 0.045, 0.2);
    tone(587, 0.17, "triangle", 0.045, 0.4);
  };
  beat();
  harmony();
  gameplayBeatId = setInterval(beat, 620);
  gameplayHarmonyId = setInterval(harmony, 760);
}

function stopGameplayMusic() {
  if (gameplayBeatId) clearInterval(gameplayBeatId);
  if (gameplayHarmonyId) clearInterval(gameplayHarmonyId);
  gameplayBeatId = null;
  gameplayHarmonyId = null;
}

function resetLevelState() {
  worms = [];
  enemies = [];
  collectibles = [];
  powerups = [];
  projectiles = [];
  player.x = 200;
  player.y = GROUND_Y - player.h;
  player.vy = 0;
  player.onGround = true;
  player.invuln = 0;
  frame = 0;
  levelTimer = 0;
  bossMode = false;
  boss = null;
  softMessage = "";
  messageTimer = 0;
}

function startGame() {
  scene = "play";
  level = 1;
  score = 0;
  lives = 10;
  crowns = 0;
  resetLevelState();
  startGameplayMusic();
}

function startLevel(n) {
  level = n;
  resetLevelState();
  scene = "play";
  startGameplayMusic();
}

function spawnWorm(speed) {
  worms.push({ x: GAME_WIDTH + 30, y: GROUND_Y - 24, w: 48, h: 24, speed });
}

function spawnEnemy(speed) {
  enemies.push({
    x: GAME_WIDTH + 40,
    y: GROUND_Y - 88,
    w: 54,
    h: 88,
    speed,
    hp: 2 + Math.floor(level / 2)
  });
}

function spawnCollectible(speed) {
  const kinds = ["star", "megaphone", "bow"];
  const kind = kinds[Math.floor(Math.random() * kinds.length)];
  collectibles.push({
    kind,
    x: GAME_WIDTH + 20,
    y: 350 + Math.random() * 170,
    r: 18,
    speed
  });
}

function spawnPowerup(speed) {
  powerups.push({ x: GAME_WIDTH + 20, y: 360 + Math.random() * 120, r: 20, speed });
}

function spawnBoss() {
  bossMode = true;
  const hp = difficultyMap[selectedDifficulty].bossHp + (level - 1) * 2;
  boss = {
    x: GAME_WIDTH - 280,
    y: GROUND_Y - 170,
    w: 130,
    h: 170,
    hp,
    maxHp: hp,
    swing: 0
  };
}

function rectHit(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function circleRectHit(c, r) {
  const cx = Math.max(r.x, Math.min(c.x, r.x + r.w));
  const cy = Math.max(r.y, Math.min(c.y, r.y + r.h));
  const dx = c.x - cx;
  const dy = c.y - cy;
  return dx * dx + dy * dy < c.r * c.r;
}

function loseLife() {
  if (player.invuln > 0) return;
  lives -= 1;
  player.invuln = 90;
  voiceCheer("hit");
  softMessage = "Keep Tumbling!";
  messageTimer = 80;
  if (lives <= 0) {
    scene = "gameOver";
    stopGameplayMusic();
  }
}

function winLevel() {
  stopGameplayMusic();
  if (level >= 3) {
    crowns += 1;
    scene = "danceParty";
    return;
  }
  scene = "levelClear";
}

function updatePlay() {
  frame += 1;
  levelTimer += 1;
  if (player.invuln > 0) player.invuln -= 1;

  const d = difficultyMap[selectedDifficulty];
  const baseSpeed = d.speed + (level - 1) * d.levelRamp;

  if (!bossMode) {
    if (Math.random() < d.wormRate) spawnWorm(baseSpeed + Math.random() * 2);
    if (Math.random() < d.enemyRate) spawnEnemy(baseSpeed + Math.random() * 1.8);
    if (Math.random() < 0.018) spawnCollectible(baseSpeed * 0.8);
    if (Math.random() < 0.008) spawnPowerup(baseSpeed * 0.7);
    if (levelTimer > d.bossDelay) spawnBoss();
  }

  if (!bossMode) {
    player.action = Math.abs(player.vy) > 0.3 ? "jump" : (keys.tumble ? "tumble" : "run");
  }
  if (keys.left) player.x = Math.max(70, player.x - 4.3);
  if (keys.right) player.x = Math.min(520, player.x + 4.3);
  if (keys.left) player.facing = -1;
  if (keys.right) player.facing = 1;

  player.vy += 0.84;
  player.y += player.vy;
  if (player.y >= GROUND_Y - player.h) {
    player.y = GROUND_Y - player.h;
    player.vy = 0;
    player.onGround = true;
  } else {
    player.onGround = false;
  }

  worms.forEach((w) => (w.x -= w.speed));
  enemies.forEach((e) => (e.x -= e.speed));
  collectibles.forEach((c) => (c.x -= c.speed));
  powerups.forEach((p) => (p.x -= p.speed));
  projectiles.forEach((p) => (p.x += p.vx));

  worms = worms.filter((w) => w.x + w.w > -30);
  enemies = enemies.filter((e) => e.x + e.w > -30 && e.hp > 0);
  collectibles = collectibles.filter((c) => c.x + c.r > -30);
  powerups = powerups.filter((p) => p.x + p.r > -30);
  projectiles = projectiles.filter((p) => p.x < GAME_WIDTH + 50);

  worms.forEach((w) => {
    if (rectHit(player, w)) {
      if (player.vy > 2 && player.y + player.h - 10 < w.y + 10) {
        score += 120;
        w.x = -200;
        voiceCheer("woo");
      } else {
        loseLife();
      }
    }
  });

  enemies.forEach((e) => {
    if (rectHit(player, e)) {
      if (keys.tumble || player.action === "jump") {
        e.hp -= 1;
        score += 140;
        voiceCheer("go");
      } else {
        loseLife();
      }
    }
  });

  collectibles.forEach((c) => {
    if (circleRectHit(c, player)) {
      score += c.kind === "megaphone" ? 180 : 120;
      c.x = -100;
      voiceCheer("woo");
      if (score > 0 && score % d.lifeBonusEvery < 140) {
        lives += 1;
        softMessage = "Extra Life!";
        messageTimer = 70;
      }
    }
  });

  powerups.forEach((p) => {
    if (circleRectHit(p, player)) {
      lives += 1;
      score += 240;
      p.x = -100;
      softMessage = "Power Up +1 Life";
      messageTimer = 80;
      voiceCheer("go");
    }
  });

  if (bossMode && boss) {
    boss.swing += 0.06;
    boss.y = GROUND_Y - 170 + Math.sin(boss.swing) * 8;
    if (boss.x > 760) boss.x -= 1.8;
    if (frame % d.projectileCadence === 0) {
      projectiles.push({
        x: boss.x - 6,
        y: boss.y + 60,
        r: 13,
        vx: -(7 + Math.random() * 2)
      });
    }
    if ((keys.tumble || player.action === "jump") && rectHit(player, boss)) {
      boss.hp -= 1;
      score += 220;
      voiceCheer("go");
      player.vy = -9;
      player.y -= 10;
      if (boss.hp <= 0) winLevel();
    } else if (rectHit(player, boss)) {
      loseLife();
    }
  }

  projectiles.forEach((p) => {
    if (circleRectHit(p, player)) {
      loseLife();
      p.x = GAME_WIDTH + 100;
    }
  });

  if (messageTimer > 0) messageTimer -= 1;
  hudLevel.textContent = `Level ${level}`;
  hudLives.textContent = `Lives: ${lives}`;
  hudScore.textContent = `Score: ${score}`;
}

function drawBackground() {
  const grad = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
  grad.addColorStop(0, "#77bfff");
  grad.addColorStop(0.5, "#94d0ff");
  grad.addColorStop(1, "#ffd7a0");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  for (let i = 0; i < 7; i += 1) {
    const x = ((i * 230 - (frame * 0.9)) % (GAME_WIDTH + 230)) - 120;
    ctx.fillStyle = "#8492bd";
    ctx.fillRect(x, 240, 110, 220);
    ctx.fillStyle = "#a4b6df";
    for (let w = 0; w < 4; w += 1) {
      ctx.fillRect(x + 15 + w * 22, 265, 12, 18);
      ctx.fillRect(x + 15 + w * 22, 300, 12, 18);
    }
  }

  ctx.fillStyle = "#444b64";
  ctx.fillRect(0, GROUND_Y, GAME_WIDTH, GAME_HEIGHT - GROUND_Y);
  ctx.fillStyle = "#efb85e";
  for (let i = 0; i < 35; i += 1) {
    const lx = ((i * 64 - frame * 6) % (GAME_WIDTH + 60)) - 30;
    ctx.fillRect(lx, GROUND_Y + 55, 35, 8);
  }
}

function drawPlayer() {
  if (player.invuln > 0 && Math.floor(player.invuln / 6) % 2 === 0) return;
  const x = player.x;
  const y = player.y;
  player.anim += 0.16;

  ctx.save();
  if (player.facing === -1) {
    ctx.translate(x + player.w / 2, 0);
    ctx.scale(-1, 1);
    ctx.translate(-(x + player.w / 2), 0);
  }

  ctx.fillStyle = "#f5d3b2";
  ctx.beginPath();
  ctx.arc(x + 38, y + 20, 17, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#f3c651";
  ctx.beginPath();
  ctx.moveTo(x + 22, y + 15);
  ctx.quadraticCurveTo(x + 62, y - 30, x + 58, y + 42);
  ctx.quadraticCurveTo(x + 40, y + 34, x + 25, y + 43);
  ctx.fill();

  ctx.fillStyle = "#1e61d7";
  ctx.fillRect(x + 18, y + 42, 42, 38);
  ctx.fillStyle = "#ff8327";
  ctx.fillRect(x + 24, y + 48, 30, 10);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 14px Verdana";
  ctx.fillText("LE", x + 28, y + 73);

  const legSwing = Math.sin(player.anim * 2) * 8;
  ctx.fillStyle = "#f5d3b2";
  if (player.action === "tumble") {
    ctx.fillRect(x + 8, y + 75, 52, 10);
    ctx.fillRect(x + 4, y + 88, 62, 10);
  } else {
    ctx.fillRect(x + 23, y + 80, 10, 32 + legSwing);
    ctx.fillRect(x + 44, y + 80, 10, 32 - legSwing);
  }
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x + 21, y + 115, 14, 9);
  ctx.fillRect(x + 42, y + 115, 14, 9);

  ctx.restore();
}

function drawWorm(w) {
  ctx.fillStyle = "#a95f40";
  ctx.beginPath();
  ctx.ellipse(w.x + w.w / 2, w.y + w.h / 2, 23, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#e8b89f";
  ctx.fillRect(w.x + 6, w.y + 7, 33, 4);
}

function drawEnemy(e) {
  ctx.fillStyle = "#583198";
  ctx.fillRect(e.x, e.y + 20, e.w, e.h - 20);
  ctx.fillStyle = "#ffcc9f";
  ctx.beginPath();
  ctx.arc(e.x + e.w / 2, e.y + 16, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffd53f";
  ctx.fillRect(e.x + 10, e.y + 36, e.w - 20, 9);
}

function drawCollectible(c) {
  if (c.kind === "star") ctx.fillStyle = "#ffe77c";
  if (c.kind === "megaphone") ctx.fillStyle = "#ff9f4e";
  if (c.kind === "bow") ctx.fillStyle = "#ff7ea8";
  ctx.beginPath();
  ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "bold 12px Verdana";
  ctx.fillText(c.kind === "megaphone" ? "GO" : c.kind === "bow" ? "LE" : "*", c.x - 10, c.y + 4);
}

function drawPowerup(p) {
  ctx.fillStyle = "#8affcc";
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#116146";
  ctx.font = "bold 20px Verdana";
  ctx.fillText("+1", p.x - 15, p.y + 7);
}

function drawBoss() {
  if (!boss) return;
  ctx.fillStyle = "#b40d3a";
  ctx.fillRect(boss.x, boss.y + 34, boss.w, boss.h - 34);
  ctx.fillStyle = "#ffd5a8";
  ctx.beginPath();
  ctx.arc(boss.x + 66, boss.y + 24, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffef86";
  ctx.fillRect(boss.x + 30, boss.y + 55, 68, 11);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 15px Verdana";
  ctx.fillText("RIVAL", boss.x + 30, boss.y + 95);

  const hpPct = boss.hp / boss.maxHp;
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(800, 46, 360, 22);
  ctx.fillStyle = "#ff5f7d";
  ctx.fillRect(803, 49, 354 * hpPct, 16);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 14px Verdana";
  ctx.fillText("Boss Cheer-Off", 810, 64);
}

function drawProjectile(p) {
  ctx.fillStyle = "#ff7a4b";
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
  ctx.fill();
}

function overlayCard(title, lines) {
  ctx.fillStyle = "rgba(8, 12, 34, 0.72)";
  ctx.fillRect(170, 110, 940, 500);
  ctx.strokeStyle = "#87b0ff";
  ctx.lineWidth = 5;
  ctx.strokeRect(170, 110, 940, 500);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 56px Verdana";
  ctx.fillText(title, 220, 205);
  ctx.font = "28px Verdana";
  lines.forEach((line, i) => {
    ctx.fillText(line, 220, 265 + i * 52);
  });
}

function drawHome() {
  drawBackground();
  ctx.fillStyle = "rgba(22,32,75,0.7)";
  ctx.fillRect(70, 55, 1140, 610);
  ctx.fillStyle = "#f0f7ff";
  ctx.font = "bold 86px Verdana";
  ctx.fillText("Legacy Cheer Battle Run", 110, 190);
  ctx.font = "bold 38px Verdana";
  ctx.fillStyle = "#ff9f4a";
  ctx.fillText("LE", 110, 246);
  ctx.fillStyle = "#ffffff";
  ctx.fillText("Press Enter To Continue", 110, 560);
  ctx.font = "28px Verdana";
  ctx.fillText("Blue + Orange Energy | Street Sprint | Cheer Power", 110, 615);
  drawPlayer();
}

function drawMenu() {
  drawBackground();
  overlayCard("Main Menu", [
    "Choose options then press Enter",
    `Difficulty: ${selectedDifficulty}`,
    `Sound: ${soundOn ? "ON" : "OFF"}`,
    "Controls: Arrow keys move, Space jump, X tumble",
    "10 lives start, easy extra lives, 3 boss levels"
  ]);
  menuItems.forEach((item, i) => {
    const y = 335 + i * 48;
    ctx.fillStyle = i === menuIndex ? "#ffd765" : "#e8f0ff";
    let value = item.label;
    if (item.id === "difficulty") value = `Difficulty: ${selectedDifficulty}`;
    if (item.id === "sound") value = `Sound: ${soundOn ? "ON" : "OFF"}`;
    ctx.fillText(`${i === menuIndex ? ">" : " "} ${value}`, 230, y);
  });
}

function drawPlay() {
  drawBackground();
  worms.forEach(drawWorm);
  enemies.forEach(drawEnemy);
  collectibles.forEach(drawCollectible);
  powerups.forEach(drawPowerup);
  projectiles.forEach(drawProjectile);
  drawPlayer();
  if (bossMode) drawBoss();
  if (messageTimer > 0) {
    ctx.fillStyle = "rgba(16,25,64,0.76)";
    ctx.fillRect(470, 100, 340, 54);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 30px Verdana";
    ctx.fillText(softMessage, 500, 137);
  }
}

function drawLevelClear() {
  drawPlay();
  overlayCard(`Level ${level} Cleared!`, [
    "Boss beaten in cheer battle!",
    "Press Enter for next level.",
    "Collect more LE items for extra lives."
  ]);
}

function drawGameOver() {
  drawPlay();
  overlayCard("Game Over", [
    `Final Score: ${score}`,
    "Press Enter for Home Screen."
  ]);
}

function drawDanceParty() {
  drawBackground();
  ctx.fillStyle = "rgba(8, 8, 36, 0.65)";
  ctx.fillRect(80, 50, 1120, 620);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 68px Verdana";
  ctx.fillText("Champion Dance Party!", 170, 160);
  ctx.font = "32px Verdana";
  ctx.fillText("Crowned Legacy Star - LE Forever", 270, 220);

  const danceY = 360 + Math.sin(frame * 0.16) * 28;
  ctx.fillStyle = "#ffd44f";
  ctx.beginPath();
  ctx.moveTo(620, danceY - 120);
  ctx.lineTo(600, danceY - 90);
  ctx.lineTo(640, danceY - 90);
  ctx.closePath();
  ctx.fill();

  const oldY = player.y;
  player.y = danceY;
  player.x = 600;
  drawPlayer();
  player.y = oldY;
  ctx.fillStyle = "#fff";
  ctx.font = "bold 30px Verdana";
  ctx.fillText(`Score: ${score}   Crowns: ${crowns}`, 420, 560);
  ctx.fillText("Press Enter for Home", 470, 610);
}

function render() {
  ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  if (scene === "home") drawHome();
  if (scene === "menu") drawMenu();
  if (scene === "play") drawPlay();
  if (scene === "levelClear") drawLevelClear();
  if (scene === "gameOver") drawGameOver();
  if (scene === "danceParty") drawDanceParty();
}

function loop() {
  if (scene === "play") updatePlay();
  frame += 1;
  render();
  requestAnimationFrame(loop);
}

function cycleDifficulty(next = true) {
  const arr = Object.keys(difficultyMap);
  let idx = arr.indexOf(selectedDifficulty);
  idx = next ? (idx + 1) % arr.length : (idx - 1 + arr.length) % arr.length;
  selectedDifficulty = arr[idx];
}

function handleMenuSelect() {
  const item = menuItems[menuIndex];
  if (!item) return;
  if (item.id === "start") startGame();
  if (item.id === "difficulty") cycleDifficulty(true);
  if (item.id === "sound") {
    soundOn = !soundOn;
    if (!soundOn) {
      stopGameplayMusic();
      homeSongTimeouts.forEach(clearTimeout);
    }
  }
  if (item.id === "controls") {
    softMessage = "Arrows Move | Space Jump | X Tumble";
    messageTimer = 120;
  }
  if (item.id === "restart") {
    score = 0;
    lives = 10;
    level = 1;
    crowns = 0;
  }
}

window.addEventListener("keydown", (e) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();

  if (scene === "home" && e.code === "Enter") {
    scene = "menu";
    return;
  }
  if (scene === "menu") {
    if (e.code === "ArrowUp") menuIndex = (menuIndex - 1 + menuItems.length) % menuItems.length;
    if (e.code === "ArrowDown") menuIndex = (menuIndex + 1) % menuItems.length;
    if (e.code === "ArrowLeft" && menuItems[menuIndex].id === "difficulty") cycleDifficulty(false);
    if (e.code === "ArrowRight" && menuItems[menuIndex].id === "difficulty") cycleDifficulty(true);
    if (e.code === "Enter") {
      ensureAudio();
      handleMenuSelect();
      if (soundOn && scene === "menu") playHomeSongOnce();
    }
    if (e.code === "KeyM") {
      soundOn = !soundOn;
      if (!soundOn) stopGameplayMusic();
    }
    return;
  }
  if (scene === "play") {
    if (e.code === "ArrowLeft") keys.left = true;
    if (e.code === "ArrowRight") keys.right = true;
    if ((e.code === "Space" || e.code === "ArrowUp") && player.onGround) {
      player.vy = -16.5;
      player.onGround = false;
      player.action = "jump";
      ensureAudio();
      voiceCheer("go");
    }
    if (e.code === "KeyX") {
      keys.tumble = true;
      player.action = "tumble";
      ensureAudio();
      voiceCheer("woo");
    }
    if (e.code === "Escape") {
      scene = "menu";
      stopGameplayMusic();
    }
    return;
  }
  if (scene === "levelClear" && e.code === "Enter") {
    startLevel(level + 1);
    return;
  }
  if (scene === "gameOver" && e.code === "Enter") {
    scene = "home";
    homeSongPlayed = false;
    playHomeSongOnce();
    return;
  }
  if (scene === "danceParty" && e.code === "Enter") {
    scene = "home";
    homeSongPlayed = false;
    playHomeSongOnce();
  }
});

window.addEventListener("keyup", (e) => {
  if (e.code === "ArrowLeft") keys.left = false;
  if (e.code === "ArrowRight") keys.right = false;
  if (e.code === "KeyX") keys.tumble = false;
});

window.addEventListener("click", () => {
  ensureAudio();
  if (scene === "home") {
    scene = "menu";
    playHomeSongOnce();
  }
});

function init() {
  hudLevel.textContent = "Level 1";
  hudLives.textContent = "Lives: 10";
  hudScore.textContent = "Score: 0";
  playHomeSongOnce();
  loop();
}

init();
