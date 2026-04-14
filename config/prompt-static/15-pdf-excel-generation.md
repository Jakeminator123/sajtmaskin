# PDF & Excel Generation

When the user asks to generate PDF documents, Excel spreadsheets, invoices, reports, quotes, or any printable/downloadable document, produce polished, visually branded output — not unstyled data dumps.

## Library Selection

- **PDF:** Use `@react-pdf/renderer` for server-rendered PDFs. Create a React component that renders to PDF via `renderToStream` or `renderToBuffer` in an API route, and provide a download button or link in the UI.
- **Excel:** Use `exceljs` (NOT `xlsx` or `sheetjs`). ExcelJS supports cell styling, merged cells, borders, fills, column widths, images, and conditional formatting.
- Always add the chosen library to the merge-format `package.json` output.

## Brand-Aligned Design (mandatory)

Every generated document must feel intentionally designed, not auto-generated. Apply the site's visual identity consistently:

### Color Palette

Derive colors from the project's theme tokens. When specific brand colors are not available, use these defaults:

| Role | Hex | Usage |
|------|-----|-------|
| Primary (navy) | `#1a2744` | Headers, table header backgrounds, footer bars, section dividers |
| Accent (orange) | `#f97316` | Highlights, status badges, CTA elements, totals row accents |
| Background | `#ffffff` | Page/cell background |
| Muted | `#f4f5f7` | Alternating table rows, secondary sections |
| Border | `#e2e4e9` | Table borders, separators |
| Text primary | `#1a2744` | Headings, labels |
| Text secondary | `#64748b` | Descriptions, footnotes, meta info |

### Typography (PDF)

- Heading: 18-24pt, bold, navy (`#1a2744`), letter-spacing tight
- Subheading: 12-14pt, semibold, navy
- Body: 10-11pt, regular, dark gray (`#334155`)
- Labels/captions: 8-9pt, medium, muted (`#64748b`)
- Use consistent font throughout — Helvetica is safe for `@react-pdf/renderer`

### Typography (Excel)

- Header row: 12pt, bold, white text on navy fill (`#1a2744`), centered
- Subheader: 11pt, semibold, navy text, light gray fill (`#f4f5f7`)
- Data cells: 10pt, regular
- Totals row: 11pt, bold, navy text or white on navy
- Column headers get frozen row (`worksheet.views = [{ state: 'frozen', ySplit: 1 }]`)

## PDF Layout Rules

### Page Structure

```
┌─────────────────────────────────────┐
│  LOGO / Company Name    Document #  │  ← Header bar (navy bg, white text)
│  Subtitle / Date                    │
├─────────────────────────────────────┤
│                                     │
│  Section heading                    │  ← Left-aligned, navy, semibold
│  ┌─────────┬──────────┬──────────┐  │
│  │ Column  │ Column   │ Column   │  │  ← Table header (navy bg)
│  ├─────────┼──────────┼──────────┤  │
│  │ Data    │ Data     │ Data     │  │  ← Alternating row fills
│  │ Data    │ Data     │ Data     │  │
│  ├─────────┼──────────┼──────────┤  │
│  │ TOTAL   │          │ ####     │  │  ← Totals row (bold, accent line)
│  └─────────┴──────────┴──────────┘  │
│                                     │
│  Notes / Terms section              │  ← Muted text, smaller font
│                                     │
├─────────────────────────────────────┤
│  Company info   │   Page X of Y     │  ← Footer (navy thin bar + meta)
└─────────────────────────────────────┘
```

### Spacing & Symmetry

- Page margins: 40-50pt on all sides (symmetric)
- Section spacing: 20-30pt between major sections
- Table cell padding: 8-12pt vertical, 10-14pt horizontal — uniform across all cells
- Column widths must be explicitly set to fill the page width proportionally — never let columns auto-size to cramped or uneven widths
- Align numbers and currency right, text left, dates center
- All rows in a table must have identical height (no jagged row heights)
- Keep consistent left margin for all body content (flush left edge)

### Visual Elements

- Header bar: full-width navy rectangle with white text (logo left, document number right)
- Section dividers: 2pt navy line or accent-colored line above each section heading
- Table header row: navy fill, white text, no border between header cells — single unified bar
- Alternating rows: white and `#f4f5f7` (subtle zebra striping)
- Totals/summary row: top border 2pt navy, bold text, optional light accent fill
- Status badges: rounded rectangle fills (green for paid/complete, orange for pending, red for overdue)
- Footer: thin navy line spanning page width, company info below in 8pt muted text

### Common Document Types

**Invoice / Faktura:**
- Header: company logo area (left), "FAKTURA" title + number (right)
- Recipient block: customer name, address, org.nr — below header, left-aligned
- Meta row: fakturadatum, förfallodatum, betalningsvillkor, OCR/referens
- Line items table: Beskrivning | Antal | á-pris | Moms | Belopp
- Summary: Netto, Moms (per sats), Att betala (large, bold, accent underline)
- Payment details: Bankgiro/Plusgiro, IBAN, SWIFT — in a bordered box
- Footer: company registration, F-skatt, org.nr

**Quote / Offert:**
- Similar to invoice but "OFFERT" title, giltighetstid (validity period), accept-signature area
- Optional terms & conditions section

**Report / Rapport:**
- Title page with company name, report title, date, author
- Table of contents (if multi-page)
- Section headings with consistent numbering
- Data tables and summary boxes with key metrics highlighted
- Charts rendered as images (use Recharts server-side or include as PNG data URIs)

## Excel Layout Rules

### Worksheet Structure

- Row 1: Title row — merged across all data columns, 16pt bold navy, company name
- Row 2: Subtitle — merged, 11pt, date range or document description
- Row 3: Empty spacer row
- Row 4: Column headers — frozen, bold white text, navy fill, center-aligned, auto-filter enabled
- Row 5+: Data rows with alternating fills (white / `#f4f5f7`)
- Last data row + 1: Totals row — bold, navy text, top border medium

### Cell Styling

- All data cells: thin borders (`#e2e4e9`), 10pt font
- Number format: `#,##0.00` for currency, `#,##0` for integers, `0.0%` for percentages
- Date format: `YYYY-MM-DD`
- Currency cells: right-aligned, Swedish locale (`1 234,50 kr`)
- Set explicit column widths based on content type (text columns wider, number columns narrower)
- Wrap text for description columns, nowrap for numbers/dates

### Multi-sheet Workbooks

When data has natural groupings, use separate sheets:
- First sheet: Summary / Sammanfattning
- Subsequent sheets: Detail data per category
- Each sheet follows the same visual template (header, colors, formatting)
- Sheet names in Swedish, max 31 chars, no special characters

## Implementation Pattern (PDF API Route)

```typescript
// app/api/pdf/[type]/route.ts
import { renderToBuffer } from "@react-pdf/renderer";
import { InvoicePdf } from "@/components/pdf/invoice-pdf";

export async function GET(req: Request) {
  const buffer = await renderToBuffer(<InvoicePdf data={invoiceData} />);
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="faktura.pdf"',
    },
  });
}
```

## Implementation Pattern (Excel API Route)

```typescript
// app/api/excel/[type]/route.ts
import ExcelJS from "exceljs";

export async function GET(req: Request) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Rapport");
  // ... style and populate
  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="rapport.xlsx"',
    },
  });
}
```

## Quality Checklist

Before outputting any PDF or Excel generation code, verify:
- [ ] Brand colors used consistently (navy headers, orange accents, white backgrounds)
- [ ] All spacing is symmetric (equal margins, uniform cell padding)
- [ ] Tables fill available width proportionally (no cramped or oversized columns)
- [ ] Numbers are right-aligned, text is left-aligned
- [ ] Swedish content, formatting, and currency (kr, not $)
- [ ] Font sizes follow the hierarchy defined above
- [ ] Alternating row colors applied for readability
- [ ] Header and footer are present and styled
- [ ] Column widths are explicitly set (not auto-sized to minimum)
- [ ] All text content is realistic Swedish — no placeholders, no Lorem ipsum
