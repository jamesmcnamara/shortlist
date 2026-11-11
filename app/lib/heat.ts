// GitHub's diff backgrounds, extrapolated one step past each end for punch.
export const HEAT_STOPS = [
  "#ff948f",
  "#ffb1ad",
  "#ffcecb",
  "#ffebe9",
  "#ffffff",
  "#dafbe1",
  "#aceebb",
  "#7ee195",
  "#50d46f",
] as const;

export const RATING_RANGES = {
  imdb: [5.5, 7.5],
  letterboxd: [3, 4],
  tomatoes: [50, 95],
  popcorn: [50, 95],
} satisfies Record<string, [number, number]>;

export const heat = (value: number, [low, high]: [number, number] = [0, 1]) => {
  const score = (value - low) / (high - low);
  const position = Math.max(0, Math.min(1, score)) * (HEAT_STOPS.length - 1);
  const index = Math.min(Math.floor(position), HEAT_STOPS.length - 2);
  const weight = Math.round((position - index) * 100);
  return `color-mix(in srgb, ${HEAT_STOPS[index + 1]} ${weight}%, ${HEAT_STOPS[index]})`;
};
