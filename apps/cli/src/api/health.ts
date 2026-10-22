export async function getBackendHealth(): Promise<string> {
  const response = await fetch("http://127.0.0.1:3001/health", {
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    throw new Error(`Backend returned HTTP ${response.status}`);
  }

  const data: unknown = await response.json();

  if (
    typeof data !== "object" ||
    data === null ||
    !("status" in data) ||
    data.status !== "ok" ||
    !("service" in data) ||
    typeof data.service !== "string"
  ) {
    throw new Error("Backend returned an unexpected health response");
  }

  return data.service;
}
