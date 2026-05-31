import { useState, useEffect } from "react";
import { InteractionManager } from "react-native";

/**
 * 무거운/네트워크 의존 하위 섹션의 렌더를 인터랙션(화면 전환 애니메이션·제스처) 완료 후로 지연한다.
 *
 * React Native는 단일 JS 번들이라 `React.lazy`/`Suspense` 코드 스플리팅 효과가 없다.
 * 대신 InteractionManager로 첫 페인트·탭 전환 애니메이션을 먼저 끝내고
 * 그 뒤에 below-the-fold 위젯을 마운트해 체감 렌더링 지연과 전환 jank를 줄인다 (#264).
 *
 * @param active  true가 된 이후부터 지연 타이머 시작 (예: 해당 탭이 활성화된 시점).
 * @param delayMs 인터랙션 완료 후 추가 지연(ms). 0이면 완료 직후.
 * @returns       렌더 준비 완료 여부. 한 번 true가 되면 유지된다.
 */
export function useDeferredRender(active = true, delayMs = 0): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!active || ready) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const task = InteractionManager.runAfterInteractions(() => {
      if (delayMs > 0) {
        timer = setTimeout(() => setReady(true), delayMs);
      } else {
        setReady(true);
      }
    });
    return () => {
      task.cancel();
      if (timer) clearTimeout(timer);
    };
  }, [active, delayMs, ready]);

  return ready;
}
