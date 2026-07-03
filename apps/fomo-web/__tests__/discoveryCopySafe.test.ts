import { describe, expect, it } from "vitest";
import { isDiscoveryCopySafe } from "../lib/discoveryCopySafe";

describe("isDiscoveryCopySafe — 금칙 카피 오탐 방지", () => {
  it("영문 접두 한국 종목명은 안전(조사 뒤 한글이 이어지면 조사가 아님)", () => {
    // 프로덕션 카드 로딩 멈춤의 실제 원인: SK+이터닉스 의 'SK이'가 '영문+조사(이)'로 오탐됐었다.
    expect(isDiscoveryCopySafe("기관 6일 연속 순매수 3만주 — SK이터닉스")).toBe(true);
    expect(isDiscoveryCopySafe("SK이노베이션")).toBe(true);
    expect(isDiscoveryCopySafe("외국인 5일 연속 순매수 — LG이노텍")).toBe(true);
  });

  it("실제 미번역 영문+조사 잔여물은 오염으로 판정", () => {
    expect(isDiscoveryCopySafe("AAPL의 실적이 좋았다")).toBe(false);
    expect(isDiscoveryCopySafe("Nvidia와 경쟁하는 중")).toBe(false);
    expect(isDiscoveryCopySafe("the company reported")).toBe(false);
    expect(isDiscoveryCopySafe("SHPH , ILLR")).toBe(false);
  });

  it("정상 한국어 카피는 안전", () => {
    expect(isDiscoveryCopySafe("기관이 6일째 사는 중이에요.")).toBe(true);
    expect(isDiscoveryCopySafe("52주 저점권에 가까운 상태예요.")).toBe(true);
  });
});
