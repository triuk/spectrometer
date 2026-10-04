# HANDOFF – webový Little Garden Spectrometer

Tento soubor je určený pro další ChatGPT/Codex vlákno, které má pokračovat ve vývoji bez znalosti předchozí konverzace.

## Kde se pracuje

- Repozitář: `triuk/spectrometer`
- Aktivní vývojová větev: `agent/web-spectrometer-prototype`
- Draft PR: **#1 – Add browser spectrometer prototype and GitLab Pages deployment**
- Webová aplikace je v `prototype/`.
- `externalSources/` je referenční a nemá se upravovat bez výslovného požadavku.
- `AGENTS.md` obsahuje základní zadání projektu a referenční zdroje; neměň ho bez výslovného požadavku uživatele.
- Deployment se řeší odděleně. Bez výslovného požadavku neupravuj:
  - `.github/workflows/mirror-to-gitlab.yml`
  - `.gitlab-ci.yml`

## Poslední nasazení

Uživatel 4. října 2026 výslovně požádal o push a deploy po dodatečné kontrole kódu.

- Implementační commit: `5fd54a738a8416753722a94eaa6a39f0d543801b` na `agent/web-spectrometer-prototype`, pushnutý do `triuk/spectrometer`.
- [GitHub mirror](https://github.com/triuk/spectrometer/actions/runs/37192029704) uspěl a GitLab větev obsahuje stejné SHA.
- [GitLab Pages pipeline](https://gitlab.com/lab-devices/spectrometer/-/pipelines/2910603350) i `deploy-pages` uspěly pro toto SHA.
- Živá aplikace: https://spectrometer-f57060.gitlab.io/ (standardní https://lab-devices.gitlab.io/spectrometer/ na ni přesměruje).
- Všech 28 zveřejněných souborů prototypu odpovídá ověřenému commitu. Čisté headless Chromium načetlo výchozí profil i uPlot bez JS či HTTP chyb a bez spuštění kamery. Kamera USB-ZH nebyla při nasazení dostupná; praktické HW ověření níže zůstává neprovedené.

Push používá stávající SSH přístup do stejného GitHub repozitáře. HTTPS CLI přihlášení v této relaci není dostupné; konfigurace originu nebyla trvale změněna.

## Cíl

Čistě webová aplikace HTML/CSS/JS pro ovládání a měření s kamerovým Little Garden Spectrometerem v Chromiu. Inspirace a referenční implementace jsou popsány v `AGENTS.md`.

## Cílová kamera / hardware

Ověřená kamera spektrometru:

- Linux/V4L2 název: `USB 2.0 Camera: USB-ZH`
- USB ID: `0c68:6464` – Sonix Technology Co., Ltd.
- ovladač: `uvcvideo`
- typicky vytváří dva video nody a media node; konkrétní `/dev/videoX` není stabilní
- kamera nemá sériové číslo (`Serial:` je prázdné)
- profil požaduje `1920 × 1080 @ 5 fps`
- V4L2 při poslední kontrole na `/dev/video2` hlásil 1920×1080 MJPG a defaultně 30 fps; aplikace následně aplikuje vlastní capture constraints
- Chromium negarantuje ani nezpřístupňuje, zda reálně používá MJPEG nebo YUYV

Důsledek chybějícího sériového čísla: po přesunutí kamery do jiného USB portu nebo za hub se může změnit browserový `deviceId`. `deviceId` proto **není identita spektrometru**.

`prototype/camera.js` nyní postupuje takto:

1. zkusí lokálně uložené `deviceId` pro daný profil;
2. ověří, že otevřený track odpovídá `camera.labelContains` (výchozí `USB-ZH`);
3. pokud ne, provede `enumerateDevices()` a hledá kameru podle labelu;
4. pokud browser kvůli oprávnění labely ještě skrývá, dočasně otevře kameru, znovu enumeruje a teprve potom hledá profilovou kameru;
5. nalezené nové `deviceId` znovu uloží lokálně.

Toto bylo doplněno kvůli situaci, kdy kamera po připojení přes USB hub byla v Linuxu normálně dostupná, ale web používal staré `deviceId` a padal na výchozí HP kameru.

## Profily spektrometrů

Vestavěné profily jsou v `prototype/configs/`; výchozí je `lgs-default.json`.

Profil obsahuje zejména:

- preferovanou kameru, rozlišení a FPS;
- `sensorOrientation.flipX`;
- ROI;
- lineární kalibrační body pixel → nm;
- pevné parametry kamery;
- horní limit expozice;
- model SW optimalizace expozice.

Lokální profily se ukládají do `localStorage` pod `spectrometer.instrumentProfiles`. Tlačítko **Uložit aktuální** nevytváří soubor. **Export JSON** vytvoří přenositelný soubor.

Browserový `deviceId` se do přenositelného profilu záměrně neukládá.

Serverové ukládání profilů bylo diskutováno, ale **není implementované**. GitLab Pages je statický hosting. Pro budoucí Raspberry Pi nasazení dává smysl malé REST API a zapisovat runtime profily do odděleného `data/profiles/`, ne do git-tracked `prototype/configs/`.

## Souřadnice a orientace spektra

Na reálném LGS bylo potvrzeno, že spektrum je na X senzoru snímáno obráceně.

Platí:

`x_spectrum = width - 1 - x_raw`

Výchozí profil má:

`sensorOrientation.flipX: true`

Důležitý invariant:

**co uživatel vidí vlevo v Náhledu kamery, musí odpovídat tomu, co vidí vlevo ve Spektru.**

Proto:

- náhled `<video>` je vizuálně zrcadlen;
- profilová ROI a kalibrační pixely používají spektrální souřadnice;
- `state.roi` za běhu zůstává v raw souřadnicích kamery, protože ho přímo používají `getImageData()`, optimalizátor expozice a expoziční diagnostika;
- výběr ROI v náhledu převádí display/spektrální X → raw X;
- overlay převádí raw ROI → display/spektrální X;
- uPlot, kalibrace a detekované píky používají spektrální pixely;
- CSV je řazené podle opraveného `sensor_pixel` a obsahuje také `raw_sensor_pixel`;
- uložený PNG snímek má stejnou orientaci jako náhled.

Při změnách kolem ROI nikdy nemíchej význam `state.roi.x` s profilovým `roi.x`.

## Kamera při měření

Záměr je opakovatelné měření, nikoli průběžná automatika kamery:

- expozice: ruční;
- white balance: ruční;
- brightness/contrast/saturation/sharpness: pevné hodnoty z profilu;
- SW optimalizace expozice se spustí jednorázově a výslednou expozici potom uzamkne.

Důvod: WB mění poměry kanálů, brightness offset, contrast převodní funkci, saturation RGB poměry a sharpening tvar spektrálních čar.

Výchozí WB 4600 K je praktický pevný bod vycházející z defaultu kamery, nikoli radiometrická kalibrace.

## Expozice – důležité naměřené chování

V4L2 `exposure_time_absolute` používá jednotky 100 µs.

Příklady:

- 1 = 0,1 ms
- 157 = 15,7 ms
- 1800 = 180 ms

Při 5 fps je perioda snímku 200 ms, proto je profilový horní limit pro měření **1800 = 180 ms**.

Na celé expozici 1–1800 byl proveden diagnostický sweep s krokem **5**, nahoru i dolů. Výsledek:

- velké poklesy intenzity nejsou náhodné;
- objevují se deterministicky na hranicích po **32 expozičních jednotkách**;
- mezi těmito hranicemi je odezva prakticky monotónní;
- sweep nahoru a dolů byl téměř shodný, tedy nejde primárně o hysterézi;
- typický velký reset byl např. kolem 251 → 256;
- pevné čekání 650 ms nebylo hlavní příčinou skoků, ale bylo příliš hraniční;
- z diagnostiky vyšlo ustálení přibližně kolem 0,84 s po dokončení `applyConstraints()` (záleží na bodu).

Výchozí LGS profil proto používá:

```json
"exposureOptimization": {
  "model": "piecewise-monotonic",
  "discontinuityPeriod": 32,
  "discontinuityOrigin": 0,
  "freshFrames": 5,
  "sampleFrames": 3
}
```

`prototype/exposure-optimizer.js`:

- nehledá globálně přes celou nespojitou křivku;
- testuje bezpečné konce monotónních úseků `31, 63, 95, ...`;
- vybere první úsek schopný dosáhnout cílové intenzity;
- uvnitř něj dolaďuje expozici;
- po každé změně čeká přes `requestVideoFrameCallback()` na nové snímky;
- standardně vezme 5 nových snímků a používá medián posledních 3.

Cíl je přibližně 220/255, přijatelné pásmo je v kódu 205–232.

### Diagnostika expozice

`prototype/exposure-diagnostics.js` je záměrně analytický nástroj bez optimalizačních předpokladů.

Umí sweep nahoru/dolů/oběma směry a export JSON/CSV. Pro každý bod ukládá raw průběh nových snímků, requested/actual exposure, čas od změny, RGB maxima, celkové maximum, mean luminance, saturaci a informaci o ustálení.

Při dalších problémech s expozicí nejprve použij tento nástroj, ne další heuristiku naslepo.

Poznámka: V4L2 `exposure_dynamic_framerate` byl na zařízení pozorován jako 1. Čistý web tento vendor/V4L2 parametr neumí přímo řídit. Při potřebě externího Linux nastavení lze použít např. `v4l2-ctl`; neimplementuj to do browser JS jako domnělý MediaTrackConstraint.

## Graf spektra

Interaktivní graf je v `prototype/uplot-spectrum.js` a používá **uPlot 1.6.32** přibalený v `prototype/vendor/uplot-1.6.32/` včetně MIT licence. CDN není potřeba.

Funkce:

- zoom X tažením;
- kolečko = zoom kolem kurzoru;
- Shift+kolečko / Shift+drag / prostřední tlačítko = pan;
- dvojklik nebo Reset zoomu = celý rozsah X;
- Y se automaticky škáluje podle aktuálně viditelného rozsahu X a zapnutých kanálů;
- crosshair/tooltip;
- spektrální barevný pás podle kalibrované vlnové délky;
- detekce lokálních píků;
- kliknutí na pík pro kalibrační Pixel 1/2;
- peak labely se u hranic posouvají dovnitř grafu.

Detekce píků je zatím na **luminance**. Pokud budou důležité úzké červené/modré čáry, možné budoucí rozšíření je volba `luminance / max RGB / vybraný kanál`.

Canvas graf v `spectrum.js` zůstává jako fallback při chybě načtení nebo vykreslení uPlotu. Aktivní je vždy pouze jeden renderer.

## Aktuální architektura (4. října 2026)

Bylo provedeno osm bodů code review podle [WORK_PLAN.md](WORK_PLAN.md). User výslovně schválil i refaktor; původní doporučení odložit jej do HW kontroly tím bylo překonáno. **Skutečný USB-ZH v této relaci nebyl připojen** (`/dev/video*` chyběly). Výsledky níže jsou softwarové kontroly a simulace, ne nové měření přístroje.

- `camera.js` má jedinou posloupnost: výběr kamery → formát → video metadata → profil/ROI/kalibrace → pevné ruční parametry → ověření skutečných hodnot → nové snímky → měření. Track `ended`, Stop, nečekaná změna rozlišení nebo nepotvrzené nastavení ukončí akvizici.
- `camera-operations.js` poskytuje výhradní operace a AbortController. Optimalizace, diagnostika, start a ruční změna se nesmějí překrývat. Neúspěšná operace uvolní zámek; opožděný stream po zrušeném startu nebo timeoutu se zavře. Stop ruší i čekání na enumeraci zařízení. Po timeoutu nastavení formátu se track zavře, protože původní nativní požadavek může ještě běžet.
- `camera-constraints.js` odděluje ImageCapture parametry od formátu, respektuje krok capabilities a profilový limit, ověřuje readback. Ruční změna a start čekají na profilový počet čerstvých snímků. Známý automatický režim se odmítá i při chybějících capabilities. Diagnostika obnovuje původní expozici před uvolněním zámku. Pokud uživatel přeruší právě běžící nativní `applyConstraints`, kamera se ukončí a je nutné ji znovu spustit: toto API nemá nativní zrušení a souběžný restore by mohl být přepsán opožděnou změnou. Zastavení diagnostiky během čekání na snímky expozici obnoví a kameru zachová; Stop kamery ruší také obnovu.
- `video-frames.js` čeká na nový snímek s timeoutem/abortem a ruší callback/listenery. Fallback kontroluje posun `currentTime`.
- `spectrum.js` zpracovává jedinečné video snímky. Interval je omezení výpočtu, nikoli generátor vzorků. Rozpracovaná ROI je v `state.pendingRoi`; měřicí `state.roi` se změní až při dokončení výběru. Pointer cancel výběr zahodí. Během výběru jsou optimizer, diagnostika a ruční změny blokované v UI i ve vstupních funkcích.
- `measurement-context.js` identifikuje podmínky: relaci, kameru/profil, rozlišení, raw ROI, orientaci a obrazové parametry. Historie a pozadí platí pouze pro shodné podmínky. Export používá snapshot podmínek zpracovaných snímků, ne pozdější nastavení kamery.
- `spectrum-model.js` sdílí numerické výpočty, kalibraci, odečet pozadí, souřadnice a CSV mezi grafy/exportem.
- `profile-schema.js` striktně validuje čísla, rozměry, ROI, právě dva odlišné lineární kalibrační body a expoziční model; zachovává známé migrace raw → spectral.
- Kalibrace obsahuje `calibration.captureMode: {width,height}` a volitelný `valid`. Starší profily zdědí referenční rozměry z `camera`. Při náhradním rozlišení zůstávají body původní, ale osa přejde na pixely. Nové body musí uživatel potvrdit pro aktuální režim. Stejné rozlišení samo o sobě neprokazuje nezměněnou optickou geometrii.
- `instrument-profiles.js` už kameru nepolluje. Aktivace jiného profilu za běhu restartuje kameru; během operace/výběru ROI jsou akce profilu blokované. Export zachovává i nulové pevné parametry a odmítá neúplné kalibrační body místo převodu prázdného pixelu na nulu.
- `image-settings.js` pouze synchronizuje ruční UI pomocí událostí. Nemění režim automaticky. Globální patch `MediaStreamTrack.prototype` a staré automatické/duplicitní moduly byly odstraněny.
- `exposure-model.js` zachovává 32bodové úseky a jejich bezpečné konce, včetně kamer s krokem větším než 1. Samotný piecewise optimalizátor zůstává jednorázový.
- `uplot-spectrum.js` dostává data přímo, nepolluje. Canvas nekreslí při aktivním uPlotu; při Stop se graf vymaže. Globální obsluhy interakcí se při zničení grafu odstraní. Sestupná kalibrace používá sestupnou osu, aby náhled a graf zachovaly stejnou stranu.

## Ověření a zbývající omezení

- `npm test`: 15 regresních kontrol (souřadnice/ROI, migrace a vadné profily, RGB/průměr/pozadí, kalibrace/CSV, 32bodové úseky a krok, identita měření, výhradní operace, abort/timeout/fallback snímků, úklid opožděného streamu a odmítnutí již zrušené žádosti).
- `npm run test:browser`: 24 integračních kontrol se simulovanou kamerou v **Chromiu 153.0.8010.36**. Ověřené byly rediscovery, ruční start, limit expozice, nové snímky, pozadí/ROI, dokončený optimizer, diagnostika/obnova, CSV/PNG, fallback kalibrace, opožděné oprávnění, skutečný uPlot/zoom/píky/kalibrační výběr, sestupná osa, Stop/odpojení, odmítnuté nastavení, permission probe a import/export profilu. Dodatečné kontroly pokrývají blokování operací během ROI, zrušenou enumeraci, opožděné nativní změny formátu/parametrů, oba způsoby zastavení diagnostiky, Stop během obnovy, neúplné capabilities, neúplný export kalibrace a viditelné shrnutí diagnostiky.
- Node: **26.8.2**; testy nepotřebují npm závislosti. Browser runner používá lokální HTTP server a CDP. `SPECTROMETER_CHROMIUM` určuje binárku, `SPECTROMETER_SCREENSHOT` volitelný PNG snímek UI.
- Syntaxe aktivních JS modulů a `git diff --check` byly ověřeny.
- Expoziční maxima, 32bodová odezva, ustálení, fyzická orientace a USB topologie nebyly nově ověřeny. Dřívější naměřené údaje výše zůstávají referencí.
- Stejné labely několika kamer bez sériového čísla nelze automaticky považovat za jednoznačnou identitu. Matching pravidla zůstávají původní; toto vyžaduje praktické rozhodnutí při rozšíření na více přístrojů.
- Jasové píky, dvoubodová kalibrace a serverové ukládání profilů mají původní rozsah; radiometrická kalibrace ani backend nebyly přidány.

## Co je potřeba ověřit na reálném HW

Nejbližší praktické ověření:

1. připojit USB-ZH přes USB hub;
2. otevřít GitLab Pages a spustit kameru;
3. potvrdit, že aplikace sama znovu najde `USB-ZH` i po změně browserového `deviceId`;
4. potvrdit 1920×1080 @ 5 fps;
5. vybrat úzkou ROI vlevo a vpravo a ověřit, že stejná strana odpovídá grafu;
6. spustit SW optimalizaci expozice a ověřit stabilní výsledek bez přeskakování mezi 32bodovými segmenty;
7. zkontrolovat, že Y autoscale a peak labely fungují při živém spektru i zoomu.

Pokud selže výběr kamery, nejdřív porovnej:

- `v4l2-ctl --list-devices`
- `navigator.mediaDevices.enumerateDevices()`
- `track.label`
- uložené browserové `deviceId`

a až potom měň matching logiku.
