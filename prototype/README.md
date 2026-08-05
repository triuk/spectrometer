# Webový spektrometr – prototyp

Prototyp běží přímo v prohlížeči a používá kameru USB-ZH jako zdroj obrazu.

## Snímání

Aplikace se snaží otevřít kameru v režimu 1920 × 1080 při 5 fps. Pokud cílový režim není dostupný, vyzkouší náhradní profily. Chromium nezpřístupňuje použitý V4L2 pixelový formát, proto aplikace neumí potvrdit YUYV nebo MJPEG.

## Nastavení obrazu

Kamera při měření běží vždy v pevném ručním režimu. Hardwarová automatická expozice ani automatické vyvážení bílé se nepoužívají a v rozhraní už není přepínač Auto/Ručně.

Po spuštění se nastaví pevné parametry vhodné pro opakovatelné měření:

- ruční expozice;
- ruční vyvážení bílé 4600 K;
- jas 0;
- kontrast 32;
- saturace 50;
- ostrost 1.

Jas, kontrast, saturace a ostrost nejsou v běžném rozhraní dostupné. Jejich změny by ovlivňovaly intenzity, poměry barevných kanálů nebo tvar spektrálních čar.

### Optimalizovat expozici (SW)

Samostatné tlačítko spustí jednorázovou softwarovou optimalizaci pouze expozičního času:

1. změří maximum barevných kanálů ve vybrané ROI;
2. iterativně mění ruční expoziční čas;
3. snaží se dostat maximum přibližně do rozsahu 205–232 z 255;
4. po dosažení cíle expozici uzamkne.

Optimalizace neběží průběžně, aby se během měření neměnilo měřítko intenzity. Při změně zdroje nebo optické sestavy ji lze spustit znovu.

## Spektrum

- výběr ROI tažením přes náhled;
- zobrazení R, G, B a jasového průběhu;
- průměrování více snímků;
- odečet tmavého spektra;
- dvoubodová kalibrace pixel–vlnová délka;
- export CSV a uložení snímku PNG.

Tmavé spektrum se při změně expozice ruší, protože po změně expozičního času už není platné.

## Spuštění

Prohlížeč musí stránku načítat v bezpečném kontextu HTTPS nebo z localhostu. Nasazení v tomto projektu zajišťuje GitLab Pages.
