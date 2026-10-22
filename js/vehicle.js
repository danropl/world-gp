// WORLD GP — model bolidu (semi-sim): cztery koła z oponami Magic Formula (combined slip, load sensitivity,
// relaksacja), przechył i pochylenie na sprężynach, amortyzatorach i stabilizatorach, docisk zależny od prześwitu,
// silnik V10 z krzywą momentu, dyferencjał sprzęgłowy, hamulce z balansem i temperaturą, temperatura i zużycie opon.
// Bolid ok. 2004 roku. Krok stały PG.Veh.H (2 ms); PG.stepCar w physics.js woła PG.Veh.step.
// Układ: x do przodu, y w prawo (zgodnie z normalną toru), r > 0 — skręt w prawo.
(function (PG) {
  'use strict';

  var VEH = PG.VEH = {
    m: 640, L: 3.05, a: 1.65, b: 1.40, tF: 1.46, tR: 1.40, h: 0.29, Iz: 950,
    R: 0.33, IwF: 0.9, IwR: 1.2, Ie: 0.04, eff: 0.92, crr: 0.012,
    rho: 1.225, ClA: 3.4, CdA: 1.15, aeroF: 0.43,
    hrcF: 0.03, hrcR: 0.06, Iroll: 60, Ipitch: 450,
    KphiF: 195e3, KphiR: 160e3, Kth: 2.5e6, KhF: 600e3, KhR: 520e3,
    Tbrk: 11000, lock: 0.28, mu0: 1.74, fz0: 3000,
    rpmIdle: 4500, rpmLaunch: 13500, rpmMax: 19000,
    LrF: 0.35, LrR: 0.30
  };
  var H = 1 / 500, G = 9.81;
  var Veh = PG.Veh = { H: H };

  // Opony: mieszanki (µ0 z PG.TYRES.grip × VEH.mu0), czułość na nacisk, kąt i poślizg szczytu, okno temperatur
  var TP = {
    S: { kL: 0.15, apF: 0.095, apR: 0.085, kp: 0.11, tOpt: 95, tW: 16 },
    M: { kL: 0.15, apF: 0.090, apR: 0.080, kp: 0.10, tOpt: 105, tW: 20 },
    H: { kL: 0.14, apF: 0.085, apR: 0.075, kp: 0.09, tOpt: 115, tW: 24 },
    W: { kL: 0.12, apF: 0.110, apR: 0.100, kp: 0.12, tOpt: 65, tW: 24 }
  };
  Object.keys(TP).forEach(function (k) { if (PG.TYRES && PG.TYRES[k]) { var t = PG.TYRES[k]; Object.keys(TP[k]).forEach(function (q) { t[q] = TP[k][q]; }); } });
  // Temperatura powietrza i asfaltu (°C) dla pogody
  var AIR = { sun: [26, 40], cloud: [19, 25], rain: [15, 17] };
  // Krzywa momentu V10 (obr./min → Nm)
  var TQ_R = [0, 4000, 6000, 8000, 10000, 12000, 14000, 16000, 17500, 18300, 19000, 19400];
  var TQ_N = [120, 150, 200, 250, 285, 320, 350, 370, 366, 350, 330, 300];
  function torque(rpm) {
    if (rpm <= TQ_R[0]) return TQ_N[0];
    for (var i = 1; i < TQ_R.length; i++) if (rpm <= TQ_R[i]) { var k = (rpm - TQ_R[i - 1]) / (TQ_R[i] - TQ_R[i - 1]); return TQ_N[i - 1] + (TQ_N[i] - TQ_N[i - 1]) * k; }
    return TQ_N[TQ_N.length - 1];
  }
  Veh.torque = torque;
  var W_TOP = VEH.rpmMax * Math.PI / 30; // rad/s silnika na końcu biegu

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }

  // ---------- SETUP ----------
  // Wartości jak na ekranie setupu (skale 1–11, balans w % przodu, dyferencjał w %, preload w Nm, 8. bieg w km/h)
  var SETUP_DEF = { fw: 6, rw: 6, bias: 58, diffP: 45, diffC: 25, pre: 80, arbF: 6, arbR: 5, sprF: 6, sprR: 6, dmpB: 6, dmpR: 6, rhF: 4, rhR: 6, press: 6, top: 360 };
  var SETUP_LIM = { fw: [1, 11], rw: [1, 11], bias: [50, 64], diffP: [20, 80], diffC: [10, 60], pre: [0, 200], arbF: [1, 11], arbR: [1, 11], sprF: [1, 11], sprR: [1, 11], dmpB: [1, 11], dmpR: [1, 11], rhF: [1, 11], rhR: [1, 11], press: [1, 11], top: [330, 380] };
  PG.SETUP_DEF = SETUP_DEF; PG.SETUP_LIM = SETUP_LIM;
  Veh.cleanSetup = function (s) {
    var o = {};
    Object.keys(SETUP_DEF).forEach(function (k) {
      var v = s && typeof s[k] === 'number' && isFinite(s[k]) ? s[k] : SETUP_DEF[k], l = SETUP_LIM[k];
      o[k] = clamp(Math.round(v), l[0], l[1]);
    });
    return o;
  };

  // Parametry pochodne z cech zespołu (p z PG.carParams) i setupu
  Veh.prep = function (p, setup) {
    var s = Veh.cleanSetup(setup), V = VEH;
    var pwr = (p && p.power) ? p.power / PG.PHYS.power : 1, am = (p && p.aeroMul) || 1, cdm = (p && p.cd) ? p.cd / PG.PHYS.cd : 1;
    var q = {
      s: s,
      ClF: V.ClA * V.aeroF * am * (1 + 0.06 * (s.fw - 6)),
      ClR: V.ClA * (1 - V.aeroF) * am * (1 + 0.06 * (s.rw - 6)),
      CdA: V.CdA * cdm * (1 + 0.012 * (s.fw - 6) + 0.035 * (s.rw - 6)),
      tq: pwr, bias: s.bias / 100, Tbrk: V.Tbrk * ((p && p.brakeMul) || 1),
      kP: s.diffP / 100, kC: s.diffC / 100, pre: s.pre,
      KphiF: V.KphiF * (1 + 0.07 * (s.arbF - 6) + 0.05 * (s.sprF - 6)),
      KphiR: V.KphiR * (1 + 0.07 * (s.arbR - 6) + 0.05 * (s.sprR - 6)),
      Kth: V.Kth * (1 + 0.03 * (s.sprF + s.sprR - 12)),
      KhF: V.KhF * (1 + 0.07 * (s.sprF - 6)), KhR: V.KhR * (1 + 0.07 * (s.sprR - 6)),
      cB: 1 + 0.08 * (s.dmpB - 6), cR: 1 + 0.08 * (s.dmpR - 6),
      rhF: 0.010 + 0.0025 * s.rhF, rhR: 0.030 + 0.004 * s.rhR,
      press: s.press - 6, gs: s.top / 360
    };
    // ciśnienie: niższe = większy ślad (więcej przyczepności), więcej ciepła w karkasie; wyższe = ostrzejsza reakcja
    q.muP = 1 - 0.004 * q.press;
    q.kB = 1 + 0.03 * q.press;
    q.Kphi = q.KphiF + q.KphiR; q.lamF = q.KphiF / q.Kphi;
    var ws = Math.sqrt(q.Kphi * V.Iroll), wp = Math.sqrt(q.Kth * V.Ipitch);
    q.Cphi = 2 * 0.6 * ws; q.Cth = 2 * 0.6 * wp;
    q.hra = (V.hrcF * V.b + V.hrcR * V.a) / V.L;
    return q;
  };

  // ---------- OPONA ----------
  // Magic Formula: kształt krzywej g(u) = sin(C·atan(u − E·(u − atan u))), u = B·σ (1 na szczycie).
  // Stablicowana (krok 1/64) z interpolacją liniową: liczona 4–16 razy na koło w każdym kroku 2 ms.
  // P: siła w pełnym poślizgu (ułamek szczytu), poniżej której krzywa za szczytem już nie spada. Siła boczna
  // zostaje na 0,8 szczytu od ok. 18° kąta znoszenia: bolid w obrocie, jadący bokiem, wytraca prędkość na oponach
  var MFU = 64, MFS = 64, MFN = MFU * MFS;
  function mfTab(C, E, P) {
    var t = new Float64Array(MFN + 2);
    for (var k = 0; k <= MFN + 1; k++) { var u = k / MFS; t[k] = Math.sin(C * Math.atan(u - E * (u - Math.atan(u)))); if (P && u > 2 && t[k] < P) t[k] = P; }
    return t;
  }
  var GX = mfTab(1.7, 0.1), GY = mfTab(1.6, 0.2, 0.8), BX = 1.37, BY = 1.62;
  var MG = 0, MD = 0; // wartość i pochodna dg/du ostatniego odczytu
  function mfL(t, u) {
    if (u >= MFU) { MG = t[MFN]; MD = 0; return MG; }
    var x = u * MFS, k = x | 0, a = t[k], b = t[k + 1];
    MD = (b - a) * MFS; MG = a + (b - a) * (x - k);
    return MG;
  }
  Veh.mf = function (u, lat) { return mfL(lat ? GY : GX, u); };
  // Znormalizowany poślizg wzdłużny σ = κ/κp, przy którym siła osiąga F/D = ratio (przed szczytem krzywej)
  Veh.KP_REF = 0.1;
  function slipFor(ratio, kB) {
    if (!(ratio > 0)) return 0;
    var lo = 0, hi = 1.33 / (BX * kB); // u ≈ 1,33 to szczyt g(u)
    for (var i = 0; i < 20; i++) { var mid = (lo + hi) / 2; if (mfL(GX, BX * kB * mid) < ratio) lo = mid; else hi = mid; }
    return lo;
  }
  // Siły opony w układzie koła (x do przodu, y w prawo) do TF[0], TF[1]; TF[2] = znormalizowany poślizg σ,
  // TF[3] = dFx/dκ (do półniejawnego obrotu koła). D = µ·Fz, ap = kąt szczytu, kp = poślizg szczytu, kB = sztywność (ciśnienie)
  var TF = new Float64Array(4), GYK = 0.7;
  function tanA(alpha) { return Math.tan(alpha < -1.45 ? -1.45 : alpha > 1.45 ? 1.45 : alpha); }
  // ta = tan(α) (liczony raz na koło w kroku)
  function tyre(D, ap, kp, kB, ta, kappa) {
    var sx = kappa / kp, sy = ta / ap;
    var s = Math.sqrt(sx * sx + sy * sy), cx = BX * kB;
    TF[2] = s;
    if (!(D > 0)) { TF[0] = 0; TF[1] = 0; TF[3] = 0; return; }
    if (!(s > 1e-6)) { TF[0] = 0; TF[1] = 0; TF[3] = D * GX[1] * MFS * cx / kp; return; }
    var gx = mfL(GX, cx * s), dgx = MD, gy = mfL(GY, BY * kB * s), is = 1 / s, ux = sx * is, uy = sy * is;
    // koło buksujące albo zablokowane (poślizg wzdłużny wyraźnie za szczytem) traci siłę boczną szybciej, niż
    // wynika z koła tarcia (jak funkcja wagowa Gyκ w Magic Formula): gaz bez kontroli trakcji kończy się
    // obrotem, a nie długim driftem na kręcących się tylnych kołach. Efekt słabnie z kątem znoszenia (jak w Magic
    // Formula): bolid w obrocie, jadący bokiem, ma hamować na oponach, a nie sunąć dalej
    var ax = sx < 0 ? -sx : sx, wy = ax > 1.5 ? 1 / (1 + GYK * Math.min(ax - 1.5, 3) / (1 + 8 * ta * ta)) : 1;
    TF[0] = D * gx * ux;
    TF[1] = -D * gy * uy * wy;
    TF[3] = D * (dgx * cx * ux * ux + gx * uy * uy * is) / kp;
  }
  Veh.tyre = function (D, ap, kp, kB, alpha, kappa) { tyre(D, ap, kp, kB, tanA(alpha), kappa); return [TF[0], TF[1], TF[2], TF[3]]; };
  // Współczynnik tarcia z czułością na nacisk
  // (Fz/Fz0)^(−kL) stablicowane co 25 N dla każdej wartości kL (Math.pow 4× na krok był zauważalny)
  var LT = {}, LTS = 25, LTN = 2400;
  function muLoad(mu0, kL, fz) {
    var t = LT[kL];
    if (!t) { t = LT[kL] = new Float64Array(LTN + 2); for (var k = 0; k <= LTN + 1; k++) t[k] = Math.pow(Math.max(200, k * LTS) / VEH.fz0, -kL); }
    var x = (fz > 200 ? fz : 200) / LTS;
    if (x >= LTN) return mu0 * Math.pow(fz / VEH.fz0, -kL);
    var j = x | 0;
    return mu0 * (t[j] + (t[j + 1] - t[j]) * (x - j));
  }

  // Grip od temperatury (bieżnik i karkas)
  function fTemp(ts, tc, tp) {
    var te = 0.6 * ts + 0.4 * tc, d = (te - tp.tOpt) / tp.tW;
    var f = 1 - (d < 0 ? 0.06 : 0.10) * d * d;
    return f < 0.72 ? 0.72 : f;
  }
  Veh.fTemp = fTemp;
  // Grip od zużycia: łagodnie, pod koniec „klif"
  function fWear(w) { return 1 - 0.06 * w - 0.12 * w * w * w * w; }
  Veh.fWear = fWear;

  // ---------- STAN ----------
  var WX = [VEH.a, VEH.a, -VEH.b, -VEH.b];
  var WY = [-VEH.tF / 2, VEH.tF / 2, -VEH.tR / 2, VEH.tR / 2];

  function newState(car, env) {
    var tp = PG.TYRES[car.compound] || PG.TYRES.M, T0 = car.tyreT0 === 'opt' ? tp.tOpt : 80;
    var s = {
      vx: 0, vy: 0, r: 0, w: new Float64Array(4), al: new Float64Array(4), kap: new Float64Array(4),
      fz: new Float64Array(4), fx: new Float64Array(4), fy: new Float64Array(4), sig: new Float64Array(4), fT: new Float64Array(4),
      Ts: new Float64Array(4), Tc: new Float64Array(4), wr: new Float64Array(4), Tb: new Float64Array(2), ps: new Float64Array(4), pb: new Float64Array(4), ab: new Float64Array([1, 1, 1, 1]), tg: 1,
      phi: 0, dphi: 0, th: 0, dth: 0, ax: 0, ay: 0, hF: 0, hR: 0, dlt: 0, aiI: 0,
      oV: NaN, oB: NaN, oH: NaN, shiftT: 0, gear: 1, rpm: VEH.rpmIdle, comp: car.compound, eLap: 0, thN: 0, thDt: 0
    };
    for (var i = 0; i < 4; i++) { s.Ts[i] = T0; s.Tc[i] = T0; s.wr[i] = car.wear || 0; }
    s.Tb[0] = 420; s.Tb[1] = 420;
    syncIn(car, s, true);
    return s;
  }
  // Prędkości z pól bolidu (start, reset, po zderzeniu): wolne toczenie kół
  function syncIn(car, s, hard) {
    var v = car.v || 0, b = car.beta || 0;
    var ov = Math.hypot(s.vx, s.vy);
    s.vx = v * Math.cos(b); s.vy = v * Math.sin(b);
    if (hard || !(ov > 1)) { for (var i = 0; i < 4; i++) { s.w[i] = s.vx / VEH.R; s.al[i] = 0; } s.r = 0; s.dphi = 0; s.dth = 0; }
    else {
      var k = Math.abs(v) / ov;
      for (var j = 0; j < 4; j++) s.w[j] *= k;
      s.r *= 0.3;
    }
  }
  // Nowe opony (pit stop)
  Veh.newTyres = function (car) {
    var s = car.vs; if (!s) return;
    for (var i = 0; i < 4; i++) { s.Ts[i] = 80; s.Tc[i] = 80; s.wr[i] = 0; }
    s.comp = car.compound;
  };
  // Reset stanu ruchu (powrót na tor, pole startowe), temperatury i zużycie zostają
  Veh.resetMotion = function (car) { if (car.vs) car.vsHard = true; };

  // ---------- OBWIEDNIA OSIĄGÓW (profil prędkości AI, podpowiedzi hamowania) ----------
  // Dla prędkości 0…110 m/s: maks. przyspieszenie boczne, opóźnienie hamowania i trakcja (część od opon),
  // siła napędu silnika (na kg) i opór (na kg). p: {power, cd, gripMul, aeroMul, brakeMul, setup}
  var ENV_CACHE = {};
  Veh.envelope = function (p) {
    var key = [p.power, p.cd, p.gripMul, p.aeroMul, p.brakeMul || 1, JSON.stringify(p.setup || null)].map(function (x) { return typeof x === 'number' ? x.toFixed(5) : x; }).join('|');
    if (ENV_CACHE[key]) return ENV_CACHE[key];
    var V = VEH, q = Veh.prep(p, p.setup), m = V.m, mu0 = V.mu0 * (p.gripMul || 1) * q.muP, kL = 0.15;
    var N = 111, E = { lat: new Float64Array(N), brk: new Float64Array(N), trac: new Float64Array(N), eng: new Float64Array(N), drag: new Float64Array(N) };
    var Wf = m * G * V.b / V.L, Wr = m * G * V.a / V.L;
    function cap2(fz) { // dwa koła osi przy równym nacisku
      var f = fz / 2; if (f < 0) return 0;
      return 2 * muLoad(mu0, kL, f) * f;
    }
    function capLR(fzA, dfz) { var o = fzA / 2 + dfz, i = fzA / 2 - dfz; if (i < 0) { o += i; i = 0; } return muLoad(mu0, kL, o) * o + (i > 0 ? muLoad(mu0, kL, i) * i : 0); }
    for (var v = 0; v < N; v++) {
      var qd = 0.5 * V.rho * v * v;
      // prześwit w stanie ustalonym (bez pochylenia): niżej = więcej docisku
      var kr = rideK(q.rhF - qd * q.ClF / q.KhF, q.rhR - qd * q.ClR / q.KhR);
      var dF = qd * q.ClF * kr, dR = qd * q.ClR * kr, drag = qd * q.CdA + V.crr * (m * G + dF + dR);
      E.drag[v] = drag / m;
      // boczne: największe ay, przy którym obie osie mają zapas (tył dodatkowo pcha bolid przeciw oporowi)
      var lo = 0, hi = 90;
      for (var it = 0; it < 30; it++) {
        var ay = (lo + hi) / 2, mA = m * ay;
        var dFz = mA / V.tF * (V.b / V.L * V.hrcF + q.lamF * (V.h - q.hra)), dRz = mA / V.tR * (V.a / V.L * V.hrcR + (1 - q.lamF) * (V.h - q.hra));
        var cF = capLR(Wf + dF, dFz), cR = capLR(Wr + dR, dRz);
        cR = cR > drag ? Math.sqrt(cR * cR - drag * drag) : 0;
        if (cF >= mA * V.b / V.L && cR >= mA * V.a / V.L) lo = ay; else hi = ay;
      }
      // przy małej prędkości bolid nie osiąga ideału obu osi naraz (kąt skrętu, opór skręconych kół, blokada
      // dyferencjału, podsterowność): korekta zmierzona na skidpadzie R = 15–50 m
      E.lat[v] = lo * clamp(1 - 0.5 / Math.max(v, 8) - 20 / Math.max(v * v, 64), 0.8, 1);
      // hamowanie z ABS: oś zablokuje się na swoim szczycie albo zabraknie momentu hamulca
      lo = 0; hi = 80;
      for (var it2 = 0; it2 < 30; it2++) {
        var ab = (lo + hi) / 2, tr = m * ab * V.h / V.L;
        var fF = Math.min(cap2(Wf + dF + tr), q.bias * q.Tbrk / V.R), fR = Math.min(cap2(Wr + dR - tr), (1 - q.bias) * q.Tbrk / V.R);
        if (fF + fR >= m * ab) lo = ab; else hi = ab;
      }
      E.brk[v] = lo;
      // trakcja: tylna oś (z przeniesieniem obciążenia), 2% zapasu na kontrolę trakcji
      lo = 0; hi = 40;
      for (var it3 = 0; it3 < 30; it3++) {
        var at = (lo + hi) / 2;
        if (0.98 * cap2(Wr + dR + m * at * V.h / V.L) >= m * at) lo = at; else hi = at;
      }
      E.trac[v] = lo;
      // silnik: bieg automatu przy tej prędkości, obroty podniesione o poślizg opon, masa zastępcza
      // z bezwładnością kół i silnika (jak w kroku dynamiki), żeby profil AI zgadzał się z jazdą
      var g = PG.autoGear(1, v * 3.6 / q.gs), gr = W_TOP / (PG.GEAR_TOP[g] / 3.6 * q.gs / V.R);
      var rpm0 = v / V.R * gr * 30 / Math.PI, ae = 0, mEq = m + (2 * V.IwF + 2 * V.IwR + V.Ie * gr * gr) / (V.R * V.R);
      for (var it4 = 0; it4 < 3; it4++) {
        var Dr = cap2(Wr + dR + m * ae * V.h / V.L), Fd = 0;
        var kap = Dr > 0 ? slipFor(Math.min(0.999, (ae * mEq + drag) / Dr), q.kB) * Veh.KP_REF : 0;
        var rpm = rpm0 * (1 + kap);
        if (g === 1 && rpm < V.rpmLaunch) rpm = V.rpmLaunch;
        if (rpm > V.rpmMax) rpm = V.rpmMax;
        Fd = torque(rpm) * q.tq * gr * V.eff / V.R;
        ae = Math.max(0, (Fd - drag) / mEq);
      }
      E.eng[v] = (Fd - drag) / mEq + drag / m; // profil odejmuje E.drag osobno
    }
    E.dfF = q.ClF; E.dfR = q.ClR;
    ENV_CACHE[key] = E;
    return E;
  };
  function envAt(arr, v) {
    var a = v < 0 ? -v : v; if (a >= 110) return arr[110];
    var i = a | 0, f = a - i;
    return arr[i] + (arr[i + 1] - arr[i]) * f;
  }
  Veh.envAt = envAt;

  // Mnożnik docisku od prześwitu (m): niżej przód = więcej docisku, pod 3 mm podłoga traci docisk (przeciągnięcie)
  function rideK(hF, hR) {
    var mmF = hF * 1000, mmR = hR * 1000;
    var k = 1 + 0.010 * (20 - mmF) + 0.002 * (mmR - mmF - 34);
    if (mmF < 3) k -= 0.04 * (3 - mmF);
    return clamp(k, 0.7, 1.15);
  }
  Veh.rideK = rideK;

  // ---------- KROK ----------
  var FZ = new Float64Array(4), TA = new Float64Array(4), DV = new Float64Array(4), DTQ = new Float64Array(4), BTQ = new Float64Array(4);

  // Główny krok dynamiki. o: { surfGrip, surfDrag, kerb, offRoad, dp (uszkodzenia), dirtyF, dirtyR, human }
  Veh.step = function (car, dt, env, o) {
    var V = VEH, p = car.params, i;
    if (!car.vp || car.vpKey !== car.setupKey) { car.vp = Veh.prep(p, car.setup); car.vpKey = car.setupKey; }
    var q = car.vp;
    var s = car.vs;
    if (!s) s = car.vs = newState(car, env);
    if (car.vsHard) { car.vsHard = false; syncIn(car, s, true); }
    else if (car.v !== s.oV || car.beta !== s.oB) syncIn(car, s, false); // zderzenie albo bariera zmieniły ruch
    if (s.comp !== car.compound) Veh.newTyres(car);
    var tp = PG.TYRES[car.compound] || PG.TYRES.M;
    var dp = o.dp, human = !!o.human, m = V.m;
    var air = AIR[(env && env.weather) || 'sun'] || AIR.sun;
    var vx = s.vx, vy = s.vy, r = s.r, spd = Math.sqrt(vx * vx + vy * vy);

    // postój na polu startowym (hamulec postojowy)
    if (car.hold && spd < 0.6) {
      s.vx = 0; s.vy = 0; s.r = 0; for (i = 0; i < 4; i++) { s.w[i] = 0; s.al[i] = 0; s.kap[i] = 0; }
      therm(car, s, tp, q, env, air, dt, 0);
      car.v = 0; car.beta = 0; s.oV = 0; s.oB = 0;
      car.latAcc = 0; car.skid = 0; car.wspin = 0; car.lock = 0; car.lockSide = 0; car.absAct = 0; car.tcAct = 0;
      engineOut(car, s, q, 0, car.throttle || 0);
      return;
    }

    // ---- aerodynamika ----
    var qd = 0.5 * V.rho * vx * vx;
    var kr = rideK(s.hF || q.rhF, s.hR || q.rhR);
    var dirtyF = o.dirtyF || 0, dirtyR = o.dirtyR || 0;
    var dF = qd * q.ClF * kr * dp.aF * (1 - dirtyF);
    var dR = qd * q.ClR * kr * dp.aR * (1 - dirtyR) * (car.drsOpen ? 0.88 : 1);
    var drag = qd * q.CdA * dp.drag * (car.drsOpen ? 0.86 : 1) * (car.slip || 1);
    // ride height dla następnego kroku: docisk ugina sprężyny, pochylenie opuszcza przód przy hamowaniu
    s.hF = q.rhF - dF / q.KhF - V.a * s.th;
    s.hR = q.rhR - dR / q.KhR + V.b * s.th;
    // podłoga dobija (deska ociera o asfalt): część nacisku idzie na deskę, rośnie opór
    var plank = 0;
    if (s.hF < 0) plank += -s.hF * 200e3;
    if (s.hR < 0) plank += -s.hR * 200e3;

    // ---- naciski kół ----
    var Wf = m * G * V.b / V.L, Wr = m * G * V.a / V.L;
    var dLong = (q.Kth * s.th + q.Cth * s.dth) / V.L;            // > 0: na przód (hamowanie)
    var dLatF = (q.KphiF * s.phi + q.Cphi * q.lamF * s.dphi) / V.tF + m * s.ay * V.b / V.L * V.hrcF / V.tF;
    var dLatR = (q.KphiR * s.phi + q.Cphi * (1 - q.lamF) * s.dphi) / V.tR + m * s.ay * V.a / V.L * V.hrcR / V.tR;
    var pF = plank * 0.6, pR = plank * 0.4;
    FZ[0] = (Wf + dF - pF) / 2 + dLong / 2 + dLatF;
    FZ[1] = (Wf + dF - pF) / 2 + dLong / 2 - dLatF;
    FZ[2] = (Wr + dR - pR) / 2 - dLong / 2 + dLatR;
    FZ[3] = (Wr + dR - pR) / 2 - dLong / 2 - dLatR;
    if (o.kerb && spd > 8) for (i = 0; i < 4; i++) FZ[i] *= 1 + (Math.random() - 0.5) * (human ? 0.5 : 0.2);
    for (i = 0; i < 4; i++) { if (FZ[i] < 30) FZ[i] = 30; s.fz[i] = FZ[i]; }

    // ---- kierownica ----
    var st = clamp(car.steer || 0, -1, 1), dl;
    var avx = vx < 0 ? -vx : vx, vxs = avx > 3 ? avx : 3;
    var tgr = PG.tyreGrip(car, env);
    var gEst = (p.gripMul || 1) * tgr * o.surfGrip * dp.gD;
    var envC = car.envC || (car.envC = Veh.envelope({ power: p.power, cd: p.cd, gripMul: p.gripMul, aeroMul: p.aeroMul, brakeMul: p.brakeMul, setup: car.setup }));
    var aLat = envAt(envC.lat, avx) * gEst / (p.gripMul || 1);
    car.maxCurv = Math.min(1 / 6.5, aLat / (vxs * vxs));
    var aF = Math.atan2(vy + V.a * r, vxs); // kierunek ruchu przedniej osi względem nadwozia
    var apF = tp.apF / q.kB;
    if (human) {
      if (car.sAssist) {
        // asysta: pełne wychylenie = szczyt przedniej opony przy tej prędkości (+20 % zapasu)
        var dmax = Math.min(V.lock, 1.2 * apF + V.L * aLat / (vxs * vxs));
        dl = st * dmax;
      } else dl = st * V.lock;
      // pomoc kontry łapie mały uślizg tyłu (najwyżej ok. 7° na kołach), ale nie trzyma bolidu bokiem na gazie:
      // gdy tylne koła buksują za szczytem (gaz bez kontroli trakcji), pomoc znika i bolid się obraca
      if (car.csAssist && avx > 6) {
        var be = Math.atan2(vy, avx), ex = be - clamp(be, -0.05, 0.05);
        var kqC = Math.max(s.kap[2], s.kap[3]) / (tp.kp / q.kB);
        dl += clamp(0.75 * ex, -0.12, 0.12) * (1 - clamp((kqC - 1.3) / 1.2, 0, 1));
      }
      // pad i klawiatura: lekkie wygładzenie; kierownica wprost
      if (!car.inWheel) dl = s.dlt + (dl - s.dlt) * Math.min(1, 18 * dt);
    } else {
      // AI i jazda automatyczna: steer = ułamek maxCurv → regulator krzywizny toru (prędkość odchylania)
      var kc = st * car.maxCurv, kAct = avx > 1 ? r / avx : 0, e = kc - kAct;
      if (avx < 2) s.aiI = 0;
      else s.aiI = clamp(s.aiI + 8 * V.L * e * dt, -0.12, 0.12);
      dl = kc * V.L + s.aiI + 2.2 * V.L * e;
      // tył za szczytem przyczepności (nadsterowność): kontra od nadmiaru kąta znoszenia tylnej osi — sama
      // prędkość odchylania tego nie widzi, bo przy poślizgu bolid „płynie" bokiem, a r rośnie powoli
      var aR = Math.atan2(vy - V.b * r, vxs), apR = tp.apR / q.kB, exR = aR - clamp(aR, -apR, apR);
      if (avx > 6) dl += 1.2 * exR;
      // nie skręcaj dalej niż szczyt przedniej opony (podsterowność nic nie daje), kontra wynika z regulatora
      dl = clamp(dl, aF - 1.05 * apF, aF + 1.05 * apF);
    }
    if (dp.pull !== 0 && avx > 3) dl += dp.pull * 0.008;
    if (dp.susp > 0.05 && avx > 10) dl += (Math.random() - 0.5) * 0.004 * dp.susp;
    dl = clamp(dl, -V.lock, V.lock);
    s.dlt = dl;
    car.delta = dl;
    var cd = Math.cos(dl), sd = Math.sin(dl);

    // ---- pedały ----
    var thr = clamp(car.throttle || 0, 0, 1), brk = clamp(car.brake || 0, 0, 1);
    var reversing = !!(car.isPlayer && car.wantRev && car.revT > 0.4 && thr === 0 && !car.hold && spd < 7.5);
    if (reversing) brk = 0;

    // ---- opony: kinematyka i siły (bez momentów) ----
    // zużycie działa niżej, na każdym kole osobno (fWear); tgr (ze zużyciem) służy tylko do szacunków maxCurv i asysty
    var muB = V.mu0 * PG.baseGrip(car, env) * (p.gripMul || 1) * o.surfGrip * dp.gD * q.muP * (1 - 0.03 * (car.flat || 0));
    var sigMax = 0, kapMin = 0, kapMax = 0, lockL = 0, lockR = 0;
    var Dv = DV; // D = µ·Fz na koło
    for (i = 0; i < 4; i++) {
      var front = i < 2;
      var cvx = vx - r * WY[i], cvy = vy + r * WX[i];
      var wvx = front ? cvx * cd + cvy * sd : cvx, wvy = front ? -cvx * sd + cvy * cd : cvy;
      var awx = wvx < 0 ? -wvx : wvx, den = awx > 3 ? awx : 3;
      var ass = Math.atan2(wvy, den);
      var Lr = front ? V.LrF : V.LrR;
      s.al[i] += (ass - s.al[i]) * Math.min(1, (awx > 2 ? awx : 2) * dt / Lr);
      TA[i] = tanA(s.al[i]);
      s.kap[i] = (s.w[i] * V.R - wvx) / den;
      var muT = fTemp(s.Ts[i], s.Tc[i], tp), muW = fWear(s.wr[i]);
      s.fT[i] = muT;
      var lb = (!front && car.launchBoost && car.launchBoost < 1) ? car.launchBoost : 1;
      Dv[i] = muLoad(muB * muT * muW * lb, tp.kL, FZ[i]) * FZ[i];
      s.ps[i] = wvx; // prędkość w osi koła (termika, siły)
    }

    // ---- napęd: silnik, skrzynia, sprzęgło ----
    // automat zmienia biegi wg obrotów (prędkość tylnych kół; przy buksowaniu najwyżej o 25 % ponad prędkość jazdy,
    // inaczej automat wrzuca kolejne biegi na kręcących się kołach). Redukcja tylko bez przekręcenia silnika:
    // w obrocie bolid jedzie bokiem (prędkość wzdłuż osi prawie zero), a kręcące się koła z silnikiem na jedynce
    // kręciłyby się dalej przez kilka sekund i bolid sunąłby bokiem bez tarcia tylnych opon
    var vWr = (s.w[2] + s.w[3]) / 2 * V.R, vShift = thr > 0 && vWr > avx ? Math.max(avx, Math.min(vWr, spd * 1.25 + 2)) : avx;
    var gs = q.gs, gear = car.manual && human ? (car.mgear || 1) : PG.autoGear(s.gear, vShift * 3.6 / gs);
    if (!(car.manual && human)) while (gear < s.gear && vWr * 3.6 / gs > PG.GEAR_TOP[gear] * 0.98) gear++;
    if (gear > s.gear && !(car.manual && human)) s.shiftT = 0.03;
    if (car.manual && human && car.shiftT > 0) s.shiftT = Math.max(s.shiftT, car.shiftT);
    s.gear = gear;
    var GR = W_TOP / (PG.GEAR_TOP[gear] / 3.6 * gs / V.R);
    var wRear = (s.w[2] + s.w[3]) / 2, rpmW = wRear * GR * 30 / Math.PI;
    var rpm = rpmW, slipClutch = false;
    if (thr > 0 && rpmW < V.rpmLaunch && gear === 1) { rpm = Math.max(rpmW, V.rpmIdle + (V.rpmLaunch - V.rpmIdle) * thr); slipClutch = true; }
    else if (rpmW < V.rpmIdle) { rpm = V.rpmIdle; slipClutch = true; }
    // obrót (bolid bokiem, bez gazu): sprzęgło otwarte jak anti-stall w F1, tylne koła toczą się z prędkością jazdy
    // zamiast kręcić się razem z silnikiem, więc opony hamują bolid w ślizgu
    var spinC = !slipClutch && thr < 0.05 && !reversing && spd > 3 && Math.abs(vy) > 0.7 * spd;
    if (spinC) { rpm = V.rpmIdle; slipClutch = true; }
    var limiter = !slipClutch && rpmW >= V.rpmMax;
    var Te = 0;
    if (reversing) Te = 0;
    else if (thr > 0 && !limiter && s.shiftT <= 0) Te = torque(rpm) * q.tq * dp.pw * thr;
    else if (!slipClutch && vWr > 4) Te = -(15 + 45 * (rpm / V.rpmMax) * (rpm / V.rpmMax)) * (1 - thr);
    if (s.shiftT > 0) s.shiftT -= dt;
    var Tin = Te * GR * (Te > 0 ? V.eff : 1);
    // bezwładność silnika na tylnych kołach przy zamkniętym sprzęgle
    var IwR = V.IwR + (slipClutch ? 0 : V.Ie * GR * GR / 2);
    // kontrola trakcji: moment ograniczony tak, by tylne koła zostały w elipsie przyczepności (poślizg wzdłużny
    // dopuszczony tylko w części, której nie zużywa skręt); poziom 1 pozwala na więcej, 3 na najmniej
    // AI i poziom 3: koło tarcia — napęd tylko z tej części przyczepności, której nie potrzebuje boczna siła
    // przy obecnym kącie znoszenia (jak idealnie dozowany gaz); poziomy 1–2 pilnują łącznego poślizgu
    car.tcAct = 0;
    if (!car.tcOn || Tin <= 0) s.tg = 1;
    if (car.tcOn && Tin > 0) {
      var circ = !human || car.tcLvl === 3, sMax = car.tcLvl === 1 ? 1.3 : 1.1, lsum = 0, lmin = Infinity;
      for (i = 2; i < 4; i++) {
        var sy0 = TA[i] / tp.apR, li;
        if (circ) {
          var gy = mfL(GY, BY * q.kB * (sy0 < 0 ? -sy0 : sy0));
          li = 0.98 * Dv[i] * Math.sqrt(Math.max(0.0025, 1 - gy * gy)) * V.R;
        } else {
          var kt = tp.kp * Math.sqrt(Math.max(0.04, sMax * sMax - sy0 * sy0));
          tyre(Dv[i], tp.apR, tp.kp, q.kB, TA[i], kt);
          li = Math.abs(TF[0]) * V.R;
        }
        lsum += li; if (li < lmin) lmin = li;
      }
      var lockT = q.pre + q.kP * Tin, lt = Math.min(lsum, 2 * lmin + 2 * lockT);
      // moment na rozpędzenie kół i silnika: przy przyspieszeniu, które da ta siła (filtrowane ax spóźnia się po zmianie biegu)
      // (opór nawierzchni poza torem odejmuje się od przyspieszenia, inaczej zapas na bezwładność rozkręca koła)
      var aP = Math.max(s.ax, (lt / V.R - drag) / m - (o.surfDrag || 0), 0);
      var lim = lt + 2 * IwR * aP / V.R;
      // sprzężenie od rzeczywistego poślizgu (jak modulator ABS): gdy koło i tak buksuje za szczytem, siła opony
      // na opadającej części krzywej jest mniejsza od limitu i koło rozkręca się dalej; wtedy szybko mniej momentu
      var kq = Math.max(s.kap[2], s.kap[3]) / (tp.kp / q.kB * (circ ? 1 : sMax));
      if (kq > 1.25) s.tg = Math.max(0.05, s.tg - (kq > 2 ? 30 : 10) * dt);
      else if (kq < 1.05) s.tg = Math.min(1, s.tg + 3 * dt);
      lim *= s.tg;
      if (Tin > lim) { car.tcAct = clamp((Tin - lim) / Tin * 2, 0, 1); Tin = lim; }
    }
    // pomoc stabilności (AI zawsze, gracz z ustawień): bolid obraca się szybciej, niż wynika z toru jazdy
    // (r > ay/v, kąt znoszenia rośnie) albo kąt znoszenia już duży → mniej gazu. Odniesieniem nie jest kąt
    // kierownicy: przy wyjściu z zakrętu prostuje się ją, zanim bolid przestanie skręcać.
    if (car.stabOn && Tin > 0 && avx > 8) {
      // kąt znoszenia tylnej osi (w wolnym zakręcie środek masy ma naturalny kąt b/R, tył nie)
      var sR = Math.abs(vy - V.b * r) / (avx * tp.apR), rPath = s.ay / avx;
      var rot = r * rPath >= 0 ? Math.abs(r) - Math.abs(rPath) - 0.08 : Math.abs(r) - 0.08;
      var cut = Math.max(rot > 0 ? rot * 3 : 0, (sR - 1.25) * 1.5);
      // tył w poślizgu i koła buksują za szczytem: częściowe odjęcie momentu nie wystarcza (koło na opadającej
      // części krzywej kręci się dalej), więc moment w dół, aż koła wrócą do szczytu
      var kqS = Math.max(s.kap[2], s.kap[3]) / (tp.kp / q.kB);
      if ((rot > 0 || sR > 1) && kqS > 1.2) cut = Math.max(cut, (kqS - 1.2) * 2.5);
      if (cut > 0) Tin *= clamp(1 - cut, 0, 1);
    }
    // dyferencjał sprzęgłowy: różnica obrotów zamknięta momentem blokady
    var Tlock = q.pre + (Tin >= 0 ? q.kP : q.kC) * Math.abs(Tin);
    var dTq = clamp(300 * (s.w[2] - s.w[3]), -Tlock, Tlock);
    DTQ[0] = 0; DTQ[1] = 0; DTQ[2] = Tin / 2 - dTq; DTQ[3] = Tin / 2 + dTq;
    // bieg wsteczny: moment najwyżej do przyczepności tylnych kół i bez rozkręcania kół (żwir, trawa)
    if (reversing) for (i = 2; i < 4; i++) DTQ[i] = s.w[i] * V.R < -8 ? 0 : -Math.min(m * 5.5 * V.R / 2, 0.9 * Dv[i] * V.R);

    // ---- hamulce ----
    var bpF = brkFac(s.Tb[0]), bpR = brkFac(s.Tb[1]);
    var bIn = brk;
    // hamulec cyfrowy (klawiatura, dotyk) bez ABS: ciśnienie dopasowane do przyczepności (lekka blokada widać, ale nie zawsze)
    if (human && !car.analogIn && !car.absOn && bIn > 0) {
      var need = (envAt(envC.brk, avx) * gEst / (p.gripMul || 1)) * m * V.R / q.Tbrk;
      bIn = Math.min(bIn, clamp(need * 1.06, 0.15, 1));
    }
    var Tb = bIn * q.Tbrk;
    var bias = q.bias + (car.bbAdj || 0) / 100; // pokrętło balansu w trakcie jazdy
    BTQ[0] = Tb * bias / 2 * bpF; BTQ[1] = BTQ[0];
    BTQ[2] = Tb * (1 - bias) / 2 * bpR; BTQ[3] = BTQ[2];
    car.absAct = 0;
    if (car.absOn && Tb > 0) {
      // ABS: limit momentu z modelu opony (κ ≈ 0,9 κp) + sprzężenie od rzeczywistego poślizgu koła
      // (zwolnienie ciśnienia przy κ za szczytem, powolny powrót) → koło nie zostaje zablokowane
      var absA = 0, kpB = tp.kp / q.kB, aB = -s.ax;
      if (Tb > 0.3 * q.Tbrk) aB = Math.max(aB, 0.9 * (Dv[0] + Dv[1] + Dv[2] + Dv[3]) / m); // przewidywane opóźnienie na początku hamowania
      for (i = 0; i < 4; i++) {
        var fr = i < 2, ap = fr ? tp.apF : tp.apR;
        var fb;
        if (!human) {
          // AI: hamowanie w kole tarcia (część przyczepności zostaje na skręt przy obecnym kącie znoszenia)
          var gyb = mfL(GY, BY * q.kB * Math.abs(TA[i] / ap));
          fb = 0.97 * Dv[i] * Math.sqrt(Math.max(0.0025, 1 - gyb * gyb));
        } else { tyre(Dv[i], ap, tp.kp, q.kB, TA[i], -0.9 * kpB); fb = Math.abs(TF[0]); }
        var lim2 = fb * V.R + DTQ[i] + (fr ? V.IwF : IwR) * Math.max(0, aB) / V.R;
        var kr = -s.kap[i] / kpB;
        if (kr > 1.15 && avx > 3) s.ab[i] = Math.max(0.25, s.ab[i] - (kr > 2 ? 40 : 15) * dt);
        else if (kr < 0.95) s.ab[i] = Math.min(1, s.ab[i] + 4 * dt);
        lim2 *= s.ab[i];
        if (lim2 < 0) lim2 = 0;
        if (BTQ[i] > lim2) { absA = Math.max(absA, (BTQ[i] - lim2) / Math.max(BTQ[i], 1)); BTQ[i] = lim2; }
      }
      if (avx > 4) car.absAct = clamp(absA * 2.5, 0, 1);
    } else for (i = 0; i < 4; i++) s.ab[i] = 1;

    // ---- koła: siły i półniejawny obrót ----
    var Fx = 0, Fy = 0, Mz = 0, Pb0 = 0, Pb1 = 0;
    for (i = 0; i < 4; i++) {
      var fr2 = i < 2, ap2 = fr2 ? tp.apF : tp.apR, Iw = fr2 ? V.IwF : IwR;
      var den2 = Math.abs(s.ps[i]) > 3 ? Math.abs(s.ps[i]) : 3;
      tyre(Dv[i], ap2, tp.kp, q.kB, TA[i], s.kap[i]);
      var fx0 = TF[0], fy0 = TF[1], sg = TF[2];
      // pochodna siły po obrotach koła: dFx/dω = dFx/dκ · R / |v|
      var dFw = TF[3] * V.R / den2;
      if (dFw < 0) dFw = 0;
      // obrót koła: półniejawnie względem siły opony; hamulec to tarcie (zatrzymuje koło, nie odwraca obrotów)
      var w0 = s.w[i], Tb_ = BTQ[i], Td = DTQ[i], Ieff = Iw + dt * V.R * dFw, wn;
      if (w0 > 0.01 || w0 < -0.01) {
        wn = (Iw * w0 + dt * (Td - (w0 > 0 ? Tb_ : -Tb_) - V.R * fx0 + V.R * dFw * w0)) / Ieff;
        if (w0 > 0 ? wn < 0 : wn > 0) wn = 0;
      } else {
        wn = (Iw * w0 + dt * (Td - V.R * fx0 + V.R * dFw * w0)) / Ieff;
        var hold = dt * Tb_ / Ieff;
        wn = wn > hold ? wn - hold : wn < -hold ? wn + hold : 0;
      }
      s.w[i] = wn;
      var fx = fx0 + dFw * (wn - w0);
      var lim3 = Dv[i] * 1.02; if (fx > lim3) fx = lim3; else if (fx < -lim3) fx = -lim3;
      var fy = fy0;
      s.fx[i] = fx; s.fy[i] = fy; s.sig[i] = sg;
      if (sg > sigMax) sigMax = sg;
      var kp2 = s.kap[i];
      if (kp2 < kapMin && fr2) { kapMin = kp2; }
      if (fr2 && kp2 < -0.2) { if (i === 0) lockL = -kp2; else lockR = -kp2; }
      if (!fr2 && (reversing ? -kp2 : kp2) > kapMax) kapMax = reversing ? -kp2 : kp2;
      // moc hamulców do temperatury tarcz
      var pb = BTQ[i] * Math.abs(wn);
      s.pb[i] = pb;
      if (fr2) Pb0 += pb; else Pb1 += pb;
      // do nadwozia
      var bx, by;
      if (fr2) { bx = fx * cd - fy * sd; by = fx * sd + fy * cd; } else { bx = fx; by = fy; }
      Fx += bx; Fy += by;
      Mz += WX[i] * by - WY[i] * bx;
    }

    // ---- opór, toczenie, nawierzchnia ----
    var sgn = vx > 0.05 ? 1 : vx < -0.05 ? -1 : 0;
    Fx -= sgn * (drag + V.crr * (m * G + dF + dR) + plank * 0.5 + m * (o.surfDrag || 0));
    if (spd > 0.5 && o.surfDrag) Fy -= vy / spd * m * o.surfDrag * 0.5;
    // ---- nadwozie (semi-implicit Euler) ----
    var axb = Fx / m, ayb = Fy / m;
    vx += (axb + r * vy) * dt;
    vy += (ayb - r * vx) * dt;
    r += Mz / V.Iz * dt;
    if (r > 6) r = 6; else if (r < -6) r = -6;
    // postój: bez pełzania
    if (thr === 0 && !reversing && Math.abs(vx) < 0.25 && Math.abs(vy) < 0.25 && (brk > 0 || Math.abs(vx) < 0.05)) {
      vx *= 0.8; vy *= 0.8; r *= 0.8;
      if (Math.abs(vx) < 0.02) { vx = 0; vy = 0; r = 0; for (i = 0; i < 4; i++) s.w[i] = 0; }
    }
    if (reversing && vx < -7) vx = -7;
    if (car.hold && vx < 0) vx = 0;
    s.vx = vx; s.vy = vy; s.r = r;
    s.ax += (axb - s.ax) * Math.min(1, dt * 60); s.ay += (ayb - s.ay) * Math.min(1, dt * 60);
    // ---- przechył i pochylenie (sprężyny, stabilizatory, amortyzatory: dobicie / odbicie) ----
    var cPhi = q.Cphi * ((s.phi * s.dphi > 0) ? q.cB : q.cR), cTh = q.Cth * ((s.th * s.dth > 0) ? q.cB : q.cR);
    s.dphi += (m * s.ay * (V.h - q.hra) - q.Kphi * s.phi - cPhi * s.dphi) / V.Iroll * dt;
    s.phi += s.dphi * dt;
    s.dth += (-m * s.ax * V.h - q.Kth * s.th - cTh * s.dth) / V.Ipitch * dt;
    s.th += s.dth * dt;

    // ---- ruch po torze ----
    car.h += r * dt;
    var ch = Math.cos(car.h), sh = Math.sin(car.h);
    car.x += (vx * ch - vy * sh) * dt;
    car.y += (vx * sh + vy * ch) * dt;
    spd = Math.sqrt(vx * vx + vy * vy);
    car.v = vx >= 0 ? spd : -spd;
    // kierunek ruchu = kurs + β (przy jeździe tyłem v < 0, więc β liczone od ruchu wstecz)
    car.beta = spd > 0.05 ? (vx >= 0 ? Math.atan2(vy, vx) : Math.atan2(-vy, -vx)) : 0;
    s.oV = car.v; s.oB = car.beta;
    car.latAcc = ayb;
    car.yawRate = r;
    car.rollA = s.phi; car.pitchA = s.th;

    // ---- stan dla dźwięku, śladów, wibracji ----
    car.lock = clamp((-kapMin - 0.2) / 0.5, 0, 1);
    car.lockSide = car.lock > 0.01 ? clamp((lockR - lockL) / Math.max(lockR, lockL, 0.01), -1, 1) : 0;
    car.wspin = clamp((kapMax - 0.18) / 0.45, 0, 1);
    var skid = clamp((sigMax - 1.05) / 1.6, 0, 1);
    var bs = Math.abs(car.beta);
    if (spd > 8 && bs > 0.06) skid = Math.max(skid, Math.min(1, (bs - 0.06) * 3));
    skid = Math.max(skid, car.lock * 0.9, spd > 1 ? car.wspin * 0.75 : 0);
    if (o.offRoad) skid = Math.max(skid, Math.min(1, spd / 40));
    car.skid = skid;
    // płaskie miejsca po blokadzie (tylko gracz)
    if (human && car.lock > 0.2 && spd > 4) car.flat = Math.min(1, (car.flat || 0) + car.lock * dt * 0.05 * clamp(spd / 40, 0.3, 1.5));

    // ---- hamulce: temperatura tarcz ----
    var hb = 10 + 1.2 * spd;
    s.Tb[0] += (Pb0 - hb * (s.Tb[0] - air[0])) / 3000 * dt;
    s.Tb[1] += (Pb1 - hb * (s.Tb[1] - air[0])) / 3000 * dt;
    // ---- opony: temperatura i zużycie ----
    therm(car, s, tp, q, env, air, dt, 1);
    engineOut(car, s, q, spinC ? V.rpmIdle : rpmW, thr, slipClutch, limiter, gear);
  };

  // Skuteczność tarcz węglowych od temperatury
  function brkFac(t) {
    if (t < 400) return t <= 150 ? 0.85 : 0.85 + 0.15 * (t - 150) / 250;
    if (t > 1000) return Math.max(0.75, 1 - (t - 1000) / 600);
    return 1;
  }
  Veh.brkFac = brkFac;

  // Termika co 8 kroków (stałe czasowe to sekundy; moc poślizgu próbkowana co 16 ms)
  function therm(car, s, tp, q, env, air, dt, moving) {
    s.thDt += dt;
    if (++s.thN < 8) return;
    thermal(car, s, tp, q, env, air, s.thDt, moving);
    s.thN = 0; s.thDt = 0;
  }
  // Temperatura bieżnika i karkasu, zużycie z energii poślizgu
  function thermal(car, s, tp, q, env, air, dt, moving) {
    var wet = !!(env && env.wet), V = VEH;
    var spd = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
    var ha = (4 + 0.45 * spd) * (wet ? 1.8 : 1), hr = wet ? 50 : 20, hi = 12, ksc = 120;
    var tw = tp.wear || 1, wm = (env && env.wearMul) || 1, pm = (car.params && car.params.wearMul) || 1;
    var wf = wm * pm * tw * (wet && car.compound !== 'W' ? 0.7 : 1) * (!wet && car.compound === 'W' ? 3 : 1);
    var tot = 0;
    for (var i = 0; i < 4; i++) {
      var Ps = 0, Pc = 0;
      if (moving) {
        var vsx = s.w[i] * V.R - s.ps[i], al = s.al[i];
        var vsy = s.ps[i] * Math.tan(al < -1.4 ? -1.4 : al > 1.4 ? 1.4 : al);
        Ps = Math.abs(s.fx[i] * vsx) + Math.abs(s.fy[i] * vsy);
        Pc = 0.0045 * s.fz[i] * Math.abs(s.ps[i]) * (1 - 0.06 * q.press) + 0.025 * (s.pb ? s.pb[i] : 0); // ugniatanie + ciepło tarcz przez felgę
      }
      // przednie opony węższe: mniejsza masa i powierzchnia → ta sama moc grzeje je mocniej
      var fs = i < 2 ? 1.35 : 1;
      Pc *= fs;
      s.Ts[i] += (0.5 * fs * Ps * (1 + 0.04 * q.press) - ha * (s.Ts[i] - air[0]) - hr * (s.Ts[i] - air[1]) * (spd > 0.5 ? 1 : 0.3) - ksc * (s.Ts[i] - s.Tc[i])) / 3000 * dt;
      s.Tc[i] += (ksc * (s.Ts[i] - s.Tc[i]) + Pc - hi * (s.Tc[i] - air[0])) / 14000 * dt;
      if (Ps > 0) {
        var hot = (s.Ts[i] - tp.tOpt - tp.tW) / tp.tW;
        s.wr[i] = Math.min(1, s.wr[i] + 2.6e-8 * wf * Ps * (1 + 2 * (hot > 0 ? hot : 0)) * dt);
      }
      tot += s.wr[i];
    }
    car.wear = tot / 4;
    // grip z temperatur ogranicza słabsza oś (zimny przód → podsterowność, przegrzany tył → nadsterowność)
    var gF = (s.fT[0] + s.fT[1]) / 2, gR = (s.fT[2] + s.fT[3]) / 2, g = gF < gR ? gF : gR;
    car.gripT = g > 0 ? g : 1;
    car.tyreTs = s.Ts; car.tyreTc = s.Tc; car.tyreW = s.wr; car.brakeT = s.Tb;
  }

  function engineOut(car, s, q, rpmW, thr, slip, limiter, gear) {
    var V = VEH;
    car.gear = car.v < -0.5 ? 0 : (gear || s.gear || 1);
    var r = rpmW;
    if (slip || !(r > V.rpmIdle)) r = Math.max(r || 0, V.rpmIdle + (gear === 1 ? (V.rpmLaunch - V.rpmIdle) * clamp(thr || 0, 0, 1) : 0));
    car.limiter = !!limiter;
    car.rpm = limiter ? V.rpmMax - 150 + Math.random() * 300 : Math.min(V.rpmMax + 300, r);
  }

  // Grip relatywny (wear, mieszanka, pogoda) bez temperatury — jak dawny PG.tyreGrip
  Veh.relGrip = function (car, env) { return PG.tyreGrip(car, env); };
})(PG);
