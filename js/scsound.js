// WORLD GP — dźwięk samochodu bezpieczeństwa (V8 coupé GT).
//
// Wbudowany dźwięk: synteza z oscylatorów (zapłon V8 i jego podharmoniczne przez filtr), słyszy go każdy.
// Własny bank: gracz może wczytać ze swojego dysku bank dźwięków FMOD (.bank) z nieskompresowanymi (PCM 16 bit)
// pętlami silnika V8 o nazwach z tabeli LAYERS. Gra nie zawiera tych nagrań i nigdzie ich nie wysyła: potrzebne
// pętle (skrócone do kilkunastu sekund, mono) zostają tylko w przeglądarce gracza (IndexedDB).
//
// Bank FMOD to RIFF „FEV ” z wbudowanym kontenerem FSB5: nagłówek (wersja, liczba próbek, rozmiary nagłówków
// próbek, tablicy nazw i danych, kodek), potem 64-bitowe nagłówki próbek (częstotliwość, kanały, przesunięcie
// danych × 32, liczba próbek) z opcjonalnymi blokami, tablica nazw i dane. Gra czyta tylko nagłówki i potrzebne
// próbki (kawałki pliku), więc nawet duży bank wczytuje się szybko.
//
// Odtwarzanie jak w zdarzeniu silnika z banku: każda pętla ma obroty odniesienia (wysokość dźwięku = obroty /
// obroty odniesienia) i zakres obrotów, w którym gra; sąsiednie zakresy przenikają się. Są dwie perspektywy
// mikrofonów (przód i tył auta, mieszane z kąta między autem a słuchaczem) i dwie grupy: gaz i hamowanie
// silnikiem. Obroty i gaz pochodzą z wirtualnej, 7-biegowej skrzyni auta liczonej z prędkości SC.
(function (PG) {
  'use strict';
  var SCS = PG.SCSound = { ready: false, info: null, busy: false, error: '' };

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function fin(x, d) { return (typeof x === 'number' && isFinite(x)) ? x : d; }

  // Pętle silnika: nazwa próbki, perspektywa (f — przód, r — tył), gaz (1) / hamowanie silnikiem (0),
  // obroty odniesienia, zakres obrotów [od, do]
  var LAYERS = [
    ['onrear', 'r', 1, 3100, 2200, 5400], ['upshrear', 'r', 1, 5100, 4400, 6800], ['accrear', 'r', 1, 5100, 6600, 9000],
    ['reardecel', 'r', 0, 5600, 2200, 5400], ['reardwsh', 'r', 0, 5600, 5000, 9000],
    ['front on', 'f', 1, 5500, 2200, 5400], ['frontupnearr', 'f', 1, 7200, 4400, 6800], ['frontaccnearr', 'f', 1, 7200, 6600, 9000],
    ['frontdecel', 'f', 0, 7500, 2200, 5400], ['frontdwsh', 'f', 0, 7500, 5000, 9000]
  ];
  var POPS = ['backfireEXT_1', 'backfireEXT_2', 'backfireEXT_3', 'backfireEXT_4', 'backfireEXT_5', 'backfireEXT_6', 'backfireEXT_7', 'backfireEXT_8', 'backfireEXT_9'];
  var LOOP_S = 12, XF_S = 0.3; // długość zapisanej pętli i przenikania na jej łączeniu (s)
  SCS.LAYERS = LAYERS;

  // ---------- odczyt banku ----------
  var RATES = { 1: 8000, 2: 11000, 3: 11025, 4: 16000, 5: 22050, 6: 24000, 7: 32000, 8: 44100, 9: 48000 };
  function slice(file, a, b) { return file.slice(a, b).arrayBuffer().then(function (ab) { return new Uint8Array(ab); }); }
  function findFsb(u8) {
    for (var i = 0; i + 4 <= u8.length; i++) if (u8[i] === 0x46 && u8[i + 1] === 0x53 && u8[i + 2] === 0x42 && u8[i + 3] === 0x35) return i;
    return -1;
  }
  // Spis próbek kontenera FSB5: nazwa → { off, n, ch, sr } (off — bajt w pliku)
  function readIndex(file) {
    return slice(file, 0, Math.min(file.size, 4 << 20)).then(function (u8) {
      var o = findFsb(u8);
      if (o < 0) throw new Error('To nie jest bank dźwięków FMOD (brak kontenera FSB5).');
      var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
      var ver = dv.getUint32(o + 4, true), ns = dv.getUint32(o + 8, true), shs = dv.getUint32(o + 12, true), nts = dv.getUint32(o + 16, true), mode = dv.getUint32(o + 24, true);
      if (mode !== 2) throw new Error('Próbki w tym banku są skompresowane (kodek ' + mode + '). Gra odtwarza tylko nieskompresowane (PCM 16 bit).');
      var hs = ver === 0 ? 64 : 60, nb = o + hs + shs, db = nb + nts;
      if (db > u8.length) throw new Error('Nagłówek banku jest za duży.');
      var p = o + hs, list = [];
      for (var i = 0; i < ns; i++) {
        var lo = dv.getUint32(p, true), hi = dv.getUint32(p + 4, true); p += 8;
        var next = lo & 1, chi = (lo >>> 5) & 3;
        list.push({ sr: RATES[(lo >>> 1) & 15] || 44100, ch: [1, 2, 6, 8][chi], off: (((lo >>> 7) | ((hi & 1) << 25)) & 0x3ffffff) * 32, n: hi >>> 2 });
        while (next) { var e = dv.getUint32(p, true); next = e & 1; p += 4 + ((e >>> 1) & 0xffffff); }
      }
      var idx = {};
      for (i = 0; i < ns; i++) {
        var no = nb + dv.getUint32(nb + 4 * i, true), s = '';
        while (no < u8.length && u8[no]) s += String.fromCharCode(u8[no++]);
        list[i].off += db; idx[s] = list[i];
      }
      return idx;
    });
  }
  // Próbka jako mono Int16 (pierwsze maxS sekund, opcjonalnie zapętlona z przenikaniem na łączeniu)
  function readMono(file, sm, maxS, loop) {
    var take = Math.min(sm.n, Math.round(maxS * sm.sr) + (loop ? Math.round(XF_S * sm.sr) : 0));
    return slice(file, sm.off, sm.off + take * sm.ch * 2).then(function (u8) {
      var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), n = Math.floor(u8.byteLength / (2 * sm.ch)), m = new Float32Array(n);
      for (var i = 0; i < n; i++) { var a = 0; for (var c = 0; c < sm.ch; c++) a += dv.getInt16((i * sm.ch + c) * 2, true); m[i] = a / sm.ch; }
      var out = m;
      if (loop) {
        var X = Math.min(Math.round(XF_S * sm.sr), Math.floor(n / 3)), L = n - X;
        out = new Float32Array(L);
        for (i = 0; i < L; i++) out[i] = m[i];
        // początek pętli przechodzi w to, co było za jej końcem: koniec → początek bez skoku
        for (i = 0; i < X; i++) { var t = i / X; out[i] = m[i] * Math.sin(t * Math.PI / 2) + m[L + i] * Math.cos(t * Math.PI / 2); }
      }
      var q = new Int16Array(out.length);
      for (i = 0; i < out.length; i++) q[i] = clamp(Math.round(out[i]), -32768, 32767);
      return q;
    });
  }

  // Wczytanie banku z dysku gracza → rekord { name, sr, layers: {nazwa: Int16Array}, pops: [...] }
  SCS.open = function (file) {
    if (!file) return Promise.reject(new Error('Nie wybrano pliku.'));
    SCS.busy = true; SCS.error = ''; notify();
    var rec = { name: file.name, layers: {}, pops: [], sr: {} };
    return readIndex(file).then(function (idx) {
      var miss = LAYERS.filter(function (l) { return !idx[l[0]]; }).map(function (l) { return l[0]; });
      if (miss.length) throw new Error('W banku brakuje pętli silnika: ' + miss.slice(0, 4).join(', ') + (miss.length > 4 ? '…' : '') + '.');
      var jobs = LAYERS.map(function (l) { return function () { return readMono(file, idx[l[0]], LOOP_S, true).then(function (q) { rec.layers[l[0]] = q; rec.sr[l[0]] = idx[l[0]].sr; }); }; });
      POPS.forEach(function (nm) { if (idx[nm]) jobs.push(function () { return readMono(file, idx[nm], 2, false).then(function (q) { rec.pops.push(q); rec.sr[nm] = idx[nm].sr; }); }); });
      return jobs.reduce(function (pr, j) { return pr.then(j); }, Promise.resolve());
    }).then(function () {
      return dbOp('readwrite', function (st) { return st.put(rec, 'current'); }).then(function () { return false; }, function (e) {
        console.warn('Dźwięk SC: nie udało się zapisać w przeglądarce', e); return true;
      });
    }).then(function (unsaved) {
      use(rec, unsaved); SCS.busy = false; notify();
      return rec;
    }).catch(function (e) { SCS.busy = false; SCS.error = e && e.message ? e.message : String(e); notify(); throw e; });
  };

  function use(rec, unsaved) {
    var bytes = 0;
    Object.keys(rec.layers).forEach(function (k) { bytes += rec.layers[k].byteLength; });
    rec.pops.forEach(function (p) { bytes += p.byteLength; });
    SCS.rec = rec; SCS.ready = true;
    SCS.info = { name: rec.name, bytes: bytes, unsaved: !!unsaved, pops: rec.pops.length };
    SCS.buffers = null; // AudioBuffery powstaną przy pierwszym odtworzeniu
  }

  SCS.load = function () {
    return dbOp('readonly', function (st) { return st.get('current'); }).then(function (rec) {
      if (rec && rec.layers) { use(rec, false); notify(); }
      return rec || null;
    }).catch(function (e) { console.warn('Dźwięk SC: nie udało się wczytać z przeglądarki', e); return null; });
  };
  SCS.remove = function () {
    SCS.ready = false; SCS.info = null; SCS.rec = null; SCS.buffers = null; SCS.error = '';
    stopBank();
    notify();
    return dbOp('readwrite', function (st) { return st.delete('current'); }).catch(function () {});
  };

  // ---------- odtwarzanie ----------
  var A = null, ctx = null, bus = null, pan = null, lp = null, synth = null, bank = null;
  var car = SCS.car = { gear: 1, rpm: 900, thr: 0, v: 0, cut: 0, pop: 0, popN: 0, lastThr: 0, last: null }; // stan wirtualnej skrzyni (podgląd)
  // prędkości (km/h) przy 7200 obr./min na biegach 1..7
  var GEAR_KMH = [0, 62, 98, 136, 174, 212, 252, 305], RED = 7200;

  function setup() {
    A = PG.Audio; ctx = A && A.ctx;
    if (!ctx || bus) return !!bus;
    bus = ctx.createGain(); bus.gain.value = 0;
    lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 16000; lp.Q.value = 0.5;
    pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    bus.connect(lp);
    if (pan) { lp.connect(pan); pan.connect(A.master); } else lp.connect(A.master);
    return true;
  }

  // wbudowany V8: zapłon (piła), połowa i ćwiartka częstotliwości (bulgot), filtr otwierany gazem
  function startSynth() {
    if (synth) return;
    var o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), o3 = ctx.createOscillator();
    o1.type = 'sawtooth'; o2.type = 'square'; o3.type = 'triangle';
    var g1 = ctx.createGain(), g2 = ctx.createGain(), g3 = ctx.createGain(); g1.gain.value = 0.5; g2.gain.value = 0.28; g3.gain.value = 0.45;
    var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 2.2; f.frequency.value = 600;
    var am = ctx.createGain(), lfo = ctx.createOscillator(), lfoG = ctx.createGain(); lfo.type = 'sine'; lfoG.gain.value = 0.25; am.gain.value = 0.75;
    var out = ctx.createGain(); out.gain.value = 0;
    o1.connect(g1); o2.connect(g2); o3.connect(g3); g1.connect(f); g2.connect(f); g3.connect(f);
    f.connect(am); lfo.connect(lfoG); lfoG.connect(am.gain); am.connect(out); out.connect(bus);
    [o1, o2, o3, lfo].forEach(function (o) { o.start(); });
    synth = { o1: o1, o2: o2, o3: o3, f: f, lfo: lfo, out: out };
  }
  function stopSynth() {
    if (!synth) return;
    [synth.o1, synth.o2, synth.o3, synth.lfo].forEach(function (o) { try { o.stop(); } catch (e) { /* nic */ } });
    try { synth.out.disconnect(); } catch (e) { /* nic */ }
    synth = null;
  }

  function toBuffer(q, sr) {
    var b = ctx.createBuffer(1, q.length, sr || 44100), d = b.getChannelData(0);
    for (var i = 0; i < q.length; i++) d[i] = q[i] / 32768;
    return b;
  }
  function startBank() {
    if (bank || !SCS.rec) return;
    var rec = SCS.rec, voices = [];
    LAYERS.forEach(function (l) {
      var q = rec.layers[l[0]]; if (!q) return;
      var src = ctx.createBufferSource(); src.buffer = toBuffer(q, rec.sr[l[0]]); src.loop = true;
      var g = ctx.createGain(); g.gain.value = 0;
      src.connect(g); g.connect(bus);
      src.start(0, Math.random() * src.buffer.duration * 0.9);
      voices.push({ l: l, src: src, g: g });
    });
    bank = { voices: voices, pops: rec.pops.map(function (q, i) { return toBuffer(q, rec.sr[POPS[i]] || 44100); }) };
  }
  function stopBank() {
    if (!bank) return;
    bank.voices.forEach(function (v) { try { v.src.stop(); } catch (e) { /* nic */ } try { v.g.disconnect(); } catch (e2) { /* nic */ } });
    bank = null;
  }

  // waga pętli w jej zakresie obrotów: pełna w środku, przenikanie na zakładkach z sąsiednimi pętlami
  function rangeW(rpm, l, group) {
    if (rpm < l[4] || rpm > l[5]) {
      // poniżej najniższego / powyżej najwyższego zakresu gra skrajna pętla
      var lowest = true, highest = true;
      group.forEach(function (o) { if (o[4] < l[4]) lowest = false; if (o[5] > l[5]) highest = false; });
      if ((rpm < l[4] && lowest) || (rpm > l[5] && highest)) return 1;
      return 0;
    }
    var w = 1;
    group.forEach(function (o) {
      if (o === l) return;
      if (o[4] > l[4] && o[4] < l[5] && rpm > o[4]) w = Math.min(w, (l[5] - rpm) / (l[5] - o[4])); // wyżej leżąca pętla przejmuje
      if (o[5] < l[5] && o[5] > l[4] && rpm < o[5]) w = Math.min(w, (rpm - l[4]) / (o[5] - l[4])); // niżej leżąca oddaje
    });
    return Math.sin(clamp(w, 0, 1) * Math.PI / 2);
  }

  function popAt(t, gain) {
    if (!bank || !bank.pops.length) return;
    var s = ctx.createBufferSource(); s.buffer = bank.pops[(Math.random() * bank.pops.length) | 0];
    s.playbackRate.value = 0.9 + Math.random() * 0.2;
    var g = ctx.createGain(); g.gain.value = gain;
    s.connect(g); g.connect(bus); s.start(t);
  }

  // Wirtualna skrzynia: obroty i gaz z prędkości i przyspieszenia SC
  function drive(sc, dt) {
    var v = Math.max(0, fin(sc.v, 0)), kmh = v * 3.6, a = 0;
    if (car.last != null && dt > 0) a = (v - car.last) / dt;
    else {
      // SC dopiero wyjechało: bieg, na którym jedzie spokojnie z tą prędkością
      car.gear = 1; while (car.gear < 7 && RED * kmh / GEAR_KMH[car.gear] > 6000) car.gear++;
      car.rpm = RED * kmh / GEAR_KMH[car.gear]; car.acc = 0;
    }
    car.last = v;
    car.acc = car.acc == null ? a : car.acc + (a - car.acc) * Math.min(1, dt * 6);
    var thrT = car.acc > 0.4 ? clamp(0.45 + car.acc / 5, 0, 1) : car.acc < -0.6 ? 0 : 0.28;
    var g = car.gear, rpm = RED * kmh / GEAR_KMH[g];
    var ev = null;
    car.sh = (car.sh || 0) - dt;
    if ((rpm > 6400 && thrT > 0.5) || rpm > 6950) { while (g < 7 && RED * kmh / GEAR_KMH[g] > 6400) { car.gear = ++g; car.cut = 0.11; ev = 'up'; car.sh = 0.4; } }
    else if (g > 1 && car.sh <= 0) {
      // redukcja: przy mocnym gazie (kickdown), przy hamowaniu wcześniej (silnik trzyma obroty), przy toczeniu późno
      var lo = thrT > 0.8 ? 4300 : car.acc < -2 ? 3700 : thrT > 0.5 ? 3300 : 2500;
      if (rpm < lo && RED * kmh / GEAR_KMH[g - 1] < 6300) { car.gear = --g; ev = 'down'; car.sh = 0.3; }
    }
    rpm = clamp(RED * kmh / GEAR_KMH[g], 1050 + thrT * 900, RED);
    if (car.cut > 0) { car.cut -= dt; thrT = 0; }
    car.rpm += (rpm - car.rpm) * Math.min(1, dt * (ev === 'up' ? 30 : 12));
    car.thr += (thrT - car.thr) * Math.min(1, dt * 10);
    // strzały z wydechu: po odpuszczeniu gazu na wysokich obrotach i przy redukcji
    if (ev === 'down' || (car.lastThr > 0.55 && thrT < 0.1 && car.rpm > 4200)) { car.popN = 1 + ((Math.random() * 3) | 0); car.pop = 0.05; }
    car.lastThr = thrT;
    return ev;
  }

  // Klatka: S — sesja, L — słuchacz (pozycja, kierunek, prędkość) z audio.js
  var lastT = 0;
  SCS.frame = function (S, L) {
    var now = (window.performance ? performance.now() : Date.now()) / 1000, dt = clamp(now - lastT, 0, 0.1);
    lastT = now;
    var sc = S && S.rc && S.rc.sc, on = !!(sc && !sc.inPit && L && PG.Audio && PG.Audio.on);
    if (!on) { SCS.off(); car.last = null; return; }
    if (!setup()) return;
    var t = ctx.currentTime;
    drive(sc, dt);
    // odległość, kierunek, Doppler (wzory jak dla bolidów w audio.js), SC jest trochę głośniejsze (V8)
    var dx = sc.x - L.x, dz = sc.y - L.z, dy = L.y - 0.6, d = Math.sqrt(dx * dx + dz * dz + dy * dy);
    var gain = 9 / (9 + d), rx = -L.fz, rz = L.fx, pn = d > 0.3 ? clamp((dx * rx + dz * rz) / d, -1, 1) * 0.8 : 0;
    var lpf = 17000 / (1 + d / 45); if (dx * L.fx + dz * L.fz < 0) lpf *= 0.7;
    var ch = Math.cos(sc.h), sh = Math.sin(sc.h), cv = fin(sc.v, 0);
    var vr = d > 0.5 ? ((ch * cv - (L.vx || 0)) * dx + (sh * cv - (L.vz || 0)) * dz) / d : 0;
    var dop = clamp(343 / (343 + vr), 0.6, 1.7);
    if (d > 520) gain = 0;
    bus.gain.setTargetAtTime(gain, t, 0.05);
    lp.frequency.setTargetAtTime(clamp(lpf, 200, 18000), t, 0.05);
    if (pan) pan.pan.setTargetAtTime(pn, t, 0.05);
    var rpm = car.rpm, thr = car.thr;
    if (SCS.ready && SCS.rec) {
      stopSynth(); startBank();
      // przód auta zwrócony do słuchacza → mikrofony z przodu
      var cf = d > 0.5 ? (-(ch * dx + sh * dz) / d) : 0, wf = Math.sqrt(clamp(0.5 + 0.5 * cf, 0, 1)), wr = Math.sqrt(clamp(0.5 - 0.5 * cf, 0, 1));
      var won = Math.sin(thr * Math.PI / 2), woff = Math.cos(thr * Math.PI / 2) * 0.8;
      bank.voices.forEach(function (vo) {
        var l = vo.l, grp = LAYERS.filter(function (o) { return o[1] === l[1] && o[2] === l[2]; });
        var w = rangeW(rpm, l, grp) * (l[1] === 'f' ? wf : wr) * (l[2] ? won : woff);
        vo.g.gain.setTargetAtTime(w * 0.9, t, 0.04);
        vo.src.playbackRate.setTargetAtTime(clamp(rpm / l[3] * dop, 0.25, 3), t, 0.03);
      });
      if (car.popN > 0) { car.pop -= dt; if (car.pop <= 0) { popAt(t, 0.7 + Math.random() * 0.4); car.popN--; car.pop = 0.06 + Math.random() * 0.12; } }
    } else {
      stopBank(); startSynth();
      var ff = rpm / 15 * dop; // zapłon V8: 4 na obrót
      synth.o1.frequency.setTargetAtTime(ff, t, 0.03);
      synth.o2.frequency.setTargetAtTime(ff / 2, t, 0.03);
      synth.o3.frequency.setTargetAtTime(ff / 4, t, 0.03);
      synth.lfo.frequency.setTargetAtTime(ff / 8, t, 0.03);
      synth.f.frequency.setTargetAtTime(260 + thr * 1400 + rpm * 0.12, t, 0.05);
      synth.out.gain.setTargetAtTime(0.10 + thr * 0.12, t, 0.05);
    }
  };
  SCS.off = function () {
    if (!bus || !ctx) return;
    bus.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
  };

  // ---------- IndexedDB ----------
  var DBN = 'worldgp-sc-sound', STN = 'bank';
  function dbOpen() {
    return new Promise(function (res, rej) {
      if (typeof indexedDB === 'undefined') { rej(new Error('Brak IndexedDB')); return; }
      var r = indexedDB.open(DBN, 1);
      r.onupgradeneeded = function () { if (!r.result.objectStoreNames.contains(STN)) r.result.createObjectStore(STN); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error || new Error('IndexedDB')); };
      r.onblocked = function () { rej(new Error('IndexedDB zablokowane')); };
    });
  }
  function dbOp(mode, fn) {
    return dbOpen().then(function (d) {
      return new Promise(function (res, rej) {
        var tx, out;
        try { tx = d.transaction(STN, mode); } catch (e) { d.close(); rej(e); return; }
        var rq = fn(tx.objectStore(STN));
        if (rq) rq.onsuccess = function () { out = rq.result; };
        tx.oncomplete = function () { d.close(); res(out); };
        tx.onerror = tx.onabort = function () { d.close(); rej(tx.error || new Error('IndexedDB')); };
      });
    });
  }

  // ---------- powiadomienia (ekran ustawień) ----------
  var subs = [];
  SCS.onChange = function (fn) { subs.push(fn); return function () { var i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); }; };
  function notify() { subs.slice().forEach(function (fn) { try { fn(SCS); } catch (e) { console.warn(e); } }); }
})(PG);
