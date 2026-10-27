"use client";

import { useAPICall } from "@/app/lib/useAPIActions";
import type { BoxOfficeData } from "@/app/lib/box-office";
import { boxOfficeMetrics } from "@/app/lib/box-office-metrics";
import { heat } from "@/app/lib/heat";
import { RefreshButton } from "./RefreshButton";
import styles from "./BoxOffice.module.css";

interface BoxOfficeProps {
  data?: BoxOfficeData;
  onRefresh?: () => Promise<void>;
}

export function BoxOffice({ data, onRefresh }: BoxOfficeProps) {
  const { isSubmitting: refreshing, message: error, fromAPI } = useAPICall();
  const { missing, verb, net, multiplier, budget } = boxOfficeMetrics(data);

  const refresh =
    onRefresh &&
    fromAPI({
      api: onRefresh,
      action: "refresh Box Office Mojo",
    });

  return (
    <div
      className={styles.boxOffice}
      aria-label="Box office"
      title="USD. Net = worldwide gross minus production budget, not studio profit. Return = net / budget."
    >
      {missing ? (
        <p className={styles.missing}>No box office data</p>
      ) : (
        <p className={styles.figures}>
          {verb} <Figure {...net} /> (<Figure {...multiplier} />) on{" "}
          <Figure {...budget} />
        </p>
      )}
      <div className={styles.controls}>
        {refresh && (
          <RefreshButton
            onClick={refresh}
            busy={refreshing}
            label={refreshing ? "Refreshing..." : "Refresh"}
            title={
              refreshing
                ? "Refreshing Box Office Mojo..."
                : "Refresh Box Office Mojo"
            }
          />
        )}
        <a
          href={data?.url ?? "https://www.boxofficemojo.com/"}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.attribution}
          title={
            data
              ? `Fetched ${new Date(data.fetchedAt).toLocaleString()}`
              : undefined
          }
        >
          Box Office Mojo
        </a>
      </div>
      <span className="srOnly">
        USD. Worldwide gross includes re-releases. Net is gross minus production
        budget, not studio profit. Return is net divided by budget. Budget
        colors run from white at $0 to green at $1bn. Return colors run from red
        at -1x to green at +1x.
      </span>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function Figure({ value, score }: { value: string; score: number | null }) {
  return (
    <span
      className={styles.figure}
      style={score === null ? undefined : { background: heat(score) }}
    >
      {value}
    </span>
  );
}
