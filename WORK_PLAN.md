# Plán práce – spolehlivost webového spektrometru

Výchozí revize: `396231f`, větev `agent/web-spectrometer-prototype`.
Rozsah: osm bodů schváleného code review. Referenční zdroje, AGENTS a deployment se nemění.

## Logické commity

1. `docs: record measurement reliability work plan` – plán, způsob ověření a omezení.
2. `fix: validate instrument profiles and share spectrum calculations` – validace/migrace profilů, čisté výpočty a regresní testy.
3. `fix: serialize camera operations and cancel stalled frame waits` – výhradní operace, timeout/abort, optimalizátor a diagnostika.
4. `fix: bind measurements to fresh frames and capture conditions` – nové snímky, atomická ROI, historie/pozadí, kalibrace a export.
5. `refactor: initialize one explicit manual measurement pipeline` – lifecycle kamery a profilu, explicitní UI, odstranění aktivních legacy vrstev a pollingu kamery.
6. `perf: publish spectrum updates to one active renderer` – sdílená data, přímé aktualizace grafu a funkční Canvas fallback.
7. `test: verify browser measurement lifecycle and document handoff` – integrační kontroly v Chromiu, dokumentace a konečný stav plánu.

## Invarianty

- Runtime ROI je raw; profil, náhled, graf a kalibrace používají spektrální souřadnice.
- Kamera měří s pevnými ručními parametry. Optimalizátor zůstává jednorázový a zachovává doložené 32bodové úseky.
- Historie ani pozadí se nesmějí přenášet mezi různými podmínkami měření.
- Změna rozlišení nezaručuje stejnou geometrii obrazu; kalibrace se proto automaticky neškáluje.
- Stop/odpojení nesmí ponechat čekající úlohu ani dovolit staré úloze měnit novou kameru.

## Ověření

- Node test runner bez dalších balíčků: souřadnice, profily, výpočty/CSV, expozice, souběh a abort/timeout.
- Chromium: skutečný Canvas/DOM, simulovaný MediaStreamTrack a video snímky, lifecycle, ROI, pozadí, fallback a graf.
- Kontrola syntaxe všech aktivních JS modulů a čistoty diffu.
- USB-ZH není při zahájení dostupný (`/dev/video*` chybí). Praktické ověření USB rediscovery, orientace a expozice bude uvedeno jako neprovedené; testy jej nenahrazují.

## Stav

- [x] Plán a kontrola výchozí větve / hardwaru.
- [x] Profily a společné výpočty.
- [x] Výhradní operace a rušení.
- [x] Platnost měření a nové snímky.
- [x] Jednotná inicializace.
- [x] Jediný renderer bez pollingu.
- [x] Integrační ověření a dokumentace.


## Výsledek

Všech osm bodů bylo provedeno. uPlot stejné verze je nově přibalený s licencí, aby graf i testy fungovaly bez CDN. Integrační ověření zahrnuje reálný Canvas a uPlot, simulované snímky/tracky a import/export. Opraveny byly také regresním testem zachycené nulové hodnoty při exportu zastaveného profilu, nepřijetí constraints a orientace při sestupné kalibraci.

Ověření: 12 Node testů, 16 browser kontrol, syntaxe modulů, čistý diff. USB-ZH není dostupný; praktická kontrola zůstává uvedená v HANDOFF.md. Změny jsou pouze lokální commity; push a deployment nebyly součástí zadání.
