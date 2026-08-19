import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createNdjsonParser, readNdjsonStream } from '../src/lib/ndjsonStream.mjs';

const collect = () => {
  const events = [];
  const bad = [];
  const parser = createNdjsonParser((event) => events.push(event), (line) => bad.push(line));
  return { events, bad, parser };
};

test('whole lines in one chunk are emitted in order', () => {
  const { events, parser } = collect();
  parser.push('{"type":"meta"}\n{"type":"partial","n":1}\n');
  assert.deepEqual(events, [{ type: 'meta' }, { type: 'partial', n: 1 }]);
});

test('an object split across chunks is not emitted until it is complete', () => {
  const { events, parser } = collect();
  parser.push('{"type":"par');
  assert.deepEqual(events, [], 'nothing is emitted from half an object');
  parser.push('tial","prospects":[1,2]}');
  assert.deepEqual(events, [], 'still nothing without the newline');
  parser.push('\n');
  assert.deepEqual(events, [{ type: 'partial', prospects: [1, 2] }]);
});

test('several objects arriving in one chunk are all emitted', () => {
  const { events, parser } = collect();
  parser.push('{"a":1}\n{"a":2}\n{"a":3}\n');
  assert.deepEqual(events.map((event) => event.a), [1, 2, 3]);
});

test('a chunk boundary landing exactly on the newline loses nothing', () => {
  const { events, parser } = collect();
  parser.push('{"a":1}');
  parser.push('\n{"a":2}\n');
  assert.deepEqual(events.map((event) => event.a), [1, 2]);
});

test('a final object with no trailing newline is emitted on flush', () => {
  const { events, parser } = collect();
  parser.push('{"a":1}\n{"a":2}');
  assert.deepEqual(events.map((event) => event.a), [1]);
  parser.flush();
  assert.deepEqual(events.map((event) => event.a), [1, 2]);
});

test('blank lines are skipped rather than reported as corrupt', () => {
  const { events, bad, parser } = collect();
  parser.push('\n\n{"a":1}\n\n');
  parser.flush();
  assert.deepEqual(events, [{ a: 1 }]);
  assert.deepEqual(bad, []);
});

test('one corrupt line does not stop the events after it', () => {
  const { events, bad, parser } = collect();
  parser.push('{"a":1}\nnot json\n{"a":2}\n');
  assert.deepEqual(events.map((event) => event.a), [1, 2]);
  assert.deepEqual(bad, ['not json']);
});

/** Turns byte chunks into the `Response.body` shape readNdjsonStream expects. */
const bodyOf = (chunks) => {
  let index = 0;
  return {
    getReader: () => ({
      read: async () => (index < chunks.length
        ? { value: chunks[index++], done: false }
        : { value: undefined, done: true }),
      releaseLock: () => {},
    }),
  };
};

test('reading a response body yields every event across ragged chunks', async () => {
  const payload = `${JSON.stringify({ type: 'meta' })}\n${JSON.stringify({ type: 'partial' })}\n${JSON.stringify({ type: 'complete' })}\n`;
  const bytes = new TextEncoder().encode(payload);
  // Deliberately awkward boundaries, including one inside a JSON object.
  const chunks = [bytes.slice(0, 5), bytes.slice(5, 6), bytes.slice(6, 40), bytes.slice(40)];

  const events = [];
  await readNdjsonStream(bodyOf(chunks), (event) => events.push(event));
  assert.deepEqual(events.map((event) => event.type), ['meta', 'partial', 'complete']);
});

test('a multi-byte character split across chunks survives decoding', async () => {
  const payload = `${JSON.stringify({ name: 'Gimnasio Esazú — Peñas Blancas' })}\n`;
  const bytes = new TextEncoder().encode(payload);
  const split = payload.indexOf('ú') + 1;
  const chunks = [bytes.slice(0, split), bytes.slice(split)];

  const events = [];
  const bad = [];
  await readNdjsonStream(bodyOf(chunks), (event) => events.push(event), (line) => bad.push(line));
  assert.deepEqual(bad, [], 'the accented name did not corrupt its line');
  assert.equal(events[0].name, 'Gimnasio Esazú — Peñas Blancas');
});
