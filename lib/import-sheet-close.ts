// P3-304: an import sheet cannot be closed while a server call is running.
// Closing would unmount the sheet while the batch loop keeps saving rows, and
// the operator would never see the summary.

export const IMPORT_RUNNING_TITLE = "Importul este în curs. Așteptați să se termine.";

// Returns the close handler a sheet wires to Escape, the backdrop and the X
// button: it does nothing while `pending` is true.
export function guardedClose(pending: boolean, onClose: () => void): () => void {
  return () => {
    if (!pending) onClose();
  };
}
