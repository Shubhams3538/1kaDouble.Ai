import { Box, Text, render } from "ink";
import { getBackendHealth } from "./api/health.js";

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
