import { useEffect, useState } from "react";
import { useStdout } from "ink";
import { WriteStream } from "node:tty";

type TerminalSize = {
  columns: number;
  rows: number;
};

function readTerminalSize(stdout: NodeJS.WritableStream): TerminalSize {
  if (stdout instanceof WriteStream) {
    return {
      columns: stdout.columns ?? 80,
      rows: stdout.rows ?? 24,
    };
  }

  return { columns: 80, rows: 24 };
}

export function useTerminalSize(): TerminalSize {
  const { stdout } = useStdout();

  const [size, setSize] = useState<TerminalSize>(() =>
    readTerminalSize(stdout),
  );

  useEffect(() => {
    function updateSize() {
      setSize(readTerminalSize(stdout));
    }

    // Subscribe before reading again so a resize during mounting is not missed.
    stdout.on("resize", updateSize);
    updateSize();

    return () => {
      // Remove this hook's listener when it unmounts or stdout changes.
      stdout.off("resize", updateSize);
    };
  }, [stdout]);

  return size;
}
