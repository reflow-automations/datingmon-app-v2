# HITSTER 💿

Het muziek-tijdlijnspel voor een groep, in de browser. Je hoort een nummer,
je weet niet welk, en je moet raden waar het in je tijdlijn hoort: vóór dat
nummer uit 1984, of juist erna? Zit je goed, dan is de kaart van jou. Wie als
eerste tien kaarten op een kloppende tijdlijn heeft, wint.

Eén telefoon of tablet gaat rond aan tafel. Geen app, geen account, geen
kaartjes: alleen deze pagina en internet.

## Meteen spelen

```bash
python3 -m http.server 8080
# open http://localhost:8080/
```

Of zet het op Vercel (preset **Other**, geen build command). `vercel.json`
stuurt alles naar `index.html`.

## Hoe het spel gaat

1. **Spelers toevoegen** — 2 tot 10. Iedereen krijgt een kleur, één startkaart
   (die zie je gewoon, mét jaartal) en 1 token.
2. **Je beurt** — druk op play. Je hoort 30 seconden; titel, artiest en jaar
   blijven verborgen.
3. **Plaatsen** — kies het gat in *jouw* tijdlijn: vóór, tussen of na.
4. **Stelen** — denkt iemand anders het beter te weten? Die geeft 1 token uit
   en plaatst de kaart in zijn eigen tijdlijn. Heeft de speler aan de beurt het
   goed, dan houdt die de kaart en is het token weg. Heeft die het fout en de
   dief goed, dan gaat de kaart naar de dief.
5. **Onthullen** — jaar, titel, artiest en hoesje. Goed = kaart erbij, fout =
   kaart van tafel.
6. **Tokens verdienen** — wist je titel én artiest? Vink dat aan vóór je
   bevestigt; bij de onthulling beslist de tafel of het telt. Maximaal 3 tokens.

Twee nummers uit hetzelfde jaar mogen in willekeurige volgorde naast elkaar
staan — beide plekken worden goedgekeurd.

### Instellingen

- **Kaarten om te winnen** — 6 (kort) tot 12 (lang). 10 is het officiële spel.
- **Muziekperiode** — alles, klassiekers, 80's & 90's, 2000-nu of 1980-2010.
- **Tokens uit** — dan is het puur jaartallen plaatsen. Fijn met kinderen of
  als je snel wilt spelen.
- **Alleen Nederlandse acts** — klein deck van 12 nummers, leuk als rondje.

## De muziek

Elk nummer speelt als de officiële 30-seconden preview van Apple/iTunes.
Er is geen account of API-sleutel nodig; de app zoekt de preview zelf op via
de iTunes Search API (JSONP, dus geen CORS-gedoe) en onthoudt hem 30 dagen in
`localStorage`.

Twee routes naar het geluid, in deze volgorde:

1. het **geverifieerde track-id** in `js/deck.js` — exact de bedoelde opname;
2. **zoeken op "artiest titel"** met een strenge filter die karaoke-, live-,
   remix- en tributeversies wegkiest.

Lukt het allebei niet (offline, of het nummer is uit de winkel), dan zegt de
app dat eerlijk en kun je het nummer overslaan via het menu (☰) — zonder
straf voor de speler.

Op het instelscherm zit **🔊 Speel een testnummer**: daar hoor je meteen of
het volume, de stille stand en de verbinding in orde zijn vóór de eerste
beurt begint.

## Het deck

184 nummers van 1955 tot 2024, verdeeld over alle decennia, met een handvol
Nederlandse klassiekers (Golden Earring, Doe Maar, Guus Meeuwis, Anouk, BLØF,
Duncan Laurence …).

Zelf nummers toevoegen? Eén regel in `js/deck.js`:

```js
{"y":1994,"t":"Zombie","a":"The Cranberries"}
```

`y` is het uitgavejaar en is de waarheid in het spel. `i` (het iTunes-track-id)
mag je weglaten — dan zoekt de app het nummer zelf op. `nl: 1` zet hem in het
Nederlandse deck.

## Bestanden

- `index.html` — alle schermen (opzet, beurt, stelen, onthulling, winnaar)
- `style.css` — donker thema, gebouwd voor een telefoon die rondgaat
- `js/deck.js` — de 184 nummers
- `js/music.js` — previews opzoeken, cachen en afspelen
- `js/game.js` — beurten, tijdlijnen, tokens, stelen, winnen
- `vercel.json` — rewrite voor schone URL's

Geen build, geen dependencies, geen tracking. Het spel bewaart alleen je
lopende potje en gevonden previews in je eigen browser.

## Details die het spelen prettiger maken

- Het potje overleeft een refresh: je kunt verder waar je was.
- Het scherm blijft aan tijdens het spelen (Wake Lock, waar ondersteund).
- Spatiebalk = play/pauze, Escape sluit een venster.
- 🏆 laat alle tijdlijnen van iedereen zien, ☰ heeft de regels en "nummer
  overslaan".
