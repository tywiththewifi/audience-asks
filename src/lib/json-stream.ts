/**
 * Reads a JSON object as it streams in and hands over the source of each finished element of the arrays
 * directly under it, such as each topic in {"topics": [{…}, {…}]}, while the rest is still being written.
 * It tracks strings, so brackets inside them don't count.
 */
export function createArrayItemParser(onItem: (json: string) => void) {
  let text = "";
  let depth = 0;
  let inString = false;
  let escaped = false;
  let start = -1;
  return (chunk: string) => {
    const offset = text.length;
    text += chunk;
    for (let i = 0; i < chunk.length; i++) {
      const ch = chunk[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inString = false;
      } else if (ch === '"') {
        inString = true;
      } else if (ch === "{" || ch === "[") {
        depth += 1;
        if (depth === 3) start = offset + i;
      } else if (ch === "}" || ch === "]") {
        if (depth === 3 && start >= 0) {
          onItem(text.slice(start, offset + i + 1));
          start = -1;
        }
        depth -= 1;
      }
    }
  };
}
