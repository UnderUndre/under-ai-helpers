/**
 * INDEX.md atomic updater (feature 007 US3, FR-005).
 *
 * Atomic write-temp + rename. Idempotent on (date, file_link).
 * Preserves hand-edited annotations on prior rows.
 */

import { readFileSync, existsSync, writeFileSync, renameSync, copyFileSync, unlinkSync } from "node:fs";

export interface IndexRow {
  date: string;
  tool: string;
  branch: string;
  theme: string;
  outcome: string;
  fileLink: string;
  notes?: string;
  flags?: string;
}

/**
 * Add a row to INDEX.md atomically. If a row with the same fileLink already
 * exists, update it in-place (idempotent). Hand-edited notes/flags on other
 * rows are preserved.
 */
export function updateIndex(
  indexPath: string,
  newRow: IndexRow,
): void {
  const tempPath = `${indexPath}.tmp`;

  let existingContent = "";
  let existingRows: string[] = [];

  if (existsSync(indexPath)) {
    existingContent = readFileSync(indexPath, "utf8");
    // Extract table rows (lines starting with |)
    existingRows = existingContent
      .split("\n")
      .filter((l) => l.startsWith("|") && !l.startsWith("|---") && !l.startsWith("| Date") && !l.startsWith("|------"));
  }

  // Check if row already exists (idempotent on fileLink)
  const rowIndex = existingRows.findIndex((r) => r.includes(newRow.fileLink));

  // Build the new row line
  const rowLine = buildRowLine(newRow);

  if (rowIndex >= 0) {
    // Update in-place (preserve hand-edited notes)
    const oldParts = (existingRows[rowIndex] || "").split("|").map((p) => p.trim());
    const newParts = rowLine.split("|").map((p) => p.trim());
    // Preserve notes column if it was hand-edited (column 7)
    if (oldParts[7] && oldParts[7] !== "" && !newRow.notes) {
      newParts[7] = oldParts[7];
    }
    existingRows[rowIndex] = newParts.join(" | ");
  } else {
    existingRows.push(rowLine);
  }

  // Rebuild INDEX.md content
  const header = buildHeader();
  const tableHeader = "| Date | Tool | Branch | Theme | Summary | File | Notes |\n|------|------|--------|-------|---------|------|-------|\n";
  const tableBody = existingRows.join("\n") + "\n";
  const fullContent = header + tableHeader + tableBody;

  // Atomic write: temp + rename (with fallback for Windows EPERM/EXDEV)
  writeFileSync(tempPath, fullContent, "utf8");
  try {
    renameSync(tempPath, indexPath);
  } catch {
    copyFileSync(tempPath, indexPath);
    try { unlinkSync(tempPath); } catch {}
  }
}

function buildHeader(): string {
  return `# AI Dialog Archive\n\nCatalog of archived conversations. Each row = one session.\n\n**Columns**: Date | Tool | Branch | Theme | Summary | File | Notes\n\n`;
}

function buildRowLine(row: IndexRow): string {
  const parts = [
    row.date,
    row.tool,
    row.branch,
    row.theme,
    row.outcome.slice(0, 80),
    `[${row.fileLink.split("/").pop()}](../${row.fileLink})`,
    row.notes || row.flags || "",
  ];
  return "| " + parts.join(" | ") + " |";
}
