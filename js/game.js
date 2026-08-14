/* ══════════════════════════════════════════════════════════════
   game.js — Hitster: opzet, beurten, stelen, onthullen, winnen.
   Eén apparaat gaat rond aan tafel; de staat leeft in `S` en wordt
   na elke zet in localStorage bewaard, zodat een per ongeluk
   ververste pagina het potje niet sloopt.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var DECK = window.HITSTER_DECK || [];
  var LS_GAME = 'hitster.game.v1';
  var LS_SOUND = 'hitster.sound';
  var MAX_TOKENS = 3;
  var START_TOKENS = 1;

  var COLORS = ['#ff3d9a', '#22e0d6', '#b8ff3d', '#ffb63d', '#8b5cff',
                '#ff7a45', '#4ec3ff', '#ff5470', '#7cf5a4', '#e0a3ff'];

  var $ = function (id) { return document.getElementById(id); };

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* ══════════ staat ══════════ */
  var S = null;                 // lopend spel
  var setupPlayers = [];        // namen tijdens het instellen
  var soundOn = localStorage.getItem(LS_SOUND) !== 'off';
  var wakeLock = null;

  function save() {
    try { localStorage.setItem(LS_GAME, JSON.stringify(S)); } catch (e) {}
  }
  function loadSaved() {
    try {
      var raw = localStorage.getItem(LS_GAME);
      if (!raw) return null;
      var g = JSON.parse(raw);
      return (g && g.players && g.players.length && !g.winner) ? g : null;
    } catch (e) { return null; }
  }
  function clearSave() { try { localStorage.removeItem(LS_GAME); } catch (e) {} }

  /* ══════════ deck ══════════ */
  function filteredDeck(settings) {
    var from = 0, to = 9999;
    if (settings.era && settings.era !== 'all') {
      var p = settings.era.split('-');
      from = +p[0]; to = +p[1];
    }
    var out = [];
    for (var i = 0; i < DECK.length; i++) {
      var c = DECK[i];
      if (c.y < from || c.y > to) continue;
      if (settings.nl && !c.nl) continue;
      out.push(i);
    }
    return out;
  }

  function card(idx) { return DECK[idx]; }

  /* ══════════ geluidseffecten ══════════ */
  var actx = null;
  function beep(notes) {
    if (!soundOn) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      var t0 = actx.currentTime;
      notes.forEach(function (n, i) {
        var o = actx.createOscillator(), g = actx.createGain();
        o.type = 'triangle';
        o.frequency.value = n;
        g.gain.setValueAtTime(0.0001, t0 + i * 0.11);
        g.gain.exponentialRampToValueAtTime(0.22, t0 + i * 0.11 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.11 + 0.20);
        o.connect(g); g.connect(actx.destination);
        o.start(t0 + i * 0.11); o.stop(t0 + i * 0.11 + 0.22);
      });
    } catch (e) {}
  }
  var sfx = {
    good: function () { beep([660, 880, 1170]); },
    bad:  function () { beep([300, 190]); },
    win:  function () { beep([523, 659, 784, 1047]); }
  };

  /* ══════════ schermen ══════════ */
  function show(name) {
    ['setup', 'game', 'steal', 'reveal', 'win'].forEach(function (n) {
      $('screen-' + n).classList.toggle('is-active', n === name);
    });
    window.scrollTo(0, 0);
  }

  function openSheet(id) { $(id).hidden = false; }
  function closeSheets() {
    ['sheet-scores', 'sheet-menu', 'sheet-rules'].forEach(function (id) { $(id).hidden = true; });
  }

  /* ══════════ SETUP ══════════ */
  function renderSetup() {
    var list = $('setup-players');
    list.innerHTML = '';
    setupPlayers.forEach(function (p, i) {
      var li = el('li', 'playerrow');
      var dot = el('span', 'playerrow__dot');
      dot.style.background = COLORS[i % COLORS.length];
      dot.style.color = COLORS[i % COLORS.length];
      var del = el('button', 'playerrow__del', '✕');
      del.type = 'button';
      del.setAttribute('aria-label', 'Verwijder ' + p);
      del.onclick = function () { setupPlayers.splice(i, 1); renderSetup(); };
      li.appendChild(dot);
      li.appendChild(el('span', 'playerrow__name', p));
      li.appendChild(del);
      list.appendChild(li);
    });

    $('add-player-input').disabled = setupPlayers.length >= 10;
    $('players-hint').textContent = setupPlayers.length < 2
      ? 'Voeg minimaal 2 spelers toe.'
      : setupPlayers.length + ' spelers — maximaal 10.';
    $('btn-start').disabled = setupPlayers.length < 2;
    renderDeckCount();
  }

  function currentSettings() {
    return {
      target: +$('set-target').value,
      tokens: $('set-tokens').checked,
      era: $('set-era').value,
      nl: $('set-nl').checked
    };
  }

  function renderDeckCount() {
    var s = currentSettings();
    var n = filteredDeck(s).length;
    var players = Math.max(setupPlayers.length, 2);
    var needed = players * (s.target + 1);
    var msg = n + ' nummers in dit deck.';
    if (n < needed) {
      msg += ' Krap voor ' + players + ' spelers × ' + s.target +
             ' kaarten — is het deck op, dan wint wie de meeste kaarten heeft.';
    }
    $('deck-count').textContent = msg;
  }

  /* ══════════ spel starten ══════════ */
  function newGame() {
    var settings = currentSettings();
    var pool = shuffle(filteredDeck(settings));

    S = {
      settings: settings,
      players: setupPlayers.map(function (name, i) {
        return { id: i, name: name, color: COLORS[i % COLORS.length], tokens: settings.tokens ? START_TOKENS : 0, cards: [] };
      }),
      deck: pool,
      pos: 0,
      turn: 0,
      phase: 'turn',
      current: null,       // deck-index van het klinkende nummer
      placement: null,     // gekozen gat van de speler aan de beurt
      stealer: null,       // speler-id van de dief
      stealPlacement: null,
      claim: false,        // "ik weet titel én artiest"
      claimAnswered: false,
      outcome: null,
      winner: null
    };

    // iedereen begint met één open startkaart
    S.players.forEach(function (p) {
      if (S.pos < S.deck.length) p.cards.push(S.deck[S.pos++]);
    });

    requestWakeLock();
    startTurn();
  }

  function startTurn() {
    if (S.pos >= S.deck.length) return endByEmptyDeck();

    S.phase = 'turn';
    S.current = S.deck[S.pos++];
    S.placement = null;
    S.stealer = null;
    S.stealPlacement = null;
    S.claim = false;
    S.claimAnswered = false;
    S.outcome = null;
    save();

    show('game');
    renderGame();
    loadCurrentSong();
    if (S.pos < S.deck.length) Music.prefetch(card(S.deck[S.pos]));
  }

  /* ══════════ muziek ══════════ */
  var loadToken = 0;

  function loadCurrentSong() {
    var mine = ++loadToken;
    var c = card(S.current);
    setPlayerStatus('Nummer wordt opgehaald…', false);
    $('btn-play').disabled = true;
    $('btn-replay').hidden = true;
    $('player-error').hidden = true;
    $('progress').hidden = true;
    $('progress-bar').style.width = '0%';

    Music.load(c).then(function (info) {
      if (mine !== loadToken) return;
      if (!info) return songFailed('Dit nummer is nu niet te vinden bij Apple.');
      $('btn-play').disabled = false;
      setPlayerStatus('Klaar — druk op play. Titel, artiest en jaar blijven verborgen tot de onthulling.', false);
    }).catch(function () {
      if (mine !== loadToken) return;
      songFailed('Geen verbinding met de muziekdienst.');
    });
  }

  function songFailed(msg) {
    $('btn-play').disabled = true;
    setPlayerStatus('Geen geluid beschikbaar', false);
    var box = $('player-error');
    box.hidden = false;
    box.textContent = msg + ' Sla het over — je verliest niets.';
  }

  function setPlayerStatus(text, spinning) {
    $('player-status').textContent = text;
    $('disc').classList.toggle('is-spinning', !!spinning);
  }

  function playCurrent() {
    Music.play().then(function () {
      setPlayerStatus('Speelt… luister goed 🎧', true);
      $('btn-play').textContent = '❚❚ Pauze';
      $('btn-replay').hidden = false;
      $('progress').hidden = false;
    }).catch(function (err) {
      if (err && err.name === 'NotAllowedError') {
        songFailedSoft('Je browser blokkeerde het geluid. Tik nog een keer op play.');
      } else {
        songFailed('Dit nummer wil niet afspelen.');
      }
    });
  }

  function songFailedSoft(msg) {
    var box = $('player-error');
    box.hidden = false;
    box.textContent = msg;
  }

  Music.on('progress', function (frac) {
    $('progress-bar').style.width = Math.round(frac * 100) + '%';
  });
  Music.on('ended', function () {
    $('btn-play').textContent = '▶ Speel opnieuw';
    setPlayerStatus('Klaar. Nog een keer luisteren mag.', false);
  });
  Music.on('pause', function () {
    $('btn-play').textContent = '▶ Verder luisteren';
    setPlayerStatus('Gepauzeerd', false);
  });

  /* ══════════ tijdlijn ══════════ */
  function sortedCards(player) {
    return player.cards.slice().sort(function (a, b) { return card(a).y - card(b).y; });
  }

  function gapLabel(cards, index) {
    if (!cards.length) return ['eerste kaart', ''];
    if (index === 0) return ['vóór', String(card(cards[0]).y)];
    if (index === cards.length) return ['na', String(card(cards[cards.length - 1]).y)];
    return ['tussen', card(cards[index - 1]).y + ' – ' + card(cards[index]).y];
  }

  /**
   * Tekent een tijdlijn.
   * @param {HTMLElement} host
   * @param {object} player
   * @param {object} opts {interactive, chosen, onPick, newCard}
   */
  function renderTimeline(host, player, opts) {
    opts = opts || {};
    host.innerHTML = '';
    host.classList.toggle('timeline--locked', !opts.interactive);
    var cards = sortedCards(player);

    for (var i = 0; i <= cards.length; i++) {
      if (opts.interactive || opts.chosen === i) {
        host.appendChild(makeGap(cards, i, opts));
      }
      if (i < cards.length) host.appendChild(makeCard(cards[i], opts.newCard === cards[i]));
    }
    if (!cards.length && !opts.interactive && opts.chosen == null) {
      host.appendChild(el('p', 'empty-note', 'Nog geen kaarten.'));
    }
  }

  function makeGap(cards, i, opts) {
    var g = el('button', 'gap');
    g.type = 'button';
    var lab = gapLabel(cards, i);
    g.appendChild(el('span', 'gap__plus', '+'));
    g.appendChild(el('span', null, lab[0]));
    if (lab[1]) g.appendChild(el('strong', null, lab[1]));
    if (opts.chosen === i) g.classList.add('is-chosen');
    if (opts.interactive) g.onclick = function () { opts.onPick(i); };
    return g;
  }

  function makeCard(idx, isNew) {
    var c = card(idx);
    var d = el('div', 'tcard' + (isNew ? ' tcard--new' : ''));
    d.appendChild(el('span', 'tcard__year', String(c.y)));
    d.appendChild(el('span', 'tcard__title', c.t));
    d.appendChild(el('span', 'tcard__artist', c.a));
    return d;
  }

  /* ══════════ spelscherm ══════════ */
  function activePlayer() { return S.players[S.turn]; }

  function renderGame() {
    var p = activePlayer();
    $('turn-name').textContent = p.name;
    $('turn-dot').style.background = p.color;
    $('turn-dot').style.color = p.color;
    renderStrip();

    $('stage-hint').textContent = S.players.length > 1
      ? p.name + ', waar hoort dit nummer in jouw tijdlijn?'
      : 'Waar hoort dit nummer in de tijdlijn?';

    renderTimeline($('timeline'), p, {
      interactive: true,
      chosen: S.placement,
      onPick: function (i) {
        S.placement = i;
        renderGame();
        save();
      }
    });

    var guessOn = S.settings.tokens && p.tokens < MAX_TOKENS;
    $('guessbox').hidden = !guessOn;
    $('guess-claim').checked = !!S.claim;

    var btn = $('btn-confirm');
    btn.disabled = S.placement == null;
    btn.textContent = S.placement == null ? 'Kies eerst een plek' : 'Vastleggen ▸';
  }

  function renderStrip() {
    var strip = $('player-strip');
    strip.innerHTML = '';
    S.players.forEach(function (p, i) {
      var chip = el('div', 'chip' + (i === S.turn ? ' is-turn' : ''));
      chip.style.color = p.color;
      var dot = el('span', 'chip__dot');
      dot.style.background = p.color;
      chip.appendChild(dot);
      chip.appendChild(el('span', 'chip__name', p.name));
      chip.appendChild(el('span', 'chip__score', p.cards.length + '/' + S.settings.target));
      if (S.settings.tokens) {
        chip.appendChild(el('span', 'chip__tokens', p.tokens ? new Array(p.tokens + 1).join('●') : '○'));
      }
      strip.appendChild(chip);
    });
  }

  /* ══════════ vastleggen → stelen → onthullen ══════════ */
  function confirmPlacement() {
    if (S.placement == null) return;
    S.claim = S.settings.tokens && $('guess-claim').checked;
    Music.pause();

    var thieves = possibleThieves();
    if (S.settings.tokens && thieves.length) {
      S.phase = 'steal';
      save();
      renderSteal(thieves);
      show('steal');
    } else {
      doReveal();
    }
  }

  function possibleThieves() {
    return S.players.filter(function (p, i) { return i !== S.turn && p.tokens > 0; });
  }

  function renderSteal(thieves) {
    // De keuze van de speler aan de beurt is open — daar baseer je je steel op.
    var active = activePlayer();
    var lab = gapLabel(sortedCards(active), S.placement);
    var keuze = lab[1] ? lab[0] + ' ' + lab[1] : lab[0];

    $('steal-intro').innerHTML = '<strong>' + escapeHtml(active.name) + '</strong> legt de kaart ' +
      '<strong>' + escapeHtml(keuze) + '</strong> in de eigen tijdlijn. Wie denkt het beter te weten? ' +
      'Stelen kost 1 token — je plaatst de kaart dan in je eigen tijdlijn. ' +
      'Let op: heeft ' + escapeHtml(active.name) + ' het gewoon goed, dan blijft de kaart daar ' +
      'en ben je je token kwijt.';
    var list = $('stealers');
    list.innerHTML = '';
    thieves.forEach(function (p) {
      var li = el('li');
      var b = el('button', 'btn btn--ghost');
      b.type = 'button';
      b.style.color = p.color;
      b.appendChild(el('span', null, p.name + ' steelt'));
      b.appendChild(el('small', null, p.tokens + ' token' + (p.tokens > 1 ? 's' : '')));
      b.onclick = function () { startSteal(p.id); };
      li.appendChild(b);
      list.appendChild(li);
    });
  }

  function startSteal(playerId) {
    var thief = S.players[playerId];
    S.stealer = playerId;
    S.stealPlacement = null;
    thief.tokens -= 1;                    // token is direct betaald
    S.phase = 'stealPlace';
    save();
    show('game');
    renderStealPlacement();
  }

  function renderStealPlacement() {
    var thief = S.players[S.stealer];
    $('turn-name').textContent = thief.name + ' steelt';
    $('turn-dot').style.background = thief.color;
    renderStrip();
    $('stage-hint').textContent = thief.name + ', plaats de kaart in jouw tijdlijn.';
    $('guessbox').hidden = true;

    renderTimeline($('timeline'), thief, {
      interactive: true,
      chosen: S.stealPlacement,
      onPick: function (i) { S.stealPlacement = i; renderStealPlacement(); save(); }
    });

    var btn = $('btn-confirm');
    btn.disabled = S.stealPlacement == null;
    btn.textContent = S.stealPlacement == null ? 'Kies een plek' : 'Onthul het jaar ▸';
  }

  function isCorrect(player, index, year) {
    var cards = sortedCards(player);
    var left = index > 0 ? card(cards[index - 1]).y : -Infinity;
    var right = index < cards.length ? card(cards[index]).y : Infinity;
    return left <= year && year <= right;
  }

  function doReveal() {
    Music.stop();
    var c = card(S.current);
    var active = activePlayer();

    var activeOk = isCorrect(active, S.placement, c.y);
    var thief = S.stealer != null ? S.players[S.stealer] : null;
    var thiefOk = thief ? isCorrect(thief, S.stealPlacement, c.y) : false;

    var winnerOfCard = activeOk ? active : (thief && thiefOk ? thief : null);

    S.outcome = {
      activeOk: activeOk,
      thiefOk: thiefOk,
      winnerId: winnerOfCard ? winnerOfCard.id : null
    };
    S.phase = 'reveal';

    if (winnerOfCard) winnerOfCard.cards.push(S.current);
    save();

    renderReveal(c);
    show('reveal');
    (activeOk ? sfx.good : sfx.bad)();
  }

  function renderReveal(c) {
    $('reveal-year').textContent = c.y;
    $('reveal-title').textContent = c.t;
    $('reveal-artist').textContent = c.a;

    var art = $('reveal-art');
    var info = Music.info();
    art.onerror = function () { art.hidden = true; };
    if (info && info.art) { art.src = info.art; art.hidden = false; art.alt = c.t; }
    else { art.hidden = true; art.removeAttribute('src'); }

    var list = $('verdicts');
    list.innerHTML = '';
    var active = activePlayer();
    list.appendChild(verdictRow(
      active, S.outcome.activeOk ? 'good' : 'bad',
      S.outcome.activeOk ? 'Goed geplaatst — kaart is van jou.'
                         : 'Zat er naast.'
    ));

    if (S.stealer != null) {
      var thief = S.players[S.stealer];
      var tone, txt;
      if (S.outcome.thiefOk && S.outcome.activeOk) {
        tone = 'neutral';
        txt = 'Jouw plek klopte ook, maar ' + active.name + ' was aan de beurt en had het goed. ' +
              'De kaart blijft daar; je token is weg.';
      } else if (S.outcome.thiefOk) {
        tone = 'good';
        txt = 'Gestolen! De kaart is van jou.';
      } else {
        tone = 'bad';
        txt = 'Fout gegokt. Token weg.';
      }
      list.appendChild(verdictRow(thief, tone, txt));
    }

    var tc = $('tokencheck');
    if (S.claim && !S.claimAnswered) {
      tc.hidden = false;
      $('tokencheck-q').textContent = active.name + ', had je titel én artiest goed? De rest van de tafel beslist.';
      $('btn-next').disabled = true;
    } else {
      tc.hidden = true;
      $('btn-next').disabled = false;
    }

    $('btn-next').textContent = nextWinner() ? 'Bekijk de winnaar 🏆' : 'Volgende speler ▸';
    renderStrip();
  }

  var VERDICT_ICON = { good: '✅', bad: '❌', neutral: '➖' };

  function verdictRow(player, tone, text) {
    var li = el('li', 'verdict verdict--' + tone);
    li.appendChild(el('span', 'verdict__icon', VERDICT_ICON[tone]));
    var box = el('span', 'verdict__text');
    var name = el('strong', null, player.name);
    name.style.color = player.color;
    box.appendChild(name);
    box.appendChild(document.createTextNode(text));
    li.appendChild(box);
    return li;
  }

  function answerClaim(yes) {
    var p = activePlayer();
    S.claimAnswered = true;
    if (yes && p.tokens < MAX_TOKENS) { p.tokens += 1; sfx.good(); }
    $('tokencheck').hidden = true;
    $('btn-next').disabled = false;
    renderStrip();
    save();
  }

  function nextWinner() {
    var best = null;
    S.players.forEach(function (p) {
      if (p.cards.length >= S.settings.target && (!best || p.cards.length > best.cards.length)) best = p;
    });
    return best;
  }

  function nextTurn() {
    var w = nextWinner();
    if (w) return finish(w);
    S.turn = (S.turn + 1) % S.players.length;
    startTurn();
  }

  function endByEmptyDeck() {
    var best = S.players.slice().sort(function (a, b) { return b.cards.length - a.cards.length; })[0];
    finish(best, true);
  }

  function finish(winner, deckEmpty) {
    S.winner = winner.id;
    S.phase = 'win';
    clearSave();
    releaseWakeLock();

    $('win-name').textContent = winner.name;
    $('win-name').style.filter = 'none';
    $('win-sub').textContent = deckEmpty
      ? 'Het deck is op — met ' + winner.cards.length + ' kaarten de meeste van iedereen.'
      : winner.cards.length + ' kaarten op een kloppende tijdlijn.';
    var host = $('win-timeline');
    host.innerHTML = '';
    var tl = el('div', 'timeline');
    renderTimeline(tl, winner, { interactive: false });
    host.appendChild(tl);

    show('win');
    sfx.win();
    confetti();
  }

  /* ══════════ stand ══════════ */
  function renderScores() {
    var body = $('scores-body');
    body.innerHTML = '';
    var board = el('div', 'scoreboard');
    S.players.slice().sort(function (a, b) { return b.cards.length - a.cards.length; }).forEach(function (p) {
      var block = el('div', 'scoreboard__player');
      var head = el('div', 'scoreboard__head');
      var dot = el('span', 'playerrow__dot');
      dot.style.background = p.color;
      head.appendChild(dot);
      head.appendChild(el('span', 'scoreboard__name', p.name));
      head.appendChild(el('span', 'scoreboard__meta',
        p.cards.length + '/' + S.settings.target + (S.settings.tokens ? ' · ' + p.tokens + ' token' + (p.tokens === 1 ? '' : 's') : '')));
      block.appendChild(head);

      var wrap = el('div', 'timeline-wrap');
      var tl = el('div', 'timeline');
      renderTimeline(tl, p, { interactive: false });
      wrap.appendChild(tl);
      block.appendChild(wrap);
      board.appendChild(block);
    });
    body.appendChild(board);
  }

  /* ══════════ confetti ══════════ */
  function confetti() {
    var cv = $('confetti');
    var ctx = cv.getContext('2d');
    var W = cv.width = window.innerWidth;
    var H = cv.height = window.innerHeight;
    var bits = [];
    for (var i = 0; i < 130; i++) {
      bits.push({
        x: Math.random() * W, y: -20 - Math.random() * H,
        r: 4 + Math.random() * 7,
        c: COLORS[Math.floor(Math.random() * COLORS.length)],
        vy: 1.6 + Math.random() * 3.2,
        vx: -1 + Math.random() * 2,
        rot: Math.random() * 6.28, vr: -0.12 + Math.random() * 0.24
      });
    }
    var frames = 0;
    (function step() {
      ctx.clearRect(0, 0, W, H);
      bits.forEach(function (b) {
        b.y += b.vy; b.x += b.vx; b.rot += b.vr;
        if (b.y > H + 20) { b.y = -20; b.x = Math.random() * W; }
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.rot);
        ctx.fillStyle = b.c;
        ctx.fillRect(-b.r / 2, -b.r / 2, b.r, b.r * 0.6);
        ctx.restore();
      });
      if (++frames < 420) requestAnimationFrame(step);
      else ctx.clearRect(0, 0, W, H);
    })();
  }

  /* ══════════ scherm aan houden ══════════ */
  function requestWakeLock() {
    if (!navigator.wakeLock) return;
    navigator.wakeLock.request('screen').then(function (l) { wakeLock = l; }).catch(function () {});
  }
  function releaseWakeLock() {
    if (wakeLock) { try { wakeLock.release(); } catch (e) {} wakeLock = null; }
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && S && !S.winner) requestWakeLock();
  });

  /* ══════════ helpers ══════════ */
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ══════════ herstel van een opgeslagen potje ══════════ */
  function resume(saved) {
    S = saved;
    requestWakeLock();
    if (S.phase === 'reveal' && S.outcome) {
      renderReveal(card(S.current));
      show('reveal');
    } else if (S.phase === 'steal') {
      renderSteal(possibleThieves());
      show('steal');
    } else if (S.phase === 'stealPlace') {
      show('game');
      renderStealPlacement();
    } else {
      show('game');
      renderGame();
      loadCurrentSong();
    }
  }

  /* ══════════ knoppen ══════════ */
  function wire() {
    // setup
    $('add-player-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var input = $('add-player-input');
      var name = input.value.trim();
      if (!name || setupPlayers.length >= 10) return;
      if (setupPlayers.some(function (p) { return p.toLowerCase() === name.toLowerCase(); })) {
        name = name + ' 2';
      }
      setupPlayers.push(name);
      input.value = '';
      input.focus();
      renderSetup();
    });
    ['set-target', 'set-era', 'set-nl', 'set-tokens'].forEach(function (id) {
      $(id).addEventListener('change', renderDeckCount);
    });
    $('btn-start').addEventListener('click', function () { Music.stop(); clearSave(); newGame(); });
    $('btn-soundtest').addEventListener('click', function () {
      var btn = this, out = $('soundtest-result');
      if (btn.dataset.playing) return stopTest();
      var testCard = DECK.filter(function (c) { return c.t === 'Waterloo'; })[0] ||
                     DECK.filter(function (c) { return c.i; })[0] || DECK[0];
      btn.disabled = true;
      btn.textContent = 'Even ophalen…';
      out.textContent = 'Momentje…';
      Music.load(testCard)
        .then(function (info) { if (!info) throw new Error('niet gevonden'); return Music.play(); })
        .then(function () {
          out.textContent = 'Je hoort nu ' + testCard.a + ' — ' + testCard.t +
                            '. Hoor je niets? Check je volume, de stille stand en je internet.';
          btn.textContent = '■ Stop de test';
          btn.disabled = false;
          btn.dataset.playing = '1';
          setTimeout(stopTest, 12000);
        })
        .catch(function () {
          out.textContent = 'Geen muziek gekregen. Meestal is dat internet, een VPN of een adblocker ' +
                            'die itunes.apple.com tegenhoudt. Het spel werkt verder gewoon — je kunt ' +
                            'een nummer altijd overslaan via het menu.';
          btn.disabled = false;
          btn.textContent = '🔊 Probeer opnieuw';
        });
    });
    function stopTest() {
      var btn = $('btn-soundtest');
      if (!btn.dataset.playing) return;
      Music.stop();
      delete btn.dataset.playing;
      btn.textContent = '🔊 Speel een testnummer';
      btn.disabled = false;
    }
    $('btn-rules').addEventListener('click', function () { $('rules-target').textContent = $('set-target').value; openSheet('sheet-rules'); });

    // spel
    $('btn-play').addEventListener('click', function () {
      if (Music.isPlaying()) { Music.pause(); return; }
      playCurrent();
    });
    $('btn-replay').addEventListener('click', function () {
      Music.replay().then(function () { setPlayerStatus('Speelt… luister goed 🎧', true); });
    });
    $('btn-confirm').addEventListener('click', function () {
      if (S.phase === 'stealPlace') doReveal();
      else confirmPlacement();
    });
    $('guess-claim').addEventListener('change', function () { S.claim = this.checked; save(); });

    // stelen
    $('btn-noSteal').addEventListener('click', doReveal);

    // onthulling
    $('btn-guess-yes').addEventListener('click', function () { answerClaim(true); });
    $('btn-guess-no').addEventListener('click', function () { answerClaim(false); });
    $('btn-next').addEventListener('click', nextTurn);

    // winnaar
    $('btn-again').addEventListener('click', function () {
      // zelfde spelers, schone lei
      setupPlayers = S.players.map(function (p) { return p.name; });
      renderSetup();
      show('setup');
    });
    $('btn-win-scores').addEventListener('click', function () { renderScores(); openSheet('sheet-scores'); });

    // topbar + sheets
    $('btn-scores').addEventListener('click', function () { renderScores(); openSheet('sheet-scores'); });
    $('btn-menu').addEventListener('click', function () {
      $('menu-info').textContent = 'Nog ' + Math.max(0, S.deck.length - S.pos) + ' nummers in het deck.';
      $('btn-sound').textContent = 'Geluidseffecten: ' + (soundOn ? 'aan' : 'uit');
      $('btn-skip-song').hidden = !(S.phase === 'turn');
      openSheet('sheet-menu');
    });
    $('btn-menu-rules').addEventListener('click', function () {
      closeSheets();
      $('rules-target').textContent = S ? S.settings.target : 10;
      openSheet('sheet-rules');
    });
    $('btn-skip-song').addEventListener('click', function () {
      closeSheets();
      if (S.pos >= S.deck.length) return endByEmptyDeck();
      S.current = S.deck[S.pos++];
      S.placement = null;
      save();
      renderGame();
      loadCurrentSong();
    });
    $('btn-sound').addEventListener('click', function () {
      soundOn = !soundOn;
      localStorage.setItem(LS_SOUND, soundOn ? 'on' : 'off');
      this.textContent = 'Geluidseffecten: ' + (soundOn ? 'aan' : 'uit');
    });
    $('btn-quit').addEventListener('click', function () {
      if (!confirm('Spel stoppen en terug naar het instelscherm?')) return;
      Music.stop();
      clearSave();
      releaseWakeLock();
      closeSheets();
      setupPlayers = S.players.map(function (p) { return p.name; });
      S = null;
      renderSetup();
      show('setup');
    });

    document.querySelectorAll('[data-close-sheet]').forEach(function (b) {
      b.addEventListener('click', closeSheets);
    });
    ['sheet-scores', 'sheet-menu', 'sheet-rules'].forEach(function (id) {
      $(id).addEventListener('click', function (e) { if (e.target === this) closeSheets(); });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeSheets();
      if (e.key === ' ' && $('screen-game').classList.contains('is-active') && !$('btn-play').disabled) {
        e.preventDefault();
        $('btn-play').click();
      }
    });

    // opgeslagen potje
    var saved = loadSaved();
    if (saved) {
      var btn = $('btn-resume');
      btn.hidden = false;
      btn.textContent = '▸ Verder met het opgeslagen spel (' +
        saved.players.map(function (p) { return p.name; }).join(', ') + ')';
      btn.addEventListener('click', function () { resume(saved); });
    }
  }

  /* ══════════ start ══════════ */
  wire();
  renderSetup();
})();
