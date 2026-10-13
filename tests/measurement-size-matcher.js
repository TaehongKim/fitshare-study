const results = document.querySelector('#results');
const summary = document.querySelector('#summary');
let passed = 0;
let failed = 0;

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function assertClose(actual, expected, message) {
  if (Math.abs(actual - expected) > 1e-12) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function assertThrows(callback, message) {
  let threw = false;
  try {
    callback();
  } catch (error) {
    threw = error instanceof Error;
  }
  if (!threw) throw new Error(message);
}

function record(name, callback) {
  const item = document.createElement('li');
  try {
    callback();
    passed += 1;
    item.textContent = `PASS: ${name}`;
  } catch (error) {
    failed += 1;
    item.textContent = `FAIL: ${name} — ${error.message}`;
  }
  results.append(item);
}

function finish() {
  summary.textContent = `${passed} passed, ${failed} failed`;
  summary.dataset.failed = String(failed);
}

import('../docs/js/measurement-size-matcher.js')
  .then(({ rankSizeCandidates }) => {
    record('ranks the closest product-chart candidate', () => {
      const ranked = rankSizeCandidates(
        { widthCm: 32, lengthCm: 50 },
        [
          { label: '100', widthCm: 33, lengthCm: 51 },
          { label: '110', widthCm: 36, lengthCm: 54 }
        ]
      );
      assertEqual(ranked[0].label, '100', 'closest label');
      assertEqual(ranked[0].widthDifferenceCm, 1, 'width difference');
      assertEqual(ranked[0].lengthDifferenceCm, 1, 'length difference');
      assertClose(ranked[0].errorRatio, 0.025625, 'relative error');
    });

    record('keeps equally close candidates tied', () => {
      const ranked = rankSizeCandidates(
        { widthCm: 32, lengthCm: 50 },
        [
          { label: 'smaller', widthCm: 31, lengthCm: 49 },
          { label: 'larger', widthCm: 33, lengthCm: 51 }
        ]
      );
      assertEqual(ranked.length, 2, 'candidate count');
      assertEqual(ranked[0].errorRatio, ranked[1].errorRatio, 'tied error');
    });

    record('rejects missing, non-finite, zero, and negative dimensions', () => {
      const candidates = [{ label: '100', widthCm: 32, lengthCm: 50 }];
      for (const measured of [
        { widthCm: '', lengthCm: 50 },
        { widthCm: Number.NaN, lengthCm: 50 },
        { widthCm: 0, lengthCm: 50 },
        { widthCm: -1, lengthCm: 50 },
        { widthCm: 32, lengthCm: 0 }
      ]) {
        assertThrows(() => rankSizeCandidates(measured, candidates), 'invalid measurement must fail');
      }
    });

    record('rejects blank labels and incomplete chart rows', () => {
      const measured = { widthCm: 32, lengthCm: 50 };
      assertThrows(
        () => rankSizeCandidates(measured, [{ label: ' ', widthCm: 32, lengthCm: 50 }]),
        'blank labels must fail'
      );
      assertThrows(
        () => rankSizeCandidates(measured, [{ label: '100', widthCm: 32 }]),
        'incomplete rows must fail'
      );
      assertThrows(() => rankSizeCandidates(measured, []), 'empty charts must fail');
    });
  })
  .catch((error) => {
    failed += 1;
    const item = document.createElement('li');
    item.textContent = `FAIL: matcher module unavailable — ${error.message}`;
    results.append(item);
  })
  .finally(finish);
