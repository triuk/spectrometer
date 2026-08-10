# Webový spektrometr – prototyp

Prototyp běží přímo v Chromiu a převádí obraz z USB kamery na spektrum.

## Profily spektrometrů

Každý fyzický spektrometr má vlastní JSON profil v `configs/` nebo lokálně v prohlížeči. Profil obsahuje:

- preferovanou kameru, rozlišení a FPS;
- ROI;
- lineární kalibrační body pixel → nm;
- pevné nastavení obrazu a horní limit expozice.

Kalibrační pixely jsou absolutní souřadnice obrazu kamery, ne souřadnice uvnitř ROI. Profil lze importovat/exportovat jako JSON. Konkrétní `deviceId` USB kamery se do profilu neukládá; vazba profil → kamera zůstává pouze v daném prohlížeči.

## Měření

Kamera pracuje v pevném ručním režimu. Hardwarová automatická expozice ani automatické vyvážení bílé se nepoužívají. Tlačítko **Optimalizovat expozici (SW)** jednorázově hledá vhodnou expozici podle maxima ve vybrané ROI a potom ji uzamkne.

Aplikace podporuje výběr ROI, R/G/B a jasové spektrum, průměrování, odečet tmavého spektra, dvoubodovou kalibraci, CSV export a uložení snímku PNG.

## Spuštění

Prohlížeč musí stránku načítat přes HTTPS nebo z `localhost`. Nasazení projektu zajišťuje GitLab Pages.
