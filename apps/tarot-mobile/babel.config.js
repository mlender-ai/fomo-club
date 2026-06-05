// 루트 @babel/core가 preset을 못 찾는 문제 방지 — 앱 기준 require.resolve로 견고하게.
// (모노레포에 두 번째 Expo 앱이 추가되며 babel-preset-expo가 루트로 hoist되어도 동작.
//  nested 경로가 있으면 그쪽을, 없으면 루트를 찾는다 — 기존 동작과 동일/상위호환)
const presetPath = require.resolve("babel-preset-expo", { paths: [__dirname] });

module.exports = function (api) {
  api.cache(true);
  return {
    presets: [[presetPath, { reanimated: false }]],
    plugins: [],
  };
};
