// WORLD GP — dane gry: zespoły, kierowcy, tor, punktacja.
var PG = (typeof window !== 'undefined' ? (window.PG = window.PG || {}) : (globalThis.PG = globalThis.PG || {}));

// Wersja gry: widoczna w menu; w multiplayer host przyjmuje tylko graczy z tą samą wersją. Zmieniaj przy każdej
// aktualizacji razem z ?v= w znacznikach <script> w index.html (wtedy przeglądarka nie użyje starych plików z pamięci).
PG.VERSION = '2026.10.22.6';

// Tor Parco: fikcyjna nazwa; oś toru z geometrii GeoJSON (bacinger/f1-circuits, it-1922, licencja MIT, patrz THIRD_PARTY_NOTICES.md),
// przeliczona na metry względem linii mety. Kierunek jazdy zgodny z ruchem wskazówek zegara.
PG.MONZA = {
  id: 'monza',
  name: 'Autodromo del Parco',
  info: '5,79 km · 11 zakrętów',
  short: 'Parco',
  country: 'IT',
  halfWidth: 6.5,
  // otoczenie 3D (js/world3d-lite.js, SCENERY): park — trawa i las, za parkiem zabudowa miasta
  scenery: 'park',
  points: [[0.0, -0.0], [36.5, -426.4], [53.1, -605.1], [54.9, -612.4], [60.0, -616.6], [66.4, -617.6], [74.3, -616.6], [81.7, -616.0], [88.5, -616.6], [93.2, -620.2], [96.9, -625.4], [97.8, -630.1], [97.8, -635.3], [71.9, -732.8], [68.3, -759.3], [66.9, -783.3], [68.7, -809.4], [78.4, -936.5], [82.1, -957.3], [86.7, -976.6], [93.7, -997.4], [102.9, -1019.8], [113.4, -1041.7], [129.1, -1066.3], [145.2, -1086.5], [166.9, -1109.5], [190.4, -1129.8], [216.7, -1148.5], [244.8, -1164.6], [276.6, -1180.3], [308.4, -1191.3], [343.4, -1201.1], [383.1, -1208.0], [423.6, -1211.6], [581.7, -1225.1], [775.2, -1236.6], [786.8, -1237.6], [792.8, -1240.8], [797.8, -1246.0], [804.2, -1268.4], [807.0, -1274.6], [811.6, -1278.8], [819.5, -1281.4], [845.7, -1286.1], [874.3, -1292.3], [914.8, -1305.4], [1095.9, -1365.8], [1111.6, -1369.5], [1126.4, -1369.5], [1140.6, -1366.8], [1150.8, -1362.7], [1160.5, -1357.0], [1169.7, -1350.7], [1181.2, -1338.2], [1187.7, -1328.4], [1192.3, -1316.3], [1194.6, -1302.8], [1202.4, -1217.4], [1217.2, -1071.5], [1216.7, -1058.4], [1214.4, -1050.0], [1210.7, -1042.7], [1204.7, -1037.5], [1193.7, -1030.2], [1075.2, -966.7], [978.9, -913.1], [919.0, -880.2], [889.9, -863.5], [857.2, -840.7], [833.7, -822.9], [813.5, -805.2], [708.4, -715.5], [633.8, -648.3], [476.1, -510.8], [381.2, -427.9], [368.3, -414.9], [363.2, -406.6], [362.3, -398.3], [362.3, -388.3], [365.5, -366.4], [366.5, -354.5], [366.5, -337.3], [365.1, -327.9], [361.3, -315.9], [355.8, -301.9], [346.6, -287.7], [334.2, -273.1], [319.9, -261.2], [308.4, -252.4], [302.4, -245.5], [297.8, -236.2], [293.6, -219.0], [284.0, -140.3], [273.8, -56.4], [195.5, 696.0], [192.2, 723.0], [189.0, 735.6], [182.6, 748.6], [173.8, 759.1], [163.7, 768.5], [149.4, 777.8], [133.8, 783.5], [115.8, 786.7], [100.5, 785.6], [86.3, 782.5], [69.7, 776.2], [53.6, 768.9], [41.6, 760.6], [27.3, 749.7], [11.1, 732.4], [0.1, 716.9], [-9.6, 700.2], [-17.9, 680.4], [-25.7, 658.5], [-31.7, 636.0], [-34.5, 616.8], [-37.7, 587.6], [-38.2, 558.4], [-38.6, 530.8], [-40.0, 476.1], [-41.0, 428.1], [-40.0, 376.1], [-34.0, 307.9], [-11.4, 92.1]],
  // nazwy zakrętów: indeks punktu, od którego zaczyna się dany fragment
  marks: [
    { name: 'Prima Variante', p: 2, type: 'A' },
    { name: 'Curva del Bosco', p: 17, type: 'A' },
    { name: 'Seconda Variante', p: 35, type: 'A' },
    { name: 'Curva del Parco 1', p: 46, type: 'A' },
    { name: 'Curva del Parco 2', p: 58, type: 'A' },
    { name: 'Rettifilo dei Pini', p: 63, type: 'S' },
    { name: 'Variante del Lago', p: 74, type: 'A' },
    { name: 'Rettifilo Centrale', p: 91, type: 'S' },
    { name: 'Curva Finale', p: 94, type: 'A' },
    { name: 'Rettifilo Tribune', p: 117, type: 'S' }
  ],
  // dodatkowe wygładzenie zgrubnych danych w zakrętach: [od punktu, do punktu, liczba przejść]
  smooth: [[2, 13, 12], [16, 34, 40], [34, 45, 14], [45, 57, 120], [57, 64, 220], [73, 91, 140], [93, 118, 160]],
  km: 5.793, lapS: 92, laps: 53,
  // rozkład toru: [nazwa zakrętu, przesunięcie w metrach]; start — prosta startowa, first — pierwszy zakręt za metą
  layout: {
    start: 'Rettifilo Tribune', first: 'Prima Variante',
    sectors: [['Curva del Parco 1', -120], ['Variante del Lago', 250]],
    drs: [
      { from: ['Rettifilo Tribune', 30], to: ['Prima Variante', -100], detect: ['Curva Finale', -30] },
      { from: ['Rettifilo Centrale', 60], to: ['Curva Finale', -120], detect: ['Variante del Lago', -80] }
    ],
    // aleja serwisowa: koniec alei przed pierwszym zakrętem, początek garaży względem mety (m)
    pit: { to: ['Prima Variante', -180], garage: -260 },
    mainTo: ['Prima Variante', -140],
    // asfaltowe pobocza: L/R — najmniejsza odległość bariery; all — asfalt także tam, gdzie była trawa
    runoff: [
      { at: 'Curva Finale', from: -80, to: 420, L: 44 },
      { at: 'Prima Variante', from: -150, to: 60, L: 38, R: 30, all: true }
    ],
    // trybuna główna (od, do względem mety) i trybuny przy zakrętach: side 1 — prawa, -1 — lewa; d — odległość od bariery
    mainStand: [-330, 260],
    stands: [
      { at: 'Prima Variante', from: -160, to: 10, side: 1, bar: 'L', d: [6, 26] },
      { at: 'Curva Finale', from: 120, to: 420, side: -1, bar: 'L', barAt: 250, d: [6, 26] },
      { at: 'Variante del Lago', from: -60, to: 90, side: 1, bar: 'R', d: [6, 22] },
      { at: 'Seconda Variante', from: -120, to: 20, side: -1, bar: 'L', d: [6, 22] },
      { at: 'Curva del Parco 1', from: -40, to: 80, side: -1, bar: 'L', d: [8, 24] }
    ],
    boards: ['Prima Variante', 'Curva Finale', 'Seconda Variante', 'Variante del Lago'],
    // stary owal z mostem nad torem
    oval: { at: 'Rettifilo dei Pini', off: 330, ang: 1.15 }
  }
};

// Tor Kingsmoor: fikcyjna nazwa i nazwy zakrętów; oś toru z geometrii GeoJSON (bacinger/f1-circuits, gb-1948, licencja MIT,
// patrz THIRD_PARTY_NOTICES.md), przeliczona na metry względem linii mety (stara meta na prostej przed pierwszym zakrętem).
// Kierunek jazdy zgodny z ruchem wskazówek zegara. Dawne lotnisko: szeroki, płaski tor, mało drzew.
PG.KINGSMOOR = {
  id: 'kingsmoor',
  name: 'Kingsmoor Airfield Circuit',
  info: '5,89 km · 18 zakrętów',
  short: 'Kingsmoor',
  country: 'GB',
  halfWidth: 7,
  trees: 0.3,
  scenery: 'airfield',
  points: [[0.0, 0.0], [186.5, -16.2], [219.6, -14.2], [245.1, -5.8], [261.7, 5.2], [281.6, 28.2], [294.1, 54.5], [304.2, 87.5], [318.4, 143.6], [332.9, 198.6], [341.4, 259.4], [345.0, 297.7], [349.9, 390.4], [351.9, 469.6], [355.2, 500.5], [366.9, 529.4], [389.1, 569.8], [398.5, 592.8], [398.1, 610.1], [394.0, 630.5], [362.5, 713.9], [360.4, 747.5], [365.3, 771.5], [376.6, 791.9], [407.8, 835.4], [415.0, 855.4], [415.8, 879.0], [410.6, 900.5], [391.6, 924.0], [367.3, 941.4], [334.1, 960.7], [308.3, 976.0], [290.0, 993.8], [269.0, 1028.9], [227.8, 1106.4], [0.8, 1524.2], [-73.6, 1640.0], [-94.6, 1668.4], [-111.6, 1683.5], [-131.4, 1693.5], [-152.1, 1698.7], [-171.0, 1697.2], [-192.1, 1692.4], [-209.9, 1684.6], [-225.7, 1672.0], [-239.0, 1652.0], [-243.1, 1644.2], [-263.3, 1600.2], [-285.9, 1560.8], [-310.2, 1528.4], [-326.8, 1508.5], [-345.4, 1488.0], [-378.2, 1454.4], [-451.4, 1366.9], [-458.7, 1362.3], [-468.8, 1361.1], [-478.8, 1365.9], [-509.6, 1393.7], [-520.1, 1397.4], [-530.6, 1396.3], [-539.5, 1392.6], [-552.1, 1380.6], [-565.4, 1366.9], [-582.0, 1344.9], [-594.1, 1321.3], [-602.7, 1297.2], [-609.9, 1270.0], [-610.7, 1259.0], [-608.7, 1247.9], [-602.7, 1237.5], [-588.1, 1214.4], [-364.8, 923.0], [-314.6, 858.5], [-304.2, 846.4], [-285.9, 834.4], [-264.1, 829.2], [-246.3, 828.6], [-221.6, 830.7], [-152.9, 841.2], [-130.2, 843.9], [-106.7, 844.9], [-80.0, 841.2], [-55.8, 835.0], [-34.0, 822.8], [108.5, 709.6], [117.7, 703.4], [129.1, 697.6], [140.8, 696.5], [149.7, 699.8], [157.8, 707.1], [162.6, 715.4], [186.9, 800.4], [194.2, 812.4], [204.3, 819.7], [216.0, 820.3], [229.0, 814.5], [237.1, 804.1], [242.3, 793.0], [252.4, 765.2], [260.5, 741.7], [266.6, 718.5], [269.8, 696.1], [271.8, 672.4], [270.2, 647.8], [265.4, 636.8], [252.9, 622.7], [-208.7, 201.3], [-221.2, 193.4], [-238.6, 184.5], [-260.0, 181.4], [-282.3, 183.9], [-304.9, 194.9], [-313.1, 204.9], [-318.7, 219.6], [-328.0, 296.1], [-333.3, 311.8], [-344.6, 324.5], [-361.6, 332.8], [-380.2, 335.5], [-400.8, 330.1], [-415.4, 320.2], [-424.2, 308.7], [-431.1, 295.1], [-432.4, 280.4], [-429.5, 264.6], [-418.2, 239.0], [-358.8, 121.1], [-339.7, 98.5], [-321.1, 79.6], [-294.4, 56.6], [-272.6, 41.4], [-245.1, 29.8], [-221.2, 22.0], [-170.6, 15.7]],
  marks: [
    { name: 'Spinney', p: 1, type: 'A' },
    { name: 'Thistle', p: 13, type: 'A' },
    { name: 'Bishops', p: 16, type: 'A' },
    { name: 'Vicarage', p: 19, type: 'A' },
    { name: 'Runway Straight', p: 34, type: 'S' },
    { name: 'Lodge', p: 36, type: 'A' },
    { name: 'Dell', p: 52, type: 'A' },
    { name: 'Pavilion', p: 57, type: 'A' },
    { name: 'Tower Straight', p: 70, type: 'S' },
    { name: 'Priory', p: 72, type: 'A' },
    { name: 'Orchard', p: 76, type: 'A' },
    { name: 'Hamlet', p: 84, type: 'A' },
    { name: 'The Crook', p: 91, type: 'A' },
    { name: 'Millpond', p: 96, type: 'A' },
    { name: 'Dispersal Straight', p: 105, type: 'S' },
    { name: 'Kestrel', p: 106, type: 'A' },
    { name: 'Ashby', p: 113, type: 'A' },
    { name: 'Fernhill', p: 121, type: 'A' },
    { name: 'Pit Straight', p: 126, type: 'S' }
  ],
  smooth: [[0, 8, 40], [12, 30, 80], [35, 46, 40], [56, 70, 60], [71, 83, 60], [95, 105, 60], [113, 127, 60]],
  km: 5.891, lapS: 113, laps: 52,
  layout: {
    start: 'Pit Straight', first: 'Spinney',
    sectors: [['Runway Straight', 150], ['Hamlet', 100]],
    drs: [
      { from: ['Runway Straight', 40], to: ['Lodge', -110], detect: ['Runway Straight', -120] },
      { from: ['Dispersal Straight', 60], to: ['Kestrel', -110], detect: ['Dispersal Straight', -100] }
    ],
    // krótka prosta startowa: wyjazd z alei tuż przed Spinney
    pit: { to: ['Spinney', -110], garage: -300 },
    mainTo: ['Spinney', -130],
    runoff: [
      { at: 'Spinney', from: -60, to: 200, L: 40 },
      { at: 'Lodge', from: -100, to: 160, L: 42 },
      { at: 'Pavilion', from: -40, to: 220, L: 36 },
      { at: 'Priory', from: -80, to: 80, L: 34 },
      { at: 'Kestrel', from: -150, to: 60, L: 38, R: 30, all: true }
    ],
    mainStand: [-330, 110],
    stands: [
      { at: 'Spinney', from: 0, to: 150, side: -1, bar: 'L', barAt: 60, d: [6, 24] },
      { at: 'Lodge', from: -60, to: 120, side: -1, bar: 'L', barAt: 40, d: [6, 24] },
      { at: 'Pavilion', from: 40, to: 200, side: -1, bar: 'L', barAt: 100, d: [6, 22] },
      { at: 'Kestrel', from: -120, to: 20, side: -1, bar: 'L', d: [6, 22] },
      { at: 'Ashby', from: -20, to: 120, side: -1, bar: 'L', barAt: 50, d: [8, 26] }
    ],
    boards: ['Spinney', 'Lodge', 'Kestrel', 'Priory'],
    oval: null
  }
};

// Tor Al Rimal: fikcyjna nazwa i nazwy zakrętów; oś toru z geometrii GeoJSON (bacinger/f1-circuits, bh-2002, licencja MIT,
// patrz THIRD_PARTY_NOTICES.md), przeliczona na metry względem linii mety. Kierunek jazdy zgodny z ruchem wskazówek zegara.
// Tor na pustyni: szerokie asfaltowe pobocza, piasek i wydmy zamiast trawy, bez drzew.
PG.ALRIMAL = {
  id: 'alrimal',
  name: 'Al Rimal Desert Circuit',
  info: '5,41 km · 15 zakrętów',
  short: 'Al Rimal',
  country: 'BH',
  halfWidth: 7.5,
  trees: 0,
  scenery: 'desert',
  points: [[0.0, 0.0], [9.4, -337.0], [18.3, -557.8], [22.5, -567.7], [31.3, -569.2], [40.8, -566.7], [47.9, -561.4], [93.4, -515.3], [105.8, -510.6], [119.4, -511.6], [198.6, -537.3], [217.6, -539.4], [234.8, -538.3], [754.6, -437.7], [772.3, -432.4], [781.8, -422.5], [784.1, -409.9], [782.3, -397.9], [776.4, -384.3], [765.2, -370.6], [752.3, -359.6], [734.5, -345.9], [671.8, -299.3], [621.5, -247.0], [609.1, -234.8], [599.1, -217.6], [576.6, -166.7], [568.9, -155.7], [557.0, -147.9], [545.2, -141.6], [526.3, -139.4], [469.5, -148.9], [454.1, -148.3], [438.2, -145.2], [425.1, -138.4], [409.2, -123.8], [293.8, 22.5], [282.7, 32.5], [266.7, 35.0], [256.7, 27.2], [253.1, 11.5], [253.7, -12.6], [281.5, -178.2], [297.4, -282.0], [299.8, -302.5], [296.8, -321.4], [292.7, -335.5], [284.5, -349.6], [237.1, -390.5], [230.6, -393.6], [223.5, -391.6], [219.4, -384.3], [202.2, -256.3], [197.5, -170.9], [189.2, -17.3], [183.3, 143.1], [177.3, 289.3], [179.7, 313.3], [189.2, 327.6], [204.0, 335.4], [224.7, 339.6], [246.0, 338.0], [272.6, 332.8], [299.8, 319.7], [322.8, 303.5], [345.3, 280.4], [359.0, 257.9], [384.4, 191.8], [398.6, 164.0], [412.1, 147.8], [429.9, 133.1], [451.2, 120.0], [480.8, 112.6], [513.3, 112.1], [536.3, 117.4], [567.1, 132.1], [648.1, 172.4], [664.7, 184.5], [678.9, 198.6], [686.0, 211.7], [694.8, 226.4], [694.8, 239.5], [687.7, 253.1], [673.5, 266.8], [654.0, 281.4], [40.2, 625.2], [29.0, 631.0], [11.2, 631.6], [3.5, 624.2], [-23.7, 566.5], [-26.1, 543.5], [-25.5, 500.0], [-17.8, 261.5]],
  marks: [
    { name: 'Oasis', p: 2, type: 'A' },
    { name: 'Palm', p: 6, type: 'A' },
    { name: 'Dune Straight', p: 12, type: 'S' },
    { name: 'Falcon', p: 13, type: 'A' },
    { name: 'Caravan Esses', p: 21, type: 'A' },
    { name: 'Souq', p: 36, type: 'A' },
    { name: 'Lantern', p: 43, type: 'A' },
    { name: 'Mirage Straight', p: 51, type: 'S' },
    { name: 'Wadi', p: 56, type: 'A' },
    { name: 'Pearl', p: 66, type: 'A' },
    { name: 'Tower', p: 76, type: 'A' },
    { name: 'Sand Straight', p: 84, type: 'S' },
    { name: 'Gulf', p: 85, type: 'A' },
    { name: 'Pit Straight', p: 90, type: 'S' }
  ],
  smooth: [[1, 8, 20], [13, 21, 30], [21, 35, 40], [43, 52, 80], [56, 66, 40], [66, 84, 40], [84, 91, 60]],
  km: 5.412, lapS: 106, laps: 57,
  layout: {
    start: 'Pit Straight', first: 'Oasis',
    sectors: [['Dune Straight', 250], ['Mirage Straight', 200]],
    drs: [
      { from: ['Pit Straight', 40], to: ['Oasis', -100], detect: ['Gulf', -20] },
      { from: ['Dune Straight', 40], to: ['Falcon', -100], detect: ['Dune Straight', -120] },
      { from: ['Mirage Straight', 40], to: ['Wadi', -100], detect: ['Mirage Straight', -100] }
    ],
    pit: { to: ['Oasis', -180], garage: -260 },
    mainTo: ['Oasis', -140],
    runoff: [
      { at: 'Oasis', from: -150, to: 80, L: 42, R: 30, all: true },
      { at: 'Falcon', from: -100, to: 120, L: 40, all: true },
      { at: 'Souq', from: -100, to: 60, L: 36, R: 26, all: true },
      { at: 'Lantern', from: -60, to: 120, R: 34, all: true },
      { at: 'Wadi', from: -100, to: 150, R: 38, all: true },
      { at: 'Gulf', from: -100, to: 80, L: 36, all: true }
    ],
    mainStand: [-330, 260],
    stands: [
      { at: 'Oasis', from: -160, to: 10, side: -1, bar: 'L', d: [6, 26] },
      { at: 'Falcon', from: -60, to: 80, side: -1, bar: 'L', barAt: 20, d: [6, 24] },
      { at: 'Souq', from: -120, to: 20, side: -1, bar: 'L', d: [6, 22] },
      { at: 'Gulf', from: -80, to: 60, side: -1, bar: 'L', d: [6, 22] }
    ],
    boards: ['Oasis', 'Falcon', 'Souq', 'Wadi', 'Gulf'],
    oval: null
  }
};

// Tory do wyboru (szybki wyścig, multiplayer)
PG.TRACKS = [PG.MONZA, PG.KINGSMOOR, PG.ALRIMAL];

PG.POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

PG.NATIONS = {
  PL: { name: 'Polska', flag: ['h', '#ffffff', '#dc143c'] },
  IT: { name: 'Włochy', flag: ['v', '#009246', '#ffffff', '#ce2b37'] },
  GB: { name: 'Wielka Brytania', flag: ['gb'] },
  DE: { name: 'Niemcy', flag: ['h', '#111111', '#dd0000', '#ffce00'] },
  FR: { name: 'Francja', flag: ['v', '#0055a4', '#ffffff', '#ef4135'] },
  ES: { name: 'Hiszpania', flag: ['h', '#aa151b', '#f1bf00', '#f1bf00', '#aa151b'] },
  NL: { name: 'Holandia', flag: ['h', '#ae1c28', '#ffffff', '#21468b'] },
  MX: { name: 'Meksyk', flag: ['v', '#006847', '#ffffff', '#ce1126'] },
  AU: { name: 'Australia', flag: ['dot', '#00247d', '#ffffff'] },
  JP: { name: 'Japonia', flag: ['dot', '#ffffff', '#bc002d'] },
  BR: { name: 'Brazylia', flag: ['diamond', '#009c3b', '#ffdf00'] },
  CA: { name: 'Kanada', flag: ['vdot', '#ff0000', '#ffffff'] },
  DK: { name: 'Dania', flag: ['cross', '#c8102e', '#ffffff'] },
  SE: { name: 'Szwecja', flag: ['cross', '#006aa7', '#fecc00'] },
  FI: { name: 'Finlandia', flag: ['cross', '#ffffff', '#002f6c'] },
  CZ: { name: 'Czechy', flag: ['h', '#ffffff', '#d7141a'] },
  AR: { name: 'Argentyna', flag: ['h', '#74acdf', '#ffffff', '#74acdf'] },
  US: { name: 'USA', flag: ['h', '#b22234', '#ffffff', '#b22234', '#ffffff', '#b22234'] },
  AT: { name: 'Austria', flag: ['h', '#ed2939', '#ffffff', '#ed2939'] },
  BE: { name: 'Belgia', flag: ['v', '#111111', '#fae042', '#ed2939'] },
  CH: { name: 'Szwajcaria', flag: ['plus', '#d52b1e', '#ffffff'] },
  TH: { name: 'Tajlandia', flag: ['h', '#a51931', '#f4f5f8', '#2d2a4a', '#2d2a4a', '#f4f5f8', '#a51931'] },
  CN: { name: 'Chiny', flag: ['dot', '#de2910', '#ffde00'] },
  NZ: { name: 'Nowa Zelandia', flag: ['dot', '#00247d', '#cc142b'] },
  BH: { name: 'Bahrajn', flag: ['serrate', '#ffffff', '#ce1126'] }
};

PG.ENGINES = {
  Ferro: { name: 'Ferro', power: 2 },
  Stella: { name: 'Stella', power: 2 },
  Kaze: { name: 'Kaze', power: 1 },
  Renova: { name: 'Renova', power: -1 }
};

// Wzory malowań — nazwy widoczne w kreatorze
PG.PATTERNS = [
  { id: 'plain', name: 'Gładkie' },
  { id: 'stripe', name: 'Pas środkowy' },
  { id: 'twin', name: 'Dwa pasy' },
  { id: 'chevron', name: 'Szewron' },
  { id: 'split', name: 'Podział przód/tył' },
  { id: 'pods', name: 'Sekcje boczne' },
  { id: 'tail', name: 'Ogon w akcencie' },
  { id: 'checker', name: 'Szachownica' },
  { id: 'fade', name: 'Pasy przejścia' }
];

PG.HELMET_PATTERNS = [
  { id: 'plain', name: 'Gładki' },
  { id: 'band', name: 'Opaska' },
  { id: 'top', name: 'Pas na górze' },
  { id: 'star', name: 'Gwiazda' },
  { id: 'halves', name: 'Połówki' }
];

// Zespoły i kierowcy fikcyjni (bez nazw, numerów i znaków prawdziwych zespołów i kierowców)
PG.DEFAULT_TEAMS = [
  { id: 'rossa', name: 'Scuderia Rossa', short: 'ROS', country: 'IT', engine: 'Ferro', tier: 1,
    livery: { primary: '#d40f1a', secondary: '#1a1a1a', accent: '#ffd400', pattern: 'tail', paint: {} },
    car: { power: 88, aero: 86, tyre: 84 }, budget: 92,
    drivers: [
      { first: 'Carlo', last: 'Benedetti', nat: 'IT', num: 9, pace: 92, start: 86, tyre: 84, wet: 88, helmet: { c1: '#d40f1a', c2: '#ffd400', pattern: 'band' } },
      { first: 'Luis', last: 'Ortega', nat: 'ES', num: 21, pace: 89, start: 85, tyre: 90, wet: 84, helmet: { c1: '#1d3fa8', c2: '#ffffff', pattern: 'top' } }
    ] },
  { id: 'argento', name: 'Stella Argento', short: 'STA', country: 'DE', engine: 'Stella', tier: 1,
    livery: { primary: '#b8bec4', secondary: '#141414', accent: '#00c2b2', pattern: 'fade', paint: {} },
    car: { power: 87, aero: 85, tyre: 86 }, budget: 90,
    drivers: [
      { first: 'James', last: 'Whitfield', nat: 'GB', num: 15, pace: 90, start: 84, tyre: 86, wet: 87, helmet: { c1: '#ffffff', c2: '#00c2b2', pattern: 'halves' } },
      { first: 'Andrea', last: 'Conti', nat: 'IT', num: 34, pace: 87, start: 88, tyre: 82, wet: 80, helmet: { c1: '#1a1a1a', c2: '#00c2b2', pattern: 'star' } }
    ] },
  { id: 'bison', name: 'Danube Racing', short: 'BIS', country: 'AT', engine: 'Kaze', tier: 1,
    livery: { primary: '#1c2a6b', secondary: '#ff6a13', accent: '#e8e8e8', pattern: 'chevron', paint: {} },
    car: { power: 89, aero: 88, tyre: 83 }, budget: 91,
    drivers: [
      { first: 'Maarten', last: 'Brouwer', nat: 'NL', num: 2, pace: 96, start: 90, tyre: 88, wet: 95, helmet: { c1: '#1c2a6b', c2: '#ff6a13', pattern: 'top' } },
      { first: 'Diego', last: 'Salazar', nat: 'MX', num: 25, pace: 84, start: 87, tyre: 89, wet: 80, helmet: { c1: '#006847', c2: '#ffffff', pattern: 'band' } }
    ] },
  { id: 'papaya', name: 'Ember GP', short: 'EMB', country: 'GB', engine: 'Stella', tier: 1,
    livery: { primary: '#ff7a00', secondary: '#1b1b1b', accent: '#3fa9f5', pattern: 'split', paint: {} },
    car: { power: 88, aero: 90, tyre: 87 }, budget: 89,
    drivers: [
      { first: 'Liam', last: 'Ashby', nat: 'GB', num: 29, pace: 93, start: 84, tyre: 86, wet: 90, helmet: { c1: '#f6e200', c2: '#1b1b1b', pattern: 'halves' } },
      { first: 'Callum', last: 'Reid', nat: 'AU', num: 36, pace: 92, start: 86, tyre: 89, wet: 85, helmet: { c1: '#ffffff', c2: '#ff7a00', pattern: 'top' } }
    ] },
  { id: 'verde', name: 'Verde Britannia', short: 'VER', country: 'GB', engine: 'Stella', tier: 2,
    livery: { primary: '#005c4b', secondary: '#0d1f1a', accent: '#c8e000', pattern: 'twin', paint: {} },
    car: { power: 85, aero: 80, tyre: 82 }, budget: 84,
    drivers: [
      { first: 'Rafael', last: 'Montes', nat: 'ES', num: 39, pace: 89, start: 92, tyre: 92, wet: 90, helmet: { c1: '#005c4b', c2: '#c8e000', pattern: 'band' } },
      { first: 'Ethan', last: 'Kerr', nat: 'CA', num: 42, pace: 79, start: 82, tyre: 80, wet: 78, helmet: { c1: '#ffffff', c2: '#d61f2c', pattern: 'star' } }
    ] },
  { id: 'alpes', name: 'Alpes Bleu', short: 'ALP', country: 'FR', engine: 'Renova', tier: 3,
    livery: { primary: '#0b62c9', secondary: '#0b1a33', accent: '#ff82bd', pattern: 'pods', paint: {} },
    car: { power: 81, aero: 80, tyre: 81 }, budget: 76,
    drivers: [
      { first: 'Pierre', last: 'Garnier', nat: 'FR', num: 48, pace: 84, start: 83, tyre: 82, wet: 88, helmet: { c1: '#0b62c9', c2: '#ffffff', pattern: 'halves' } },
      { first: 'Julien', last: 'Moreau', nat: 'FR', num: 52, pace: 82, start: 80, tyre: 81, wet: 79, helmet: { c1: '#ff82bd', c2: '#0b1a33', pattern: 'top' } }
    ] },
  { id: 'grove', name: 'Grove Racing', short: 'GRV', country: 'GB', engine: 'Stella', tier: 2,
    livery: { primary: '#0a2353', secondary: '#00a3e0', accent: '#ffffff', pattern: 'stripe', paint: {} },
    car: { power: 86, aero: 81, tyre: 80 }, budget: 79,
    drivers: [
      { first: 'Kamil', last: 'Zieliński', nat: 'PL', num: 26, pace: 86, start: 84, tyre: 83, wet: 85, helmet: { c1: '#ffffff', c2: '#dc143c', pattern: 'halves' } },
      { first: 'Mateo', last: 'Ruiz', nat: 'AR', num: 57, pace: 83, start: 85, tyre: 79, wet: 80, helmet: { c1: '#74acdf', c2: '#ffffff', pattern: 'band' } }
    ] },
  { id: 'faenza', name: 'Faenza Junior', short: 'FAE', country: 'IT', engine: 'Kaze', tier: 2,
    livery: { primary: '#f2f4f8', secondary: '#1634cb', accent: '#e4002b', pattern: 'chevron', paint: {} },
    car: { power: 86, aero: 82, tyre: 81 }, budget: 80,
    drivers: [
      { first: 'Haruto', last: 'Tanabe', nat: 'JP', num: 61, pace: 85, start: 87, tyre: 80, wet: 82, helmet: { c1: '#ffffff', c2: '#bc002d', pattern: 'star' } },
      { first: 'Hugo', last: 'Delacroix', nat: 'FR', num: 64, pace: 83, start: 81, tyre: 82, wet: 81, helmet: { c1: '#1634cb', c2: '#e4002b', pattern: 'top' } }
    ] },
  { id: 'hinwil', name: 'Hinwil Verde', short: 'HIN', country: 'CH', engine: 'Ferro', tier: 3,
    livery: { primary: '#1b1b1b', secondary: '#2a2a2a', accent: '#52e252', pattern: 'twin', paint: {} },
    car: { power: 83, aero: 78, tyre: 80 }, budget: 72,
    drivers: [
      { first: 'Niklas', last: 'Hoffmann', nat: 'DE', num: 68, pace: 85, start: 83, tyre: 84, wet: 83, helmet: { c1: '#ffce00', c2: '#111111', pattern: 'band' } },
      { first: 'Gabriel', last: 'Souza', nat: 'BR', num: 72, pace: 82, start: 84, tyre: 79, wet: 84, helmet: { c1: '#009c3b', c2: '#ffdf00', pattern: 'halves' } }
    ] },
  { id: 'kanna', name: 'Kannapolis Racing', short: 'KAN', country: 'US', engine: 'Ferro', tier: 3,
    livery: { primary: '#f4f4f4', secondary: '#1b1b1b', accent: '#e6002b', pattern: 'split', paint: {} },
    car: { power: 84, aero: 79, tyre: 79 }, budget: 74,
    drivers: [
      { first: 'Mikkel', last: 'Sørensen', nat: 'DK', num: 75, pace: 83, start: 80, tyre: 81, wet: 82, helmet: { c1: '#c8102e', c2: '#ffffff', pattern: 'top' } },
      { first: 'Tomas', last: 'Novak', nat: 'CZ', num: 83, pace: 81, start: 83, tyre: 80, wet: 79, helmet: { c1: '#111111', c2: '#d7141a', pattern: 'star' } }
    ] }
];

// Kalendarz sezonu — wszystkie rundy na torze Parco w MVP, różna pogoda
PG.CALENDAR = [
  { name: 'Gran Premio d\'Apertura', weather: 'sun' },
  { name: 'Trofeo della Brianza', weather: 'cloud' },
  { name: 'Coppa del Parco', weather: 'rain' },
  { name: 'Trofeo del Lago', weather: 'sun' },
  { name: 'Coppa Lombardia', weather: 'cloud' },
  { name: 'Gran Premio del Parco', weather: 'sun' }
];

PG.WEATHER = {
  sun: { name: 'Słonecznie', grip: 1.0 },
  cloud: { name: 'Pochmurno', grip: 0.98 },
  rain: { name: 'Deszcz', grip: 0.78 }
};

PG.TYRES = {
  S: { name: 'Miękkie', color: '#e8262f', grip: 1.035, wear: 1.7 },
  M: { name: 'Pośrednie', color: '#f5c518', grip: 1.0, wear: 1.0 },
  H: { name: 'Twarde', color: '#f2f2f2', grip: 0.97, wear: 0.6 },
  W: { name: 'Deszczowe', color: '#2f7ef0', grip: 1.0, wear: 0.8 }
};

PG.FIRST_NAMES = ['Adam', 'Marco', 'Leo', 'Felix', 'Oskar', 'Jonas', 'Rui', 'Tom', 'Elias', 'Nico', 'Hugo', 'Max', 'Igor', 'Luca', 'Arvid', 'Bruno', 'Dario', 'Emil', 'Filip', 'Jan'];
PG.LAST_NAMES = ['Kowal', 'Ferraro', 'Lindgren', 'Moretti', 'Becker', 'Duval', 'Navarro', 'Okada', 'Price', 'Sandoval', 'Kaczmarek', 'Weber', 'Rossi', 'Bauer', 'Nowicki', 'Laurent', 'Hughes', 'Castro'];
