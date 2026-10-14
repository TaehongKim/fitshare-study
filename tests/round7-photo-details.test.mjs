import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const reportScript = await readFile(
  new URL('../docs/js/measurement/publicRound7Report.js', import.meta.url),
  'utf8'
);

test('round 7 photo details are open by default', () => {
  assert.match(reportScript, /<details class="round7-photo" open>/);
});

test('round 7 photo details keep the summary toggle control', () => {
  assert.match(reportScript, /<details class="round7-photo" open><summary>/);
});

test('round 7 photo details remain properly closed in the generated markup', () => {
  assert.match(reportScript, /<\/details><\/div><\/article>`;/);
});
