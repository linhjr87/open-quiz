import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveExamId, isCorrect, scoreExam, sanitizeResponses,
  loadState, saveState, formatTime, shuffled, storageKey, formatVotes,
  expireIfIdle, sanitizeHistory, loadHistory, appendAttempt, makeAttempt, wrongOf, historyStats, formatDate,
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
    removeItem: (k) => { delete data[k]; },
    key: (i) => Object.keys(data)[i] ?? null,
    get length() { return Object.keys(data).length; },
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

const qs3 = [
  { n: 1, options: { A: '', B: '' }, answer: ['A'] },
  { n: 2, options: { A: '', B: '' }, answer: ['B'] },
  { n: 3, options: { A: '', B: '', C: '' }, answer: ['A', 'C'] },
];
const DAY = 86400000;

test('expireIfIdle wipes only mln131: keys after more than 7 days idle', () => {
  const st = fakeStorage({ 'mln131:lastSeen': String(0), 'mln131:X:history': '{}', 'other:key': '1' });
  assert.equal(expireIfIdle(7 * DAY + 1, st), true);
  assert.deepEqual(Object.keys(st.data).sort(), ['mln131:lastSeen', 'other:key']);
  assert.equal(JSON.parse(st.data['mln131:lastSeen']), 7 * DAY + 1);
});
test('expireIfIdle keeps data at exactly 7 days and when lastSeen is missing', () => {
  const a = fakeStorage({ 'mln131:lastSeen': '0', 'mln131:X:study': '{}' });
  assert.equal(expireIfIdle(7 * DAY, a), false);
  assert.ok('mln131:X:study' in a.data);
  const b = fakeStorage({ 'mln131:X:study': '{}' });
  assert.equal(expireIfIdle(123, b), false);
  assert.ok('mln131:X:study' in b.data);
  assert.equal(JSON.parse(b.data['mln131:lastSeen']), 123);
});
test('expireIfIdle returns false when storage throws', () => {
  const bad = { get length() { throw new Error('x'); }, getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
  assert.equal(expireIfIdle(1, bad), false);
});
test('makeAttempt: exam carries score10 and auto only when auto', () => {
  const r = { 1: ['A'], 2: ['A'] }; // 1 right, 2 wrong, 3 blank
  assert.deepEqual(makeAttempt('exam', qs3, r, 5, true),
    { mode: 'exam', at: 5, correct: 1, total: 3, score10: 3.33, auto: true, responses: { 1: ['A'], 2: ['A'] } });
  assert.equal('auto' in makeAttempt('exam', qs3, r, 5), false);
  const s = makeAttempt('study', qs3, { 1: ['A'], 2: ['B'], 3: ['A', 'C'] }, 9);
  assert.deepEqual(s, { mode: 'study', at: 9, correct: 3, total: 3, responses: { 1: ['A'], 2: ['B'], 3: ['A', 'C'] } });
});
test('makeAttempt copies responses (later mutation does not leak)', () => {
  const r = { 1: ['A'] };
  const a = makeAttempt('study', qs3, r, 1);
  r[1].push('B');
  assert.deepEqual(a.responses[1], ['A']);
});
test('wrongOf uses the current answer key; blanks are wrong; order follows questions', () => {
  const a = { mode: 'exam', responses: { 3: ['A', 'C'], 1: ['B'] } };
  assert.deepEqual(wrongOf(a, qs3), [1, 2]);
  const fixed = qs3.map((q) => (q.n === 1 ? { ...q, answer: ['B'] } : q));
  assert.deepEqual(wrongOf(a, fixed), [2]);
});
test('sanitizeHistory drops junk and keeps valid attempts in order', () => {
  const ok1 = { mode: 'study', at: 1, correct: 2, total: 3, responses: {} };
  const ok2 = { mode: 'exam', at: 2, correct: 1, total: 3, score10: 3.33, responses: { 1: ['A'] } };
  const raw = { v: 1, attempts: [ok1, null, 'x', { mode: 'quiz', at: 1, correct: 0, total: 1, responses: {} },
    { mode: 'exam', at: 3, correct: 1, total: 3, responses: {} } /* exam without score10 */,
    { mode: 'study', at: 4, correct: 5, total: 3, responses: {} } /* correct > total */, ok2] };
  assert.deepEqual(sanitizeHistory(raw), { v: 1, attempts: [ok1, ok2] });
  for (const junk of [null, 'x', [], { attempts: 'no' }]) assert.deepEqual(sanitizeHistory(junk), { v: 1, attempts: [] });
});
test('appendAttempt returns the new 1-based k and loadHistory reads it back', () => {
  withLocalStorage({ value: fakeStorage() }, () => {
    const a = makeAttempt('study', qs3, {}, 1);
    assert.equal(appendAttempt('E', a), 1);
    assert.equal(appendAttempt('E', a), 2);
    assert.equal(loadHistory('E').attempts.length, 2);
    assert.deepEqual(loadHistory('missing'), { v: 1, attempts: [] });
  });
});
test('historyStats counts modes and takes the best exam score', () => {
  const h = { v: 1, attempts: [
    { mode: 'exam', score10: 7 }, { mode: 'study' }, { mode: 'exam', score10: 8.5 }, { mode: 'study' }, { mode: 'study' }] };
  assert.deepEqual(historyStats(h), { exams: 2, studies: 3, best: 8.5 });
  assert.deepEqual(historyStats({ v: 1, attempts: [] }), { exams: 0, studies: 0, best: null });
});
test('formatDate is dd/mm/yyyy', () => {
  assert.equal(formatDate(new Date(2026, 10, 2).getTime()), '02/11/2026');
});
