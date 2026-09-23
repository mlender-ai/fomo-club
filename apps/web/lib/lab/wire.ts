/**
 * 화면이 받는 JSON 의 모양 (UI-03 PART E).
 *
 * **서버 조립본 타입에서 뽑는다.** 화면 쪽에 따로 인터페이스를 쓰면 서버가 칸 하나를
 * 바꿔도 화면은 모르고 `undefined` 를 그린다 — `/live` 의 `undefined/?` 가 정확히 그렇게
 * 나왔다. 여기서는 서버 타입을 JSON 으로 바꾸기만 한다(`Date` → `string`).
 *
 * `import type` 이라 prisma 가 브라우저 번들에 들어가지 않는다.
 */
import type { Payloads } from "./snapshot";
import type { SyncStatus } from "./sync";

/** `JSON.stringify` 를 한 번 지난 모양. `Date` 는 문자열이 된다. */
export type Jsonify<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? Jsonify<U>[]
    : T extends object
      ? { [K in keyof T]: Jsonify<T[K]> }
      : T;

export type WireKey = keyof Payloads;
export type Wire<K extends WireKey> = Jsonify<Payloads[K]>;
export type WireSync = Jsonify<SyncStatus>;

export interface WireEnvelope<T> {
  data: T;
  sync: WireSync;
  builtAt: string;
  ms: number;
}
