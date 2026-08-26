"use client";

import { useState } from "react";
import {
  availableFilters,
  SORTS,
  type ViewContext,
  type ViewState,
} from "@/app/lib/view";
import styles from "./ViewControls.module.css";

interface ViewControlsProps {
  state: ViewState;
  context: ViewContext;
  onChange: (state: ViewState) => void;
  nominateLabel: string;
  onNominate: () => void;
}

type Expanded = "sort" | "filter" | null;

/**
 * Renders whatever the registries expose, so adding a sort or filter needs no
 * change here. The sort/filter option rows only appear once their toggle is
 * pressed, to keep the action row itself to a single line.
 */
export function ViewControls({
  state,
  context,
  onChange,
  nominateLabel,
  onNominate,
}: ViewControlsProps) {
  const filters = availableFilters(context);
  const [expanded, setExpanded] = useState<Expanded>(null);

  const toggleExpanded = (panel: Exclude<Expanded, null>) =>
    setExpanded((current) => (current === panel ? null : panel));

  const selectSort = (id: string) => {
    onChange({ ...state, sort: id });
    setExpanded(null);
  };

  const toggleFilter = (id: string) =>
    onChange({
      ...state,
      filters: state.filters.includes(id)
        ? state.filters.filter((active) => active !== id)
        : [...state.filters, id],
    });

  return (
    <div className={styles.controls}>
      <div className={styles.actions}>
        <button
          className={styles.nominateButton}
          type="button"
          onClick={onNominate}
        >
          {nominateLabel}
        </button>
        <button
          type="button"
          className={`${styles.toggle} ${expanded === "sort" ? styles.toggleActive : ""}`}
          aria-expanded={expanded === "sort"}
          onClick={() => toggleExpanded("sort")}
        >
          Sort by
        </button>
        <button
          type="button"
          className={`${styles.toggle} ${state.filters.length > 0 || expanded === "filter" ? styles.toggleActive : ""}`}
          aria-expanded={expanded === "filter"}
          onClick={() => toggleExpanded("filter")}
        >
          Filter{state.filters.length > 0 ? ` (${state.filters.length})` : ""}
        </button>
      </div>

      {expanded === "sort" && (
        <div className={styles.options} role="group" aria-label="Sort by">
          {SORTS.map((sort) => (
            <button
              key={sort.id}
              type="button"
              className={`${styles.option} ${sort.id === state.sort ? styles.optionActive : ""}`}
              aria-pressed={sort.id === state.sort}
              onClick={() => selectSort(sort.id)}
            >
              {sort.label}
            </button>
          ))}
        </div>
      )}

      {expanded === "filter" && (
        <div className={styles.options} role="group" aria-label="Filters">
          {filters.map((filter) => {
            const isActive = state.filters.includes(filter.id);
            return (
              <button
                key={filter.id}
                type="button"
                className={`${styles.option} ${isActive ? styles.optionActive : ""}`}
                aria-pressed={isActive}
                onClick={() => toggleFilter(filter.id)}
              >
                {filter.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
