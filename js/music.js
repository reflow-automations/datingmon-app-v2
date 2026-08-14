/* ══════════════════════════════════════════════════════════════
   music.js — geluid voor Hitster.

   Elk nummer wordt afgespeeld als de officiële 30-seconden preview
   van Apple/iTunes. Twee routes naar die preview:

     1. het geverifieerde track-id uit het deck  (lookup, snel en exact)
     2. zoeken op "artiest titel"                (fallback, streng gefilterd)

   Het opvragen gaat eerst via JSONP (werkt altijd, ook zonder
   CORS-headers) en anders via een gewone fetch. Gevonden previews
   blijven 30 dagen in localStorage staan, dus een tweede potje
   start meteen.
   ══════════════════════════════════════════════════════════════ */

window.Music = (function () {
  var API = 'https://itunes.apple.com';
  var COUNTRY = 'NL';
  var CACHE_PREFIX = 'hitster.audio.';
  var CACHE_MS = 30 * 24 * 60 * 60 * 1000;
  var JSONP_TIMEOUT = 9000;

  /* ── JSONP ────────────────────────────────────────────────── */
  var jsonpSeq = 0;

  function jsonp(path, params) {
    return new Promise(function (resolve, reject) {
      var cb = 'hitsterCb' + (++jsonpSeq) + '_' + Date.now().toString(36);
      var script = document.createElement('script');
      var done = false;

      function cleanup() {
        try { delete window[cb]; } catch (e) { window[cb] = undefined; }
        if (script.parentNode) script.parentNode.removeChild(script);
      }
      var timer = setTimeout(function () {
        if (done) return;
        done = true; cleanup(); reject(new Error('timeout'));
      }, JSONP_TIMEOUT);

      window[cb] = function (data) {
        if (done) return;
        done = true; clearTimeout(timer); cleanup(); resolve(data);
      };
      script.onerror = function () {
        if (done) return;
        done = true; clearTimeout(timer); cleanup(); reject(new Error('network'));
      };
      script.src = API + path + '?' + qs(params) + '&callback=' + cb;
      document.head.appendChild(script);
    });
  }

  function qs(params) {
    return Object.keys(params)
      .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); })
      .join('&');
  }

  /* Tweede route: gewone fetch. De Search API stuurt meestal
     Access-Control-Allow-Origin: *, dus dit werkt als JSONP
     geblokkeerd wordt (strenge CSP, adblocker). */
  function fetchJson(path, params) {
    if (!window.fetch) return Promise.reject(new Error('no-fetch'));
    return fetch(API + path + '?' + qs(params)).then(function (r) {
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json();
    });
  }

  function api(path, params) {
    return jsonp(path, params).catch(function () { return fetchJson(path, params); });
  }

  /* ── matchen ──────────────────────────────────────────────── */
  var BAD_WORDS = ['karaoke', 'tribute', 'made famous', 'in the style of', 'backing track',
                   'instrumental version', 'cover version', 'originally performed', 'workout mix',
                   'lullaby', '8-bit', 'meditation', 'piano tribute', 'made popular'];
  // Versies die niet "het nummer zoals iedereen het kent" zijn.
  var BAD_VERSION = ['take 1', 'take 2', 'take 3', 'demo', 'rehearsal', 'a cappella', 'acapella',
                     'karaoke', 'instrumental', 'pianoforte', 'rah mix', 'workout'];

  function norm(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/\(.*?\)|\[.*?\]/g, ' ')
      .replace(/\b(feat|ft)\..*$/, ' ')
      .replace(/[^a-z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function scoreResult(r, artist, title) {
    if (!r || !r.previewUrl) return -99;
    var na = norm(artist), nt = norm(title);
    var ra = norm(r.artistName), rt = norm(r.trackName);
    var blob = ((r.artistName || '') + ' ' + (r.trackName || '') + ' ' + (r.collectionName || '')).toLowerCase();

    for (var i = 0; i < BAD_WORDS.length; i++) if (blob.indexOf(BAD_WORDS[i]) >= 0) return -99;

    var s = 0;
    if (rt === nt) s += 10;
    else if (rt.indexOf(nt) === 0 || nt.indexOf(rt) === 0) s += 7;
    else if (rt.indexOf(nt) >= 0 || nt.indexOf(rt) >= 0) s += 4;
    else return -99;

    if (ra === na) s += 10;
    else if (ra.indexOf(na) >= 0 || na.indexOf(ra) >= 0) s += 6;
    else if (na.split(' ')[0] && ra.indexOf(na.split(' ')[0]) >= 0) s += 2;
    else s -= 4;

    var low = (r.trackName || '').toLowerCase() + ' ' + (r.collectionName || '').toLowerCase();
    for (var j = 0; j < BAD_VERSION.length; j++) {
      if (low.indexOf(BAD_VERSION[j]) >= 0 && nt.indexOf(BAD_VERSION[j]) < 0) s -= 8;
    }
    if (low.indexOf('live') >= 0 && nt.indexOf('live') < 0) s -= 6;
    if (low.indexOf('remix') >= 0 && nt.indexOf('remix') < 0) s -= 5;
    if (low.indexOf('re-record') >= 0 || low.indexOf('rerecorded') >= 0) s -= 8;
    s -= rt.length * 0.02;
    return s;
  }

  function bestMatch(results, artist, title) {
    var best = null, bestScore = 5.999;
    (results || []).forEach(function (r) {
      var s = scoreResult(r, artist, title);
      if (s > bestScore) { bestScore = s; best = r; }
    });
    return best;
  }

  function track2info(r) {
    return {
      url: r.previewUrl,
      art: r.artworkUrl100 ? r.artworkUrl100.replace('100x100', '300x300') : '',
      itunesTitle: r.trackName || '',
      itunesArtist: r.artistName || ''
    };
  }

  /* ── cache ────────────────────────────────────────────────── */
  function cacheKey(card) {
    return CACHE_PREFIX + (card.i ? 'id' + card.i : 'q' + norm(card.a + ' ' + card.t).replace(/ /g, '_'));
  }
  function cacheGet(card) {
    try {
      var raw = localStorage.getItem(cacheKey(card));
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || !o.url || Date.now() - (o.ts || 0) > CACHE_MS) return null;
      return o;
    } catch (e) { return null; }
  }
  function cacheSet(card, info) {
    try {
      info.ts = Date.now();
      localStorage.setItem(cacheKey(card), JSON.stringify(info));
    } catch (e) { /* vol of privémodus: niet erg */ }
  }
  function cacheDrop(card) {
    try { localStorage.removeItem(cacheKey(card)); } catch (e) {}
  }

  /* ── zoeken ───────────────────────────────────────────────── */
  function byId(card) {
    if (!card.i) return Promise.resolve(null);
    return api('/lookup', { id: card.i, country: COUNTRY })
      .then(function (d) {
        var r = (d && d.results || []).filter(function (x) { return x.previewUrl; })[0];
        return r ? track2info(r) : null;
      })
      .catch(function () { return null; });
  }

  function bySearch(card, country) {
    return api('/search', {
      term: card.a + ' ' + card.t,
      entity: 'song',
      limit: 25,
      country: country || COUNTRY
    })
      .then(function (d) {
        var r = bestMatch(d && d.results, card.a, card.t);
        return r ? track2info(r) : null;
      })
      .catch(function () { return null; });
  }

  /**
   * Zoekt de preview-URL bij een kaart.
   * @param {object} card  {t,a,i}
   * @param {boolean} skipCache  forceer verse lookup (na een afspeelfout)
   */
  function resolve(card, skipCache) {
    if (!skipCache) {
      var hit = cacheGet(card);
      if (hit) return Promise.resolve(hit);
    }
    return byId(card)
      .then(function (info) { return info || bySearch(card, COUNTRY); })
      .then(function (info) { return info || bySearch(card, 'US'); })
      .then(function (info) {
        if (info) cacheSet(card, info);
        return info;
      });
  }

  /* ── speler ───────────────────────────────────────────────── */
  var audio = new Audio();
  audio.preload = 'auto';
  var currentCard = null;
  var currentInfo = null;
  var listeners = {};
  var prefetched = {};

  function emit(name, arg) { (listeners[name] || []).forEach(function (fn) { fn(arg); }); }

  audio.addEventListener('timeupdate', function () {
    if (audio.duration) emit('progress', audio.currentTime / audio.duration);
  });
  audio.addEventListener('ended', function () { emit('ended'); });
  audio.addEventListener('play', function () { emit('play'); });
  audio.addEventListener('pause', function () { if (!audio.ended) emit('pause'); });

  var Music = {
    on: function (name, fn) { (listeners[name] = listeners[name] || []).push(fn); return Music; },

    /** Laadt een kaart (zonder af te spelen). Resolvet naar info of null. */
    load: function (card) {
      currentCard = card;
      currentInfo = null;
      audio.pause();
      audio.removeAttribute('src');
      return resolve(card).then(function (info) {
        if (currentCard !== card) return null;       // beurt is intussen verder
        currentInfo = info;
        if (info) { audio.src = info.url; audio.load(); }
        return info;
      });
    },

    /** Speelt af; probeert bij een fout eenmalig een verse URL. */
    play: function () {
      if (!currentInfo) return Promise.reject(new Error('not-loaded'));
      var card = currentCard;
      return audio.play().catch(function (err) {
        // Autoplay-blokkade heeft geen verse URL nodig.
        if (err && err.name === 'NotAllowedError') throw err;
        cacheDrop(card);
        return resolve(card, true).then(function (info) {
          if (!info || currentCard !== card) throw new Error('unplayable');
          currentInfo = info;
          audio.src = info.url;
          return audio.play();
        });
      });
    },

    pause: function () { audio.pause(); },
    stop: function () { audio.pause(); try { audio.currentTime = 0; } catch (e) {} },
    replay: function () { try { audio.currentTime = 0; } catch (e) {} return Music.play(); },
    isPlaying: function () { return !audio.paused && !audio.ended; },
    info: function () { return currentInfo; },

    /** Warmt de volgende kaart alvast op (URL + audiobuffer). */
    prefetch: function (card) {
      if (!card) return;
      var k = cacheKey(card);
      if (prefetched[k]) return;
      prefetched[k] = true;
      resolve(card).then(function (info) {
        if (!info) return;
        var a = new Audio();
        a.preload = 'auto';
        a.src = info.url;
      }).catch(function () {});
    },

    /** Handig bij het instellen: werkt de verbinding met iTunes? */
    selfTest: function () {
      return api('/search', { term: 'abba waterloo', entity: 'song', limit: 1, country: COUNTRY })
        .then(function (d) { return !!(d && d.results && d.results.length); })
        .catch(function () { return false; });
    }
  };

  return Music;
})();
