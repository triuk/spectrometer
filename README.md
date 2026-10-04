# Webový spektrometr

Webová aplikace pro kamerový **Little Garden Spectrometer**. Běží přímo v Chromiu a převádí obraz z USB kamery na spektrální křivku.

## Pokračování vývoje

Pro nové ChatGPT/Codex vlákno nejdřív přečti [AGENTS.md](AGENTS.md) a potom aktuální [HANDOFF.md](HANDOFF.md). Handoff obsahuje pracovní větev/PR, architektonická rozhodnutí, naměřené chování kamery a expozice, známý technický dluh a seznam věcí k ověření na reálném HW.

## Funkce

- živý náhled a výběr oblasti měření (ROI);
- profily konkrétních spektrometrů s kamerou, ROI a kalibrací;
- zobrazení R, G, B a jasového spektra;
- ruční nastavení kamery a jednorázová SW optimalizace expozice;
- průměrování skutečně nových snímků a odečet pozadí při shodných podmínkách měření;
- dvoubodová kalibrace pixel–vlnová délka;
- export CSV, profilu JSON a snímku PNG.

## Spuštění

Aplikace je ve složce [`prototype/`](prototype/) a nasazuje se přes GitLab Pages.

Pro lokální spuštění:

```bash
python -m http.server 8000 -d prototype
```

Potom otevřete `http://localhost:8000` v Chromiu. Přístup ke kameře vyžaduje HTTPS nebo `localhost`.

Vestavěné profily jsou v `prototype/configs/`. U výchozího LGS profilu je potvrzeno obrácené snímání spektra na ose X kamery, proto se používá zrcadlená spektrální souřadnice senzoru `x_spectrum = width - 1 - x_raw`. Náhled kamery se zobrazuje ve stejné orientaci jako graf, takže levá strana náhledu odpovídá levé straně spektra. ROI a kalibrační pixely v profilu používají tento spektrální systém; raw souřadnice kamery zůstávají jen uvnitř akviziční vrstvy. Uživatelské profily lze importovat/exportovat jako JSON; vazba profilu na konkrétní USB kameru se ukládá jen lokálně v prohlížeči.

Kamera při měření používá pevné ruční nastavení. Jas, kontrast, saturace, ostrost a vyvážení bílé se během měření nemají měnit, protože by ovlivnily tvar nebo intenzitu spektra.

Chromium nezpřístupňuje použitý V4L2 pixelový formát ani všechny interní úpravy obrazu ve firmwaru kamery. Projekt je zatím prototyp a výsledky je nutné ověřovat kalibrací a referenčními měřeními.

Referenční zdrojové kódy jsou ve složce `externalSources/` a nemají se upravovat.


## Platnost měření

Optimalizace, diagnostika, změny parametrů a spuštění kamery mají výhradní přístup ke kameře. Zastavení nebo odpojení ruší čekající operace; čekání na nový snímek má časový limit. Kamera zahájí měření až po aplikaci a ověření ručního profilu a příchodu nových snímků.

ROI se potvrzuje při dokončení výběru. Změna ROI, režimu snímání nebo obrazových parametrů ruší dosavadní průměr i pozadí. CSV obsahuje podmínky skutečně zpracovaných snímků.

Kalibrace je vázaná na rozlišení (`calibration.captureMode`). Při náhradním rozlišení se automaticky neškáluje: graf přejde na pixely. Zadejte odpovídající kalibrační body a stiskněte **Použít kalibraci pro tento režim**. Profil exportovaný z náhradního režimu uchová původní rozlišení kalibrace a její neaktivní stav.

uPlot 1.6.32 je přibalený v `prototype/vendor/` s MIT licencí. Graf nevyžaduje CDN a při jeho chybě funguje Canvas fallback. Vykresluje se pouze aktivní varianta.

## Vývoj a testy

Plán a stav logických commitů: [WORK_PLAN.md](WORK_PLAN.md).

```bash
npm test
npm run test:browser
```

Testy nepotřebují instalovat npm balíčky. Node testy ověřují numerické výpočty, migraci/validaci profilů a řízení operací. Integrační test spustí lokální HTTP server a headless Chromium se simulovanou kamerou; ověřuje i skutečný uPlot, PNG/CSV export a odpojení. Ověřené prostředí: Node 26.8.2 a Chromium 153.0.8010.36. Cestu k jinému Chromiu lze zadat proměnnou `SPECTROMETER_CHROMIUM`.

Simulace neověřuje expoziční odezvu, geometrii ani USB připojení skutečného USB-ZH. Praktické kroky jsou v handoffu.
