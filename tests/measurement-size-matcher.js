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

async function recordAsync(name, callback) {
  const item = document.createElement('li');
  try {
    await callback();
    passed += 1;
    item.textContent = `PASS: ${name}`;
  } catch (error) {
    failed += 1;
    item.textContent = `FAIL: ${name} — ${error.message}`;
  }
  results.append(item);
}

async function withGuide(callback) {
  const frame = document.createElement('iframe');
  frame.src = '../docs/measurement-process.html';
  frame.title = 'Guide widget test';
  const loaded = new Promise((resolve, reject) => {
    frame.addEventListener('load', resolve, { once: true });
    frame.addEventListener('error', reject, { once: true });
  });
  document.body.append(frame);
  await loaded;
  try {
    await callback(frame.contentDocument);
  } finally {
    frame.remove();
  }
}

function setComparisonValues(doc, measured, candidates) {
  doc.querySelector('[data-measured-width]').value = measured.widthCm;
  doc.querySelector('[data-measured-length]').value = measured.lengthCm;
  while (doc.querySelectorAll('[data-chart-row]').length < candidates.length) {
    doc.querySelector('[data-add-candidate]').click();
  }
  while (doc.querySelectorAll('[data-chart-row]').length > candidates.length) {
    const rows = doc.querySelectorAll('[data-chart-row]');
    rows[rows.length - 1].querySelector('[data-remove-candidate]').click();
  }
  const rows = [...doc.querySelectorAll('[data-chart-row]')];
  candidates.forEach((candidate, index) => {
    rows[index].querySelector('[data-candidate-label]').value = candidate.label;
    rows[index].querySelector('[data-candidate-width]').value = candidate.widthCm;
    rows[index].querySelector('[data-candidate-length]').value = candidate.lengthCm;
  });
  doc.querySelector('[data-size-matcher-form]').dispatchEvent(
    new doc.defaultView.Event('submit', { bubbles: true, cancelable: true })
  );
}

function finish() {
  summary.textContent = `${passed} passed, ${failed} failed`;
  summary.dataset.failed = String(failed);
}

import('../docs/js/measurement-size-matcher.js')
  .then(async ({ rankSizeCandidates }) => {
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

    await recordAsync('shows the closest product-chart label and differences', () =>
      withGuide((doc) => {
        setComparisonValues(
          doc,
          { widthCm: 32, lengthCm: 50 },
          [
            { label: '100', widthCm: 33, lengthCm: 51 },
            { label: '110', widthCm: 36, lengthCm: 54 }
          ]
        );
        const status = doc.querySelector('[data-size-status]').textContent;
        const output = doc.querySelector('[data-size-results]').textContent;
        if (!status.includes('100')) throw new Error('closest label is not announced');
        if (!output.includes('너비 1.0cm 차이')) throw new Error('width difference is missing');
        if (!output.includes('기장 1.0cm 차이')) throw new Error('length difference is missing');
      })
    );

    await recordAsync('announces all equally close chart labels', () =>
      withGuide((doc) => {
        setComparisonValues(
          doc,
          { widthCm: 32, lengthCm: 50 },
          [
            { label: 'smaller', widthCm: 31, lengthCm: 49 },
            { label: 'larger', widthCm: 33, lengthCm: 51 }
          ]
        );
        const status = doc.querySelector('[data-size-status]').textContent;
        if (!status.includes('smaller') || !status.includes('larger')) {
          throw new Error('both tied labels must be announced');
        }
      })
    );

    await recordAsync('shows an error and clears results for invalid form values', () =>
      withGuide((doc) => {
        setComparisonValues(
          doc,
          { widthCm: 0, lengthCm: 50 },
          [{ label: '100', widthCm: 33, lengthCm: 51 }]
        );
        if (!doc.querySelector('[data-size-status]').textContent.includes('0보다')) {
          throw new Error('a readable invalid-width message is missing');
        }
        assertEqual(doc.querySelectorAll('[data-size-results] li').length, 0, 'results after invalid input');
      })
    );

    await recordAsync('renders a size label containing HTML as plain text', () =>
      withGuide((doc) => {
        const label = '<b>100</b>';
        setComparisonValues(
          doc,
          { widthCm: 32, lengthCm: 50 },
          [{ label, widthCm: 32, lengthCm: 50 }]
        );
        if (!doc.querySelector('[data-size-results]').textContent.includes(label)) {
          throw new Error('the label text is missing');
        }
        assertEqual(doc.querySelectorAll('[data-size-results] b').length, 0, 'injected elements');
      })
    );

    await recordAsync('allows chart candidate rows to be added and removed', () =>
      withGuide((doc) => {
        const rows = doc.querySelectorAll('[data-chart-row]');
        const startingCount = rows.length;
        doc.querySelector('[data-add-candidate]').click();
        assertEqual(doc.querySelectorAll('[data-chart-row]').length, startingCount + 1, 'rows after add');
        doc.querySelector('[data-chart-row] [data-remove-candidate]').click();
        assertEqual(doc.querySelectorAll('[data-chart-row]').length, startingCount, 'rows after remove');
      })
    );
  })
  .catch((error) => {
    failed += 1;
    const item = document.createElement('li');
    item.textContent = `FAIL: matcher module unavailable — ${error.message}`;
    results.append(item);
  })
  .finally(finish);
