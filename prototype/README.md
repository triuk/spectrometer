# Webový spektrometr – prototyp

Prototyp běží přímo v Chromiu a převádí obraz z USB kamery na spektrum.

## Profily spektrometrů

Každý fyzický spektrometr má vlastní JSON profil v `configs/` nebo lokálně v prohlížeči. Profil obsahuje:

- preferovanou kameru, rozlišení a FPS;
- ROI;
- lineární kalibrační body pixel → nm;
- pevné nastavení obrazu a horní limit expozice;
- volitelný model odezvy expozice pro SW optimalizaci;
- orientaci spektra.

Kalibrační pixely jsou absolutní souřadnice obrazu kamery, ne souřadnice uvnitř ROI. Profil lze importovat/exportovat jako JSON. Konkrétní `deviceId` USB kamery se do profilu neukládá; vazba profil → kamera zůstává pouze v daném prohlížeči.

## Měření

Kamera pracuje v pevném ručním režimu. Hardwarová automatická expozice ani automatické vyvážení bílé se nepoužívají. Tlačítko **Optimalizovat expozici (SW)** jednorázově hledá vhodnou expozici podle maxima ve vybrané ROI a potom ji uzamkne.

Pro kameru USB-ZH použitou ve výchozím LGS profilu diagnostický sweep ukázal deterministické poklesy intenzity na hranicích po 32 jednotkách expozičního času. Mezi těmito hranicemi je odezva prakticky monotónní. Profil proto používá model `piecewise-monotonic` s periodou 32. Optimalizace nejprve testuje bezpečné konce monotónních úseků, vybere první úsek schopný dosáhnout cílové intenzity a uvnitř něj expozici binárně doladí.

Po změně expozice se nepoužívá pevné čekání v milisekundách. Aplikace čeká na nové video snímky přes `requestVideoFrameCallback()`, standardně změří 5 nových snímků a jako výsledek použije medián posledních 3. Tím se omezuje vliv opožděného projevení změny i kolísání jednotlivých snímků.

Aplikace podporuje výběr ROI, R/G/B a jasové spektrum, průměrování, odečet tmavého spektra, dvoubodovou kalibraci, CSV export a uložení snímku PNG.

## Diagnostika expozice

Panel **Diagnostika expozice** umožňuje proměřit celý rozsah ruční expozice bez optimalizačních předpokladů. Sweep může běžet nahoru, dolů nebo oběma směry. Pro každý bod ukládá jednotlivé nové video snímky, požadovanou i skutečnou expozici, maximum R/G/B, celkové maximum, průměrný jas a podíl saturovaných pixelů.

Výsledek lze exportovat jako JSON nebo CSV. JSON obsahuje i souhrnnou analýzu monotónních porušení, neustálených bodů a hystereze.

## Graf spektra

Interaktivní graf používá **uPlot 1.6.32**. Knihovna je připnutá na konkrétní verzi; při nedostupnosti CDN zůstává jako fallback původní Canvas graf.

- tažením levým tlačítkem se přiblíží vybraný rozsah osy X;
- kolečkem se zoomuje kolem kurzoru;
- `Shift` + tažení nebo prostřední tlačítko posouvá zobrazený rozsah;
- dvojklik nebo tlačítko **Reset zoomu** obnoví celý rozsah;
- přepínač **Obrátit spektrum** prohodí vlnové délky mezi kalibračními body 1 a 2; fyzické pixely senzoru se nemění;
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
