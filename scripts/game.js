const term      = document.getElementById('terminal');
const inputLine = document.getElementById('input-line');
const promptEl  = document.getElementById('prompt');
const inputEl   = document.getElementById('cmd-input');

// ─── Terminal output ──────────────────────────────────────────────────────────

function print(text) {
  term.appendChild(document.createTextNode(text));
  window.scrollTo(0, document.body.scrollHeight);
}

function println(text = '') { print(text + '\n'); }

function clearScreen() { term.textContent = ''; }

// ─── Input system ─────────────────────────────────────────────────────────────

let pendingResolve   = null;
let waitingForNumber = false;
let validNumbers     = [];

inputEl.addEventListener('keydown', (e) => {
  if (e.key == "Escape") location.reload();
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const val = inputEl.value;
  inputEl.value = '';
  if (!pendingResolve) return;

  if (waitingForNumber) {
    const n = parseInt(val);
    if (!isNaN(n) && validNumbers.includes(n)) {
      println(val);
      promptEl.textContent = '';
      const res = pendingResolve;
      pendingResolve = null; waitingForNumber = false; validNumbers = [];
      res(n);
    } else {
      println(val);
      println(language ? language.ui.invalidOption : 'Nuh uh');
      promptEl.textContent = '> ';
    }
  } else {
    println('');
    promptEl.textContent = '';
    const res = pendingResolve;
    pendingResolve = null;
    res();
  }
});

function waitEnter() {
  return new Promise(resolve => {
    println('\n' + (language ? language.ui.pressEnter : 'Uh huh'));
    promptEl.textContent = '';
    pendingResolve = resolve;
    waitingForNumber = false;
    inputEl.focus();
  });
}

function waitNumber(valid) {
  return new Promise(resolve => {
    promptEl.textContent = '> ';
    pendingResolve = resolve;
    waitingForNumber = true;
    validNumbers = valid;
    inputEl.focus();
  });
}

// ─── Template helper ──────────────────────────────────────────────────────────

function t(str, vars = {}) {
  return str.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

// ─── Active language strings ──────────────────────────────────────────────────

let language = null;

// ─── Language selection ───────────────────────────────────────────────────────

async function pickLanguage() {
  const config = await fetch('languages.json').then(r => r.json());

  clearScreen();
  config.forEach((opt, i) => println(`  ${i + 1} - ${opt.languageName}`));
  println('');

  const picked = await waitNumber(config.map((_, i) => i + 1));
  language = await fetch('lang/' + config[picked - 1].fileName).then(r => r.json());
}

// ─── Game logic ───────────────────────────────────────────────────────────────

function createEnemy(nome, tipo, vida, dano) {
  return { nome, tipo, vida, dano, status: 0 };
}

const ENEMY_CTORS = {
  1: () => createEnemy(1, 1,  5, 15),
  2: () => createEnemy(2, 2,  5, 15),
  3: () => createEnemy(3, 3,  5, 15),
  4: () => createEnemy(4, 2,  7, 20),
  5: () => createEnemy(5, 1, 15, 10),
  6: () => createEnemy(6, 3,  4, 50),
};

const HAND_ARTS = [ROCK_ART, PAPER_ART, SCISSOR_ART];

function mulType(t1, t2) {
  if (t1 === t2) return 1;
  if (t1===1&&t2===2) return 0.5;
  if (t1===1&&t2===3) return 2.0;
  if (t1===2&&t2===1) return 2.0;
  if (t1===2&&t2===3) return 0.5;
  if (t1===3&&t2===1) return 0.5;
  if (t1===3&&t2===2) return 2.0;
  return 1;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  await pickLanguage();

  const NUM_ENEMIES = 6;
  let queue = [];
  for (let i = 0; i < NUM_ENEMIES; i++) {
    const id = Math.floor(Math.random() * 6) + 1;
    queue.push(ENEMY_CTORS[id]());
  }

  let playerHp = 100;
  let turno    = 1;
  let disabled = { 1:false, 2:false, 3:false, 4:false, 5:false, 6:false };

  // Intro / title
  clearScreen();
  for (const line of INTRO_ART) println(line);
  await waitEnter();
  clearScreen();

  for (const line of language.story.scene1) println(line);
  await waitEnter();
  clearScreen();

  for (const line of language.story.scene2) println(line);
  await waitEnter();
  clearScreen();

  for (const line of language.story.scene3) println(t(line, { numEnemies: NUM_ENEMIES }));
  await waitEnter();
  clearScreen();

  // Game loop
  let jogando = true;

  while (jogando) {
    shuffle(queue);
    if (queue.length === 0) { jogando = false; break; }

    let used = { 1:false, 2:false, 3:false, 4:false, 5:false, 6:false };

    clearScreen();
    println(t(language.hud.playerHp, { hp: playerHp }));
    println('');
    println(language.hud.enemiesThisTurn);
    for (const e of queue) {
      println(`  ${language.enemy.names[e.nome]} - ${language.enemy.types[e.tipo]} | HP: ${e.vida * 10} | DMG: ${e.dano}`);
    }
    println('');
    println(language.hud.attacks);
    for (let atk = 1; atk <= 6; atk++) {
      const dmgBase = atk <= 3 ? 20 : 40;
      if (disabled[atk]) println(`  ${atk} - ${language.attack.names[atk]} - ${language.attack.disabled}`);
      else println(`  ${atk} - ${language.attack.names[atk]} - ${dmgBase}`);
    }
    await waitEnter();

    const snapshot = [...queue];
    queue = [];

    for (const curEnemy of snapshot) {
      if (playerHp <= 0) {
        clearScreen();
        println(language.hud.lose);
        inputLine.style.display = 'none';
        return;
      }

      function atkDmg(slot) {
        const typeIdx = ((slot - 1) % 3) + 1;
        const base = slot <= 3 ? 2 : 4;
        return Math.round(base * mulType(typeIdx, curEnemy.tipo));
      }

      let chosen = false, atkIndex = 0, atkDamage = 0;

      while (!chosen) {
        clearScreen();
        println(t(language.hud.turn, { turn: turno }));
        println(`${language.enemy.names[curEnemy.nome]} - ${language.enemy.types[curEnemy.tipo]} | HP: ${curEnemy.vida * 10} | DMG: ${curEnemy.dano}`);
        println('');
        println(t(language.hud.playerHp, { hp: playerHp }));
        println('');
        println(language.hud.chooseAttack);

        const validOpts = [];
        for (let atk = 1; atk <= 6; atk++) {
          if (disabled[atk])  println(`    ${atk} - ${language.attack.names[atk]} - ${language.attack.disabled}`);
          else if (used[atk]) println(`    ${atk} - ${language.attack.names[atk]} - ${language.attack.used}`);
          else {
            println(`    ${atk} - ${language.attack.names[atk]} - ${atkDmg(atk) * 10}`);
            validOpts.push(atk);
          }
        }

        const picked = await waitNumber(validOpts);

        if (!disabled[picked] && !used[picked]) {
          atkIndex  = picked;
          atkDamage = atkDmg(picked);
          used[picked] = true;
          chosen = true;
          if (curEnemy.vida <= atkDamage) disabled[picked] = true;
        }
      }

      clearScreen();
      for (const line of HAND_ARTS[(atkIndex - 1) % 3]) println(line);
      println('');

      curEnemy.vida -= atkDamage;

      const enemyElim = curEnemy.vida <= 0 ? language.hud.enemyEliminated : '';
      println(t("{name}: {hp}", { name: language.enemy.names[curEnemy.nome], hp: curEnemy.vida * 10 }) + enemyElim);

      if (curEnemy.vida > 0) playerHp -= curEnemy.dano;

      const playerElim = playerHp <= 0 ? language.hud.enemyEliminated : '';
      println(t(language.hud.playerLine, { hp: playerHp }) + playerElim);

      await waitEnter();

      if (curEnemy.vida > 0) { curEnemy.status = 0; queue.push(curEnemy); }
    }

    if (queue.length === 0) jogando = false;
    else turno++;
  }

  clearScreen();
  println(language.hud.win);
  inputLine.style.display = 'none';
}

window.addEventListener('load', () => {
  inputEl.focus();
  main();
});

document.addEventListener('click', () => inputEl.focus());