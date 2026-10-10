// 실제 서버 대신 화면을 채워 주는 연습용 데이터입니다.
export const mockData = {
  measurement: { emoji: '📏', title: '스마트 실측', description: '키와 몸무게를 기록하면 나에게 잘 맞는 옷을 찾는 데 도움을 줄 수 있어요.', tag: '실측 모듈 준비 중' },
  recommendation: {
    emoji: '🧥', title: '맞춤 추천', description: '내 정보와 옷장 속 아이템을 바탕으로 즐거운 코디를 추천해 드릴게요.', tag: '가상 데이터로 체험하기',
    items: [
      { id: 1, name: '햇살 노랑 후드티', emoji: '👕', gender: '남학생', category: '상의', season: '봄', size: '150', style: '편한 스타일', color: '밝은 색', condition: '좋음', description: '가볍고 활동하기 편한 후드티예요.' },
      { id: 2, name: '구름빛 조거 바지', emoji: '👖', gender: '남학생', category: '하의', season: '봄', size: '150', style: '활동적인 스타일', color: '밝은 색', condition: '좋음', description: '친구들과 뛰어놀 때 잘 어울려요.' },
      { id: 3, name: '포근한 민트 가디건', emoji: '🧥', gender: '여학생', category: '외투', season: '봄', size: '145', style: '편한 스타일', color: '밝은 색', condition: '좋음', description: '아침저녁 쌀쌀할 때 걸치기 좋아요.' },
      { id: 4, name: '활기찬 파랑 반팔', emoji: '👚', gender: '여학생', category: '상의', season: '여름', size: '150', style: '활동적인 스타일', color: '밝은 색', condition: '보통', description: '더운 날 시원하게 입을 수 있어요.' },
      { id: 5, name: '단정한 네이비 셔츠', emoji: '👔', gender: '남학생', category: '상의', season: '봄', size: '155', style: '편한 스타일', color: '어두운 색', condition: '좋음', description: '발표나 특별한 날에 잘 어울려요.' }
    ]
  },
  ranking: { emoji: '🏆', title: '참여 랭킹', description: '친구들과 함께 나눈 옷과 절약한 자원을 확인할 수 있어요.', tag: '랭킹 모듈 준비 중' }
};
