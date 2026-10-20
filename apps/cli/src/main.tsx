import { Box, Text, render, useInput, usePaste } from "ink";
import { getBackendHealth } from "./api/health.js";
import { useState } from "react";
import stringWidth from "string-width";
import { randomUUID } from "node:crypto";
import { useTerminalSize } from "./hooks/useTerminalSize.js";

type Message = {
  id: string;
  text: string;
};

type EditorState = {
  text: string;
  cursor: number;
  preferredColumn: number | null;
};

type EditorCell = {
  text: string;
  start: number;
  end: number;
  width: number;
};

type EditorRow = {
  start: number;
  end: number;
  cells: EditorCell[];
  width: number;
};

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const emptyEditor: EditorState = { text: "", cursor: 0, preferredColumn: null };

// A grapheme is one visible character, which can contain several Unicode code points.
function layoutDraft(text: string, columns: number): EditorRow[] {
  const rows: EditorRow[] = [];
  let row: EditorRow = { start: 0, end: 0, cells: [], width: 0 };

  for (const part of segmenter.segment(text)) {
    const start = part.index;
    const end = start + part.segment.length;

    if (part.segment === "\n") {
      row.end = start;
      rows.push(row);
      row = { start: end, end, cells: [], width: 0 };
      continue;
    }

    const width = stringWidth(part.segment);
    if (row.width + width > columns) {
      rows.push(row);
      row = { start, end: start, cells: [], width: 0 };
    }

    row.cells.push({ text: part.segment, start, end, width });
    row.width += width;
    row.end = end;
  }

  rows.push(row);
  // A full last row needs another cell for the cursor at the end of the draft.
  if (row.width === columns) {
    rows.push({ start: text.length, end: text.length, cells: [], width: 0 });
  }
  return rows;
}

function cursorColumn(row: EditorRow, cursor: number): number {
  return row.cells.reduce(
    (column, cell) => column + (cell.end <= cursor ? cell.width : 0),
    0,
  );
}

function cursorAtColumn(row: EditorRow, column: number): number {
  let width = 0;
  for (const cell of row.cells) {
    if (width + cell.width > column) return cell.start;
    width += cell.width;
  }
  return row.end;
}

function cleanInput(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, "    ")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, "");
}

function wrapConversation(text: string, columns: number): string[] {
  const rows = layoutDraft(text, columns);
  // History has no cursor, so it does not need the editor's spare final row.
  if (rows.length > 1 && rows.at(-1)!.cells.length === 0 && !text.endsWith("\n")) {
    rows.pop();
  }
  return rows.map((row) => row.cells.map((cell) => cell.text).join(""));
}

function App(props: { status: string }) {
  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>1kaDouble.Ai</Text>
      <Text>CLI foundation is running.</Text>
      <Text>{props.status}</Text>
    </Box>
  );
}
const app = render(<App status="Connecting to backend..." />);
await app.waitUntilRenderFlush();

try {
  const service = await getBackendHealth();
  app.rerender(<App status={`Connected to ${service}`} />);
} catch (error) {
  const message =
    error instanceof Error ? error.message : "Unknown connection error";

  app.rerender(
    <App status={`Connection failed: ${message}. Check the Rust server.`} />,
  );
  process.exitCode = 1;
}

await app.waitUntilRenderFlush();
app.unmount();
await app.waitUntilExit();
