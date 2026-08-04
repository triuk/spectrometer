# Webový spektrometr – prototyp

První čistě webový prototyp zpracování obrazu z USB spektrometru. Nevyžaduje sestavení ani instalaci JavaScriptových balíčků.

## Funkce

- výběr kamery přes `MediaDevices.getUserMedia()`;
- požadavek na rozlišení a snímkovou frekvenci;
- zobrazení skutečného nastavení a schopností kamery;
- interaktivní výběr obdélníkové oblasti spektra;
- zprůměrování řádků oblasti na jednorozměrné spektrum;
- kanály R, G, B a jas `0.299R + 0.587G + 0.114B`;
- klouzavý průměr více snímků;
- zachycení a odečet tmavého spektra;
- lineární dvoubodová kalibrace pixel → nm;
- živý graf a detekce maxima;
- export CSV s metadaty;
- uložení aktuálního snímku jako PNG.

## Spuštění

Přístup ke kameře vyžaduje zabezpečený kontext. Pro lokální provoz stačí `localhost`:

```bash
cd prototype
python -m http.server 8000
```

Potom otevřete:

```text
http://localhost:8000
```

Při prvním spuštění povolte přístup ke kameře a vyberte zařízení `USB 2.0 Camera: USB-ZH`.

## Známá omezení

- Prohlížeč neumí vynutit V4L2 formát YUYV místo MJPEG.
- Ne všechny V4L2 ovládací prvky jsou dostupné přes webové kamerové API.
- Jde o relativní intenzitu z již zpracovaného obrazu kamery, nikoli o surová Bayer data ani absolutní radiometrické měření.
- Kalibrace je zatím pouze lineární a dvoubodová.
- Prototyp nebyl kalibrován proti známému zdroji spektrálních čar.

Pro reprodukovatelné měření bude pravděpodobně následovat lokální backend pro přesný výběr V4L2 formátu a ruční ovládání expozice.
