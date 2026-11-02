import Link from "next/link";
import {
  TOOL_COMPARISON_COLUMNS,
  TOOL_COMPARISON_FOOTNOTE_AFTER_PRICE,
  TOOL_COMPARISON_FOOTNOTE_BEFORE_PRICE,
  TOOL_COMPARISON_LEAD,
  TOOL_COMPARISON_ROWS,
  TOOL_COMPARISON_UPDATED_LABEL,
} from "./tool-comparison";

export function ToolComparisonTable({
  heading,
}: {
  heading: string;
}) {
  return (
    <section className="border-t border-border/15 px-6 py-16 md:py-24">
      <div className="mx-auto max-w-6xl">
        <p className="mb-3 text-xs font-medium tracking-widest text-primary uppercase">
          Jämförelse
        </p>
        <h2 className="max-w-3xl text-balance font-(--font-heading) text-2xl tracking-tight text-foreground md:text-4xl">
          {heading}
        </h2>
        <p className="mt-4 max-w-3xl text-pretty leading-relaxed text-muted-foreground">
          {TOOL_COMPARISON_LEAD} Senast avstämd {TOOL_COMPARISON_UPDATED_LABEL}.
        </p>
        <div className="mt-8 overflow-x-auto rounded-2xl border border-border/20">
          <table className="w-full min-w-[56rem] border-collapse text-left text-sm">
            <caption className="sr-only">
              Jämförelse av Sajtmaskin, WordPress, Wix och Squarespace
            </caption>
            <thead className="bg-card/50 text-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  Fråga
                </th>
                {TOOL_COMPARISON_COLUMNS.map((column) => (
                  <th key={column} scope="col" className="px-4 py-3 font-medium">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              {TOOL_COMPARISON_ROWS.map((row) => (
                <tr key={row.criterion} className="border-t border-border/15 align-top">
                  <th scope="row" className="px-4 py-3 font-medium text-foreground">
                    {row.criterion}
                  </th>
                  {TOOL_COMPARISON_COLUMNS.map((column) => (
                    <td key={column} className="px-4 py-3">
                      {row.cells[column]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          {TOOL_COMPARISON_FOOTNOTE_BEFORE_PRICE}{" "}
          <Link href="/priser" className="text-foreground underline-offset-4 hover:underline">
            prissidan
          </Link>
          . {TOOL_COMPARISON_FOOTNOTE_AFTER_PRICE}
        </p>
      </div>
    </section>
  );
}
