// Testy bolidu bez toru: przyspieszanie, hamowanie, V max, skidpad, skok skrętu, okrążenie samotnego AI.
'use strict';
var B = require('./physics-bench.js');
var PG = B.PG, T = B.T;
var H = PG.Veh.H;
function mk(compound, setup) {
  var team = PG.DEFAULT_TEAMS[0];
  var car = PG.makeCar({ id: 0, driver: team.drivers[0], team: team, isPlayer: true, params: PG.carParams(team, team.drivers[0]), compound: compound || 'M', setup: setup || null });
  car.human = true; car.absOn = true; car.tcOn = true; car.tcLvl = 2; car.sAssist = false; car.inWheel = true; car.tyreT0 = 'opt';
  return car;
}
var O = { surfGrip: 1, surfDrag: 0, kerb: false, offRoad: false, dp: PG.dmgPerf(null, false), dirtyF: 0, dirtyR: 0, human: true };
var env = { weather: 'sun', weatherGrip: 1, wearMul: 1 };
function step(car, n) { for (var i = 0; i < n; i++) PG.Veh.step(car, H, env, O); }
var out = [];
function log(s) { out.push(s); console.log(s); }

// 1. przyspieszanie
(function () {
  var c = mk(); c.throttle = 1; c.brake = 0; c.steer = 0;
  var t = 0, t100 = 0, t200 = 0, t300 = 0;
  while (t < 30) { step(c, 1); t += H; var k = c.v * 3.6; if (!t100 && k >= 100) t100 = t; if (!t200 && k >= 200) t200 = t; if (!t300 && k >= 300) t300 = t; }
  log('Przyspieszanie: 0–100 ' + t100.toFixed(2) + ' s, 0–200 ' + t200.toFixed(2) + ' s, 0–300 ' + t300.toFixed(2) + ' s, po 30 s ' + (c.v * 3.6).toFixed(1) + ' km/h, bieg ' + c.gear + ', obr ' + c.rpm.toFixed(0));
  var c2 = mk(); c2.throttle = 1; c2.v = 80; c2.vsHard = true; step(c2, 1); c2.vsHard = false;
  for (var i = 0; i < 60 / H; i++) step(c2, 1);
  log('V max: ' + (c2.v * 3.6).toFixed(1) + ' km/h');
  var c3 = mk(); c3.throttle = 1; c3.tcOn = false;
  var ws = 0; for (var j = 0; j < 2 / H; j++) { step(c3, 1); ws = Math.max(ws, c3.wspin); }
  log('Bez TC: po 2 s ' + (c3.v * 3.6).toFixed(0) + ' km/h, maks. buksowanie ' + ws.toFixed(2));
})();
// 2. hamowanie
(function () {
  [300, 200].forEach(function (kmh) {
    var c = mk(); c.v = kmh / 3.6; c.vsHard = true; c.throttle = 0; c.brake = 0; step(c, 5);
    c.brake = 1; var d = 0, t = 0, peak = 0, v0 = c.v;
    while (c.v > 0.3 && t < 10) { var vb = c.v; step(c, 1); t += H; d += c.v * H; peak = Math.max(peak, (vb - c.v) / H); }
    log('Hamowanie z ABS ' + kmh + '→0: ' + d.toFixed(1) + ' m, ' + t.toFixed(2) + ' s, szczyt ' + (peak / 9.81).toFixed(2) + ' g');
    var c2 = mk(); c2.v = kmh / 3.6; c2.vsHard = true; c2.absOn = false; c2.analogIn = true; step(c2, 5); c2.brake = 1; var lk = 0;
    for (var i = 0; i < 1 / H; i++) { step(c2, 1); lk = Math.max(lk, c2.lock); }
    log('  bez ABS, pełny hamulec: blokada ' + lk.toFixed(2) + ', po 1 s ' + (c2.v * 3.6).toFixed(0) + ' km/h');
  });
})();
// 3. skidpad: AI-regulator na stałym promieniu, szukanie najwyższej prędkości
(function () {
  [15, 25, 50, 150, 400].forEach(function (Rr) {
    var best = 0, bestAy = 0;
    for (var kmh = Rr < 40 ? 30 : 60; kmh <= 340; kmh += Rr < 40 ? 2 : 5) {
      var c = mk(); c.human = false; O.human = false; c.v = kmh / 3.6; c.vsHard = true; c.throttle = 0; c.brake = 0;
      var ok = true, ayS = 0, n = 0;
      for (var i = 0; i < 6 / H; i++) {
        // utrzymanie prędkości gazem
        c.throttle = c.v < kmh / 3.6 ? Math.min(1, (kmh / 3.6 - c.v) * 0.8 + 0.3) : 0;
        c.maxCurv = c.maxCurv || 0.01;
        var kc = 1 / Rr; c.steer = Math.max(-1, Math.min(1, kc / (c.maxCurv || 0.01)));
        step(c, 1);
        if (i > 3 / H) { ayS += c.latAcc; n++; }
      }
      O.human = true;
      var rAct = Math.abs(c.v / (c.yawRate || 1e-6));
      var ay = ayS / n;
      if (Math.abs(rAct - Rr) / Rr < 0.06 && Math.abs(c.v * 3.6 - kmh) < 6) { best = kmh; bestAy = ay; } else break;
    }
    var E = PG.Veh.envelope({ power: PG.PHYS.power, cd: PG.PHYS.cd, gripMul: 1, aeroMul: 1, brakeMul: 1, setup: null });
    log('Skidpad R=' + Rr + ' m: ' + best + ' km/h, ay ' + (bestAy / 9.81).toFixed(2) + ' g (obwiednia ' + (PG.Veh.envAt(E.lat, best / 3.6) / 9.81).toFixed(2) + ' g)');
  });
})();
// 4. skok skrętu 150 km/h (kierownica, bez asysty)
(function () {
  var c = mk(); c.v = 150 / 3.6; c.vsHard = true; c.throttle = 0.25; step(c, 200);
  c.steer = 0.15; var t = 0, rMax = 0, t90 = 0, rs = [];
  for (var i = 0; i < 2 / H; i++) { step(c, 1); t += H; rs.push(c.yawRate); if (Math.abs(c.yawRate) > rMax) rMax = Math.abs(c.yawRate); }
  var rEnd = Math.abs(rs[rs.length - 1]);
  for (var j = 0; j < rs.length; j++) if (Math.abs(rs[j]) >= 0.9 * rEnd) { t90 = j * H; break; }
  log('Skok skrętu: yaw rate ' + rEnd.toFixed(3) + ' rad/s, 90% po ' + t90.toFixed(3) + ' s, przeregulowanie ' + ((rMax / rEnd - 1) * 100).toFixed(0) + '%');
})();
module.exports = out;
