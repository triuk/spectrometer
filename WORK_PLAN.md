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
- [ ] Profily a společné výpočty.
- [ ] Výhradní operace a rušení.
- [ ] Platnost měření a nové snímky.
- [ ] Jednotná inicializace.
- [ ] Jediný renderer bez pollingu.
- [ ] Integrační ověření a dokumentace.
