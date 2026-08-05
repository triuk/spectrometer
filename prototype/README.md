# Webový spektrometr – prototyp

Prototyp běží přímo v prohlížeči a používá kameru USB-ZH jako zdroj obrazu.

## Snímání

Aplikace se snaží otevřít kameru v režimu 1920 × 1080 při 5 fps. Pokud cílový režim není dostupný, vyzkouší náhradní profily. Chromium nezpřístupňuje použitý V4L2 pixelový formát, proto aplikace neumí potvrdit YUYV nebo MJPEG.

## Nastavení obrazu

Kamera při měření běží fyzicky v ručním režimu. Hardwarová automatická expozice a automatické vyvážení bílé se nepoužívají.

### Optimalizovat (SW)

Tlačítko spustí jednorázovou softwarovou optimalizaci expozice:

1. změří maximum barevných kanálů ve vybrané ROI;
2. iterativně mění ruční expoziční čas;
3. snaží se dostat maximum přibližně do rozsahu 205–232 z 255;
4. po dosažení cíle expozici uzamkne.

Optimalizace neběží průběžně, aby se během měření neměnilo měřítko intenzity. Při změně zdroje nebo optické sestavy ji lze spustit znovu tlačítkem **Optimalizovat (SW)**.

Vyvážení bílé je při prvním spuštění optimalizace zafixováno na 4600 K. Pokud bylo před další optimalizací nastaveno ručně, zachová se aktuální ruční hodnota.

Jas, kontrast, saturace a ostrost se automaticky nemění. Nejde o chybu: jejich průběžná optimalizace by měnila poměry kanálů, šířku spektrálních čar a tvar měřeného spektra. Pro opakovatelné měření musí zůstat pevné.

### Ručně

Tlačítko **Ručně** zastaví SW optimalizaci a zpřístupní ruční expoziční čas a teplotu bílé.

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
