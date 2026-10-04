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

Ověření po dodatečné kontrole: 15 Node testů, 24 browser kontrol, syntaxe modulů, čistý diff. USB-ZH není dostupný; praktická kontrola zůstává uvedená v HANDOFF.md. Na následnou výslovnou žádost uživatele byly změny pushnuty a nasazeny přes stávající GitHub mirror a GitLab Pages; implementační commit `5fd54a7` a odkazy na úspěšné pipeline jsou zaznamenané v HANDOFF.md.

## Dodatečná kontrola před push a deploymentem

8. `fix: close camera cancellation and measurement gaps found in review` – opravy potvrzené regresními testy a aktualizace handoffu.

- [x] Zrušit i čekání na enumeraci zařízení; nespouštět žádost o oprávnění po Stop.
- [x] Zavřít stream doručený po timeoutu, i když volající mezitím pokračoval fallbackem.
- [x] Po timeoutu nativního nastavení formátu zavřít track; nepřekrývat jej fallback požadavkem.
- [x] Přerušení právě probíhajícího `applyConstraints` ukončí track, aby opožděná změna nepřepsala obnovenou expozici.
- [x] Stop kamery ruší také obnovu expozice; běžné zastavení diagnostiky během čekání na snímky expozici obnoví a kameru zachová.
- [x] Výběr ROI blokuje optimizer, diagnostiku a ruční změny v UI i v jejich vstupních funkcích.
- [x] Známý automatický režim není přijat jako ruční měření ani při neúplných capabilities.
- [x] Export profilu odmítá neúplné kalibrační body; shrnutí diagnostiky se po dokončení zobrazí.

Původní browser testy prošly před kontrolou. Nové regresní kontroly nejprve zachytily chyby v ROI, enumeraci, timeoutu formátu, přerušení/obnově expozice, automatických režimech a prázdném kalibračním pixelu; po opravách všechny procházejí.
