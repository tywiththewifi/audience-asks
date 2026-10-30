/** Splits a text/event-stream body into the JSON payloads of its `data:` lines. */
export function createSSEParser(onData: (data: unknown) => void) {
  let buffer = "";
  return (chunk: string) => {
    buffer += chunk;
    let end: number;
    while ((end = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const data = block
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trimStart())
        .join("\n");
      if (data) onData(JSON.parse(data));
    }
  };
}
