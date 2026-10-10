// ChArUco 교차점 옷 등록으로 안내하고 비교 실험도 계속 열 수 있게 합니다.
export function renderMeasurement(root) {
  root.innerHTML = `
    <article class="module-card measurement-entry">
      <div class="module-emoji" aria-hidden="true">📏</div>
      <div>
        <h3>옷을 등록해 볼까요?</h3>
        <p>ChArUco 교차점 매트에 옷을 놓고 사진을 찍으면 컴퓨터가 옷 종류와 색, 길이와 너비를 먼저 찾아요. 값을 확인하고 고친 다음 저장해요.</p>
        <a class="measurement-start-link" href="measure/register.html">ChArUco로 옷 등록하기 <span aria-hidden="true">→</span></a>
        <a class="measurement-history-link" href="measure/index.html">네 가지 배경 비교 실험</a>
        <a class="measurement-history-link" href="results/sessions.html">저장된 실험 회차 보기</a>
        <span class="module-tag">남녀용은 사진만으로 알 수 없어 직접 확인해요</span>
      </div>
    </article>`;
  root.dataset.module = 'measurement';
}
