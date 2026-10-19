// Canvas sizes for feed-format posts (carousel/single). Instagram's grid moved
// from 4:5 to 3:4, so 3:4 is the default for new posts; posts saved before the
// ratio option existed keep rendering at 4:5. Reels ignore this and stay 9:16.
export const RATIOS = [
  { key: '3:4', width: 1080, height: 1440, hint: '요즘 피드 기본' },
  { key: '4:5', width: 1080, height: 1350, hint: '이전 피드 사이즈' },
  { key: '9:16', width: 1080, height: 1920, hint: '스토리 · 릴스 표지' },
];
export const DEFAULT_RATIO = '3:4';
const LEGACY_RATIO = '4:5';

export function feedSizeFor(post) {
  const { width, height } =
    RATIOS.find((r) => r.key === post?.ratio) ?? RATIOS.find((r) => r.key === LEGACY_RATIO);
  return { width, height };
}

export const isRatio = (key) => RATIOS.some((r) => r.key === key);
