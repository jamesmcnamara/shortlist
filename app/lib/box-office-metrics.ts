import type { BoxOfficeData } from "./box-office";

export function floorThreeDigits(value: number): number {
  if (value === 0) return 0;
  const [significand, exponent] = value.toExponential().split("e");
  const digits = Math.floor(Number(`${significand}e2`));
  return Number(`${digits}e${Number(exponent) - 2}`);
}

export function compactMoney(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "\u2013";
  const rounded = floorThreeDigits(value);
  const unit = [
    { divisor: 1e12, suffix: "t" },
    { divisor: 1e9, suffix: "b" },
    { divisor: 1e6, suffix: "m" },
    { divisor: 1e3, suffix: "k" },
  ].find(({ divisor }) => Math.abs(rounded) >= divisor);
  const amount = Number(
    (Math.abs(rounded) / (unit?.divisor ?? 1)).toPrecision(12),
  );
  return `${rounded < 0 ? "-" : ""}$${amount}${unit?.suffix ?? ""}`;
}

export function calculateReturns(data?: BoxOfficeData) {
  if (data?.budget == null || data.worldwideGross === null) return null;

  const net = data.worldwideGross - data.budget;
  const multiplier = data.budget > 0 ? net / data.budget : null;
  return { net, multiplier };
}

export function formatMultiplier(value: number): string {
  const decimalPlaces = value > 10 ? 0 : value > 2 ? 1 : 2;
  const factor = 10 ** decimalPlaces;
  const [significand, exponent] = value.toExponential().split("e");
  const clipped = Math.trunc(
    Number(`${significand}e${Number(exponent) + decimalPlaces}`),
  );
  return `${clipped / factor}x`;
}

function formatMetric(
  value: number | null | undefined,
  format: (value: number) => string,
  score: (value: number) => number | null,
) {
  if (value == null) return { value: "\u2013", score: null };
  return { value: format(value), score: score(value) };
}

export function boxOfficeMetrics(data?: BoxOfficeData) {
  const returns = calculateReturns(data);
  const multiplier = formatMetric(
    returns?.multiplier,
    formatMultiplier,
    (value) => (value + 1) / 2,
  );
  return {
    missing: returns === null,
    verb: returns === null ? "Net" : returns.net < 0 ? "Lost" : "Made",
    budget: formatMetric(
      data?.budget,
      compactMoney,
      (value) =>
        0.5 + 0.5 * Math.min(1, Math.log1p(value / 1e6) / Math.log1p(1e3)),
    ),
    net: formatMetric(
      returns?.net,
      (value) => compactMoney(value).replace(/^-/, ""),
      () => multiplier.score,
    ),
    multiplier,
  };
}
