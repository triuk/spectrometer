# Webový spektrometr – prototyp

Čistě webový prototyp pro USB kameru připojenou k optickému spektroskopu. Neobsahuje build systém ani externí knihovny.

## Spuštění

V této složce spusť lokální HTTP server:

```bash
python -m http.server 8000
```

Potom otevři `http://localhost:8000` v Chromiu. Při prvním použití může Chromium vyžádat oprávnění nebo výběr kamery. Aplikace si následně uloží `deviceId` zvolené kamery a při dalších spuštěních ji otevře přímo, dokud zůstane identifikátor platný.

## Automatický režim kamery

Po stisknutí **Spustit kameru** aplikace postupně zkouší:

1. 1920 × 1080 při přesně 5 fps — cílový režim;
2. 1920 × 1080 s nejbližší dostupnou snímkovou frekvencí;
3. 1280 × 960 přibližně při 6 fps;
4. 1280 × 720 přibližně při 9 fps;
5. automatický režim zvolený Chromiem.

Cílový režim je označen zeleně. Jakýkoli náhradní režim je označen oranžově. Panel vždy uvádí skutečné rozlišení a FPS z `MediaStreamTrack.getSettings()`.

Chromium neuvádí, zda vstupní V4L2 stream používá YUYV nebo MJPEG. Pole **Pixelový formát / komprese** proto zobrazuje, že hodnotu nelze zjistit, namísto nespolehlivého odhadu.

## Funkce

- automatický výběr nejlepšího dostupného režimu snímání;
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

- Webová API neodhalují vstupní V4L2 pixelový formát ani kompresi.
- Dostupnost jednotlivých ovládacích prvků závisí na kombinaci kamery, ovladače a prohlížeče.
- Hodnoty získané přes `<video>` a `<canvas>` jsou již zpracované kamerou/prohlížečem a nejsou RAW hodnotami senzoru.
- Kalibrace je zatím pouze lineární a dvoubodová.
- Prototyp nebyl validován jako metrologický software.

## Doporučený test

1. Spusť kameru a zkontroluj zelený nebo oranžový panel režimu.
2. Přepni expozici a white balance do manuálního režimu.
3. Zkontroluj skutečné hodnoty v diagnostice.
4. Vyber vodorovný pás obsahující spektrum.
5. Bez světla zachyť pozadí.
6. Nastav kalibrační body a exportuj CSV.
