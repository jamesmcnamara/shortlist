"use client";

import {
  availableFilters,
  SORTS,
  type ViewContext,
  type ViewState,
} from "@/app/lib/view";
import { withTargetValue } from "@/app/lib/utils";
import styles from "./ViewControls.module.css";

interface ViewControlsProps {
  state: ViewState;
  context: ViewContext;
  onChange: (state: ViewState) => void;
}

/**
 * Renders whatever the registries expose, so adding a sort or filter needs no
 * change here.
 */
export function ViewControls({ state, context, onChange }: ViewControlsProps) {
  const filters = availableFilters(context);

  const toggleFilter = (id: string) =>
    onChange({
      ...state,
      filters: state.filters.includes(id)
        ? state.filters.filter((active) => active !== id)
        : [...state.filters, id],
    });

  return (
    <div className={styles.controls}>
      <label className={styles.sort}>
        <span className={styles.sortLabel}>Sort</span>
        <select
          className={styles.select}
          value={state.sort}
          onChange={withTargetValue((sort) => onChange({ ...state, sort }))}
        >
          {SORTS.map((sort) => (
            <option key={sort.id} value={sort.id}>
              {sort.label}
            </option>
          ))}
        </select>
      </label>

      <div className={styles.filters} role="group" aria-label="Filters">
        {filters.map((filter) => {
          const isActive = state.filters.includes(filter.id);
          return (
            <button
              key={filter.id}
              type="button"
              className={`${styles.filter} ${isActive ? styles.filterActive : ""}`}
              aria-pressed={isActive}
              onClick={() => toggleFilter(filter.id)}
            >
              {filter.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
