# Webový spektrometr – prototyp

Čistě webový prototyp pro převod obrazu z USB kamery na živou spektrální křivku.

## Spuštění

Adresář `prototype/` je publikován přes GitLab Pages. Pro lokální spuštění lze použít například:

```bash
python -m http.server 8000 -d prototype
```

Potom otevřete `http://localhost:8000` v Chromiu.

## Kamera

Tlačítko **Spustit kameru** automaticky zkouší cílový režim 1920 × 1080 při 5 fps a poté náhradní režimy. Skutečné rozlišení a FPS se čtou zpět přes `MediaStreamTrack.getSettings()`.

Chromium nezpřístupňuje, zda V4L2 používá YUYV nebo MJPEG, proto aplikace pixelový formát neodhaduje.

## Nastavení obrazu

- **Automaticky** zapne průběžnou automatickou expozici a automatické vyvážení bílé.
- **Ručně** umožní nastavit expoziční čas a teplotu bílé.
- Poslední ruční hodnoty se pamatují pouze po dobu otevření stránky; nepřenášejí se přes reload.
- Při návratu na automatiku aplikace nejdřív vyčistí staré ImageCapture constraints a potom nastaví `exposureMode: continuous` a `whiteBalanceMode: continuous`.
- Jas, kontrast, saturace a ostrost jsou samostatné korekce obrazu.

UVC/V4L2 ovladač nebo firmware kamery může fyzické hodnoty uchovávat i po zavření stránky. Webová aplikace proto při každém novém spuštění výslovně požaduje automatický režim.

## Zpracování

- výběr ROI tažením myši;
- výpočet R/G/B a jasového spektra po sloupcích;
- klouzavé průměrování;
- zachycení a odečet tmavého spektra;
- lineární dvoubodová kalibrace pixel → nm;
- CSV export a uložení aktuálního snímku.

## Omezení

Přesný algoritmus automatické expozice a vyvážení bílé běží ve firmwaru nebo ovladači kamery. Prohlížeč může požadovat režim a číst jeho hlášený stav, ale nemůže řídit vlastní výpočet automatiky ani zaručit pixelový formát V4L2.
