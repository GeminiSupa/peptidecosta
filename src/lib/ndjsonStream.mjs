/**
 * Reading newline-delimited JSON off a `fetch` response body.
 *
 * Network chunks have nothing to do with message boundaries: a single JSON
 * object routinely arrives split across two reads, and two small objects
 * routinely arrive in one. Anything that parses a chunk directly works on a
 * fast local connection and drops events on a real one, so the buffering lives
 * here where the awkward boundaries can be tested directly.
 */

/**
 * @param {(event: any) => void} onEvent called once per complete JSON line
 * @param {(line: string, error: Error) => void} [onBadLine] called for a line
 *   that is not valid JSON, so a single corrupt event does not end the stream
 */
export function createNdjsonParser(onEvent, onBadLine) {
  let buffer = '';

  const drain = (finalFlush) => {
    for (;;) {
      const newline = buffer.indexOf('\n');
      if (newline < 0) break;
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      emit(line);
    }
    if (finalFlush) {
      // A well-behaved producer ends with a newline, but a stream cut short
      // mid-send can leave a complete object with no terminator.
      const rest = buffer.trim();
      buffer = '';
      if (rest) emit(rest);
    }
  };

  function emit(line) {
    if (!line) return;
    try {
      onEvent(JSON.parse(line));
    } catch (error) {
      onBadLine?.(line, error);
    }
  }

  return {
    push(text) {
      if (!text) return;
      buffer += text;
      drain(false);
    },
    flush() {
      drain(true);
    },
  };
}

/**
 * Drives a parser from a `Response.body` reader until the stream ends.
 *
 * `decode(..., { stream: true })` matters: a multi-byte character split across
 * two chunks would otherwise decode to a replacement character and corrupt the
 * line it landed in — business names are full of accented characters.
 */
export async function readNdjsonStream(body, onEvent, onBadLine) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parser = createNdjsonParser(onEvent, onBadLine);

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      parser.push(decoder.decode(value, { stream: true }));
    }
    parser.push(decoder.decode());
    parser.flush();
  } finally {
    reader.releaseLock?.();
  }
}
