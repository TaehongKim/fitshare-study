# CLAUDE.md

이 저장소의 규칙은 모두 AGENTS.md에 있습니다. 규칙을 고칠 때는 AGENTS.md만 고치세요.
(아래 줄은 Claude Code가 AGENTS.md를 자동으로 읽어 오게 하는 명령입니다.)

@AGENTS.md

## Claude Code 추가 규칙
- 학생에게는 항상 쉬운 한국어로 답한다.
- AGENTS.md 5번의 답변 순서(파일 → 이유 → 코드 전체 → 테스트 3개 이상 → 다른 모듈 영향)를 지킨다.
- 파일을 고치기 전에 현재 브랜치를 확인하고, `main`이면 멈추고 feature 브랜치를 먼저 만들자고 안내한다.
- commit · push · Pull Request는 학생이 확인한 뒤에만 한다.
