(() => {
  'use strict';

  const SAVE_KEY = 'beastie-brawl-save-v1';
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const randSeed = () => Math.floor(Math.random() * 4294967295);
  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- Save state ----------
  let S;
  function freshState() {
    return {
      monster: null, coins: 120, items: { snack: 2, juice: 1 }, hats: [], hat: null,
      moves: ['jab', 'chomp', 'slam'], equipped: ['jab', 'chomp', 'slam'],
      wins: 0, losses: 0, streak: 0, muted: false, foes: null,
    };
  }
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      S = raw ? Object.assign(freshState(), JSON.parse(raw)) : freshState();
    } catch (e) { S = freshState(); }
  }
  function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* storage unavailable */ } }

  // ---------- Formulas ----------
  const maxHp = (m) => 60 + m.tou * 6 + m.level * 6;
  const xpNeeded = (lvl) => Math.round(40 * Math.pow(lvl, 1.5));
  const trainCost = () => 10 + S.monster.level * 5;

  function gainXp(amount) {
    const m = S.monster;
    let ups = 0;
    m.xp += amount;
    while (m.xp >= xpNeeded(m.level)) {
      m.xp -= xpNeeded(m.level);
      m.level++;
      m.points += 3;
      ups++;
    }
    return ups;
  }

  // ---------- Sound (tiny WebAudio synth, no files) ----------
  let actx = null;
  function beep(freq, dur = 0.1, type = 'square', vol = 0.05, slide = 0, delay = 0) {
    if (S.muted) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const t = actx.currentTime + delay;
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.linearRampToValueAtTime(Math.max(30, freq + slide), t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(actx.destination);
      o.start(t); o.stop(t + dur + 0.02);
    } catch (e) { /* audio unavailable */ }
  }
  const sfx = {
    click: () => beep(660, 0.05, 'square', 0.03),
    hit: () => beep(160, 0.18, 'sawtooth', 0.08, -90),
    crit: () => { beep(220, 0.1, 'square', 0.08, 200); beep(110, 0.25, 'sawtooth', 0.09, -60, 0.08); },
    miss: () => beep(500, 0.15, 'triangle', 0.05, -300),
    block: () => beep(900, 0.08, 'square', 0.04, -200),
    coin: () => { beep(988, 0.07, 'square', 0.04); beep(1319, 0.12, 'square', 0.04, 0, 0.07); },
    win: () => [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.18, 'square', 0.05, 0, i * 0.12)),
    lose: () => [392, 330, 262, 196].forEach((f, i) => beep(f, 0.22, 'triangle', 0.06, 0, i * 0.15)),
    level: () => [523, 784, 1047, 1568].forEach((f, i) => beep(f, 0.12, 'square', 0.05, 0, i * 0.08)),
  };

  // ---------- UI helpers ----------
  function show(name) {
    $$('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + name));
    window.scrollTo(0, 0);
    const fn = { lair: renderLair, select: renderSelect, train: renderTrain, shop: renderShop }[name];
    if (fn) fn();
  }
  function updateCoins() { $('#coin-count').textContent = S.coins; }

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  function modal(html, buttons = [{ label: 'OK' }]) {
    return new Promise(resolve => {
      const box = $('#modal-box');
      box.innerHTML = html + '<div class="modal-actions"></div>';
      const actions = $('.modal-actions', box);
      buttons.forEach((b, i) => {
        const el = document.createElement('button');
        el.className = 'btn ' + (b.cls || '');
        el.textContent = b.label;
        el.onclick = () => { $('#modal').classList.add('hidden'); sfx.click(); resolve('value' in b ? b.value : i); };
        actions.appendChild(el);
      });
      $('#modal').classList.remove('hidden');
    });
  }

  function monsterHtml(seed, opts) { return Art.render(seed, opts); }

  // ---------- Timing meter ----------
  // Resolves with a quality from 0 (awful) to 1 (perfect).
  function runMeter({ title, speed = 1, zone = 0.06, timeout = 0 }) {
    return new Promise(resolve => {
      const ov = $('#meter'), needle = $('#meter-needle'), zoneEl = $('#meter-zone'), res = $('#meter-result');
      if (document.activeElement) document.activeElement.blur();
      $('#meter-title').innerHTML = title;
      res.textContent = '';
      zoneEl.style.left = (50 - zone * 100) + '%';
      zoneEl.style.width = (zone * 200) + '%';
      ov.classList.remove('hidden');
      const start = performance.now();
      let done = false, raf, pos = 0;

      const frame = (now) => {
        const t = (now - start) / 1000;
        pos = 1 - Math.abs(((t * speed) % 2) - 1);
        needle.style.left = (pos * 100) + '%';
        if (timeout && t > timeout) return finish(true);
        raf = requestAnimationFrame(frame);
      };
      const finish = (timedOut) => {
        if (done) return;
        done = true;
        cancelAnimationFrame(raf);
        removeEventListener('keydown', onKey, true);
        ov.removeEventListener('pointerdown', onPress);
        const d = Math.abs(pos - 0.5);
        let q = d <= zone ? 1 : clamp(1 - (d - zone) / (0.5 - zone), 0, 1);
        if (timedOut) q = 0;
        const label = timedOut ? 'Too slow!' : q >= 1 ? 'PERFECT!' : q > 0.7 ? 'Great!' : q > 0.4 ? 'Good' : 'Weak...';
        res.textContent = label;
        res.className = 'meter-result ' + (q >= 1 ? 'perfect' : q > 0.4 ? 'ok' : 'bad');
        setTimeout(() => { ov.classList.add('hidden'); resolve(q); }, 550);
      };
      const onPress = (e) => {
        if (performance.now() - start < 150) return;
        e.preventDefault();
        finish(false);
      };
      const onKey = (e) => {
        if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) onPress(e); }
      };
      addEventListener('keydown', onKey, true);
      ov.addEventListener('pointerdown', onPress);
      raf = requestAnimationFrame(frame);
    });
  }

  // ---------- Hatch ----------
  let hatchSeed = randSeed();
  function renderHatch() {
    const el = $('#hatch-preview');
    el.innerHTML = monsterHtml(hatchSeed);
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  }
  function initHatch() {
    $('#hatch-reroll').onclick = () => { sfx.click(); hatchSeed = randSeed(); renderHatch(); };
    $('#hatch-randname').onclick = () => { sfx.click(); $('#hatch-name').value = randomName(); };
    $('#hatch-go').onclick = () => {
      const name = $('#hatch-name').value.trim() || randomName();
      S.monster = { name, seed: hatchSeed, level: 1, xp: 0, str: 5, agi: 5, tou: 5, points: 3 };
      S.foes = null;
      save();
      sfx.level();
      show('lair');
      toast(`${name} hatched! Spend your 3 stat points.`);
    };
  }

  // ---------- Lair ----------
  const STATS = [
    { key: 'str', name: 'Strength', icon: '💪', tip: 'More damage' },
    { key: 'agi', name: 'Agility', icon: '⚡', tip: 'Dodge more, hit more, bigger timing zone' },
    { key: 'tou', name: 'Toughness', icon: '🛡️', tip: 'More HP, take less damage' },
  ];

  function renderLair() {
    const m = S.monster;
    updateCoins();
    $('#lair-art').innerHTML = monsterHtml(m.seed, { hat: S.hat });
    $('#lair-name').textContent = m.name;
    $('#lair-level').textContent = m.level;
    $('#lair-record').textContent = `${S.wins}W / ${S.losses}L` + (S.streak > 1 ? ` · 🔥${S.streak} streak` : '');
    const need = xpNeeded(m.level);
    $('#lair-xp').style.width = (100 * m.xp / need) + '%';
    $('#lair-xp-text').textContent = `XP ${m.xp} / ${need}`;
    $('#lair-points').textContent = m.points ? `${m.points} point${m.points > 1 ? 's' : ''} to spend!` : '';
    $('#lair-points').style.display = m.points ? '' : 'none';

    $('#stat-list').innerHTML = STATS.map(s => `
      <div class="stat" title="${s.tip}">
        <span class="stat-name">${s.icon} ${s.name}</span>
        <span class="stat-val">${m[s.key]}</span>
        ${m.points ? `<button class="btn tiny" data-stat="${s.key}">+</button>` : ''}
      </div>`).join('') +
      `<div class="stat"><span class="stat-name">❤️ Health</span><span class="stat-val">${maxHp(m)}</span></div>`;
    $$('#stat-list [data-stat]').forEach(b => b.onclick = () => {
      if (m.points <= 0) return;
      m[b.dataset.stat]++; m.points--; save(); sfx.click(); renderLair();
    });

    $('#move-loadout').innerHTML = S.moves.map(id => {
      const mv = MOVES[id], on = S.equipped.includes(id);
      return `<button class="chip ${on ? 'on' : ''}" data-move="${id}" title="${esc(mv.desc)}">${mv.icon} ${mv.name} <small>${mv.power}⚔ ${mv.cost}⚡</small></button>`;
    }).join('');
    $$('#move-loadout [data-move]').forEach(b => b.onclick = () => {
      const id = b.dataset.move, i = S.equipped.indexOf(id);
      if (i >= 0) {
        if (S.equipped.length === 1) return toast('You need at least one move!');
        S.equipped.splice(i, 1);
      } else {
        if (S.equipped.length >= 4) return toast('Only 4 moves at once. Unequip one first.');
        S.equipped.push(id);
      }
      sfx.click(); save(); renderLair();
    });

    $('#wardrobe').innerHTML = S.hats.length
      ? `<button class="chip ${!S.hat ? 'on' : ''}" data-hat="">No hat</button>` +
        S.hats.map(h => `<button class="chip ${S.hat === h ? 'on' : ''}" data-hat="${h}">${HATS[h].name}</button>`).join('')
      : '<span class="muted">No hats yet. Check the shop!</span>';
    $$('#wardrobe [data-hat]').forEach(b => b.onclick = () => { S.hat = b.dataset.hat || null; sfx.click(); save(); renderLair(); });
  }

  // ---------- Opponents ----------
  function makeFoe(diffIdx) {
    const me = S.monster, D = DIFFICULTIES[diffIdx];
    const level = Math.max(1, me.level + D.lvl);
    const myTotal = me.str + me.agi + me.tou;
    const total = Math.max(15, Math.round(myTotal * D.statMul + (level - me.level) * 2));
    const st = { str: 3, agi: 3, tou: 3 };
    const w = { str: rand(0.5, 1.5), agi: rand(0.5, 1.5), tou: rand(0.5, 1.5) };
    const wsum = w.str + w.agi + w.tou;
    let left = total - 9;
    for (const k of ['str', 'agi']) { const n = Math.round(left * w[k] / wsum); st[k] += n; }
    st.tou = total - st.str - st.agi;
    const pool = Object.keys(MOVES).filter(k => k !== 'jab' && MOVES[k].lvl <= level + 1);
    const moves = ['jab'];
    while (moves.length < 4 && pool.length) moves.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    return {
      name: randomName(), seed: randSeed(), level, ...st, moves, diff: diffIdx,
      hat: Math.random() < 0.25 ? Art.hats[Math.floor(Math.random() * Art.hats.length)] : null,
    };
  }
  function rewardsFor(foe) {
    const D = DIFFICULTIES[foe.diff];
    return {
      xp: Math.round((20 + foe.level * 10) * D.reward),
      coins: Math.round((15 + foe.level * 8) * D.reward),
    };
  }

  function renderSelect() {
    updateCoins();
    if (!S.foes) { S.foes = [0, 1, 2].map(makeFoe); save(); }
    $('#foe-list').innerHTML = S.foes.map((f, i) => {
      const D = DIFFICULTIES[f.diff], r = rewardsFor(f);
      return `<div class="card foe-card ${D.cls}">
        <div class="diff-tag">${D.label}</div>
        <div class="monster idle">${monsterHtml(f.seed, { hat: f.hat, flip: true })}</div>
        <h3>${esc(f.name)}</h3>
        <div class="muted">Level ${f.level} · 💪${f.str} ⚡${f.agi} 🛡️${f.tou}</div>
        <div class="reward">Win: +${r.xp} XP · 🦷${r.coins}</div>
        <button class="btn fight" data-foe="${i}">Fight!</button>
      </div>`;
    }).join('');
    $$('#foe-list [data-foe]').forEach(b => b.onclick = () => startBattle(S.foes[+b.dataset.foe]));
  }

  // ---------- Battle ----------
  let B = null;

  function makeFighter(src, side, skill) {
    const hp = maxHp(src);
    return {
      name: src.name, seed: src.seed, hat: src.hat, level: src.level,
      str: src.str, agi: src.agi, tou: src.tou, maxHp: hp, hp,
      energy: 30, moves: src.moves, stunned: false, side, skill,
    };
  }

  function startBattle(foe) {
    sfx.click();
    const me = S.monster;
    B = {
      foeSrc: foe,
      you: makeFighter({ ...me, hat: S.hat, moves: S.equipped }, 'you', 1),
      foe: makeFighter(foe, 'foe', DIFFICULTIES[foe.diff].skill),
      over: false, busy: true,
    };
    $('#battle-log').innerHTML = '';
    $('#fighter-you .monster').innerHTML = monsterHtml(me.seed, { hat: S.hat });
    $('#fighter-foe .monster').innerHTML = monsterHtml(foe.seed, { hat: foe.hat, flip: true });
    $$('.fighter').forEach(f => f.classList.remove('ko', 'enter'));
    show('battle');
    $$('.fighter').forEach(f => { void f.offsetWidth; f.classList.add('enter'); });
    renderBattle();
    log(`<b>${esc(B.you.name)}</b> squares up against <b>${esc(B.foe.name)}</b>!`);
    setTimeout(playerTurn, 700);
  }

  function setBar(el, cur, max, label) {
    $('div', el).style.width = (100 * cur / max) + '%';
    $('span', el).textContent = label;
  }
  function renderBattle() {
    for (const f of [B.you, B.foe]) {
      const hud = $('#hud-' + f.side);
      $('.hud-name', hud).innerHTML = `${esc(f.name)} <small>Lv ${f.level}</small>${f.stunned ? ' <span class="stun">💫</span>' : ''}`;
      setBar($('.hp', hud), f.hp, f.maxHp, `${f.hp} / ${f.maxHp}`);
      $('.hp', hud).classList.toggle('low', f.hp / f.maxHp < 0.3);
      setBar($('.en', hud), f.energy, 100, `⚡ ${f.energy}`);
    }
    renderControls();
  }

  function renderControls() {
    const you = B.you;
    const locked = B.busy || B.over;
    $('#move-buttons').innerHTML = you.moves.map(id => {
      const mv = MOVES[id];
      const off = locked || mv.cost > you.energy;
      return `<button class="move-btn" data-move="${id}" ${off ? 'disabled' : ''} title="${esc(mv.desc)}">
        <span class="mi">${mv.icon}</span><span class="mn">${mv.name}</span>
        <span class="ms">${mv.power}⚔ · ${mv.acc}% · ${mv.cost}⚡</span></button>`;
    }).join('');
    $$('#move-buttons [data-move]').forEach(b => b.onclick = () => playerAttack(b.dataset.move));
    $('#items-btn').disabled = locked;
    $('#forfeit-btn').disabled = locked;
  }

  function log(html) {
    const el = $('#battle-log');
    const p = document.createElement('p');
    p.innerHTML = html;
    el.appendChild(p);
    while (el.children.length > 30) el.firstChild.remove();
    el.scrollTop = el.scrollHeight;
  }

  function floatText(side, text, cls = '') {
    const host = $('#fighter-' + side);
    const el = document.createElement('div');
    el.className = 'float ' + cls;
    el.textContent = text;
    el.style.left = (40 + Math.random() * 20) + '%';
    host.appendChild(el);
    setTimeout(() => el.remove(), 1100);
  }
  function anim(side, cls, ms) {
    const el = $('#fighter-' + side);
    el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), ms);
  }

  async function performAttack(att, def, moveId, powerQ, blockQ) {
    const mv = MOVES[moveId];
    att.energy -= mv.cost;
    renderBattle();
    log(`<b>${esc(att.name)}</b> uses <b>${mv.icon} ${mv.name}</b>!`);
    anim(att.side, 'lunge', 450);
    await wait(220);

    const hits = mv.effect === 'multi' ? 2 + Math.floor(Math.random() * 3) : 1;
    let total = 0, landed = 0;
    for (let i = 0; i < hits && def.hp > 0; i++) {
      const hitChance = clamp(mv.acc + (att.agi - def.agi) * 1.5, 15, 99);
      if (Math.random() * 100 >= hitChance) {
        floatText(def.side, 'MISS', 'miss');
        anim(def.side, 'dodge', 400);
        sfx.miss();
        await wait(hits > 1 ? 280 : 350);
        continue;
      }
      const crit = powerQ >= 1;
      const dmg = Math.max(1, Math.round(
        mv.power * (1 + att.str * 0.07) * (0.5 + powerQ) * (crit ? 1.25 : 1) *
        (1 - Math.min(0.55, def.tou * 0.025)) * (1 - blockQ * 0.6) * rand(0.9, 1.1)));
      def.hp = Math.max(0, def.hp - dmg);
      total += dmg; landed++;
      anim(def.side, 'hit', 400);
      floatText(def.side, '-' + dmg, crit ? 'crit' : '');
      crit ? sfx.crit() : sfx.hit();
      if (blockQ > 0.5 && i === 0) { floatText(def.side, 'BLOCK', 'block'); sfx.block(); }
      renderBattle();
      await wait(hits > 1 ? 280 : 350);
    }

    if (hits > 1) log(`Hit ${landed} of ${hits} times for <b>${total}</b> damage.`);
    else if (landed) log(`It deals <b>${total}</b> damage${powerQ >= 1 ? ' — <b class="crit-t">CRUSHING BLOW!</b>' : ''}.`);
    else log(`<b>${esc(def.name)}</b> dodged it!`);

    if (mv.effect === 'energy') att.energy = Math.min(100, att.energy + 8);
    if (landed && def.hp > 0) {
      if (mv.effect === 'drain') {
        const heal = Math.min(att.maxHp - att.hp, Math.round(total * 0.5));
        if (heal > 0) { att.hp += heal; floatText(att.side, '+' + heal, 'heal'); log(`${esc(att.name)} slurps back ${heal} HP.`); }
      } else if (mv.effect === 'stun' && Math.random() < mv.chance) {
        def.stunned = true; log(`💫 <b>${esc(def.name)}</b> is stunned!`);
      } else if (mv.effect === 'sap') {
        def.energy = Math.max(0, def.energy - 15); log(`🟢 ${esc(def.name)} is gooed up and loses 15 energy.`);
      }
    }
    renderBattle();
    await wait(300);
  }

  function checkEnd() {
    if (!B || B.over) return true;
    if (B.foe.hp <= 0) { endBattle(true); return true; }
    if (B.you.hp <= 0) { endBattle(false); return true; }
    return false;
  }

  function playerTurn() {
    if (!B || B.over) return;
    const you = B.you;
    you.energy = Math.min(100, you.energy + 15);
    if (you.stunned) {
      you.stunned = false;
      log(`💫 <b>${esc(you.name)}</b> is stunned and can't move!`);
      renderBattle();
      setTimeout(enemyTurn, 900);
      return;
    }
    B.busy = false;
    renderBattle();
    log('<i>Your turn — pick a move!</i>');
  }

  async function playerAttack(moveId) {
    if (B.busy || B.over) return;
    const mv = MOVES[moveId];
    if (mv.cost > B.you.energy) return;
    B.busy = true;
    sfx.click();
    renderControls();
    const zone = Math.min(0.12, 0.04 + B.you.agi * 0.003);
    const powerQ = await runMeter({ title: `${mv.icon} ${mv.name}: <b>POWER UP!</b>`, speed: 0.7 + mv.power / 40, zone });
    const blockQ = Math.random() < 0.5 ? Math.random() * B.foe.skill * 0.8 : 0;
    await performAttack(B.you, B.foe, moveId, powerQ, blockQ);
    if (!checkEnd()) setTimeout(enemyTurn, 500);
  }

  function aiPickMove(f) {
    const options = f.moves.filter(id => MOVES[id].cost <= f.energy);
    const weights = options.map(id => Math.pow(MOVES[id].power, 1.3) * (MOVES[id].effect === 'drain' && f.hp < f.maxHp * 0.5 ? 1.8 : 1));
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < options.length; i++) { r -= weights[i]; if (r <= 0) return options[i]; }
    return options[0] || 'jab';
  }

  async function enemyTurn() {
    if (!B || B.over) return;
    const f = B.foe;
    f.energy = Math.min(100, f.energy + 15);
    if (f.stunned) {
      f.stunned = false;
      log(`💫 <b>${esc(f.name)}</b> is stunned and wobbles about!`);
      renderBattle();
      setTimeout(playerTurn, 900);
      return;
    }
    const moveId = aiPickMove(f);
    const mv = MOVES[moveId];
    log(`<b>${esc(f.name)}</b> winds up a <b>${mv.icon} ${mv.name}</b>...`);
    renderBattle();
    await wait(450);
    const zone = Math.min(0.11, 0.05 + B.you.agi * 0.002);
    const blockQ = await runMeter({ title: `🛡️ <b>BLOCK!</b> Incoming ${mv.name}!`, speed: 1.1 + mv.power / 50, zone, timeout: 3 });
    let powerQ = clamp(f.skill + rand(-0.3, 0.25), 0.1, 0.99);
    if (Math.random() < f.skill * 0.2) powerQ = 1;
    await performAttack(f, B.you, moveId, powerQ, blockQ);
    if (!checkEnd()) setTimeout(playerTurn, 400);
  }

  async function useItem() {
    if (B.busy || B.over) return;
    const owned = Object.keys(ITEMS).filter(k => S.items[k] > 0);
    if (!owned.length) return toast('Your bag is empty. Buy items in the shop!');
    const choice = await modal(
      '<h2>🎒 Items</h2><p class="muted">Using an item takes your turn.</p>',
      [...owned.map(k => ({ label: `${ITEMS[k].icon} ${ITEMS[k].name} (x${S.items[k]})`, value: k })), { label: 'Cancel', value: null, cls: 'alt' }]);
    if (!choice || B.busy || B.over) return;
    B.busy = true;
    S.items[choice]--;
    save();
    const you = B.you;
    if (choice === 'snack') {
      const heal = Math.min(you.maxHp - you.hp, Math.round(you.maxHp * 0.35));
      you.hp += heal;
      floatText('you', '+' + heal, 'heal');
      log(`🍖 <b>${esc(you.name)}</b> munches a Swamp Snack and heals ${heal} HP.`);
    } else {
      you.energy = Math.min(100, you.energy + 40);
      floatText('you', '+40⚡', 'heal');
      log(`🧃 <b>${esc(you.name)}</b> guzzles Zap Juice. +40 energy!`);
    }
    sfx.coin();
    renderBattle();
    setTimeout(enemyTurn, 700);
  }

  async function forfeit() {
    if (B.busy || B.over) return;
    const ok = await modal('<h2>Run away?</h2><p>Running counts as a loss.</p>', [{ label: 'Run!', value: true, cls: 'danger' }, { label: 'Keep fighting', value: false }]);
    if (ok && !B.over) { B.you.hp = 0; renderBattle(); endBattle(false, true); }
  }

  async function endBattle(won, fled = false) {
    if (B.over) return;
    B.over = true;
    B.busy = true;
    renderControls();
    const loser = won ? B.foe : B.you;
    const lf = $('#fighter-' + loser.side);
    $('.monster', lf).innerHTML = monsterHtml(loser.seed, { hat: loser.hat, flip: loser.side === 'foe', ko: true });
    lf.classList.add('ko');
    log(won ? `🏆 <b>${esc(B.foe.name)}</b> is knocked out!` : fled ? `🏳️ You ran away!` : `😵 <b>${esc(B.you.name)}</b> got knocked out...`);
    await wait(900);

    const r = rewardsFor(B.foeSrc);
    let xp, coins;
    if (won) {
      S.wins++; S.streak++;
      xp = r.xp;
      coins = Math.round(r.coins * (1 + Math.min(S.streak - 1, 5) * 0.1));
      sfx.win();
    } else {
      S.losses++; S.streak = 0;
      xp = fled ? 0 : Math.round(r.xp * 0.3);
      coins = fled ? 0 : 5;
      sfx.lose();
    }
    S.coins += coins;
    const ups = gainXp(xp);
    S.foes = null;
    save();
    updateCoins();
    if (ups) setTimeout(sfx.level, 600);

    await modal(`
      <h2 class="${won ? 'win' : 'lose'}">${won ? 'VICTORY!' : 'DEFEAT'}</h2>
      <div class="result-art">${monsterHtml(S.monster.seed, { hat: S.hat, ko: !won })}</div>
      <p>${won ? `${esc(S.monster.name)} flattened ${esc(B.foe.name)}!` : `${esc(B.foe.name)} was too much this time. Train up and try again!`}</p>
      <div class="loot"><span>+${xp} XP</span><span>🦷 +${coins}</span>${won && S.streak > 1 ? `<span>🔥 ${S.streak} win streak</span>` : ''}</div>
      ${ups ? `<p class="lvlup">⭐ LEVEL UP! Now level ${S.monster.level}. +${ups * 3} stat points!</p>` : ''}`,
      [{ label: 'Back to Lair' }]);
    B = null;
    show('lair');
  }

  // ---------- Training ----------
  const TRAININGS = [
    { stat: 'str', name: 'Boulder Bash', icon: '🪨', desc: 'Mash the button (or Space) as fast as you can for 5 seconds to crack the boulder.', run: trainStrength },
    { stat: 'agi', name: 'Fly Swatter', icon: '🪰', desc: 'Swat the zippy flies before they buzz off.', run: trainAgility },
    { stat: 'tou', name: 'Rock Catch', icon: '🧱', desc: 'Brace for 5 falling rocks. Time each catch on the meter.', run: trainToughness },
  ];

  function renderTrain() {
    updateCoins();
    const cost = trainCost();
    $('#train-cost').textContent = cost;
    $('#train-list').innerHTML = TRAININGS.map((t, i) => {
      const st = STATS.find(s => s.key === t.stat);
      return `<div class="card train-card">
        <div class="big-icon">${t.icon}</div>
        <h3>${t.name}</h3>
        <div class="muted">Trains ${st.icon} ${st.name} (now ${S.monster[t.stat]})</div>
        <p>${t.desc}</p>
        <button class="btn" data-train="${i}" ${S.coins < cost ? 'disabled' : ''}>Train · 🦷${cost}</button>
      </div>`;
    }).join('');
    $$('#train-list [data-train]').forEach(b => b.onclick = () => startTraining(TRAININGS[+b.dataset.train]));
  }

  async function startTraining(t) {
    const cost = trainCost();
    if (S.coins < cost) return toast('Not enough fangs!');
    S.coins -= cost; save(); updateCoins(); sfx.coin();
    const gain = await t.run();
    const st = STATS.find(s => s.key === t.stat);
    S.monster[t.stat] += gain;
    const ups = gainXp(5 + gain * 3);
    save();
    if (gain) sfx.level();
    await modal(`<h2>${t.icon} ${t.name}</h2>
      <p class="big-result">${gain ? `+${gain} ${st.icon} ${st.name}!` : 'No gain this time...'}</p>
      <p class="muted">${gain === 3 ? 'Beastly performance!' : gain ? 'Nice work. Keep it up!' : 'Practice makes monstrous.'}</p>
      ${ups ? `<p class="lvlup">⭐ LEVEL UP! Now level ${S.monster.level}.</p>` : ''}`);
    renderTrain();
  }

  function trainStrength() {
    return new Promise(resolve => {
      let count = 0, started = false, left = 5;
      const box = $('#modal-box');
      box.innerHTML = `<h2>🪨 Boulder Bash</h2><p class="muted">Mash! Mash! Mash!</p>
        <div class="boulder" id="boulder">🪨</div>
        <div class="mash-stats"><span>Hits: <b id="mash-n">0</b></span><span>Time: <b id="mash-t">5.0</b>s</span></div>
        <button class="btn big" id="mash-btn">SMASH!</button>`;
      $('#modal').classList.remove('hidden');
      const boulder = $('#boulder');
      let timer, t0;
      const hit = (e) => {
        if (e) e.preventDefault();
        if (left <= 0) return;
        if (!started) {
          started = true; t0 = performance.now();
          timer = setInterval(() => {
            left = Math.max(0, 5 - (performance.now() - t0) / 1000);
            $('#mash-t').textContent = left.toFixed(1);
            if (left <= 0) end();
          }, 50);
        }
        count++;
        $('#mash-n').textContent = count;
        boulder.style.transform = `scale(${1 + Math.min(count, 40) * 0.012}) rotate(${(Math.random() - 0.5) * 16}deg)`;
        beep(120 + count * 6, 0.05, 'square', 0.03);
      };
      const onKey = (e) => { if (e.code === 'Space' && !e.repeat) hit(e); };
      const end = () => {
        clearInterval(timer);
        removeEventListener('keydown', onKey);
        boulder.textContent = count >= 25 ? '💥' : '🪨';
        setTimeout(() => {
          $('#modal').classList.add('hidden');
          resolve(count >= 38 ? 3 : count >= 26 ? 2 : count >= 12 ? 1 : 0);
        }, 700);
      };
      $('#mash-btn').addEventListener('pointerdown', hit);
      $('#mash-btn').addEventListener('click', e => e.preventDefault());
      addEventListener('keydown', onKey);
    });
  }

  function trainAgility() {
    return new Promise(resolve => {
      const box = $('#modal-box');
      box.innerHTML = `<h2>🪰 Fly Swatter</h2><p class="muted">Swat them fast! <b id="fly-n">0</b> / 15</p><div class="fly-field" id="fly-field"></div>`;
      $('#modal').classList.remove('hidden');
      const field = $('#fly-field');
      let spawned = 0, swatted = 0;
      const spawn = () => {
        if (spawned >= 15) {
          setTimeout(() => {
            $('#modal').classList.add('hidden');
            resolve(swatted >= 13 ? 3 : swatted >= 9 ? 2 : swatted >= 5 ? 1 : 0);
          }, 900);
          return;
        }
        spawned++;
        const fly = document.createElement('div');
        fly.className = 'fly';
        fly.textContent = '🪰';
        fly.style.left = rand(5, 85) + '%';
        fly.style.top = rand(5, 80) + '%';
        fly.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          if (fly.classList.contains('hit')) return;
          fly.classList.add('hit');
          fly.textContent = '💥';
          swatted++;
          $('#fly-n').textContent = swatted;
          beep(700 + swatted * 30, 0.06, 'square', 0.04);
        });
        field.appendChild(fly);
        const life = Math.max(550, 1000 - spawned * 25);
        setTimeout(() => fly.remove(), life);
        setTimeout(spawn, life * 0.75);
      };
      setTimeout(spawn, 600);
    });
  }

  async function trainToughness() {
    let sum = 0;
    for (let i = 0; i < 5; i++) {
      sum += await runMeter({ title: `🧱 Rock ${i + 1} of 5 incoming!`, speed: 1 + i * 0.25, zone: 0.07, timeout: 3 });
      await wait(200);
    }
    const avg = sum / 5;
    return avg >= 0.85 ? 3 : avg >= 0.6 ? 2 : avg >= 0.3 ? 1 : 0;
  }

  // ---------- Shop ----------
  let shopTab = 'moves';
  function renderShop() {
    updateCoins();
    $$('#shop-tabs .tab').forEach(t => t.classList.toggle('active', t.dataset.tab === shopTab));
    const lvl = S.monster.level;
    let cards = [];
    if (shopTab === 'moves') {
      cards = Object.entries(MOVES).filter(([, m]) => m.price > 0).map(([id, m]) => {
        const owned = S.moves.includes(id), locked = m.lvl > lvl;
        return card(`<div class="big-icon">${m.icon}</div><h3>${m.name}</h3>
          <div class="muted">${m.power}⚔ · ${m.acc}% acc · ${m.cost}⚡</div><p>${m.desc}</p>`,
          owned ? 'Owned' : locked ? `Needs Lv ${m.lvl}` : `Buy · 🦷${m.price}`,
          owned || locked || S.coins < m.price, `move:${id}`);
      });
    } else if (shopTab === 'items') {
      cards = Object.entries(ITEMS).map(([id, it]) => card(
        `<div class="big-icon">${it.icon}</div><h3>${it.name}</h3><div class="muted">You have ${S.items[id] || 0}</div><p>${it.desc}</p>`,
        `Buy · 🦷${it.price}`, S.coins < it.price, `item:${id}`));
    } else {
      cards = Object.entries(HATS).map(([id, h]) => {
        const owned = S.hats.includes(id);
        return card(`<div class="hat-preview">${monsterHtml(S.monster.seed, { hat: id })}</div><h3>${h.name}</h3>`,
          owned ? 'Owned' : `Buy · 🦷${h.price}`, owned || S.coins < h.price, `hat:${id}`);
      });
    }
    $('#shop-list').innerHTML = cards.join('');
    $$('#shop-list [data-buy]').forEach(b => b.onclick = () => buy(b.dataset.buy));
  }
  function card(body, label, disabled, key) {
    return `<div class="card shop-card">${body}<button class="btn" data-buy="${key}" ${disabled ? 'disabled' : ''}>${label}</button></div>`;
  }
  function buy(key) {
    const [kind, id] = key.split(':');
    const price = kind === 'move' ? MOVES[id].price : kind === 'item' ? ITEMS[id].price : HATS[id].price;
    if (S.coins < price) return toast('Not enough fangs!');
    S.coins -= price;
    if (kind === 'move') {
      S.moves.push(id);
      if (S.equipped.length < 4) S.equipped.push(id);
      toast(`Learned ${MOVES[id].name}!` + (S.equipped.includes(id) ? '' : ' Equip it in your Lair.'));
    } else if (kind === 'item') {
      S.items[id] = (S.items[id] || 0) + 1;
      toast(`Bought ${ITEMS[id].name}.`);
    } else {
      S.hats.push(id);
      S.hat = id;
      toast(`Now wearing the ${HATS[id].name}!`);
    }
    sfx.coin();
    save();
    renderShop();
  }

  // ---------- Settings ----------
  async function openMenu() {
    const choice = await modal(`<h2>⚙️ Settings</h2><p class="muted">Your progress saves automatically in this browser.</p>`, [
      { label: 'Rename beastie', value: 'rename' },
      { label: 'Start over', value: 'reset', cls: 'danger' },
      { label: 'Close', value: null, cls: 'alt' },
    ]);
    if (choice === 'rename' && S.monster) {
      const name = (prompt('New name?', S.monster.name) || '').trim().slice(0, 16);
      if (name) { S.monster.name = name; save(); if ($('#screen-lair').classList.contains('active')) renderLair(); }
    } else if (choice === 'reset') {
      const sure = await modal('<h2>Start over?</h2><p>This deletes your beastie and all progress.</p>',
        [{ label: 'Delete everything', value: true, cls: 'danger' }, { label: 'Cancel', value: false, cls: 'alt' }]);
      if (sure) {
        S = freshState(); save(); B = null;
        hatchSeed = randSeed(); renderHatch(); updateCoins(); show('hatch');
      }
    }
  }

  function updateMute() { $('#mute-btn').textContent = S.muted ? '🔇' : '🔊'; }

  // ---------- Boot ----------
  function init() {
    load();
    initHatch();
    $$('[data-go]').forEach(b => b.addEventListener('click', () => { sfx.click(); show(b.dataset.go); }));
    $('#reroll-foes').onclick = () => { sfx.click(); S.foes = null; renderSelect(); };
    $('#items-btn').onclick = useItem;
    $('#forfeit-btn').onclick = forfeit;
    $$('#shop-tabs .tab').forEach(t => t.onclick = () => { shopTab = t.dataset.tab; sfx.click(); renderShop(); });
    $('#mute-btn').onclick = () => { S.muted = !S.muted; save(); updateMute(); };
    $('#menu-btn').onclick = () => { if (!B) openMenu(); else toast('Finish the fight first!'); };
    updateMute();
    updateCoins();
    if (S.monster) show('lair');
    else { renderHatch(); show('hatch'); }
  }

  init();
})();
