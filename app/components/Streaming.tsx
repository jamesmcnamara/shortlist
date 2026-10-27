"use client";

import { httpsUrl } from "@/app/lib/justwatch";
import { stopPropagation } from "@/app/lib/utils";
import type {
  JustWatchAvailability,
  StreamingService,
  StreamingType,
} from "@/app/lib/justwatch-types";
import { STREAMING_SERVICES } from "@/app/lib/streaming-services";
import { useState } from "react";
import { RefreshButton } from "./RefreshButton";
import styles from "./Streaming.module.css";

const LABELS: Record<StreamingType, string> = {
  FREE: "Free",
  ADS: "Free with ads",
  FLATRATE: "Included with subscription",
  RENT: "Rent",
};
const PRIORITY: Record<StreamingType, number> = {
  FREE: 0,
  ADS: 1,
  FLATRATE: 2,
  RENT: 3,
};

interface StreamingProps {
  availability?: JustWatchAvailability;
  services?: readonly StreamingService[];
  onRefresh?: () => Promise<unknown>;
}

export function Streaming({
  availability,
  services = STREAMING_SERVICES,
  onRefresh,
}: StreamingProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const offers = getOffers(services, availability);
  const refresh = async () => {
    if (!onRefresh || isRefreshing) return;
    setIsRefreshing(true);
    setRefreshFailed(false);
    try {
      await onRefresh();
    } catch {
      setRefreshFailed(true);
    } finally {
      setIsRefreshing(false);
    }
  };
  const attribution =
    httpsUrl(availability?.url) ?? "https://www.justwatch.com/us";

  return (
    <div
      className={styles.streaming}
      aria-label="Streaming availability"
      onClick={stopPropagation()}
      onKeyDown={stopPropagation()}
    >
      {availability?.status === "matched" && offers.length > 0 ? (
        <ul className={styles.services} aria-label="Your streaming services">
          {offers.map((offer) => (
            <li key={offer.serviceName}>
              <a
                className={styles.service}
                href={offer.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Watch on ${offer.serviceName}: ${LABELS[offer.type]}`}
                title={`${offer.serviceName}: ${LABELS[offer.type]}`}
              >
                {offer.iconUrl && (
                  <span className={styles.iconWrap}>
                    <ServiceIcon key={offer.iconUrl} url={offer.iconUrl} />
                    {offer.type === "RENT" && (
                      <span className={styles.rent}>RENT</span>
                    )}
                  </span>
                )}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <>
          <p className={styles.empty} role="status">
            {refreshFailed
              ? "Couldn't check JustWatch. Try again tomorrow."
              : !availability
                ? ""
                : availability.status === "unavailable"
                  ? "Streaming availability is temporarily unavailable."
                  : availability.status === "not_found"
                    ? "Couldn't find it, man."
                    : "It's fuckin' nowhere. Ghost town."}
          </p>
        </>
      )}
      <div className={styles.controls}>
        {onRefresh &&
          !(availability?.status === "matched" && offers.length > 0) && (
            <RefreshButton
              onClick={refresh}
              busy={isRefreshing}
              label={isRefreshing ? "Checking…" : "Check JustWatch"}
              title={
                isRefreshing ? "Checking JustWatch..." : "Refresh JustWatch"
              }
            />
          )}
        <a
          className={styles.attribution}
          href={attribution}
          target="_blank"
          rel="noopener noreferrer"
        >
          JustWatch
        </a>
      </div>
    </div>
  );
}

interface ServiceIconProps {
  url: string;
}

function ServiceIcon({ url }: ServiceIconProps) {
  const [failed, setFailed] = useState(false);
  const safeUrl = httpsUrl(url);
  return failed || !safeUrl ? null : (
    <img
      className={styles.icon}
      src={safeUrl}
      alt=""
      width={24}
      height={24}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

const getOffers = (
  services: readonly StreamingService[],
  availability?: JustWatchAvailability,
) =>
  services
    .flatMap((service) => {
      const offer = availability?.offers
        .filter(
          (item) =>
            service.packageIds.includes(item.packageId) &&
            (item.type !== "RENT" || service.rent) &&
            httpsUrl(item.url),
        )
        .sort((a, b) => PRIORITY[a.type] - PRIORITY[b.type])[0];
      return offer ? [{ ...offer, serviceName: service.name }] : [];
    })
    .sort((a, b) => PRIORITY[a.type] - PRIORITY[b.type]);
