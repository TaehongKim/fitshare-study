// 한글 학교명도 학교 코드 칸에 쓸 수 있게 입력을 다듬습니다.
export function createSchoolEntryResult(inputValue) {
  const code = String(inputValue ?? '').trim();
  if (!code) return { ok: false, code: '', message: '학교 코드를 한 번 입력해 볼까요?' };
  return { ok: true, code, message: `${code} 스마트 옷장에 입장했어요! 아래 버튼으로 옷을 등록해 보세요.` };
}
