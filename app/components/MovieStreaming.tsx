"use client";

import { useState } from "react";
import type {
  JustWatchAvailability,
  StreamingService,
  StreamingType,
} from "@/app/lib/justwatch-types";
import { STREAMING_SERVICES } from "@/app/lib/streaming-services";
import { httpsUrl } from "@/app/lib/justwatch";
import styles from "./MovieStreaming.module.css";
import { has } from "shades";

const LABELS: Record<StreamingType, string> = {
  FREE: "Free",
  ADS: "Free with ads",
  FLATRATE: "Included with subscription",
};
const PRIORITY: Record<StreamingType, number> = {
  FREE: 0,
  ADS: 1,
  FLATRATE: 2,
};

interface MovieStreamingProps {
  availability?: JustWatchAvailability;
  services?: readonly StreamingService[];
}

export function MovieStreaming({
  availability,
  services = STREAMING_SERVICES,
}: MovieStreamingProps) {
  const offers = getOffers(services, availability);
  const attribution =
    httpsUrl(availability?.url) ?? "https://www.justwatch.com/us";

  return (
    <div
      className={styles.streaming}
      aria-label="Streaming availability"
      onClick={stopPropagation}
      onKeyDown={stopPropagation}
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
                  <ServiceIcon key={offer.iconUrl} url={offer.iconUrl} />
                )}
                <span className={styles.name}>{offer.serviceName}</span>
                {offer.type !== "FLATRATE" && (
                  <span className={styles.free}>{LABELS[offer.type]}</span>
                )}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>
          {!availability
            ? "Streaming availability not checked yet."
            : availability.status === "unavailable"
              ? "Streaming availability is temporarily unavailable."
              : availability.status === "not_found"
                ? "No matching movie found on JustWatch."
                : "Not included on your streaming services."}
        </p>
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
  );
}

function ServiceIcon({ url }: { url: string }) {
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
  services.flatMap((service) => {
    const offer = availability?.offers
      .filter(
        (item) =>
          service.packageIds.includes(item.packageId) && httpsUrl(item.url),
      )
      .sort((a, b) => PRIORITY[a.type] - PRIORITY[b.type])[0];
    return offer ? [{ ...offer, serviceName: service.name }] : [];
  });

const stopPropagation = (event: React.SyntheticEvent) => {
  event.stopPropagation();
};
