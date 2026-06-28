# SPEC CHECKLIST

스펙/WO를 구현에 넘기기 전에 작성자가 채운다.

- [ ] `docs/PRODUCT_VISION.md`와 충돌하지 않는다.
- [ ] `AGENTS.md` 블랙리스트를 인용했고 위반하지 않는다.
- [ ] `docs/DATA_ENGINE_STRATEGY.md`의 grounding/fail-closed 원칙을 반영했다.
- [ ] 성공 지표가 측정 가능하다.
- [ ] 비범위가 명확하다.
- [ ] 데이터가 없을 때 fallback이 정의되어 있다.
- [ ] 투자조언, 매수/매도, 목표가, 예측 금칙어를 배제했다.
- [ ] 테스트/게이트가 구체적이다.
- [ ] discovery 관련이면 `npm run guard:discovery`가 검증 계획에 있다.
- [ ] HANDOFF에 남길 다음 액션과 검증 결과 형식이 있다.
