"use client";

import { useEffect } from "react";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import type { PresetName } from "@/app/lib/rooms";

const TOUR_SEEN_KEY = "shortlist:tour-seen:v1";

interface UseFirstRoomTourOptions {
  roomType: PresetName;
  /** Wait until nominations have loaded so step 1 has something to point at. */
  isReady: boolean;
}

/**
 * Fires a one-time driver.js walkthrough for brand-new members of their
 * first watchlist room. Anchors are matched by id, so this hook only needs
 * those ids to exist in the DOM before it runs.
 */
export function useFirstRoomTour({
  roomType,
  isReady,
}: UseFirstRoomTourOptions) {
  useEffect(() => {
    if (roomType !== "club" || !isReady) return;
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(TOUR_SEEN_KEY)) return;

    // Elements render as part of the same paint as `isReady`, but driver.js
    // needs them attached to the DOM before `drive()` runs.
    const raf = requestAnimationFrame(() => {
      const tour = driver({
        showProgress: true,
        allowClose: true,
        nextBtnText: "Next scene →",
        prevBtnText: "← Rewind",
        doneBtnText: "Roll credits",
        onDestroyed: () => {
          window.localStorage.setItem(TOUR_SEEN_KEY, "1");
        },
        steps: [
          {
            element: "#tour-nominations",
            popover: {
              title: "The lineup",
              description:
                "Here's the nominees — every movie submitted by us for our own consideration. The movie with the most votes will be our next watch (unless of course Chelsea and Laurel veto it and then we'll just watch what they want).",
            },
          },
          {
            element: "#tour-votes",
            popover: {
              title: "Your ballots",
              description:
                "This is how many votes you've got left for the month. Spend them wisely, like an Oscar voter with actual taste. If you fuck up, or a better movie comes along, you can change your votes until the cycle ends.",
            },
          },
          {
            element: "#tour-nominate",
            popover: {
              title: "Lights, camera, nominate",
              description:
                "Got our next watch? The movie that will bring us all to tears and then build back our humanity one story beat at a time? Use this button to throw your movie into the ring. The journey of one Green Mile starts with a single nom.",
            },
          },
          {
            element: "#tour-menu",
            popover: {
              title: "The control room",
              description:
                "Behind this reel: I mean, you know what an options menu looks like. Start your own club or create a watchlist, or leave feedback if something's bugging you. Or much more imporantly, if I missed an opportunity for a movie pun.",
            },
            onHighlightStarted: () => {
              const menuButton = document.getElementById("tour-menu");
              if (menuButton?.getAttribute("aria-expanded") === "false") {
                menuButton.click();
              }
            },
            onDeselected: () => {
              const menuButton = document.getElementById("tour-menu");
              if (menuButton?.getAttribute("aria-expanded") === "true") {
                menuButton.click();
              }
            },
          },
        ],
      });

      tour.drive();
    });

    return () => cancelAnimationFrame(raf);
  }, [roomType, isReady]);
}
