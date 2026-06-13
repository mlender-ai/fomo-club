// 루트 @babel/core가 preset을 못 찾는 문제 방지 — 앱 기준으로 절대 경로 resolve.
// (hoisting 위치와 무관하게 동작; 이전 RN 앱은 nested 경로를 직접 지정하지만
//  여기선 require.resolve로 견고하게 처리)
const presetPath = require.resolve("babel-preset-expo", { paths: [__dirname] });

module.exports = function (api) {
  api.cache(true);
  return {
    presets: [[presetPath, { reanimated: false }]],
    plugins: [],
  };
};
