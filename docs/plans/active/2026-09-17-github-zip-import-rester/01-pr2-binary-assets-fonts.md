# PR2 – Binary assets + fonts

## Mål

GitHub- och ZIP-import ska bevara de vanligaste lokala assets som verkliga sajter behöver.

### Scope v1

Bilder: `.png` `.jpg` `.jpeg` `.webp` `.gif` `.ico`

Fonts: `.woff` `.woff2` `.ttf`

SVG fortsätter som text enligt befintligt flöde.

Video/audio är utanför denna PR.

## Kontrakt

Skapa inte ett nytt mediasystem. Återanvänd:

- `CodeFile`
- `language: "binary"`
- `content: "base64:<canonical-base64>"`
- `isNonTextContentFile(...)`
- preview-host materialisering av `base64:` till bytes

En canonical envelope. Ingen legacy double-base64.

## Owner

- [`src/lib/import/extract-imported-archive.ts`](../../../../src/lib/import/extract-imported-archive.ts)
- [`src/lib/import/extract-imported-archive.test.ts`](../../../../src/lib/import/extract-imported-archive.test.ts)

Samma extractor för GitHub-ZIP och direkt ZIP. Preview-host runtime ändras inte.

## Krav

1. Binärfil får aldrig `toString("utf8")` som innehåll.
2. Paths genom samma traversal/blocklist/env-skydd som text.
3. Separat per-filgräns och total binary-budget, mätt på decoded bytes.
4. Textbudget och binarybudget blandas inte.
5. För stora assets hoppas över deterministiskt (ingen OOM, importen av text fortsätter).
6. Extra binaries vid filtaket hoppas över; texttaket kastar fortfarande.
7. Pre-decompress-skip tillåter en persistad `base64:`-envelope (`4/3` + prefix)
   så re-import inte tappar en fil som ryms efter unwrap. JSZip-deklarerad
   storlek är best-effort — saknad/lögnaktig size lastas och kapas efter decode.

## Acceptans

Fixture med `app/page.tsx` + `app/globals.css` som refererar `/logo.png` och
`/fonts/site.woff2`. Bevisa extraction, `decode(base64:) == fixture-bytes`,
persist-snapshot och preview-host-materialisering.

Live preview-GET och save/reopen i inloggad browser är residualer om credentials saknas.
