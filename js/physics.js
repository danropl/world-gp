// WORLD GP — krok bolidu na torze (nawierzchnie, bariery, uszkodzenia) i sztuczna inteligencja kierowców.
// Dynamika bolidu (opony, zawieszenie, napęd) jest w vehicle.js.
(function (PG) {
  'use strict';

  // Skala cech zespołu (PG.carParams) i kolizje. Dynamika: PG.VEH w vehicle.js.
  PG.PHYS = {
    cd: 0.00104,               // opór powietrza na kg (odniesienie dla cechy aero zespołu)
    power: 940,                // moc na kg (odniesienie dla cechy mocy zespołu)
    carLen: 1.45, carR: 1.05,  // dwa koła kolizyjne ±carLen, promień carR
    dirtyF: 0.26, dirtyR: 0.14 // maks. utrata docisku przodu / tyłu za innym bolidem (brudne powietrze)
  };

  var GEAR_TOP = [0, 82, 118, 154, 190, 228, 266, 306, 360]; // km/h
  // Silnik V10 (3,0 l, jak w F1 2000–2005). Przełożenia są stałe, więc obroty rosną liniowo z prędkością:
  // top — obroty przy prędkości końca biegu (GEAR_TOP), idle — bieg jałowy, launch — obroty przy ruszaniu
  // na pełnym gazie (sprzęgło się ślizga, dopóki prędkość ich nie dogoni).
  var RPM = { idle: 4500, top: 19000, launch: 13500 };
  // Automat: w górę przy 97 % obrotów końca biegu, w dół dopiero gdy na niższym biegu byłoby 86 %
  // (histereza: przy stałej prędkości bieg nie przeskakuje)
  var UP_AT = 0.97, DOWN_AT = 0.86;

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }

  // Parametry fizyczne z cech zespołu i kierowcy
  PG.carParams = function (team, driver) {
    var c = team.car, eng = PG.ENGINES[team.engine] || { power: 0 };
    var p = {
      power: PG.PHYS.power * (1 + (c.power - 88) * 0.0042 + eng.power * 0.003),
      aeroMul: 1 + (c.aero - 88) * 0.006,
      gripMul: 1 + (c.aero - 88) * 0.0018 + (c.tyre - 85) * 0.0012,
      cd: PG.PHYS.cd * (1 + (c.aero - 88) * 0.0015),
      brakeMul: 1,
      wearMul: Math.max(0.55, 1 - (c.tyre - 85) * 0.014 - ((driver && driver.tyre) ? (driver.tyre - 85) * 0.01 : 0))
    };
    return p;
  };

  function zeroDmg() { return { fwL: 0, fwR: 0, rw: 0, floor: 0, suspFL: 0, suspFR: 0, suspRL: 0, suspRR: 0, engine: 0 }; }
  PG.zeroDmg = zeroDmg;

  PG.makeCar = function (o) {
    return {
      id: o.id, driver: o.driver, team: o.team, isPlayer: !!o.isPlayer,
      x: 0, y: 0, h: 0, v: 0, steer: 0, steerIn: 0, throttle: 0, brake: 0,
      idx: 0, lat: 0, lap: 0, dist: 0, lastIdx: 0, finished: false, finishTime: 0,
      lapStart: 0, lastLap: 0, bestLap: 0, sectorTimes: [0, 0, 0], curSector: 0, sectorStart: 0, lastSectors: [0, 0, 0],
      compound: o.compound || 'M', wear: 0, drsOpen: false, drsAllowed: false, slip: 1,
      params: o.params, gear: 1, rpm: 4000, skid: 0, surface: 'asphalt', wall: 0,
      manual: false, mgear: 1, shiftT: 0, limiter: false, // ręczna skrzynia (tylko gracz)
      penalty: 0, jump: false, retired: false, launched: false, react: 0.25,
      ai: o.ai || null, profile: null, offset: 0, offsetTarget: 0, pos: 0,
      latAcc: 0, hold: false, ghost: 0, stuck: 0, launchBoost: 1,
      // dynamika: kąt znoszenia, blokada i buksowanie kół, płaskie miejsca na oponach
      beta: 0, lock: 0, lockSide: 0, wspin: 0, flat: 0,
      // uszkodzenia (0 sprawne … 1 zniszczone)
      dmg: zeroDmg(), dmgTotal: 0,
      dmgEv: { on: false, x: 0, y: 0, f: 0, prev: zeroDmg() },
      // stan wewnętrzny fizyki i sesji
      axS: 0, dirty: 0, maxCurv: 0, wallNx: 0, wallNy: 0,
      human: false, absOn: true, tcOn: true, analogIn: false,
      thrIn: 0, brkIn: 0, wantRev: false, revT: 0, padSteer: false,
      drsWas: false, lockEv: false, aiT: 0,
      profKey: 3, profDirty: false, profAt: -9,
      // pola dopisywane później przez sesję, aleję serwisową i dyrekcję wyścigu — zadeklarowane od razu,
      // żeby wszystkie bolidy miały ten sam kształt obiektu (szybki dostęp w krokach fizyki)
      absAct: 0, tcAct: 0, vpKey: undefined, vsHard: false, brakeT: undefined, tyreTs: undefined, tyreTc: undefined, tyreW: undefined,
      aiPit: undefined, bestSectors: undefined, compounds: undefined, ei: undefined, fLap: undefined, finishLaps: undefined,
      inPit: undefined, lastDetect: undefined, noBest: undefined, owner: undefined, pit: undefined, pitComp: undefined,
      pitCount: undefined, pitLim: undefined, pitReq: undefined, rcCap: undefined, remote: undefined, retLat: undefined,
      retireT: undefined, retireWhy: undefined, retiring: undefined, ruleFined: undefined, started: undefined,
      timeAt: undefined, wearAtLap: undefined, wearLap: undefined,
      // model bolidu (vehicle.js): stan dynamiki, setup, pomoce gracza
      vs: null, vp: null, envC: null, setup: o.setup || null, setupKey: JSON.stringify(o.setup || null),
      delta: 0, gripT: 1, yawRate: 0, rollA: 0, pitchA: 0, tyreT0: null,
      tcLvl: 2, sAssist: true, csAssist: false, stabOn: false, inWheel: false
    };
  };
  // Nowy setup bolidu (od razu w trakcie sesji)
  PG.setCarSetup = function (car, setup) {
    car.setup = setup ? PG.Veh.cleanSetup(setup) : null;
    car.setupKey = JSON.stringify(car.setup);
    car.vp = null; car.envC = null;
  };

  PG.placeOnGrid = function (car, T, slot) {
    car.x = slot.x; car.y = slot.y; car.h = slot.h; car.v = 0; car.idx = slot.i; car.lastIdx = slot.i;
    car.lap = 0; car.dist = -(T.N - slot.i) * T.ds; // ujemny dystans przed linią startu
    car.beta = 0; car.axS = 0; car.mgear = 1; car.shiftT = 0;
    if (PG.Veh) PG.Veh.resetMotion(car);
  };

  // Przyczepność opon względem nowych pośrednich na suchym (mieszanka, pogoda) — bez zużycia i temperatury
  function baseGrip(car, env) {
    var t = PG.TYRES[car.compound] || PG.TYRES.M;
    var wet = !!(env && env.wet);
    var g;
    if (wet) g = car.compound === 'W' ? 0.86 : 0.66;
    else g = car.compound === 'W' ? 0.86 : t.grip;
    return g * ((env && env.weatherGrip) || 1);
  }
  PG.baseGrip = baseGrip;
  // Jak wyżej, ze zużyciem (średnia czterech opon)
  function tyreGrip(car, env) {
    var w = clamp(car.wear || 0, 0, 1);
    return baseGrip(car, env) * (1 - 0.06 * w - 0.12 * w * w * w * w);
  }
  PG.tyreGrip = tyreGrip;

  // Wpływ uszkodzeń na osiągi (wspólny obiekt — skopiuj, jeśli potrzebny na dłużej)
  var DP = { aF: 1, aR: 1, gD: 1, pw: 1, drag: 1, pull: 0, susp: 0 };
  function dmgPerf(car, full) {
    var d = car && car.dmg;
    DP.aF = 1; DP.aR = 1; DP.gD = 1; DP.pw = 1; DP.drag = 1; DP.pull = 0; DP.susp = 0;
    if (!full || !d) return DP;
    var fw = ((d.fwL || 0) + (d.fwR || 0)) * 0.5, fl = d.floor || 0, rw = d.rw || 0;
    var sL = (d.suspFL || 0) + (d.suspRL || 0), sR = (d.suspFR || 0) + (d.suspRR || 0);
    DP.susp = (sL + sR) * 0.25;
    DP.aF = 1 - 0.5 * fw - 0.2 * fl;         // przednie skrzydło: mniej docisku z przodu (podsterowność)
    DP.aR = 1 - 0.5 * rw - 0.2 * fl;         // tylne skrzydło: mniej docisku z tyłu (nadsterowność)
    DP.gD = 1 - 0.12 * DP.susp - 0.03 * fl;  // zawieszenie: mniej przyczepności mechanicznej
    DP.pw = 1 - 0.3 * (d.engine || 0);       // silnik: spadek mocy
    DP.drag = 1 - 0.1 * rw;                  // bez tylnego skrzydła mniejszy opór
    DP.pull = clamp(0.5 * ((d.fwR || 0) - (d.fwL || 0)) + 0.45 * (sR - sL), -1, 1); // ściąganie w stronę uszkodzenia
    return DP;
  }
  PG.dmgPerf = dmgPerf;

  // Maksymalne opóźnienie hamowania (m/s², dodatnie) na asfalcie przy prędkości v (podpowiedź hamowania na linii jazdy)
  PG.brakeDecel = function (car, v, env) {
    var p = car && car.params;
    if (!p || !PG.Veh) return 30;
    var E = car.envC || (car.envC = PG.Veh.envelope({ power: p.power, cd: p.cd, gripMul: p.gripMul, aeroMul: p.aeroMul, brakeMul: p.brakeMul, setup: car.setup }));
    var dp = dmgPerf(car, !!(env && env.dmgFull));
    var g = tyreGrip(car, env) * dp.gD * (car.gripT || 1);
    var dec = PG.Veh.envAt(E.brk, v) * g * (0.5 + 0.25 * (dp.aF + dp.aR)) + PG.Veh.envAt(E.drag, v) * dp.drag;
    return (isFinite(dec) && dec > 1) ? dec : 1;
  };

  // Zmiana biegu (ręczna skrzynia). dir: +1 w górę, −1 w dół.
  // Zwraca 'up' / 'down', 'deny' (redukcja zakręciłaby silnik ponad ogranicznik) albo null (brak biegu).
  PG.shiftGear = function (car, dir) {
    if (!car || !car.manual) return null;
    var g = car.mgear || 1, kmh = Math.abs(car.v) * 3.6 / ((car.vp && car.vp.gs) || 1);
    if (dir > 0) {
      if (g >= GEAR_TOP.length - 1) return null;
      car.mgear = g + 1; car.shiftT = 0.03; // przerwa w napędzie przy zmianie w górę
      return 'up';
    }
    if (g <= 1) return null;
    if (kmh > GEAR_TOP[g - 1]) return 'deny';
    car.mgear = g - 1;
    return 'down';
  };
  // Skrzynia automatyczna: bieg po poprzednim biegu (prev) i prędkości (km/h), z histerezą
  PG.autoGear = function (prev, kmh) {
    var g = prev >= 1 && prev <= 8 ? prev | 0 : 1;
    while (g < 8 && kmh > GEAR_TOP[g] * UP_AT) g++;
    while (g > 1 && kmh < GEAR_TOP[g - 1] * DOWN_AT) g--;
    return g;
  };
  // Obroty silnika na biegu g przy prędkości kmh i gazie thr (na jedynce sprzęgło pozwala ruszyć na obrotach)
  PG.engineRpm = function (g, kmh, thr) {
    var r = RPM.top * kmh / GEAR_TOP[g];
    if (g === 1) r = Math.max(r, RPM.idle + (RPM.launch - RPM.idle) * clamp(thr || 0, 0, 1));
    return Math.min(RPM.top + 300, Math.max(RPM.idle, r));
  };

  // Krok fizyki dla jednego bolidu: położenie na torze, nawierzchnia, dynamika (vehicle.js), bariery
  var STEP = { surfGrip: 1, surfDrag: 0, kerb: false, offRoad: false, dp: null, dirtyF: 0, dirtyR: 0, human: false };
  PG.stepCar = function (car, dt, T, env) {
    var P = PG.PHYS;
    env = env || {};
    if (!(dt > 0)) return;
    // zabezpieczenie przed wartościami nieskończonymi
    if (!(isFinite(car.x) && isFinite(car.y) && isFinite(car.h))) {
      var i0 = (car.idx >= 0 && car.idx < T.N) ? car.idx : 0;
      car.x = T.line.x[i0]; car.y = T.line.y[i0]; car.h = Math.atan2(T.ty[i0], T.tx[i0]); car.v = 0; car.idx = i0;
      car.vsHard = true;
    }
    if (!isFinite(car.v)) { car.v = 0; car.vsHard = true; }
    if (!isFinite(car.beta)) { car.beta = 0; car.vsHard = true; }
    if (car.vs && !(isFinite(car.vs.vx) && isFinite(car.vs.vy) && isFinite(car.vs.r))) car.vs = null;
    if (!(car.flat >= 0)) car.flat = 0;
    if (!car.dmg) car.dmg = zeroDmg();

    var idx = PG.nearestLocal(T, car.x, car.y, car.idx);
    var dIdx = idx - car.idx;
    if (dIdx < -T.N / 2) dIdx += T.N; else if (dIdx > T.N / 2) dIdx -= T.N;
    car.idx = idx;
    car.dist += dIdx * T.ds;
    var lat = (car.x - T.x[idx]) * T.nx[idx] + (car.y - T.y[idx]) * T.ny[idx];
    car.lat = lat;
    var alat = Math.abs(lat), hw = T.hw, right = lat > 0;
    var bar = right ? T.barR[idx] : T.barL[idx];
    var av0 = Math.abs(car.v);
    var surfGrip = 1, surfDrag = 0, surface = 'asphalt';
    if (alat <= hw) { surface = 'asphalt'; }
    else if (alat <= hw + 1.6 && (right ? T.kerbR[idx] : T.kerbL[idx])) { surface = 'kerb'; surfGrip = 0.94; }
    else {
      var st = right ? T.surfR[idx] : T.surfL[idx];
      if (st === 3) st = (lat >= T.pitA[idx] - 0.3 && lat <= T.pitB[idx] + 0.3) ? 4 : 0; // droga alei albo trawiasty klin
      if (st === 4) { surface = 'asphalt'; }
      else if (st === 1) { surface = 'gravel'; surfGrip = 0.38; surfDrag = (5 + 0.03 * av0 * av0) * Math.min(1, av0 / 8); }
      else if (st === 2) { surface = 'runoff'; surfGrip = 0.88; surfDrag = 0.4; }
      else { surface = 'grass'; surfGrip = 0.5; surfDrag = (2 + 0.012 * av0 * av0) * Math.min(1, av0 / 8); }
    }
    car.surface = surface;
    var kerb = surface === 'kerb', offRoad = surface === 'grass' || surface === 'gravel';

    // dynamika bolidu
    var dk = clamp(car.dirty || 0, 0, 1);
    STEP.surfGrip = surfGrip; STEP.surfDrag = surfDrag; STEP.kerb = kerb; STEP.offRoad = offRoad;
    STEP.dp = dmgPerf(car, !!env.dmgFull); STEP.dirtyF = P.dirtyF * dk; STEP.dirtyR = P.dirtyR * dk; STEP.human = !!car.human;
    PG.Veh.step(car, dt, env, STEP);
    if (car.shiftT > 0) car.shiftT -= dt;
    // trawa i żwir: nierówności szarpią bolidem
    if (offRoad && car.vs && av0 > 3) car.vs.r += (Math.random() - 0.5) * 30 * dt * Math.min(1, av0 / 30);

    // bariery
    car.wall = 0;
    lat = (car.x - T.x[idx]) * T.nx[idx] + (car.y - T.y[idx]) * T.ny[idx];
    if (Math.abs(lat) > bar - 1.2) {
      var sgn = lat > 0 ? 1 : -1, pen = Math.abs(lat) - (bar - 1.2);
      car.x -= T.nx[idx] * sgn * pen; car.y -= T.ny[idx] * sgn * pen;
      var th = Math.atan2(T.ty[idx], T.tx[idx]);
      // kierunek ruchu (przy cofaniu odwrotny do nosa)
      var rel = car.h + car.beta + (car.v < 0 ? Math.PI : 0) - th;
      while (rel > Math.PI) rel -= 2 * Math.PI; while (rel < -Math.PI) rel += 2 * Math.PI;
      var into = Math.sin(rel) * sgn; // >0 gdy jedzie w barierę
      if (into > 0) {
        var impact = Math.abs(car.v) * into;
        car.v *= Math.max(0.15, 1 - into * 1.6);
        var relH = car.h - th; while (relH > Math.PI) relH -= 2 * Math.PI; while (relH < -Math.PI) relH += 2 * Math.PI;
        if (Math.abs(relH) < Math.PI / 2) car.h = th + relH * 0.3;
        else { var back = relH - (relH > 0 ? 1 : -1) * Math.PI; car.h = th + Math.PI + back * 0.3; }
        car.beta = 0;
        car.vsHard = true; // koła toczą się dalej z nową prędkością, rotacja wygaszona
        car.wall = impact;
        car.wallNx = T.nx[idx] * sgn; car.wallNy = T.ny[idx] * sgn; // kierunek do ściany (do oceny uszkodzeń)
      }
    }
  };

  // Kontroler AI
  PG.aiControl = function (car, T, cars, env, dt) {
    var P = PG.PHYS, L = T.line, N = T.N, v = Math.max(car.v, 0);
    var look = Math.round((12 + v * 0.36) / T.ds);
    var ai = car.ai;
    // unikanie i wyprzedzanie
    // w zakręcie (i przed nim) trzymaj się blisko linii: inny tor jazdy przy prędkości z profilu wynosi bolid z toru
    var kAh = 0, nAh = Math.round((20 + v * 1.2) / T.ds);
    for (var ka = 0; ka <= nAh; ka += 3) { var kk = Math.abs(L.k[(car.idx + ka) % N]); if (kk > kAh) kAh = kk; }
    var offLim = kAh > 1 / 250 ? 1.5 : kAh > 1 / 600 ? 3 : 99;
    // gdzie będziemy jechać za chwilę (powrót na linię przed zakrętem) — rywal na tym torze też jest „przed nami"
    var offNext = Math.max(-offLim, Math.min(offLim, car.offsetTarget || 0));
    var wantOff = 0, cap = Infinity, close = false, sideLo = -Infinity, sideHi = Infinity;
    for (var i = 0; i < cars.length; i++) {
      var o = cars[i]; if (o === car || o.retired) continue;
      if (car.ghost > 0 || o.ghost > 0) continue; // po powrocie na tor bolidy przenikają się — nie blokuj się nawzajem
      var dd = o.dist - car.dist;
      // bolid obok (zachodzą na siebie): nie zjeżdżaj na niego bokiem; jeśli jest przed nami, odpuść i schowaj się za nim
      if (dd > -7 && dd < 7 && o.v > 3) {
        var lds = o.lat - car.lat;
        if (lds > -4 && lds < 4) {
          if (lds > 0) sideHi = Math.min(sideHi, o.lat - 2.5); else sideLo = Math.max(sideLo, o.lat + 2.5);
          if (dd > 1.5 && v > o.v - 1) cap = Math.min(cap, o.v - 1.5);
        }
      }
      // bardzo wolny bolid przed nami (obrót, uszkodzenie): hamuj na czas, z zasięgiem drogi hamowania
      if (dd > 0 && dd < 12 + v * v / 40 && o.v < Math.min(v * 0.6, 20) && Math.abs(o.lat - car.lat) < 3.2) {
        var ov = Math.max(0, o.v);
        cap = Math.min(cap, Math.sqrt(ov * ov + 2 * 20 * Math.max(0, dd - 8)));
      }
      if (dd > 0 && dd < 34) {
        var ld = Math.min(Math.abs(o.lat - car.lat), Math.abs(o.lat - (L.o[o.idx] || 0) - offNext));
        if (ld < 4.4) {
          var myPot = car.profile.v[car.idx] * ai.pace;
          if (car.v > o.v + 0.3 || myPot > o.v + 1.5) {
            var roomR = T.hw - o.lat, roomL = o.lat + T.hw;
            var side = ai.side || (roomR > roomL ? 1 : -1);
            ai.side = side;
            wantOff = (o.lat + side * 5.0) - (L.o[car.idx] || 0);
          }
        }
        // za stojącym/wolnym bolidem nie zatrzymuj się do zera, jeśli i tak go objeżdżasz
        if (dd < 11 && ld < 3.4) cap = Math.min(cap, Math.max(o.v * (dd < 7 ? 0.9 : 0.985), wantOff !== 0 && o.v < 8 ? 6 : 0));
        // rywal przed nami hamuje: zostaw sobie drogę hamowania (bezpieczny odstęp)
        if (dd < 34 && ld < 3.0 && o.brake > 0.2 && o.v < v) cap = Math.min(cap, Math.sqrt(o.v * o.v + 2 * 18 * Math.max(0, dd - 8)));
        if (dd < 40 && ld < 3.0) close = true;
      }
    }
    if (wantOff === 0) ai.side = 0;
    car.offsetTarget = Math.max(-offLim, Math.min(offLim, wantOff));
    if (sideLo > -Infinity || sideHi < Infinity) {
      var lo0 = sideLo - (L.o[car.idx] || 0), hi0 = sideHi - (L.o[car.idx] || 0);
      car.offsetTarget = lo0 > hi0 ? (lo0 + hi0) / 2 : Math.max(lo0, Math.min(hi0, car.offsetTarget));
    }
    car.offset += (car.offsetTarget - car.offset) * Math.min(1, dt * (offLim < 99 ? 3 : 1.6));
    var ti = (car.idx + look) % N;
    var off = Math.max(-T.hw + 2.2 - L.o[ti], Math.min(T.hw - 2.2 - L.o[ti], car.offset));
    var tx = L.x[ti] + T.nx[ti] * off, ty = L.y[ti] + T.ny[ti] * off;
    var dx = tx - car.x, dy = ty - car.y, dist = Math.hypot(dx, dy);
    // celujemy kierunkiem ruchu (kurs + kąt znoszenia)
    var ang = Math.atan2(dy, dx) - (car.h + (car.beta || 0));
    while (ang > Math.PI) ang -= 2 * Math.PI; while (ang < -Math.PI) ang += 2 * Math.PI;
    var curv = 2 * Math.sin(ang) / Math.max(dist, 4);
    // blisko linii: śledzenie toru (krzywizna linii z wyprzedzeniem + korekta odchyłki bocznej i kursu);
    // czyste pure pursuit ścina zmiany krzywizny i spóźnia obrót na wyjściach
    var i0 = car.idx, ip = (i0 + 1) % N, im = (i0 + N - 1) % N;
    var offN = Math.max(-T.hw + 2.2 - L.o[i0], Math.min(T.hw - 2.2 - L.o[i0], car.offset));
    var ey = L.o[i0] + offN - car.lat;
    var eh = Math.atan2(L.y[ip] - L.y[im], L.x[ip] - L.x[im]) - (car.h + (car.beta || 0));
    while (eh > Math.PI) eh -= 2 * Math.PI; while (eh < -Math.PI) eh += 2 * Math.PI;
    if (v > 6 && Math.abs(ey) < 3 && Math.abs(eh) < 0.35) {
      var Lp = 7 + v * 0.22, iff = (i0 + Math.round((1 + v * 0.06) / T.ds)) % N;
      var kff = (L.k[iff] + L.k[(iff + 1) % N] + L.k[(iff + N - 1) % N]) / 3;
      var ctr = kff + ey / (Lp * Lp) + 1.6 * Math.sin(eh) / Lp;
      var wB = Math.max(0, Math.min(1, (3 - Math.abs(ey)) / 1.5, (0.35 - Math.abs(eh)) / 0.15));
      curv = ctr * wB + curv * (1 - wB);
    }
    var maxCurv = car.maxCurv;
    if (!(maxCurv > 0)) {
      var vs = Math.max(v, 3), E0 = car.envC || (car.envC = PG.Veh.envelope({ power: car.params.power, cd: car.params.cd, gripMul: car.params.gripMul, aeroMul: car.params.aeroMul, brakeMul: car.params.brakeMul, setup: car.setup }));
      maxCurv = Math.min(1 / 6.5, PG.Veh.envAt(E0.lat, v) * PG.tyreGrip(car, env) / (vs * vs));
    }
    // AI podaje krzywiznę toru jako ułamek maxCurv; vehicle.js zamienia ją na kąt kół (regulator prędkości odchylania)
    car.steer = Math.max(-1, Math.min(1, curv / maxCurv));
    // prędkość docelowa z profilu
    var PV = car.profile.v;
    var pi = (car.idx + Math.round((2 + v * 0.05) / T.ds)) % N;
    var target = PV[pi] * ai.pace;
    // korekta za zużycie i temperaturę opon oraz warunki: w zakrętach i strefach hamowania (na prostej limitem jest moc)
    var gr = PG.tyreGrip(car, env) / ai.refGrip * Math.min(1, car.gripT || 1);
    if (Math.abs(L.k[pi]) > 1 / 900 || PV[(pi + 1) % N] < PV[pi] - 0.01 || gr > 1) target *= Math.sqrt(gr);
    // brudne powietrze za rywalem: wolniej w zakrętach (przód traci więcej docisku)
    var dirty = car.dirty || 0, E = car.envC, aero = 0;
    if (E) { var aV = PG.Veh.envAt(E.lat, v); aero = aV > 0 ? Math.max(0, (aV - E.lat[0]) / aV) : 0; }
    if (dirty > 0.02 && E) {
      var aT = PG.Veh.envAt(E.lat, target), gT = PG.tyreGrip(car, env);
      var use = aT > 0 ? Math.min(1, Math.abs(L.k[pi]) * target * target / (aT * gT * (ai.skill || 1))) : 0;
      if (use > 0.3 && aT > 0) {
        var aeroT = Math.max(0, (aT - E.lat[0]) / aT);
        var lossF = Math.sqrt(Math.max(0.5, 1 - aeroT * P.dirtyF * dirty));
        target *= 1 - (1 - lossF) * (use - 0.3) / 0.7;
      }
    }
    // strefa hamowania: profil zakłada pełne hamowanie w czystym powietrzu na dobrych oponach; przy mniejszej
    // skuteczności (brudne powietrze, zimne/zużyte opony, ciasno w stawce) hamuj wcześniej: v² = vmin² + f·(vp² − vmin²)
    // daleko od linii (wyprzedzanie) trzeba jeszcze skręcić na hamowaniu: mniej siły na hamowanie
    var dLn = Math.abs(car.lat - L.o[car.idx]);
    var fB = Math.min(1, gr) * (1 - aero * 0.6 * dirty) * (close ? 0.93 : 1) * (dLn > 1 ? Math.max(0.8, 1 - 0.03 * (dLn - 1)) : 1);
    if (fB < 0.995) {
      var W = Math.min(260, Math.round(v * v / 24 / T.ds)), vmin = PV[pi];
      for (var k = 1; k <= W; k++) { var pk = PV[(pi + k) % N]; if (pk < vmin) vmin = pk; }
      var vp = PV[pi];
      if (vmin < vp - 0.5) target = Math.min(target, Math.sqrt(vmin * vmin + fB * (vp * vp - vmin * vmin)) * ai.pace);
    }
    // poza linią po wewnętrznej (wyprzedzanie, obrona) promień jest mniejszy niż w profilu: v ~ √(1 − k·Δ)
    var kdl = L.k[pi] * (car.lat - L.o[car.idx]);
    if (kdl > 0) target *= Math.sqrt(Math.max(0.5, 1 - kdl));
    // poza asfaltem: łagodnie zwalniaj (gwałtowne hamowanie na krawężniku w zakręcie kończy się obrotem)
    var offT = Math.abs(car.lat) > T.hw + 0.5;
    if (offT) target = Math.min(target, Math.max(30, v - 0.5));
    if (cap < target) target = cap;
    if (car.rcCap < target) target = car.rcCap; // samochód bezpieczeństwa / VSC
    if (v < target - 0.2) { car.throttle = Math.min(1, (target - v) / 1.5 + 0.5); car.brake = 0; }
    else if (v > target + 0.4) { car.throttle = 0; car.brake = Math.min(offT ? 0.35 : 1, (v - target) / 1.5); }
    else { car.throttle = 0.4; car.brake = 0; }
    // DRS
    car.drsOpen = !!(car.drsAllowed && PG.inDRS(T, car.idx) && car.steer < 0.3 && car.steer > -0.3 && !(car.brake > 0.05));
  };

  // Powrót na tor (AI po utknięciu lub gracz klawiszem R). Nie naprawia uszkodzeń.
  PG.resetCar = function (car, T) {
    var i = PG.wrapI(car.idx - Math.round(10 / T.ds), T.N);
    var d = i - car.idx; if (d > T.N / 2) d -= T.N; if (d < -T.N / 2) d += T.N;
    car.dist += d * T.ds; car.idx = i;
    car.x = T.line.x[i]; car.y = T.line.y[i]; car.h = Math.atan2(T.ty[i], T.tx[i]); car.v = 8; car.steer = 0; car.steerIn = 0;
    car.offset = 0; car.stuck = 0; car.ghost = 2.5;
    car.beta = 0; car.lock = 0; car.wspin = 0; car.axS = 0; car.revT = 0;
    car.mgear = 1; car.shiftT = 0; car.vsHard = true;
  };

  PG.inDRS = function (T, idx) {
    for (var i = 0; i < T.drs.length; i++) {
      var z = T.drs[i];
      if (z.from < z.to ? (idx >= z.from && idx <= z.to) : (idx >= z.from || idx <= z.to)) return z;
    }
    return null;
  };

  // Kolizje między bolidami (dwa okręgi na bolid). Zwraca najwyżej jeden kontakt na parę;
  // tablica i obiekty są używane ponownie przy kolejnym wywołaniu.
  var HITS = [], HPOOL = [];
  PG.collide = function (cars) {
    var Lc = PG.PHYS.carLen, R = PG.PHYS.carR, n = 0;
    HITS.length = 0;
    for (var i = 0; i < cars.length; i++) {
      var a = cars[i]; if (a.retired || a.ghost > 0 || a.inPit) continue;
      for (var j = i + 1; j < cars.length; j++) {
        var b = cars[j]; if (b.retired || b.ghost > 0 || b.inPit || (a.remote && b.remote)) continue;
        var dx0 = b.x - a.x, dy0 = b.y - a.y;
        if (dx0 * dx0 + dy0 * dy0 > 100) continue;
        // prędkości przed kontaktem (siła uderzenia do uszkodzeń)
        var pa = a.h + (a.beta || 0), pb = b.h + (b.beta || 0);
        var rvx = Math.cos(pa) * a.v - Math.cos(pb) * b.v, rvy = Math.sin(pa) * a.v - Math.sin(pb) * b.v;
        var hf = 0, hx = 0, hy = 0, hnx = 0, hny = 0, hia = 0, hib = 0;
        for (var ia = -1; ia <= 1; ia += 2) for (var ib = -1; ib <= 1; ib += 2) {
          var ax = a.x + Math.cos(a.h) * Lc * ia, ay = a.y + Math.sin(a.h) * Lc * ia;
          var bx = b.x + Math.cos(b.h) * Lc * ib, by = b.y + Math.sin(b.h) * Lc * ib;
          var dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy);
          if (d < 2 * R && d > 0.001) {
            var pen = (2 * R - d) / 2, nx = dx / d, ny = dy / d;
            // bolid innego gracza (stan z sieci) jest nieruchomą przeszkodą: odsuwa się tylko nasz
            var ka = b.remote ? 2 : a.remote ? 0 : 1, kb = 2 - ka;
            a.x -= nx * pen * ka; a.y -= ny * pen * ka; b.x += nx * pen * kb; b.y += ny * pen * kb;
            // wymiana prędkości wzdłużnej
            var ahead = (b.dist > a.dist) ? b : a, behind = ahead === b ? a : b;
            if (behind.v > ahead.v) {
              var dv = behind.v - ahead.v;
              if (!behind.remote) behind.v -= dv * (ahead.remote ? 0.6 : 0.45);
              if (!ahead.remote) ahead.v += dv * (behind.remote ? 0.35 : 0.25);
            }
            var side = (nx * Math.sin(a.h) - ny * Math.cos(a.h));
            if (!a.remote) a.h += side * 0.01; if (!b.remote) b.h -= side * 0.01;
            var f = Math.abs(a.v - b.v) + pen * 4;
            if (f > hf) { hf = f; hx = (ax + bx) / 2; hy = (ay + by) / 2; hnx = nx; hny = ny; hia = ia; hib = ib; }
          }
        }
        if (hf > 0) {
          var vn = rvx * hnx + rvy * hny;           // >0: bolidy zbliżały się
          var vt = Math.abs(-rvx * hny + rvy * hnx); // ślizg boczny po sobie
          var o = HPOOL[n]; if (!o) { o = {}; HPOOL[n] = o; }
          o.a = a; o.b = b; o.x = hx; o.y = hy; o.force = hf;
          o.nx = hnx; o.ny = hny; o.ia = hia; o.ib = hib;
          o.vn = (vn > 0 && isFinite(vn)) ? vn : 0; o.vt = isFinite(vt) ? vt : 0;
          HITS[n++] = o;
        }
      }
    }
    return HITS;
  };

  PG.GEAR_TOP = GEAR_TOP;
  PG.RPM = RPM;
})(PG);
