# 런치 키트 — 파문을 어떻게 소개할까

## 한 줄 (모든 글의 첫 문장)

- **한국어**: 물방울을 떨어뜨리면, 물결이 돌에 닿을 때마다 소리가 나는 악기를 만들었어요.
- **English**: I made an instrument you play with ripples — every stone a wave touches sings.

뒤에 붙일 근거 한 줄(대상에 따라 하나만):
- 일반: 돌을 멀리 두면 늦게, 높이 두면 높게 울려요. 링크 하나로 폰에서 바로 돼요.
- 개발자: 진짜 파동 방정식을 풀어서, 거리가 곧 박자예요. HTML 파일 하나, 라이브러리 0개.
- 과학: 고교 물결통 실험 그대로라 반사 · 회절 · 굴절이 리듬을 바꿔요.

**피할 말**: "물리 시뮬레이터", "파동 투영기", "인터랙티브 미디어아트" — 무엇을 하는지 말하지 않는 단어입니다.

## 15초 영상 (릴스 · 쇼츠 · 틱톡) — 본체는 링크가 아니라 이 영상

폰 세로 화면에서 `녹화` 버튼으로 찍으면 9:16 · 소리 포함으로 바로 나옵니다. 첫 1초에 소리가 나야 합니다.

| 초 | 화면 | 자막(선택) |
|---|---|---|
| 0–3 | 오르골 그대로. 물결이 울림돌을 지날 때마다 번쩍 · 띵 | 물결이 닿으면 소리가 나요 |
| 3–8 | 울림돌 하나를 멀리 끌어간다 → 그 음만 늦게 울린다 | 멀리 두면 늦게 |
| 8–13 | 프리셋 › 메아리 북 → 가운데를 톡 하면 메아리가 박자에 맞춰 돌아온다 | 벽은 메아리 |
| 13–15 | 손을 떼고 그대로 둔다 | 링크는 프로필에 |

변주: 받은 사람이 고쳐서 다시 보내는 "릴레이" — "이 곡 이어서 만들어 줄 사람?"으로 공유 링크를 함께 올립니다.

## 채널별 초안

### 스레드 · 인스타그램 (영상 + 캡션)

> 물방울을 떨어뜨리면, 물결이 돌에 닿을 때마다 소리가 나요.
> 돌을 멀리 두면 늦게, 위에 두면 높게 울려요. 그게 전부인데 계속 만지게 돼요.
> 설치 없이 폰 브라우저에서 바로 → jeiel85.github.io/pamun-ripple-tank
> 만든 곡은 링크로 보낼 수 있어요. 이어서 만들어 줄 사람?

### X (한국어)

> 물결로 연주하는 악기를 만들었어요 🌊
> 물방울 → 물결 → 울림돌에 닿는 순간 소리. 거리가 박자, 높이가 음정.
> 폰에서 바로: jeiel85.github.io/pamun-ripple-tank
> (영상 첨부)

### 긱뉴스 Show GN · 디스콰이엇

> **제목**: 파문 — 물결로 연주하는 브라우저 악기
>
> 물방울을 떨어뜨리면 물결이 퍼지고, 울림돌에 닿을 때마다 소리가 나는 악기입니다. 돌을 멀리 두면 늦게 울려서, 배치가 곧 악보가 됩니다.
>
> - 물결은 애니메이션이 아니라 얕은 물 파동 방정식(320×180 격자)을 매 프레임 풀어서 그립니다. 부팅 때 격자의 실제 전파 속도를 재서 박자 표시와 배치에 씁니다.
> - 시뮬레이션 시간을 유일한 시계로 두고 오디오를 거기에 맞춥니다. 기기가 느리면 음악 전체가 같이 느려집니다.
> - HTML 파일 하나, 라이브러리 0개(WebGL2 · Web Audio). 공유 링크는 서버 없이 수조 배치를 URL 조각에 압축해서 담습니다.
> - 15초 영상 녹화(MediaRecorder)로 바로 숏폼에 올릴 수 있습니다.
>
> 어디서 막히는지, 어떤 배치가 재밌었는지 알려 주시면 고맙겠습니다.
> 링크: https://jeiel85.github.io/pamun-ripple-tank/ · 소스: https://github.com/jeiel85/pamun-ripple-tank

### Hacker News (Show HN)

> **Title**: Show HN: Pamun – an instrument you play with ripples
>
> Drop water into a virtual ripple tank; every stone the wave reaches plays a note. Distance is timing, height is pitch, walls make echoes on the beat.
>
> It's a shallow-water wave equation on a 320×180 grid, solved every frame in plain JS and rendered as caustics in WebGL2. The grid's real propagation speed is measured at boot so the beat rings line up, and the simulation clock drives the audio scheduler. No libraries, one HTML file. Share links carry the whole tank in the URL fragment (deflate-raw), and you can record a 15-second clip.
>
> https://jeiel85.github.io/pamun-ripple-tank/?lang=en

(HN은 제목에 이모지 · 과장 금지. 본문은 첫 댓글로 다는 편이 일반적입니다.)

### Reddit

- **r/InternetIsBeautiful** — 제목: *An instrument you play with ripples: every stone the wave touches sings (no install, works on phones)*. 링크 게시물, 본문 없이.
- **r/creativecoding · r/webgl** — 영상 게시 + 첫 댓글에 기술 요약(위 HN 본문).
- **r/physicsgifs · r/Physics** — "high-school ripple tank, but the stones are notes" 각도로 영상. 홍보 규칙이 엄격하니 각 서브레딧 규칙을 먼저 확인하세요.

### 과학 교사 · 교육 쪽 (선택, 두 번째 파도)

> 고등학교 물결통 실험을 브라우저로 옮겼습니다. 반사 · 회절 · 굴절 · 간섭을 눈으로 보고, 울림돌로 **소리로 듣습니다.** 프리셋에 이중 슬릿 · 메아리 · 타원 초점 · 공명실이 있어요. 설치 없이 교실 화면이나 학생 폰에서 바로 됩니다.

## 올리는 순서

1. **먼저 영상 3개를 찍어 둡니다**(오르골 그대로 · 돌 옮기기 · 벽 메아리). 링크만 올린 글보다 영상 글의 도달이 훨씬 큽니다.
2. 국내 첫날: 스레드/인스타 영상 → 반응을 보고 X. 같은 날 긱뉴스 · 디스콰이엇.
3. 해외: 미국 오전(한국 밤 10~12시)에 Show HN, 다음 날 Reddit. 하루에 다 올리지 않습니다(같은 링크가 여러 곳에 동시에 뜨면 스팸으로 보입니다).
4. 반응이 오면 받은 공유 링크 중 재밌는 걸 다시 영상으로 — "누가 보낸 곡" 시리즈.

## 'AI로 만들었다'는 말

README에 제작 과정을 투명하게 적어 두었습니다. 다만 **첫 문장으로 내세우지는 않는 편**을 권합니다. 커뮤니티에 따라 반응이 크게 갈리고, 사람들이 퍼뜨리는 이유는 만드는 방법이 아니라 손에 쥐었을 때의 느낌이기 때문입니다. 물어보면 그대로 답하면 됩니다.

## 출시 전 확인할 것

- [ ] 실제 폰(iOS Safari · 안드로이드 Chrome)에서 **소리 켜고 시작 → 녹화 → 저장/공유**가 되는지. 아이폰은 무음 스위치를 켜 두면 소리가 나지 않습니다.
- [ ] 받은 공유 링크를 카카오톡 · 인스타 DM · X에 붙여 넣었을 때 잘리지 않는지(벽을 많이 그린 수조로).
- [ ] 공유 미리보기 카드(카카오톡 · X)에 새 이미지가 뜨는지. 캐시 때문에 예전 이미지가 보이면 각 서비스의 캐시 초기화 도구를 쓰세요.
