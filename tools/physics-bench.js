// WORLD GP — test fizyki bez przeglądarki: node tools/physics-bench.js [race|tests|all] [okrążenia]
// Ładuje skrypty gry do jednej przestrzeni (PG) i uruchamia wyścig samych AI oraz testy bolidu.
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var root = path.join(__dirname, '..');
// w głównym kontekście (osobny kontekst vm spowalnia każdy dostęp do Math i innych globali kilkukrotnie)
['data.js', 'track.js', 'physics.js', 'vehicle.js', 'session.js', 'pit.js', 'racecontrol.js'].forEach(function (f) {
  var p = path.join(root, 'js', f);
  if (fs.existsSync(p)) vm.runInThisContext(fs.readFileSync(p, 'utf8'), { filename: f });
});
var PG = globalThis.PG;
var T = PG.buildTrack(PG.MONZA);
var mode = process.argv[2] || 'all', LAPS = +(process.argv[3] || 3);

function entries(nPlayer, comp) {
  var out = [];
  PG.DEFAULT_TEAMS.forEach(function (t) { t.drivers.forEach(function (d) { out.push({ driver: d, team: t, isPlayer: false, compound: comp }); }); });
  if (nPlayer !== undefined) out[nPlayer].isPlayer = true;
  return out;
}

// powtarzalne wyniki: Math.random z ziarnem (mulberry32)
function seed(n) {
  var a = n >>> 0;
  Math.random = function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function race(fps, laps, opt) {
  opt = opt || {};
  if (opt.seed !== undefined) seed(opt.seed);
  var S = PG.createSession({ track: T, entries: entries(0, opt.compound || (opt.weather === 'rain' ? 'W' : 'M')), mode: 'race', laps: laps, weather: opt.weather || 'sun', difficulty: opt.difficulty || 'normal', damage: 'full', autoPlayer: true, incidents: 'off' });
  var dt = 1 / fps, t = 0, stats = S.cars.map(function () { return { off: 0, wall: 0, maxWall: 0, resets: 0, laps: [] }; });
  var resetCount = {};
  var origReset = PG.resetCar;
  PG.resetCar = function (c, TT) { resetCount[c.id] = (resetCount[c.id] || 0) + 1; return origReset(c, TT); };
  var t0 = Date.now();
  while (t < 60 * laps * 3 && !S.done) {
    PG.updateSession(S, dt, {});
    t += dt;
    S.events.forEach(function (e) {
      if (e.type === 'lap' && e.car) stats[e.car.id].laps.push(e.t);
      if (e.type === 'wall' && e.car) { stats[e.car.id].wall++; stats[e.car.id].maxWall = Math.max(stats[e.car.id].maxWall, e.force); }
    });
    S.cars.forEach(function (c, k) { if (c.surface === 'grass' || c.surface === 'gravel') stats[k].off += dt; });
    if (S.leaderDone && S.cars.every(function (c) { return c.finished || c.retired; })) break;
  }
  PG.resetCar = origReset;
  var wall = Date.now() - t0;
  console.log('Wyścig ' + laps + ' okr., ' + fps + ' FPS, czas symulacji ' + t.toFixed(0) + ' s, obliczenia ' + wall + ' ms');
  var best = Infinity;
  S.cars.forEach(function (c, k) {
    var s = stats[k];
    var bl = s.laps.slice(1).reduce(function (a, b) { return Math.min(a, b); }, Infinity);
    if (bl < best) best = bl;
    console.log((c.driver.last + '          ').slice(0, 11) + ' ' + c.team.short + ' okr: ' + s.laps.map(function (x) { return x.toFixed(2); }).join(' ') +
      ' | poza torem ' + s.off.toFixed(1) + ' s, ściana ' + s.wall + (s.wall ? ' (maks ' + s.maxWall.toFixed(1) + ')' : '') + ', reset ' + (resetCount[c.id] || 0) + (c.retired ? ' DNF' : '') + ' dmg ' + (c.dmgTotal || 0).toFixed(2));
  });
  console.log('Najlepsze okrążenie: ' + PG.fmtTime(best) + ', profil AI (Rossa/Benedetti): ' + PG.fmtTime(S.cars[1].profile.lapTime));
  return { S: S, stats: stats, best: best };
}

if (require.main === module) {
  if (mode === 'race' || mode === 'all') race(60, LAPS);
  if (mode === 'fps') { race(30, LAPS); race(60, LAPS); race(144, LAPS); }
  if ((mode === 'tests' || mode === 'all') && PG.VehTests) PG.VehTests.run(PG, T, console.log);
}
module.exports = { PG: PG, T: T, race: race, seed: seed };
