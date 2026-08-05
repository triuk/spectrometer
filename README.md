# Webový spektrometr

Webová aplikace pro kamerový **Little Garden Spectrometer**. Běží přímo v Chromiu a převádí obraz z USB kamery na spektrální křivku.

## Funkce

- živý náhled a výběr oblasti měření (ROI);
- zobrazení R, G, B a jasového spektra;
- ruční nastavení kamery a jednorázová SW optimalizace expozice;
- průměrování snímků a odečet tmavého spektra;
- dvoubodová kalibrace pixel–vlnová délka;
- export CSV a uložení snímku PNG.

## Spuštění

Aplikace je ve složce [`prototype/`](prototype/) a nasazuje se přes GitLab Pages.

Pro lokální spuštění:

```bash
python -m http.server 8000 -d prototype
```

Potom otevřete `http://localhost:8000` v Chromiu. Přístup ke kameře vyžaduje HTTPS nebo `localhost`.

## Poznámky

Kamera při měření používá pevné ruční nastavení. Jas, kontrast, saturace, ostrost a vyvážení bílé se během měření nemají měnit, protože by ovlivnily tvar nebo intenzitu spektra.

Chromium nezpřístupňuje použitý V4L2 pixelový formát ani všechny interní úpravy obrazu ve firmwaru kamery. Projekt je zatím prototyp a výsledky je nutné ověřovat kalibrací a referenčními měřeními.

Referenční zdrojové kódy jsou ve složce `externalSources/` a nemají se upravovat.