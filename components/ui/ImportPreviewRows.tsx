// P3-141. Tabelul "Rânduri noi" din pasul "Verifică" al celor patru importuri.
// Un singur component, folosit de clienti, leaduri, proiecte si materiale.

import { Table, Td, Th } from "@/components/ui/primitives";
import { morePreviewRowsText, type ImportPreviewTable } from "@/lib/data/import-preview-rows";

export function ImportPreviewRows({ preview }: { preview: ImportPreviewTable }) {
  if (preview.rows.length === 0) return null;
  return (
    <div className="space-y-2" data-testid="import-preview">
      <h3 className="text-[13px] font-semibold text-rc-black">Rânduri noi</h3>
      <p className="text-[12px] text-rc-muted">
        Valorile sunt cele care se vor salva, după citirea numerelor și a datelor.
      </p>
      <Table>
        <thead>
          <tr>
            {preview.columns.map((column) => (
              <Th key={column}>{column}</Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {preview.rows.map((row) => (
            <tr key={row.line} data-testid="import-preview-row" data-line={row.line}>
              <Td className="tabular-nums">{row.line}</Td>
              {row.cells.map((cell, i) => (
                <Td key={i} className="[overflow-wrap:anywhere]">
                  {cell}
                </Td>
              ))}
            </tr>
          ))}
        </tbody>
      </Table>
      {preview.more > 0 ? (
        <p className="text-[12px] text-rc-muted" data-testid="import-preview-more">
          {morePreviewRowsText(preview.more)}
        </p>
      ) : null}
    </div>
  );
}
