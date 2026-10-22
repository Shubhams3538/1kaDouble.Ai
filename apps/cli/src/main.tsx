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
  const [editor, setEditor] = useState<EditorState>(emptyEditor);
  const [messages, setMessages] = useState<Message[]>([]);
  const [historyOffset, setHistoryOffset] = useState(0);
  const { columns, rows } = useTerminalSize();
  const isTooSmall = columns < 40 || rows < 16;
  // Reserve outer padding, the prompt prefix and a spare end-of-line cursor cell.
  const editorColumns = Math.max(2, columns - 5);
  const draftRows = layoutDraft(editor.text, editorColumns);
  const cursorRow = draftRows.findLastIndex((row) => row.start <= editor.cursor);
  const inputRows = Math.min(3, draftRows.length);
  const firstInputRow = Math.min(
    Math.max(0, cursorRow - 1),
    draftRows.length - inputRows,
  );
  const historyHeight = Math.max(0, rows - 13 - inputRows);
  const historyLines = messages.flatMap((message) => [
    ...wrapConversation(`You: ${message.text}`, Math.max(2, columns - 2)).map((text, index) => ({
      id: `${message.id}-user-${index}`, text, dim: false,
    })),
    ...wrapConversation("Demo reply: message received locally. No AI call.", Math.max(2, columns - 2)).map((text, index) => ({
      id: `${message.id}-reply-${index}`, text, dim: true,
    })),
    { id: `${message.id}-gap`, text: "", dim: false },
  ]);
  const maxHistoryOffset = Math.max(0, historyLines.length - historyHeight);
  const scrollOffset = Math.min(historyOffset, maxHistoryOffset);
  const historyEnd = historyLines.length - scrollOffset;
  const visibleHistory = historyLines.slice(
    Math.max(0, historyEnd - historyHeight), historyEnd,
  );

  function insertText(value: string) {
    const text = cleanInput(value);
    if (!text) return;
    setEditor((previous) => {
      const nextText =
        previous.text.slice(0, previous.cursor) + text +
        previous.text.slice(previous.cursor);
      const insertionEnd = previous.cursor + text.length;
      // Insertion can merge a combining mark or emoji into a neighboring grapheme.
      const boundaries = [...segmenter.segment(nextText)].map((part) => part.index);
      boundaries.push(nextText.length);
      return {
        text: nextText,
        cursor: boundaries.find((position) => position >= insertionEnd) ?? nextText.length,
        preferredColumn: null,
      };
    });
  }

  // Keeping these hooks mounted also keeps the app alive in the compact view.
  usePaste((text) => {
    if (!isTooSmall) insertText(text);
  });

  useInput((input, key) => {
    if (isTooSmall || key.eventType === "release") return;

    if (key.pageUp || key.pageDown || (key.ctrl && (input === "p" || input === "n"))) {
      const direction = key.pageUp || (key.ctrl && input === "p") ? 1 : -1;
      const page = Math.max(1, historyHeight - 1);
      setHistoryOffset(Math.max(0, Math.min(maxHistoryOffset, scrollOffset + direction * page)));
      return;
    }

    if (input === "\n" || (key.ctrl && input === "j") ||
        (key.return && (key.shift || key.meta))) {
      insertText("\n");
      return;
    }

    if (key.return) {
      handleSubmit(editor.text);
      return;
    }

    if (key.upArrow || key.downArrow) {
      const targetRow = cursorRow + (key.upArrow ? -1 : 1);
      if (targetRow < 0 || targetRow >= draftRows.length) return;
      const column = editor.preferredColumn ?? cursorColumn(draftRows[cursorRow]!, editor.cursor);
      const target = draftRows[targetRow]!;
      let cursor = cursorAtColumn(target, column);
      // The boundary after a soft-wrapped row belongs to the following row.
      if (draftRows[targetRow + 1]?.start === cursor) {
        cursor = target.cells.at(-1)?.start ?? cursor;
      }
      setEditor({
        ...editor,
        cursor,
        preferredColumn: column,
      });
      return;
    }

    const boundaries = [...segmenter.segment(editor.text)].map((part) => part.index);
    boundaries.push(editor.text.length);
    const before = boundaries.findLast((position) => position < editor.cursor) ?? 0;
    const after = boundaries.find((position) => position > editor.cursor) ?? editor.text.length;

    if (key.home || (key.ctrl && input === "a")) {
      setEditor({ ...editor, cursor: 0, preferredColumn: null });
    } else if (key.end || (key.ctrl && input === "e")) {
      setEditor({ ...editor, cursor: editor.text.length, preferredColumn: null });
    } else if (key.leftArrow || key.rightArrow) {
      setEditor({ ...editor, cursor: key.leftArrow ? before : after, preferredColumn: null });
    } else if (key.backspace || key.delete) {
      const start = key.backspace ? before : editor.cursor;
      const end = key.backspace ? editor.cursor : after;
      const text = editor.text.slice(0, start) + editor.text.slice(end);
      const nextBoundaries = [...segmenter.segment(text)].map((part) => part.index);
      setEditor({
        text,
        cursor: nextBoundaries.find((position) => position >= start) ?? text.length,
        preferredColumn: null,
      });
    } else if (key.tab) {
      insertText("    ");
    } else if (!key.ctrl && !key.meta && !key.escape) {
      insertText(input);
    }
  });

  function handleSubmit(value: string) {
    const message = value.trim();

    if (message.length === 0) {
      return;
    }

    const newMessage: Message = {
      id: randomUUID(),
      text: message,
    };

    setMessages((previous) => [...previous, newMessage]);
    setHistoryOffset(0);
    setEditor(emptyEditor);
  }

  if (isTooSmall) {
    return (
      <Box
        width={Math.max(1, columns)}
        height={Math.max(1, rows - 1)}
        overflow="hidden"
      >
        <Text wrap="truncate-end">
          Enlarge terminal to 40 columns × 16 rows. Ctrl+C exits.
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1} width={columns}>
      <Text bold>1kaDouble.Ai</Text>
      <Text>CLI foundation is running.</Text>
      <Text wrap="truncate-end">{props.status}</Text>
      <Box
        flexDirection="column"
        height={historyHeight}
        marginTop={1}
        overflow="hidden"
      >
        {visibleHistory.map((line) => (
          <Box key={line.id} height={1} flexShrink={0}>
            <Text dimColor={line.dim} wrap="truncate-end">{line.text || " "}</Text>
          </Box>
        ))}
      </Box>

      <Box
        flexDirection="column"
        borderStyle="round"
        paddingX={1}
        marginTop={1}
      >
        <Text bold wrap="truncate-end">
          Sponsored · Demo placement
        </Text>
        <Text dimColor wrap="truncate-end">
          Sample sponsor text. No advertising revenue.
        </Text>
      </Box>

      <Box flexDirection="column" height={inputRows} flexShrink={0}>
        {draftRows.slice(firstInputRow, firstInputRow + inputRows).map((row, index) => {
          const rowIndex = firstInputRow + index;
          const hasCursor = rowIndex === cursorRow;
          const cursorCell = row.cells.find((cell) => cell.start === editor.cursor);
          const before = hasCursor
            ? row.cells.filter((cell) => cell.end <= editor.cursor).map((cell) => cell.text).join("")
            : row.cells.map((cell) => cell.text).join("");
          const after = hasCursor
            ? row.cells.filter((cell) => cell.start > editor.cursor).map((cell) => cell.text).join("")
            : "";

          return (
            <Box key={rowIndex} height={1} flexShrink={0}>
              <Text color="cyan">{rowIndex === 0 ? "> " : index === 0 ? "↑ " : "  "}</Text>
              <Text wrap="truncate-end">
                {editor.text === "" ? (
                  <><Text inverse> </Text><Text dimColor>Type a message...</Text></>
                ) : (
                  <>{before}{hasCursor && <Text inverse>{cursorCell?.text ?? " "}</Text>}{after}</>
                )}
              </Text>
            </Box>
          );
        })}
      </Box>

      <Text dimColor wrap="truncate-end">
        {scrollOffset > 0
          ? `History: ${scrollOffset} rows above latest · PgDn or Ctrl+N to return`
          : columns >= 60
            ? "Enter send · ^J newline · PgUp/PgDn history · ^C exit"
            : "Enter send · ^J newline · ^C exit"}
      </Text>
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
await app.waitUntilExit();
