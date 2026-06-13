// 카카오 로그인(웹). Kakao JS SDK를 동적 로드 → Kakao.init → 로그인 → access_token 획득.
// 토큰은 인증 백엔드(/api/fomo/auth/login, KAKAO 분기)가 kapi.kakao.com로 서버 검증한다.
// NEXT_PUBLIC_KAKAO_JS_KEY 필요(Vercel). Kakao Developers 콘솔에 웹 도메인 등록 선행.

const SDK_SRC = "https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js";

interface KakaoAuth {
  login(opts: {
    scope?: string;
    success: (res: { access_token: string }) => void;
    fail: (err: unknown) => void;
  }): void;
}
interface KakaoSDK {
  isInitialized(): boolean;
  init(key: string): void;
  Auth: KakaoAuth;
}
declare global {
  interface Window {
    Kakao?: KakaoSDK;
  }
}

let sdkPromise: Promise<KakaoSDK> | null = null;

function loadSdk(): Promise<KakaoSDK> {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<KakaoSDK>((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("브라우저 환경이 아닙니다"));
      return;
    }
    if (window.Kakao) {
      resolve(window.Kakao);
      return;
    }
    const script = document.createElement("script");
    script.src = SDK_SRC;
    script.async = true;
    script.onload = () => {
      if (window.Kakao) resolve(window.Kakao);
      else reject(new Error("Kakao SDK 로드 실패"));
    };
    script.onerror = () => reject(new Error("Kakao SDK 스크립트 로드 실패"));
    document.head.appendChild(script);
  });
  return sdkPromise;
}

/** 카카오 로그인 → access_token. 백엔드 로그인 엔드포인트에 그대로 넘긴다. */
export async function loginWithKakao(): Promise<string> {
  const jsKey = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
  if (!jsKey) throw new Error("NEXT_PUBLIC_KAKAO_JS_KEY 미설정");

  const Kakao = await loadSdk();
  if (!Kakao.isInitialized()) Kakao.init(jsKey);

  return new Promise<string>((resolve, reject) => {
    Kakao.Auth.login({
      success: (res) => resolve(res.access_token),
      fail: (err) => reject(err instanceof Error ? err : new Error("카카오 로그인 실패")),
    });
  });
}
