# WORLD GP

Gra wyścigowa w przeglądarce w stylu bolidów z otwartymi kołami: trzy fikcyjne tory oparte na prawdziwej geometrii (Parco, Kingsmoor i Al Rimal), pełny widok 3D (three.js), kwalifikacje, wyścig, pogoda, zużycie opon, DRS, uszkodzenia, dźwięk silników (klasyczny albo własne nagrania gracza, wtedy także rywali), tryb kariery (kierowca albo właściciel zespołu) i kreator kierowców, zespołów i malowań. Zespoły, kierowcy, silniki i tory są fikcyjni.

WORLD GP to gra fanowska, niezwiązana z Formułą 1, FIA ani żadnym zespołem. Licencje bibliotek, danych toru i fontów: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Gra to czysty HTML + JavaScript bez budowania i bez zależności z npm. Biblioteki: three.js (MIT) w `js/vendor/three.min.js` i supabase-js (MIT, tylko dla multiplayer) w `js/vendor/supabase.js`.

Jak działa AI bolidów: [docs/WORLD-GP-AI-bolidow.md](docs/WORLD-GP-AI-bolidow.md). Polityka prywatności (multiplayer): [privacy.html](privacy.html).

## Uruchomienie

Gra działa wyłącznie w 3D i wymaga przeglądarki z WebGL (aktualny Chrome, Edge, Firefox lub Safari z włączonym przyspieszeniem sprzętowym).

Sklonuj repozytorium:

```bash
git clone https://github.com/danropl/world-gp.git
```

Potem uruchamiaj grę skryptem z katalogu `world-gp`. Skrypt najpierw pobiera najnowszą wersję (`git pull`), a potem otwiera grę w przeglądarce:

- **macOS:** dwuklik `start.command` w Finderze albo w Terminalu `./start.command`
- **Windows:** dwuklik `start.bat`
- **ręcznie:** `python3 serve.py`, potem http://localhost:8000

`serve.py` wyłącza pamięć podręczną przeglądarki, więc po aktualizacji zawsze ładuje się nowa wersja. Jeśli port 8000 zajmuje inny serwer (np. stary `python3 -m http.server` z poprzedniego folderu), `serve.py` uruchomi grę na następnym wolnym porcie i to napisze. Przy zwykłym `python3 -m http.server` Safari i Chrome potrafią przez kilka godzin pokazywać stare pliki; pomaga wtedy twarde odświeżenie (Cmd+Shift+R albo Ctrl+Shift+R).

Wersja gry jest widoczna na dole menu. W multiplayer wszyscy gracze muszą mieć tę samą wersję, inaczej host odmówi dołączenia.

Zapis gry (kariera, kreator, ustawienia) trzyma `localStorage` przeglądarki pod kluczem `pixelgp-save-v1`.

## Sterowanie

| Klawiatura | Akcja |
| --- | --- |
| `↑` / `W` | gaz |
| `↓` / `S` | hamulec |
| `←` `→` | skręt |
| `E` / `Spacja` | DRS |
| `X` / `Z` | bieg w górę / w dół (ręczna skrzynia) |
| `R` | powrót na tor |
| `C` | kamera |
| `V` | patrz do tyłu |
| `Esc` | pauza |
| `M` | dźwięk |

Pad (DualSense i inne): lewa gałka skręt, `R2` gaz, `L2` hamulec, `R1` / `✕` DRS, `△` kamera, `□` patrz do tyłu, `○` powrót na tor, `L1` / `Create` (Share) zjazd do boksu, `Options` pauza. Na telefonie działa sterowanie dotykowe.

Klawisze można zmienić w **Ustawienia → Sterowanie**: każda akcja ma dwa pola, kliknij pole i naciśnij nowy klawisz (Backspace czyści, Esc anuluje, zajęty klawisz zamienia się miejscami). Przypisania zapisują się w ciasteczku `wgp_keys` tej przeglądarki, nie na serwerze; „Przywróć domyślne” wraca do tabeli powyżej. W **Ustawienia → Kontroler** jest schemat pada PS5 z opisem przycisków dla skrzyni automatycznej i ręcznej.

W menu strzałki na klawiaturze i krzyżak pada przechodzą do przycisku, który leży wizualnie w danym kierunku (także w siatce kart zespołów i między kolumnami ustawień); `Enter` / `✕` wybiera, `Esc` / `○` wraca. Ustawienia są podzielone na sekcje z boczną nawigacją (Grafika, Jazda, Kontroler, Dźwięk, Sterowanie), a w szybkim wyścigu panel ustawień z przyciskiem startu zostaje widoczny przy przewijaniu listy zespołów.

### Ręczna skrzynia biegów (opcja)

**Ustawienia → Jazda → Skrzynia biegów: Ręczna** (także w menu pauzy). Domyślnie skrzynia jest automatyczna, a AI zawsze jeździ z automatem.

- Zmiana biegów: klawiatura `X` w górę, `Z` w dół (albo `+` / `−` na klawiaturze numerycznej); pad `R1` w górę, `L1` w dół. Przy ręcznej skrzyni DRS na padzie jest pod `✕`, a zjazd do boksu pod `Create` albo `L3`. Na telefonie pojawiają się przyciski `+` i `−`.
- Pełna moc jest od ok. 12 000 obr./min (silnik kręci się do 19 000). Na za wysokim biegu silnik słabnie, a na końcu biegu działa ogranicznik obrotów (bieg na wyświetlaczu robi się niebieski).
- Redukcja, po której silnik przekroczyłby obroty, jest blokowana. Niższy bieg mocniej hamuje silnikiem.
- Kto zmienia biegi przy ok. 18 500 obr./min (zapalone prawie wszystkie diody), jest prawie tak szybki jak automat (0–200 km/h: 4,7 s wobec 4,6 s).
- Aleja serwisowa, powrót na tor (`R`) i przejęcie bolidu przez AI ustawiają bieg automatycznie.

## Weekend wyścigowy

- **Dystans:** od 1 do 53 okrążeń (pełny dystans Grand Prix na tym torze). Zużycie opon „Auto" przyspiesza degradację w krótszych wyścigach, by strategia miała znaczenie.
- **Kwalifikacje Q1 · Q2 · Q3:** po Q1 odpada pięciu najwolniejszych, po Q2 kolejnych pięciu, Q3 ustala pierwszą dziesiątkę. Każdy segment można przejechać albo zasymulować. Do wyboru też jedno okrążenie.
- **Pit stopy:** `B` (pad: `L1` albo `Create`) zgłasza zjazd, `1`–`4` (pad: krzyżak ▲▼) wybiera opony. Przejazd aleją prowadzi gra (80 km/h przy garażach), na stanowisku wymiana opon i naprawa skrzydeł. AI ma własną strategię. Na suchym torze od 10 okrążeń obowiązują dwie różne mieszanki (inaczej +30 s).
- **Zjazd bez zgłoszenia:** możesz też po prostu skręcić w drogę zjazdu za Curva Finale, zanim zacznie się mur alei. Mechanicy nie czekają wtedy z oponami, więc postój trwa o ok. 7–9 s dłużej.
- **Samochód bezpieczeństwa i VSC:** po wypadkach, awariach AI i przy odłamkach. Pod SC kolejka bez wyprzedzania i restart na linii mety, pod VSC limit prędkości. DRS wraca dwa okrążenia po restarcie. Częstość awarii: wyłączone / rzadko / często.

## Multiplayer

**Menu → Multiplayer.** Jedna osoba tworzy lobby (publiczne albo prywatne), pozostali dołączają z listy albo kodem. Każdy wybiera zespół i kierowcę (także z kreatora), host ustawia dystans, pogodę, kwalifikacje, AI, SC, zużycie opon i uszkodzenia. Potem kwalifikacje online, wybór opon na start i wyścig.

- Lista lobby i łączenie graczy działają przez Supabase Realtime (projekt z `.env.example`), sam wyścig — bezpośrednio między przeglądarkami (WebRTC). Gdy połączenie bezpośrednie się nie uda, dane idą przez serwer rzadziej. Darmowy plan Supabase ma limit ok. 100 wiadomości na sekundę na projekt.
- Host prowadzi AI i dyrekcję wyścigu: nie przełączaj karty, gdy jesteś hostem (przeglądarka wstrzymuje wtedy grę).
- Wyścig online nie zatrzymuje się na pauzie. Gracz, który się rozłączy, oddaje bolid AI.
- Test na jednym komputerze: dodaj `?mp=local` do adresu i otwórz grę w dwóch kartach.

## Adaptacyjne spusty DualSense (PS5)

Działają w Chrome i Edge (WebHID), gdy gra jest otwarta z `localhost` albo `https`. W grze: **Ustawienia → Kontroler → „Połącz DualSense: adaptacyjne spusty"** i zgoda przeglądarki na dostęp do pada. Tam też włącznik, siła oporu i test spustów.

- **L2 (hamulec):** opór twardnieje w miarę wciskania jak pedał hamulca (mocniej przy dużej prędkości), drży przy pracy ABS, odbija przy blokowaniu kół.
- **R2 (gaz):** lekka sprężyna, szarpnięcie przy zmianie biegu w górę, drżenie na ograniczniku obrotów, przy buksowaniu, pracy kontroli trakcji, na żwirze, trawie i krawężnikach.

## Dźwięk silników

**Ustawienia → Dźwięk → Silniki:**

- **Klasyczny** (domyślnie, gdy nie ma paczki): dawny dźwięk gry — dwa oscylatory z filtrem, wysokość z obrotów, barwa z gazu. Słychać tylko własny bolid.
- **Własne nagrania**: nagrania silników w formacie `.bdl` wczytane z dysku gracza (niżej). Słychać własny bolid i do 4 najbliższych rywali, każdy z silnikiem swojego producenta, z odległością, kierunkiem i efektem Dopplera (najlepiej w kamerze telewizyjnej). Bez wczytanych nagrań gra dźwięk klasyczny.

Obroty: do 19 000 obr./min. Przełożenia są stałe, więc na każdym biegu obroty rosną liniowo z prędkością, a po zmianie w górę spadają o ok. 15–20%; skrzynia automatyczna zmienia bieg przy ok. 18 400. Diody na kierownicy i pasek obrotów zapalają się od ok. 15 000 obr./min.

## Własne nagrania silników (opcjonalnie)

Gra potrafi odtwarzać nagrania przemiatania obrotów silnika w formacie `.bdl`. **Gra nie zawiera żadnych nagrań** — każdy gracz wczytuje ze swojego dysku nagrania, do których ma prawa, a wybrany zestaw zostaje tylko w jego przeglądarce (IndexedDB). Nic nie jest nigdzie wysyłane, a `.gitignore` blokuje dodanie plików `.bdl` do gita.

1. **Ustawienia → Dźwięk → Wczytaj paczkę (ZIP lub .bdl)…** i wskaż plik ZIP (albo **Rozpakowany folder…**, albo same pliki `.bdl`).
2. Jeśli w plikach jest kilka zestawów, wybierz jeden i kliknij **Zainstaluj zestaw**.
3. Silniki: **Własne nagrania** włączają się same. Po ponownym uruchomieniu gry nagrania wczytują się z przeglądarki. **Usuń paczkę** kasuje je z przeglądarki.

Każdy producent silnika w grze (Ferro, Stella, Kaze, Renova) dostaje nagranie z pliku o odpowiadającej nazwie. Słychać też przerwę zapłonu przy zmianie biegu, przegazówkę przy redukcji, ogranicznik w alei, strzały z wydechu po odpuszczeniu gazu i wypadanie zapłonów przy uszkodzonym silniku; na polach startowych przy zapalonych światłach rywale trzymają obroty. Kto nie wczytał nagrań (np. drugi gracz w multiplayerze), słyszy dźwięk klasyczny.

**Maksymalne obroty brzmią jak maksymalne obroty nagrania:** jałowe (4500) to jałowe z nagrania, zmiana biegu skrzyni automatycznej (ok. 18 400) to sam koniec przemiatania na gazie, a od 18 800 (diody ogranicznika) i na ograniczniku (np. przy prędkości maksymalnej z DRS na 8. biegu) gra nagranie silnika na ograniczniku z końca przemiatania. Na gazie głośność rośnie z obrotami aż do maksimum — w niektórych nagraniach silnik przy samym ograniczniku cichnie, w grze nie. Z kamery za bolidem własny silnik gra ze stałą głośnością i bez efektu Dopplera (kamera przy dużej prędkości zostaje w tyle, ale silnik nie cichnie).

Jak to działa: plik `.bdl` to pakiet nagrań silnika. Każde nagranie to przemiatanie obrotów — z gazem (od jałowych do ogranicznika) i bez gazu (hamowanie silnikiem) z dwóch mikrofonów (przy wydechu i bliżej silnika) — z dokładnie oznaczonymi początkami cykli silnika (2 obroty wału). Gra odtwarza je syntezą ziarnistą: ziarna długości dwóch cykli wycięte wokół znaczników, co jeden cykl następne, z wysokością dopasowaną do obrotów. Kursor idzie po nagraniu cykl po cyklu i wahadłowo wokół miejsca o właściwych obrotach, więc dźwięk żyje i nie trzeszczy. Na ograniczniku i na jałowych gra w pętli stały zakres z końca nagrania (punkty pętli dobrane tak, by jej koniec gładko przechodził w początek). Gaz płynnie przenika między nagraniem z gazem i bez gazu, a w kokpicie słychać głównie mikrofon przy silniku. Odtwarzanie działa w osobnym wątku audio (AudioWorklet), gdy gra jest otwarta z `localhost` albo `https`; z innego adresu ten sam kod liczy się w wątku głównym.

Rozpakowanie ZIP w przeglądarce wymaga Chrome/Edge 103+, Safari 16.4+ albo Firefox 113+; w starszych rozpakuj ZIP i wskaż folder.

## Grafika 3D

Las złożony z czterech gatunków: szerokie drzewa liściaste (lipa, dąb), liściaste o koronie jajowatej (grab, buk), topole włoskie i świerki. Każde drzewo ma pień rozszerzony przy korzeniach, rozwidlenie na konary i koronę z kilkunastu kłębów liści (gałązki z liśćmi z atlasu tekstur, prześwity, przez które widać gałęzie, ciemniejsze wnętrze i spód korony); świerki mają piętra zwisających gałęzi. Drzewa kołyszą się na wietrze i są rysowane w trzech poziomach szczegółów: pełne blisko kamery (do 110 m na wysokiej jakości), uproszczone dalej (te same kłęby, mniej i większych kart) i najprostsze w oddali (kłąb liści albo sylwetka świerka). Poziom wybierany jest osobno dla każdego drzewa, więc granice są niewidoczne, a cienie rzucają tylko drzewa w zasięgu mapy cieni.

Trawa 3D na poboczach wokół kamery, asfalt z kruszywem i smugami gumy w strefach hamowania, żwir z otoczaków.

W kamerze z kokpitu (`C`) widać wnętrze wzorowane na współczesnym bolidzie z otwartymi kołami: kierownicę z dużym wyświetlaczem (bieg, prędkość, czasy, DRS, ERS, opony), rzędem diod obrotów, diodami flag (żółte przy neutralizacji, niebieskie przy DRS), kolorowymi przyciskami (N, +10, BW, PC, +1, PL, OK, BB±), jasnoniebieskimi rolkami pod kciukami i trzema pokrętłami z kolorowymi skalami, gumowe uchwyty i łopatki; dłonie w rękawicach skręcające razem z kierownicą i ręce w kombinezonie zespołu (łokcie zginają się przy skręcie); wannę kokpitu z panelami z wytłoczeniami, jasnoszarą poduszkę przed kolanami, przezroczystą owiewkę z zębami na przedniej krawędzi, panel przełączników i naklejki ostrzegawcze.

## Pliki

| Plik | Zawartość |
| --- | --- |
| `js/data.js` | zespoły, kierowcy, tory (oś, zakręty, rozkład: aleja, DRS, sektory, trybuny), kalendarz, opony, pogoda |
| `js/track.js` | geometria toru |
| `js/physics.js` | model jazdy bolidu |
| `js/session.js` | kwalifikacje i wyścig, przeciwnicy |
| `js/quali.js` | kwalifikacje Q1 · Q2 · Q3 |
| `js/pit.js` | aleja serwisowa, pit stopy, strategia AI |
| `js/racecontrol.js` | samochód bezpieczeństwa, VSC, awarie |
| `js/net.js`, `js/multi.js` | multiplayer: lobby, WebRTC, synchronizacja wyścigu |
| `js/career.js` | zapis gry, zespoły własne, tryb kariery |
| `js/render.js` | rozmieszczenie trybun, boksów, drzew i reklam dla sceny 3D, linia jazdy, minimapa |
| `js/sprites.js` | ikony bolidów, kasków i flag w menu i kreatorze |
| `js/car3d.js`, `js/world3d-lite.js`, `js/view3d.js`, `js/post3d.js` | widok 3D: bolid, tor, las (poziomy szczegółów), trawa, kamery, postprocessing |
| `js/trees3d.js` | drzewa 3D: atlas liści i kory, gatunki, daleki LOD, materiał z kołysaniem na wietrze |
| `js/cockpit3d.js` | wnętrze kokpitu (kierownica, wyświetlacz, diody, dłonie i ręce, wanna, poduszka, owiewka) |
| `js/audio.js` | dźwięk: silnik klasyczny, silniki z paczki (słuchacz w kamerze, rywale, odległość, Doppler) i efekty (Web Audio) |
| `js/engines.js` | odtwarzanie własnych nagrań silników (synteza ziarnista w AudioWorklecie, zapasowo w wątku głównym) |
| `js/enginepack.js` | wczytywanie własnych nagrań silników z dysku gracza (ZIP, `.bdl`), odczyt formatu, zapis w przeglądarce |
| `js/input.js` | pad, wibracje, adaptacyjne spusty DualSense (WebHID) |
| `js/keys.js` | przypisanie klawiszy (zapis w ciasteczku `wgp_keys`) |
| `js/game.js` | pętla gry |
| `serve.py`, `start.command`, `start.bat` | lokalny serwer bez pamięci podręcznej i uruchamianie z aktualizacją |
| `js/ui.js` | menu, HUD, kreator, ustawienia |
