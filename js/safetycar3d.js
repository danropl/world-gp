// WORLD GP — samochód bezpieczeństwa w 3D: proceduralne coupé GT z długą maską i kabiną przesuniętą do tyłu
// (proporcje dużego, dwumiejscowego coupé z silnikiem V8 z przodu), bez znaków żadnego producenta.
// Układ lokalny jak w bolidach: początek na ziemi pośrodku auta, przód wzdłuż +X, +Y w górę, ±Z to boki.
//
// Nadwozie to jedna siatka „wyciągnięta” wzdłuż auta: dla każdego przekroju x funkcje profilu dają wysokość osi
// dachu i maski (T), linię ramion (B), półszerokość (W) i udział kabiny (c). Przekrój to dolna część z progami
// i nadkolami (wcięcie wokół kół) oraz górna część z nadwoziem przechodzącym w szklarnię. Szyby, światła,
// wloty i napisy to „łaty” próbkowane z tej samej powierzchni (lekko odsunięte wzdłuż normalnej), więc leżą
// dokładnie na karoserii.
// API: build({ quality }) → THREE.Group z userData.update(dt, v, steer, brake, lights, time) i userData.disp.
(function (PG) {
  'use strict';
  if (typeof THREE === 'undefined') return;

  var PI = Math.PI;
  // wymiary w metrach: długość 4,55, szerokość 1,94, wysokość 1,26 (bez belki świateł), rozstaw osi 2,63
  var XF = 2.275, XR = -2.275, AF = 1.43, AR = -1.20, RW = 0.345, ZW = 0.80, ARCH = 0.405, WCY = RW;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function sstep(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

  // Krzywa Catmulla-Roma po punktach (x rosnące) — gładki profil
  function spline(pts) {
    var n = pts.length;
    return function (x) {
      if (x <= pts[0][0]) return pts[0][1];
      if (x >= pts[n - 1][0]) return pts[n - 1][1];
      var i = 0;
      while (i < n - 2 && x > pts[i + 1][0]) i++;
      var p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
      var t = (x - p1[0]) / (p2[0] - p1[0]);
      // styczne z uwzględnieniem nierównych odstępów
      var m1 = (p2[1] - p0[1]) / (p2[0] - p0[0]) * (p2[0] - p1[0]);
      var m2 = (p3[1] - p1[1]) / (p3[0] - p1[0]) * (p2[0] - p1[0]);
      var t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * p1[1] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2[1] + (t3 - t2) * m2;
    };
  }

  // Oś dachu, maski i klapy: niski nos, długa wypukła maska, mocno pochylona szyba, krótki dach,
  // opadający tył (fastback) z małym spojlerem na krawędzi klapy
  var T = spline([[XR, 0.80], [-2.24, 0.92], [-2.17, 0.965], [-2.05, 0.955], [-1.80, 0.985], [-1.35, 1.09], [-0.90, 1.20],
    [-0.50, 1.258], [-0.20, 1.245], [0.10, 1.16], [0.36, 1.04], [0.58, 0.945], [0.95, 0.905], [1.45, 0.855], [1.85, 0.775],
    [2.08, 0.69], [2.20, 0.62], [XF, 0.53]]);
  // linia ramion (najszerszy punkt boku)
  var B = spline([[XR, 0.73], [-2.10, 0.80], [-1.70, 0.825], [-1.20, 0.815], [-0.60, 0.775], [0.20, 0.735], [0.90, 0.71],
    [1.45, 0.69], [1.90, 0.63], [2.15, 0.55], [XF, 0.47]]);
  // półszerokość nadwozia: szerokie przednie błotniki, talia przy drzwiach, szerokie tylne nadkola
  var W = spline([[XR, 0.80], [-2.18, 0.90], [-1.95, 0.955], [-1.55, 0.97], [-1.05, 0.965], [-0.70, 0.93], [-0.20, 0.915],
    [0.40, 0.915], [0.90, 0.93], [1.35, 0.95], [1.75, 0.94], [2.02, 0.90], [2.18, 0.83], [XF, 0.72]]);
  // prześwit (spód podnosi się na zwisach: dyfuzor z tyłu, splitter z przodu)
  var Y0 = spline([[XR, 0.24], [-2.0, 0.16], [-1.6, 0.115], [1.75, 0.115], [2.1, 0.13], [XF, 0.15]]);

  // Udział kabiny w przekroju: 0 — maska/klapa, 1 — pełna szklarnia
  function cab(x) { return sstep(0.18, 0.42, T(x) - B(x) - 0.03); }

  // Wcięcie nadkola dla punktu boku (x, y): 0 poza nadkolem, 1 w środku (łagodna krawędź)
  function archIn(x, y) {
    var r = Infinity;
    [AF, AR].forEach(function (ax) { var dx = x - ax, dy = y - WCY; r = Math.min(r, Math.sqrt(dx * dx + dy * dy)); });
    return 1 - sstep(ARCH - 0.012, ARCH + 0.018, r);
  }

  var NSIDE = 14, NUP = 9;
  // Półprzekrój (strona +z) od środka spodu do środka dachu: tablica [y, z] i kolory (1 — lakier, < 1 — czerń)
  function half(x) {
    var y0 = Y0(x), t = T(x), b = B(x), w = W(x), c = cab(x), pts = [], dark = [];
    // pas zwężania przodu i tyłu w rzucie z góry (zaokrąglenie narożników zderzaków)
    pts.push([y0, 0]); dark.push(0.06);
    pts.push([y0, w - 0.12]); dark.push(0.06);
    pts.push([y0 + 0.055, w - 0.025]); dark.push(0.06);
    var ys = y0 + 0.11, ye = b - 0.075;
    for (var k = 0; k < NSIDE; k++) {
      var y = lerp(ys, ye, k / (NSIDE - 1));
      // lekka „beczka” boku: najszerzej nieco poniżej linii ramion, próg cofnięty
      var bul = Math.sin(PI * (0.25 + 0.75 * k / (NSIDE - 1))) * 0.012 - (k === 0 ? 0.02 : 0);
      var ai = archIn(x, y), z = w + bul - ai * 0.24;
      pts.push([y, z]); dark.push(k <= 1 ? 0.06 : ai > 0.45 ? 0.04 : 1);
    }
    pts.push([b - 0.008, w - 0.03]); dark.push(1);
    // półka ramion: górna część kabiny węższa niż błotniki
    var wu = lerp(w - 0.085, 0.80, c);
    pts.push([b + 0.022, lerp(w - 0.075, wu + 0.04, c)]); dark.push(1);
    var h = t - (b + 0.035), e1 = lerp(1, 0.62, c), e2 = lerp(1.15, 0.85, c);
    for (var j = 1; j <= NUP; j++) {
      var a = j / NUP * PI / 2, ca = Math.cos(a), sa = Math.sin(a);
      // na szczycie kabiny dach jest prawie płaski, boki szyb pochylone do środka
      pts.push([b + 0.035 + h * Math.pow(sa, e2), wu * Math.pow(ca, e1) * (j === NUP ? 0 : 1)]); dark.push(1);
    }
    return { p: pts, d: dark };
  }
  var NH = 3 + NSIDE + 2 + NUP;  // punktów półprzekroju
  var TOPI = NH - 1;             // indeks środka dachu
  var UP0 = 3 + NSIDE + 1;       // indeks półki ramion (początek części górnej)

  // Pełny przekrój (zamknięty): prawa połowa od spodu do dachu, potem lewa z powrotem; t ∈ [0, 1] wokół
  function ring(x) {
    var hf = half(x), out = [], col = [];
    for (var i = 0; i < NH; i++) { out.push([x, hf.p[i][0], hf.p[i][1]]); col.push(hf.d[i]); }
    for (i = NH - 2; i >= 1; i--) { out.push([x, hf.p[i][0], -hf.p[i][1]]); col.push(hf.d[i]); }
    return { p: out, d: col };
  }
  var NR = 2 * NH - 2;

  // Punkt powierzchni dla (x, u), u — indeks w półprzekroju (ułamkowy), side = ±1
  function surf(x, u, side) {
    var hf = half(x), i = clamp(Math.floor(u), 0, NH - 2), f = clamp(u - i, 0, 1);
    var a = hf.p[i], b = hf.p[i + 1];
    return [x, lerp(a[0], b[0], f), side * lerp(a[1], b[1], f)];
  }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm(a) { var l = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function surfN(x, u, side) {
    var p = surf(x, u, side), px = sub(surf(x + 0.01, u, side), surf(x - 0.01, u, side)), pu = sub(surf(x, u + 0.05, side), surf(x, u - 0.05, side));
    var n = norm(cross(px, pu));
    // na zewnątrz: od osi auta
    if (n[1] * (p[1] - 0.55) + n[2] * p[2] < 0) n = [-n[0], -n[1], -n[2]];
    return n;
  }

  // Łata na powierzchni: x od x0 do x1, u od u0(x) do u1(x) (funkcje albo liczby), odsunięta o off
  function patch(x0, x1, u0, u1, side, off, nx, nu) {
    var fu0 = typeof u0 === 'function' ? u0 : function () { return u0; };
    var fu1 = typeof u1 === 'function' ? u1 : function () { return u1; };
    var pos = [], uv = [], idx = [];
    for (var i = 0; i <= nx; i++) {
      var x = lerp(x0, x1, i / nx), a = fu0(x), b = fu1(x);
      for (var j = 0; j <= nu; j++) {
        var u = lerp(a, b, j / nu), p = surf(x, u, side), n = surfN(x, u, side);
        pos.push(p[0] + n[0] * off, p[1] + n[1] * off, p[2] + n[2] * off);
        uv.push(side > 0 ? i / nx : 1 - i / nx, j / nu);
      }
    }
    for (i = 0; i < nx; i++) for (j = 0; j < nu; j++) {
      var q = i * (nu + 1) + j, r = q + nu + 1;
      if (side > 0) idx.push(q, r, q + 1, r, r + 1, q + 1); else idx.push(q, q + 1, r, r, q + 1, r + 1);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  // Indeks u w części górnej dla ułamka wysokości s (0 — półka ramion, 1 — środek dachu)
  function upU(s) { return UP0 + s * (TOPI - UP0); }

  // ---------- nadwozie ----------
  function bodyGeo(nst) {
    var pos = [], col = [], idx = [], i, j;
    var xs = [];
    for (i = 0; i <= nst; i++) {
      // gęściej przy końcach (zaokrąglone zderzaki)
      var t = i / nst;
      xs.push(XR + (XF - XR) * (0.35 * (0.5 - 0.5 * Math.cos(PI * t)) + 0.65 * t));
    }
    xs.forEach(function (x) {
      var r = ring(x);
      for (var k = 0; k < NR; k++) { pos.push(r.p[k][0], r.p[k][1], r.p[k][2]); var d = r.d[k]; col.push(d, d, d); }
    });
    for (i = 0; i < nst; i++) for (j = 0; j < NR; j++) {
      var a = i * NR + j, b2 = i * NR + (j + 1) % NR, c2 = (i + 1) * NR + j, d2 = (i + 1) * NR + (j + 1) % NR;
      idx.push(a, c2, b2, b2, c2, d2);
    }
    // zaślepki przodu i tyłu (płaskie ściany pod grill, światła i dyfuzor)
    [0, nst].forEach(function (st) {
      var base = st * NR, cx = xs[st], cy = 0, n = 0;
      for (j = 0; j < NR; j++) { cy += pos[(base + j) * 3 + 1]; n++; }
      var ci = pos.length / 3;
      pos.push(cx, cy / n, 0); col.push(1, 1, 1);
      for (j = 0; j < NR; j++) {
        var p = base + j, q = base + (j + 1) % NR;
        if (st === 0) idx.push(ci, p, q); else idx.push(ci, q, p);
      }
    });
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  // ---------- tekstury z kanwy ----------
  function canvasTex(w, h, draw) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    var t = new THREE.CanvasTexture(c);
    if ('colorSpace' in t && THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace; else if (THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 4;
    return t;
  }
  // napis na drzwiach: pas w kolorze ostrzegawczym i „SAFETY CAR”
  function doorTex() {
    return canvasTex(1024, 256, function (g, w, h) {
      g.clearRect(0, 0, w, h);
      g.fillStyle = '#c8e000';
      g.beginPath(); g.moveTo(0, h * 0.70); g.lineTo(w, h * 0.52); g.lineTo(w, h * 0.62); g.lineTo(0, h * 0.82); g.closePath(); g.fill();
      g.fillStyle = '#16181b';
      g.beginPath(); g.moveTo(0, h * 0.84); g.lineTo(w, h * 0.65); g.lineTo(w, h * 0.69); g.lineTo(0, h * 0.88); g.closePath(); g.fill();
      g.font = 'italic 900 112px "Titillium Web", "Arial Black", Arial, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#16181b';
      g.fillText('SAFETY CAR', w * 0.5, h * 0.34);
    });
  }
  function bannerTex(txt, fg, bg) {
    return canvasTex(512, 96, function (g, w, h) {
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      g.font = 'italic 900 64px "Titillium Web", "Arial Black", Arial, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = fg;
      g.fillText(txt, w / 2, h * 0.54);
    });
  }
  // felga: 10 podwójnych ramion (alfa), w środku piasta
  function rimTex() {
    return canvasTex(256, 256, function (g, w, h) {
      g.clearRect(0, 0, w, h);
      g.translate(w / 2, h / 2);
      g.fillStyle = '#ffffff';
      g.beginPath(); g.arc(0, 0, 126, 0, PI * 2); g.arc(0, 0, 112, 0, PI * 2, true); g.fill();
      for (var k = 0; k < 10; k++) {
        g.save(); g.rotate(k * PI / 5);
        g.beginPath(); g.moveTo(-9, -28); g.lineTo(-3, -114); g.lineTo(3, -114); g.lineTo(9, -28); g.closePath(); g.fill();
        g.restore();
      }
      g.beginPath(); g.arc(0, 0, 34, 0, PI * 2); g.fill();
      g.fillStyle = '#2a2c30'; g.beginPath(); g.arc(0, 0, 14, 0, PI * 2); g.fill();
    });
  }

  PG.SafetyCar3D = {};
  PG.SafetyCar3D.build = function (opts) {
    opts = opts || {};
    var hi = opts.quality !== 'medium' && opts.quality !== 'low';
    var g = new THREE.Group(), disp = [];
    function keep(x) { disp.push(x); return x; }
    function std(o) { return keep(new THREE.MeshStandardMaterial(o)); }
    function add(geo, mat, cast) { keep(geo); var m = new THREE.Mesh(geo, mat); m.castShadow = cast !== false; m.receiveShadow = true; g.add(m); return m; }

    // lakier: srebrny metalik z warstwą bezbarwną (na wysokiej jakości)
    var paint = keep(hi ? new THREE.MeshPhysicalMaterial({ color: 0xc3c8cd, roughness: 0.32, metalness: 0.78, clearcoat: 1, clearcoatRoughness: 0.06, vertexColors: true, envMapIntensity: 1.1 })
      : new THREE.MeshStandardMaterial({ color: 0xc3c8cd, roughness: 0.3, metalness: 0.8, vertexColors: true }));
    var glass = std({ color: 0x0b0f14, roughness: 0.04, metalness: 0.9, envMapIntensity: 1.3 });
    var black = std({ color: 0x0d0e10, roughness: 0.55, metalness: 0.2 });
    var gloss = std({ color: 0x08090a, roughness: 0.15, metalness: 0.5 });
    var carbon = std({ color: 0x17181a, roughness: 0.35, metalness: 0.35 });
    var chrome = std({ color: 0xdfe3e8, roughness: 0.12, metalness: 1 });
    var head = std({ color: 0xffffff, emissive: 0xf4f8ff, emissiveIntensity: 2.2, roughness: 0.2 });
    var tail = std({ color: 0x3a0000, emissive: 0xff1a10, emissiveIntensity: 1.2, roughness: 0.3 });
    var lampL = std({ color: 0x3a2400, emissive: 0xffa000, emissiveIntensity: 0, roughness: 0.3 });
    var lampR = std({ color: 0x3a2400, emissive: 0xffa000, emissiveIntensity: 0, roughness: 0.3 });
    var lampG = std({ color: 0x002a10, emissive: 0x20ff60, emissiveIntensity: 0, roughness: 0.3 });

    // nadwozie
    var body = add(bodyGeo(hi ? 150 : 90), paint);

    // szyby: przednia (między słupkami A), boczne (zwężające się ku tyłowi), tylna klapa
    var nu = hi ? 8 : 5;
    add(patch(-0.22, 0.565, function (x) { return upU(lerp(0.30, 0.42, sstep(-0.22, 0.56, x))); }, TOPI, 1, 0.004, 22, nu), glass, false);
    add(patch(-0.22, 0.565, function (x) { return upU(lerp(0.30, 0.42, sstep(-0.22, 0.56, x))); }, TOPI, -1, 0.004, 22, nu), glass, false);
    // boczna szyba: od półki do ok. 2/3 wysokości, tylny koniec zbiega się w klin nad tylnym nadkolem
    [-1, 1].forEach(function (sd) {
      add(patch(-1.47, 0.36, function (x) { return upU(0.07 + 0.12 * sstep(-0.95, -1.47, x)); }, function (x) { return upU(0.30 - 0.12 * sstep(-0.9, -1.47, x) - 0.05 * sstep(0.1, 0.36, x)); }, sd, 0.004, 26, 5), glass, false);
    });
    // tylna szyba (klapa)
    add(patch(-1.70, -0.94, function (x) { return upU(lerp(0.52, 0.40, sstep(-1.70, -0.94, x))); }, TOPI, 1, 0.004, 14, nu), glass, false);
    add(patch(-1.70, -0.94, function (x) { return upU(lerp(0.52, 0.40, sstep(-1.70, -0.94, x))); }, TOPI, -1, 0.004, 14, nu), glass, false);

    // reflektory: wąskie, wydłużone, na narożnikach nosa, z listwą świateł do jazdy dziennej
    [-1, 1].forEach(function (sd) {
      add(patch(1.88, 2.215, function (x) { return upU(lerp(0.0, 0.16, sstep(1.88, 2.215, x))); }, function (x) { return upU(lerp(0.24, 0.30, sstep(1.88, 2.2, x))); }, sd, 0.003, 10, 3), gloss, false);
      add(patch(1.93, 2.20, function (x) { return upU(lerp(0.05, 0.18, sstep(1.93, 2.2, x))); }, function (x) { return upU(lerp(0.075, 0.205, sstep(1.93, 2.2, x))); }, sd, 0.006, 10, 1), head, false);
      // wloty na masce
      add(patch(1.18, 1.48, upU(0.47), upU(0.60), sd, 0.003, 6, 3), gloss, false);
      // tylne światła: cienki pas zawinięty z tylnej ściany na bok
      add(patch(-2.262, -2.10, NH - NUP - 3.2, NH - NUP - 2.2, sd, 0.004, 5, 2), tail, false);
      var tl = new THREE.BoxGeometry(0.01, 0.035, 0.42); tl.translate(XR - 0.003, 0.705, sd * 0.47); add(tl, tail, false);
      // napis na drzwiach
      var dm = keep(new THREE.MeshStandardMaterial({ map: doorTex(), transparent: true, roughness: 0.35, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2 }));
      add(patch(-0.78, 0.66, 3 + 2.2, 3 + 7.6, sd, 0.003, 16, 4), dm, false);
      // lusterko na nóżce przy słupku A
      var mb = surf(0.36, UP0 + 0.6, sd);
      var mg = new THREE.SphereGeometry(0.075, 12, 8); mg.scale(1.15, 0.6, 1); mg.translate(0.33, mb[1] + 0.11, sd * (Math.abs(mb[2]) + 0.12)); add(mg, paint);
      var mf = new THREE.CircleGeometry(0.06, 12); mf.scale(1, 0.55, 1); mf.rotateY(-PI / 2); mf.translate(0.255, mb[1] + 0.11, sd * (Math.abs(mb[2]) + 0.12)); add(mf, glass, false);
      var ms = new THREE.BoxGeometry(0.06, 0.11, 0.025); ms.rotateX(-sd * 0.9); ms.translate(0.36, mb[1] + 0.05, sd * (Math.abs(mb[2]) + 0.05)); add(ms, black);
    });

    // przód: grill o pionowych żebrach, boczne wloty, splitter
    var fx = XF + 0.002;
    var gs = new THREE.Shape();
    gs.moveTo(-0.33, 0.215); gs.lineTo(0.33, 0.215); gs.lineTo(0.28, 0.43); gs.quadraticCurveTo(0, 0.455, -0.28, 0.43); gs.closePath();
    var gg = new THREE.ShapeGeometry(gs); gg.rotateY(PI / 2); gg.translate(fx, 0, 0); add(gg, gloss, false);
    var satin = std({ color: 0x9aa0a8, roughness: 0.3, metalness: 0.9 });
    for (var s = -6; s <= 6; s++) {
      var zz = s * 0.044, top = 0.43 - Math.abs(zz) * 0.1;
      var sg = new THREE.BoxGeometry(0.02, top - 0.235, 0.008); sg.translate(fx + 0.008, 0.225 + (top - 0.235) / 2, zz); add(sg, satin, false);
    }
    [-1, 1].forEach(function (sd) {
      var is = new THREE.Shape();
      is.moveTo(0.40, 0.19); is.lineTo(0.56, 0.19); is.lineTo(0.55, 0.33); is.lineTo(0.42, 0.30); is.closePath();
      var ig = new THREE.ShapeGeometry(is); ig.rotateY(PI / 2); if (sd < 0) { ig.scale(1, 1, -1); ig.index.array.reverse(); } ig.translate(fx, 0, 0); add(ig, gloss, false);
    });
    var sp = new THREE.BoxGeometry(0.10, 0.02, 1.36); sp.translate(XF - 0.01, 0.14, 0); add(sp, carbon);
    // tył: dyfuzor, cztery końcówki wydechu, spojler na klapie, skrzydło na wspornikach
    var rx = XR - 0.002;
    var dg = new THREE.BoxGeometry(0.004, 0.12, 1.30); dg.translate(rx, 0.30, 0); add(dg, carbon, false);
    for (var f = -3; f <= 3; f++) { var fg = new THREE.BoxGeometry(0.40, 0.10, 0.012); fg.translate(XR + 0.18, 0.20, f * 0.11); add(fg, carbon, false); }
    var eg = new THREE.CylinderGeometry(0.048, 0.048, 0.14, hi ? 18 : 10, 1, true); eg.rotateZ(PI / 2);
    var ein = new THREE.CircleGeometry(0.04, hi ? 16 : 8); ein.rotateY(-PI / 2);
    [[-0.52, 0.30], [-0.40, 0.30], [0.40, 0.30], [0.52, 0.30]].forEach(function (p) {
      var e = add(eg.clone(), chrome); e.position.set(rx + 0.03, p[1], p[0]);
      var c = add(ein.clone(), black, false); c.position.set(rx - 0.03, p[1], p[0]);
    });
    keep(eg); keep(ein);
    var rp = new THREE.BoxGeometry(0.004, 0.10, 0.62); rp.translate(rx, 0.60, 0); add(rp, black, false); // tablica (pusta, czarna)
    // skrzydło na dwóch wspornikach z klapy (profil: krawędź natarcia z przodu, spływu uniesiona)
    var WX = -2.0, WY = 1.15;
    var ws = new THREE.Shape();
    ws.moveTo(0.15, 0.0); ws.quadraticCurveTo(0.12, 0.03, 0.0, 0.032); ws.quadraticCurveTo(-0.10, 0.03, -0.155, 0.045); ws.lineTo(-0.16, 0.03);
    ws.quadraticCurveTo(-0.05, 0.0, 0.15, -0.012); ws.closePath();
    var wg = new THREE.ExtrudeGeometry(ws, { depth: 1.70, bevelEnabled: false, curveSegments: 6 }); wg.translate(0, 0, -0.85);
    var wing = add(wg, carbon); wing.position.set(WX, WY, 0);
    [-0.42, 0.42].forEach(function (z) {
      var wy0 = T(WX + 0.05) - 0.02, up = new THREE.BoxGeometry(0.11, WY - wy0 + 0.01, 0.014); up.translate(WX + 0.03, (WY + wy0) / 2, z); add(up, carbon);
    });
    [-1, 1].forEach(function (sd) { var ep = new THREE.BoxGeometry(0.36, 0.14, 0.01); ep.translate(WX, WY + 0.01, sd * 0.855); add(ep, carbon); });
    var wtx = keep(bannerTex('SAFETY CAR', '#16181b', '#c8e000'));
    var wl = new THREE.PlaneGeometry(0.62, 0.075); wl.rotateX(-PI / 2); wl.rotateY(PI / 2);
    var wlm = keep(new THREE.MeshStandardMaterial({ map: wtx, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2 }));
    var wlb = add(wl, wlm, false); wlb.position.set(WX - 0.02, WY + 0.04, 0); wlb.rotation.z = -0.05;

    // belka świateł na dachu: płaska obudowa, dwa pomarańczowe pola i zielone na tyle
    var rt = T(-0.5), bar = new THREE.BoxGeometry(0.24, 0.07, 1.08); bar.translate(-0.48, rt + 0.03, 0); add(bar, black);
    var lg = new THREE.BoxGeometry(0.205, 0.05, 0.40);
    var l1 = add(lg, lampL, false); l1.position.set(-0.48, rt + 0.072, -0.27);
    var l2 = add(lg.clone(), lampR, false); l2.position.set(-0.48, rt + 0.072, 0.27);
    var gl = new THREE.BoxGeometry(0.01, 0.035, 0.12);
    var g1 = add(gl, lampG, false); g1.position.set(-0.605, rt + 0.03, -0.12);
    var g2 = add(gl.clone(), lampG, false); g2.position.set(-0.605, rt + 0.03, 0.12);
    var ant = new THREE.CylinderGeometry(0.004, 0.006, 0.16, 5); ant.translate(-0.95, T(-0.95) + 0.08, 0); add(ant, black, false);
    keep(l2.geometry); keep(g2.geometry);

    // listwy nadkoli (zakrywają krawędź wcięcia w siatce nadwozia)
    var lip = keep(new THREE.TorusGeometry(ARCH + 0.004, 0.028, 5, hi ? 40 : 20, PI * 1.12));
    lip.rotateZ(-PI * 0.06); lip.scale(1, 1, 0.5);
    [[AF, 1], [AF, -1], [AR, 1], [AR, -1]].forEach(function (p) {
      var m = new THREE.Mesh(lip, carbon); m.castShadow = true;
      m.position.set(p[0], WCY, p[1] * (W(p[0]) - 0.012)); g.add(m);
    });

    // koła: opona (profil obrotowy), felga z 10 ramionami, tarcza i zacisk hamulca
    var tp = [], ts = hi ? 14 : 8;
    for (var k = 0; k <= ts; k++) {
      var a = -PI / 2 + PI * k / ts, rr = RW - 0.035 + 0.035 * Math.cos(a);
      tp.push(new THREE.Vector2(rr * (0.86 + 0.14 * Math.cos(a)) + 0.0, 0.14 * Math.sin(a)));
    }
    var tyreG = keep(new THREE.LatheGeometry(tp, hi ? 40 : 22)); tyreG.rotateX(PI / 2);
    var sideG = keep(new THREE.RingGeometry(0.23, RW - 0.045, hi ? 40 : 22));
    var rimT = keep(rimTex());
    var rimM = std({ color: 0x8c9198, roughness: 0.3, metalness: 0.85, map: rimT, transparent: true, alphaTest: 0.5 });
    rimM.alphaMap = rimT;
    var rimG = keep(new THREE.CircleGeometry(0.235, hi ? 40 : 22));
    var barrel = keep(new THREE.CylinderGeometry(0.232, 0.232, 0.2, hi ? 32 : 16, 1, true)); barrel.rotateX(PI / 2);
    var disc = keep(new THREE.CylinderGeometry(0.19, 0.19, 0.03, hi ? 28 : 14)); disc.rotateX(PI / 2);
    var discM = std({ color: 0x6b6e72, roughness: 0.45, metalness: 0.9 });
    var calG = keep(new THREE.BoxGeometry(0.15, 0.09, 0.05));
    var calM = std({ color: 0xd9a400, roughness: 0.4, metalness: 0.2 });
    var wheels = [];
    [[AF, 1], [AF, -1], [AR, 1], [AR, -1]].forEach(function (p) {
      var steer = new THREE.Group(); steer.position.set(p[0], RW, p[1] * ZW); g.add(steer);
      var spin = new THREE.Group(); steer.add(spin);
      var wide = p[0] < 0 ? 1.12 : 1;
      var ty = new THREE.Mesh(tyreG, black); ty.scale.set(1, 1, wide); ty.castShadow = true; spin.add(ty);
      [-1, 1].forEach(function (f) { var sw = new THREE.Mesh(sideG, black); sw.position.z = f * 0.138 * wide; if (f < 0) sw.rotation.y = PI; spin.add(sw); });
      var rim = new THREE.Mesh(rimG, rimM); rim.position.z = p[1] * 0.10 * wide; if (p[1] < 0) rim.rotation.y = PI; spin.add(rim);
      var br = new THREE.Mesh(barrel, discM); br.scale.set(1, 1, wide); spin.add(br);
      var dk = new THREE.Mesh(disc, discM); dk.position.z = p[1] * 0.02; steer.add(dk);
      var cl = new THREE.Mesh(calG, calM); cl.position.set(p[0] > 0 ? -0.12 : 0.12, 0.10, p[1] * 0.05); steer.add(cl);
      wheels.push({ steer: steer, spin: spin, front: p[0] > 0 });
    });

    // cień kontaktowy pod autem
    var shT = keep(canvasTex(128, 64, function (c, w, h) {
      var gr = c.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
      gr.addColorStop(0, 'rgba(0,0,0,0.75)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.4)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = gr; c.fillRect(0, 0, w, h);
    }));
    var shG = new THREE.PlaneGeometry(5.3, 2.5); shG.rotateX(-PI / 2);
    var sh = add(shG, keep(new THREE.MeshBasicMaterial({ map: shT, transparent: true, depthWrite: false })), false);
    sh.position.y = 0.02; sh.receiveShadow = false; sh.renderOrder = -1;

    var ang = 0, st = 0;
    g.userData = {
      lamps: [lampL, lampR], disp: disp, body: body,
      // v — prędkość (m/s), steer — skręt kół (rad), brake 0..1, lights — belka świateł, time — czas animacji (s)
      update: function (dt, v, steer, brake, lights, time) {
        ang = (ang + (v || 0) * dt / RW) % (PI * 2);
        st += ((steer || 0) - st) * Math.min(1, dt * 8);
        for (var i = 0; i < wheels.length; i++) {
          wheels[i].spin.rotation.z = -ang;
          wheels[i].steer.rotation.y = wheels[i].front ? st : 0;
        }
        var ph = Math.floor((time || 0) * 6) % 2;
        lampL.emissiveIntensity = lights ? (ph ? 7 : 0.2) : 0;
        lampR.emissiveIntensity = lights ? (ph ? 0.2 : 7) : 0;
        lampG.emissiveIntensity = lights ? 0 : 3;
        tail.emissiveIntensity = 1.2 + 3.5 * clamp(brake || 0, 0, 1);
      }
    };
    return g;
  };
})(PG);
