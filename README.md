# anna-watch

Yumiko "전설의 안나" (Anna Duo · CV-Silver 상의 / N-Silver 하의 · 캡소매 · 전면안감 · 하이컷, **L 사이즈**) 재입고 감시.

## 감시 대상

| 소스 | 알림 조건 |
|---|---|
| 니사라트 ANNA - SILVER | 품절 → 구매 가능 (유일하게 샵 자체 재입고 알림도 있음) |
| 이발레샵 Yumiko - Anna (Silver) | L 옵션의 `[품절]` 해제 (샵에 재입고 알림 기능 없음) |
| 탑토 전설의 안나♪ | 품절 → 구매 가능 (샵에 재입고 알림 기능 없음) |
| 탑토 Anna 카테고리 | 이름에 Silver 들어간 신규 상품 |
| 브이데니에 유미코 카테고리 | Anna 신규 상품 / L 사이즈 등장 |
| 랑베르쎄 유미코 | 안나 신규 등록 |
| Yumiko 공식 Ready to Wear (JP/US/EU) | Anna + Silver 상품 등장 / L 재고 |

**현황 페이지:** https://onschan.github.io/anna-watch/ — `check.js`가 매 실행마다 `docs/`를 다시 만들고 GitHub에 푸시한다 (문구는 `site.js` 상단 `SITE`에서 수정).

변화가 있을 때만 알림: macOS 배너 + (설정 시) 이메일 + Slack. 파싱 실패는 한 번만 경고하고 복구될 때까지 조용히.

## 이메일 알림 설정

```bash
cp .env.example .env   # EMAIL_TO / SMTP_USER / SMTP_PASS 채우기
node check.js --test   # 테스트 메일 발송
```

Gmail은 2단계 인증 후 앱 비밀번호(16자리)를 발급해 `SMTP_PASS`에 넣는다. 네이버는 `SMTP_HOST=smtp.naver.com`. 외부 패키지 없이 macOS 내장 `curl`로 보낸다.

## 사용

```bash
node check.js          # 확인 + 변화 시 알림
node check.js --dry    # 알림 없이 현황만
node check.js --test   # 알림 테스트
```

## 자동 실행 (1시간마다)

```bash
./install.sh                          # 등록
INTERVAL=1800 ./install.sh            # 30분으로 변경
./uninstall.sh                        # 해제
```

로그: `watch.log` (감시 결과), `launchd.err.log` (실행 오류). 상태: `state.json` (지우면 처음부터 다시).

## 사이트 구조가 바뀌면

`⚠️ ... 확인 실패` 알림이 오면 `check.js`의 해당 source `check()`를 고친다. 각 source는 독립적이라 하나가 깨져도 나머지는 계속 돈다.
