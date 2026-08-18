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

### Diagnostika expozice

Panel **Diagnostika expozice** slouží k proměření skutečné odezvy kamery na ruční expoziční čas. Výchozí sweep pokrývá celý dostupný měřicí rozsah po 25 jednotkách a provede průchod nahoru i dolů.

Po každé změně expozice se nepoužívá pevná čekací doba. Aplikace přes `requestVideoFrameCallback()` zaznamenává pouze skutečně nové video snímky a sleduje jejich ustálení. Pro každý snímek ukládá:

- požadovanou a skutečnou expozici z `getSettings()`;
- čas od aplikování nové hodnoty;
- číslo/presentedFrames a mediaTime video snímku, pokud je Chromium poskytne;
- maximum v ROI a samostatná maxima R/G/B;
- průměrný jas ROI;
- podíl saturovaných sloupců.

Průchod nahoru a dolů umožňuje odhalit nejen nemonotónní odezvu a náhlé změny jasu, ale také případnou hysterézi. Souhrn automaticky vypíše velké skoky, neustálené body a rozdíly mezi oběma směry. Výsledky lze exportovat jako JSON s kompletními raw daty nebo CSV s jedním řádkem pro každý zaznamenaný video snímek. Po dokončení nebo zastavení se obnoví původní expozice.

## Graf spektra

Interaktivní graf používá **uPlot 1.6.32**. Knihovna je připnutá na konkrétní verzi; při nedostupnosti CDN zůstává jako fallback původní Canvas graf.

- tažením levým tlačítkem se přiblíží vybraný rozsah osy X;
- kolečkem se zoomuje kolem kurzoru;
- `Shift` + tažení nebo prostřední tlačítko posouvá zobrazený rozsah;
- dvojklik nebo tlačítko **Reset zoomu** obnoví celý rozsah;
- crosshair zobrazuje přesnou vlnovou délku, absolutní pixel senzoru a intenzity aktivních kanálů;
- při kalibrované ose X se zobrazuje spektrální barevné pozadí a výraznější barevný pás odpovídající aktuálně zobrazeným vlnovým délkám.

### Píky a kalibrace

Graf automaticky hledá lokální píky v jasovém spektru. Před detekcí se používá lehké vyhlazení a pík musí mít dostatečnou lokální prominenci, takže se neoznačuje každý jednotlivý šumový bod.

- zobrazení píků lze vypnout;
- citlivost má režimy **Nízká**, **Střední** a **Vysoká**;
- při zoomu se zobrazují jen píky v aktuálním rozsahu;
- počet popisků je omezen podle šířky grafu a přednost mají píky s vyšší prominencí;
- kliknutí na označený pík zobrazí jeho přesnou polohu a intenzitu;
- tlačítka **Kal. bod 1** a **Kal. bod 2** aktivují výběr kalibračního bodu; následující kliknutí na pík vloží jeho absolutní pixel senzoru do příslušného kalibračního pole.

Vlnová délka kalibračního bodu se záměrně nedoplňuje automaticky: uživatel ji zadává podle známé charakteristické spektrální čáry použitého kalibračního zdroje.

## Spuštění

Prohlížeč musí stránku načítat přes HTTPS nebo z `localhost`. Nasazení projektu zajišťuje GitLab Pages.
