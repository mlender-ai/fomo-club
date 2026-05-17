// Apple / Google 소셜 토큰 서버 사이드 검증

// ─── Apple ───────────────────────────────────────────────────────────────────

interface AppleJwk {
  kid: string;
  n: string;
  e: string;
  kty: string;
  alg: string;
  use: string;
}

interface ApplePublicKeyResponse {
  keys: AppleJwk[];
}

interface AppleIdTokenClaims {
  sub: string;
  email?: string;
  aud: string;
  iss: string;
  exp: number;
}

let appleKeysCache: { keys: AppleJwk[]; fetchedAt: number } | null = null;

async function getApplePublicKeys(): Promise<AppleJwk[]> {
  const now = Date.now();
  if (appleKeysCache && now - appleKeysCache.fetchedAt < 3600_000) {
    return appleKeysCache.keys;
  }
  const res = await fetch("https://appleid.apple.com/auth/keys", {
    signal: AbortSignal.timeout(5_000),
  });
  if (!res.ok) throw new Error("Failed to fetch Apple public keys");
  const data = (await res.json()) as ApplePublicKeyResponse;
  appleKeysCache = { keys: data.keys, fetchedAt: now };
  return data.keys;
}

function decodeJwtParts(token: string): { header: Record<string, string>; payload: Record<string, unknown> } {
  const [headerB64, payloadB64] = token.split(".");
  if (!headerB64 || !payloadB64) throw new Error("Invalid JWT format");
  const header = JSON.parse(Buffer.from(headerB64, "base64url").toString()) as Record<string, string>;
  const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString()) as Record<string, unknown>;
  return { header, payload };
}

export async function verifyAppleIdentityToken(
  identityToken: string
): Promise<{ sub: string; email?: string }> {
  const { header, payload } = decodeJwtParts(identityToken);
  const claims = payload as Partial<AppleIdTokenClaims>;

  if (!claims.sub) throw new Error("Apple token missing sub");
  if (!claims.exp || Date.now() / 1000 > claims.exp) throw new Error("Apple token expired");

  // 서명 검증 — Web Crypto API
  const keys = await getApplePublicKeys();
  const jwk = keys.find((k) => k.kid === header["kid"]);
  if (!jwk) throw new Error("Apple JWK not found for kid");

  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: jwk.alg, use: jwk.use },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const [headerB64, payloadB64, sigB64] = identityToken.split(".");
  if (!headerB64 || !payloadB64 || !sigB64) throw new Error("Invalid JWT");

  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const sig = Buffer.from(sigB64, "base64url");

  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", cryptoKey, sig, data);
  if (!valid) throw new Error("Apple token signature invalid");

  const result: { sub: string; email?: string } = { sub: claims.sub };
  if (claims.email !== undefined) result.email = claims.email;
  return result;
}

// ─── Google ──────────────────────────────────────────────────────────────────

interface GoogleTokenInfo {
  sub: string;
  email?: string;
  aud: string;
  exp: string;
  iss: string;
}

export async function verifyGoogleIdToken(
  idToken: string
): Promise<{ sub: string; email?: string }> {
  const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
  if (!res.ok) throw new Error("Google token verification failed");

  const info = (await res.json()) as Partial<GoogleTokenInfo>;
  if (!info.sub) throw new Error("Google token missing sub");
  if (!info.exp || Date.now() / 1000 > parseInt(info.exp, 10)) throw new Error("Google token expired");

  const clientIds = [
    process.env["GOOGLE_CLIENT_ID_IOS"],
    process.env["GOOGLE_CLIENT_ID_ANDROID"],
  ].filter(Boolean);

  if (clientIds.length > 0 && !clientIds.includes(info.aud)) {
    throw new Error("Google token audience mismatch");
  }

  const result: { sub: string; email?: string } = { sub: info.sub };
  if (info.email !== undefined) result.email = info.email;
  return result;
}

// ─── Kakao ────────────────────────────────────────────────────────────────────

interface KakaoAccount {
  email?: string;
  email_needs_agreement?: boolean;
}

interface KakaoUserInfo {
  id: number;
  kakao_account?: KakaoAccount;
}

// identityToken = Kakao access token (클라이언트에서 발급받은 OAuth 액세스 토큰)
export async function verifyKakaoAccessToken(
  accessToken: string
): Promise<{ sub: string; email?: string }> {
  const res = await fetch("https://kapi.kakao.com/v2/user/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(5_000),
  });
  if (!res.ok) throw new Error(`Kakao user info failed: ${res.status}`);

  const info = (await res.json()) as Partial<KakaoUserInfo>;
  if (!info.id) throw new Error("Kakao token missing id");

  const result: { sub: string; email?: string } = { sub: String(info.id) };
  const email = info.kakao_account?.email;
  if (email && !info.kakao_account?.email_needs_agreement) result.email = email;
  return result;
}

// ─── Naver ────────────────────────────────────────────────────────────────────

interface NaverResponse {
  resultcode: string;
  message: string;
  response: {
    id: string;
    email?: string;
    name?: string;
  };
}

// identityToken = Naver access token
export async function verifyNaverAccessToken(
  accessToken: string
): Promise<{ sub: string; email?: string; name?: string }> {
  const res = await fetch("https://openapi.naver.com/v1/nid/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(5_000),
  });
  if (!res.ok) throw new Error(`Naver user info failed: ${res.status}`);

  const data = (await res.json()) as Partial<NaverResponse>;
  if (data.resultcode !== "00" || !data.response?.id) {
    throw new Error("Naver token invalid");
  }

  const result: { sub: string; email?: string; name?: string } = {
    sub: data.response.id,
  };
  if (data.response.email) result.email = data.response.email;
  if (data.response.name) result.name = data.response.name;
  return result;
}
