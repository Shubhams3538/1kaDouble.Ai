import { Box, Text, render } from "ink";

function App() {
  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>1kaDouble.Ai</Text>
      <Text>CLI foundation is running.</Text>
      <Text dimColor>Backend connection comes next.</Text>
    </Box>
  );
}
const app = render(<App />);

await app.waitUntilRenderFlush();
app.unmount();
await app.waitUntilExit();
