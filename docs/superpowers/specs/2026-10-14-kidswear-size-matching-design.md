# Korean Children's Clothing Size Matching Design

## Goal

Explain how measured garment dimensions relate to Korean children's clothing
size labels, and provide a small working comparison tool without claiming that
flat garment measurements identify a universal size label.

## Evidence and limits

- The Korea Standards Association's KSSN catalogue lists KS K 0052 as
  "유아복의 치수" (infant clothing sizes), with a 2024 confirmation.
- A public study about revising the infant sizing system describes height as
  the basic measurement and proposes 5 cm height intervals. Its analyzed
  population is infants from 0 to 36 months. The paper is not a universal
  garment-dimension chart for all children's clothing.
- A photographed garment's width and length are garment measurements. Brand,
  garment type, cut, and intended ease vary, so these values cannot be safely
  converted to a universal Korean size label. Product-specific charts are
  needed for a meaningful comparison.

Sources:

- [KSSN: KS K 0052 (2024 confirmed), infant clothing sizes](https://www.kssn.net/search/stddetail.do?itemNo=K001010147933)
- [KoreaScience: proposed revision of the infant clothing sizing system](https://www.koreascience.kr/article/JAKO201412835857603.page)

## Design

1. Add a plain-language section to `docs/measurement-process.html` explaining
   that a size label is not the measured garment length, that KS K 0052 is an
   infant-size reference rather than a universal school-age garment chart, and
   that brand/product charts are required to compare garment dimensions to a
   label.
2. Add a standalone chart-comparison widget on that guide. The user enters the
   measured garment's width and length, then adds labeled candidate rows copied
   from a particular product's size chart. The widget ranks candidates by the
   mean of width and length relative absolute errors:

   `((abs(candidateWidth - measuredWidth) / measuredWidth) + (abs(candidateLength - measuredLength) / measuredLength)) / 2`

   Show the closest label and each dimension's difference. Ties remain tied.
   Clearly state that the compared widths must use the same measurement line
   and method.
3. Invalid, missing, or non-positive measurements must show a readable error;
   do not emit a size recommendation from invalid input.
4. Remove the guide's remaining browser-fallback note and related code example.
   Do not change the app's automatic browser fallback behavior.

## Files

- `docs/measurement-process.html`: explanation, source links, and widget markup.
- `docs/js/measurement-size-matcher.js`: DOM interaction and comparison logic.
- `tests/test_measurement_process_page.py`: guide content and widget wiring.
- A focused test for the comparison helper, using existing project tooling.
- `Handspff/진행상황.md`: concise handoff update after implementation.

Do not modify shared application styles, main app modules, or server behavior.
Style the widget within the guide's existing visual conventions.

## Acceptance criteria

- The page distinguishes a child's body-size designation from a garment's
  measured dimensions and does not claim a national universal garment chart.
- The interactive tool ranks the nearest candidate from a product-specific
  chart, reports differences, handles ties, and explains the comparison's
  limits.
- Normal, boundary, and invalid-input cases are tested.
- The previous browser-fallback explanation is absent from the guide, while
  runtime fallback behavior remains unchanged.
- The guide tests and full project test suite pass; the page works locally and
  on GitHub Pages.
