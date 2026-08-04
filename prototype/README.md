# Webový spektrometr – prototyp

Čistě webový prototyp pro USB kameru připojenou k optickému spektroskopu. Neobsahuje build systém ani externí knihovny.

## Spuštění

V této složce spusť lokální HTTP server:

```bash
python -m http.server 8000
```

Potom otevři `http://localhost:8000` v Chromiu. Po stisknutí **Spustit kameru** vyber požadovanou kameru v dialogu prohlížeče.

## Funkce

- požadavek na rozlišení a snímkovou frekvenci;
- živý náhled kamery;
- výběr oblasti spektra tažením myší;
- průměrování pixelů ve svislém směru;
- R, G, B a jasové spektrum;
- klouzavé průměrování více snímků;
- zachycení a odečet tmavého spektra;
- lineární dvoubodová kalibrace pixel → nm;
- živý graf a detekce maxima;
- export CSV s metadaty a uložení PNG;
- diagnostika `getSettings()` a `getCapabilities()`;
- dynamické ovládání parametrů, které kamera zpřístupní prohlížeči, například ruční expozice, white balance, jas, kontrast, saturace a ostrost.

## Známá omezení

- Chromium vybírá kameru a způsob snímání. Webová aplikace neumí zaručit V4L2 formát YUYV místo MJPEG.
- Dostupnost jednotlivých ovládacích prvků závisí na kombinaci kamery, ovladače a prohlížeče.
- Hodnoty získané přes `<video>` a `<canvas>` jsou již zpracované kamerou/prohlížečem a nejsou RAW hodnotami senzoru.
- Kalibrace je zatím pouze lineární a dvoubodová.
- Prototyp nebyl validován jako metrologický software.

## Doporučený test

1. Spusť kameru v režimu 1920 × 1080 a 5 fps.
2. Přepni expozici a white balance do manuálního režimu.
3. Zkontroluj skutečné hodnoty v diagnostice.
4. Vyber vodorovný pás obsahující spektrum.
5. Bez světla zachyť pozadí.
6. Nastav kalibrační body a exportuj CSV.
