import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveExamId, isCorrect, scoreExam, sanitizeResponses,
  loadState, saveState, formatTime, shuffled, storageKey, formatVotes,
} from '../assets/core.js';

const manifest = { exams: [{ id: 'FA24-FE' }, { id: 'SP25-B5' }] };

function withLocalStorage(descriptor, fn) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, ...descriptor });
  try { return fn(); } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  }
}
function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
  };
}

test('resolveExamId finds a known exam', () => {
  assert.equal(resolveExamId('?exam=FA24-FE', manifest), 'FA24-FE');
});
test('resolveExamId returns null for unknown id or missing param', () => {
  assert.equal(resolveExamId('?exam=NOPE', manifest), null);
  assert.equal(resolveExamId('', manifest), null);
  assert.equal(resolveExamId('?mode=exam', manifest), null);
});

const q = (n, answer, letters = 'ABCD') => ({
  n, options: Object.fromEntries([...letters].map((l) => [l, 'x'])), pick: answer.length, answer,
});

test('isCorrect single, multi, order-insensitive', () => {
  assert.equal(isCorrect(q(1, ['A']), ['A']), true);
  assert.equal(isCorrect(q(1, ['A']), ['B']), false);
  assert.equal(isCorrect(q(1, ['A', 'C']), ['C', 'A']), true);
  assert.equal(isCorrect(q(1, ['A', 'C']), ['A']), false);
  assert.equal(isCorrect(q(1, ['A']), ['A', 'B']), false);
  assert.equal(isCorrect(q(1, ['A']), []), false);
});

test('scoreExam: 1 correct, 1 wrong, 1 blank', () => {
  const qs = [q(1, ['A']), q(2, ['B']), q(3, ['C'])];
  assert.deepEqual(scoreExam(qs, { 1: ['A'], 2: ['D'] }), {
    correct: 1, total: 3, score10: 3.33, wrong: [2, 3],
  });
});
test('scoreExam: empty exam and perfect score', () => {
  assert.deepEqual(scoreExam([], {}), { correct: 0, total: 0, score10: 0, wrong: [] });
  assert.equal(scoreExam([q(1, ['A'])], { 1: ['A'] }).score10, 10);
});

test('sanitizeResponses drops unknown n, bad letters, non-arrays', () => {
  const qs = [q(1, ['A']), q(2, ['B'])];
  assert.deepEqual(sanitizeResponses(qs, { 9: ['A'] }), {});
  assert.deepEqual(sanitizeResponses(qs, { 1: ['Z'] }), {});
  assert.deepEqual(sanitizeResponses(qs, { 1: 'A' }), {});
  assert.deepEqual(sanitizeResponses(qs, { 1: ['A'], 2: ['B', 'Z'] }), { 1: ['A'], 2: ['B'] });
  assert.deepEqual(sanitizeResponses(qs, null), {});
  assert.deepEqual(sanitizeResponses(qs, 'junk'), {});
  assert.deepEqual(sanitizeResponses(qs, [['A']]), {});
});

test('loadState returns fallback when localStorage getter throws', () => {
  withLocalStorage({ get() { throw new Error('denied'); } }, () => {
    assert.deepEqual(loadState('k', { a: 1 }), { a: 1 });
  });
});
test('loadState returns fallback on invalid JSON or missing key', () => {
  withLocalStorage({ value: fakeStorage({ k: '{not json' }) }, () => {
    assert.equal(loadState('k', 'fb'), 'fb');
    assert.equal(loadState('missing', 'fb'), 'fb');
  });
});
test('saveState and loadState round-trip; saveState swallows errors', () => {
  const st = fakeStorage();
  withLocalStorage({ value: st }, () => {
    saveState('k', { a: [1, 2] });
    assert.deepEqual(loadState('k', null), { a: [1, 2] });
  });
  withLocalStorage({ get() { throw new Error('denied'); } }, () => {
    assert.doesNotThrow(() => saveState('k', 1));
  });
});

test('formatTime', () => {
  assert.equal(formatTime(3599), '59:59');
  assert.equal(formatTime(-5), '00:00');
  assert.equal(formatTime(0), '00:00');
  assert.equal(formatTime(65), '01:05');
  assert.equal(formatTime(3600), '60:00');
});

test('shuffled is deterministic, non-mutating, a permutation', () => {
  const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const copy = [...input];
  const a = shuffled(input, 42);
  const b = shuffled(input, 42);
  assert.deepEqual(a, b);
  assert.deepEqual(input, copy);
  assert.deepEqual([...a].sort((x, y) => x - y), copy);
  assert.notDeepEqual(shuffled(input, 1), shuffled(input, 2));
});

test('storageKey', () => {
  assert.equal(storageKey('FA24-FE', 'exam'), 'mln131:FA24-FE:exam');
});

test('isCorrect is false when the question has an empty or missing answer', () => {
  assert.equal(isCorrect({ n: 1, answer: [] }, []), false);
  assert.equal(isCorrect({ n: 1, answer: [] }, ['A']), false);
  assert.equal(isCorrect({ n: 1 }, ['A']), false);
});

test('sanitizeResponses treats missing options as empty', () => {
  assert.deepEqual(sanitizeResponses([{ n: 1 }], { 1: ['A'] }), {});
});

test('formatTime returns 00:00 for non-finite input', () => {
  assert.equal(formatTime(NaN), '00:00');
  assert.equal(formatTime(Infinity), '00:00');
  assert.equal(formatTime(-Infinity), '00:00');
  assert.equal(formatTime(undefined), '00:00');
});

test('formatVotes shows the full distribution, highest count first', () => {
  assert.equal(formatVotes({ A: 1, B: 3, D: 2 }, 'D'), 'B 3 · D 2 · A 1');
});
test('formatVotes puts the AI key first on ties', () => {
  assert.equal(formatVotes({ A: 1, D: 1 }, 'D'), 'D 1 · A 1');
  assert.equal(formatVotes({ A: 1, D: 1 }, 'A'), 'A 1 · D 1');
  assert.equal(formatVotes({ B: 2, A: 2, D: 2 }, 'D'), 'D 2 · A 2 · B 2');
});
test('formatVotes handles multi-letter keys and a missing AI key', () => {
  assert.equal(formatVotes({ AC: 2, BD: 1 }, 'BD'), 'AC 2 · BD 1');
  assert.equal(formatVotes({ B: 1, A: 1 }), 'A 1 · B 1');
});
test('formatVotes returns an empty string for null, empty or junk votes', () => {
  assert.equal(formatVotes(null, 'A'), '');
  assert.equal(formatVotes(undefined, 'A'), '');
  assert.equal(formatVotes({}, 'A'), '');
  assert.equal(formatVotes(['A'], 'A'), '');
  assert.equal(formatVotes({ A: 'x', B: 2 }, 'A'), 'B 2');
});
