"use client";

import { CloseIcon } from "./CloseIcon";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRef, useState, type ReactNode, type RefObject } from "react";
import classnames from "classnames";
import styles from "./ViewControls.module.css";

interface Option {
  id: string;
  label: string;
}

interface CollectionViewControlsProps {
  state: { sort: string; filters: string[] };
  onChange: (state: { sort: string; filters: string[] }) => void;
  sorts: readonly Option[];
  filters: readonly Option[];
  search?: {
    query: string;
    onChange: (query: string) => void;
    label: string;
    placeholder: string;
    inputRef?: RefObject<HTMLInputElement | null>;
  };
  expandSearch?: boolean;
  emptyFilters?: string;
  children?: ReactNode;
}

export function CollectionViewControls({
  state,
  onChange,
  sorts,
  filters,
  search,
  expandSearch = false,
  emptyFilters,
  children,
}: CollectionViewControlsProps) {
  const [expanded, setExpanded] = useState<"sort" | "filter" | null>(null);
  const [focused, setFocused] = useState(false);
  const fallbackRef = useRef<HTMLInputElement>(null);
  const inputRef = search?.inputRef ?? fallbackRef;
  const reducedMotion = useReducedMotion();
  const transition = {
    duration: reducedMotion ? 0 : 0.2,
    ease: "easeOut",
  } as const;
  const searchOpen = Boolean(search && (focused || search.query));
  const closeSearch = () => {
    search?.onChange("");
    inputRef.current?.blur();
  };
  const toggle = (panel: "sort" | "filter") =>
    setExpanded((current) => current === panel ? null : panel);

  return (
    <div className={styles.controls}>
      <div className={styles.actions}>
        {search && (
          <div className={styles.search}>
            <span aria-hidden="true">⌕</span>
            <input
              ref={inputRef}
              type="text"
              aria-label={search.label}
              placeholder={search.placeholder}
              value={search.query}
              onChange={(event) => search.onChange(event.target.value)}
              onFocus={() => {
                setFocused(true);
                if (expandSearch) setExpanded(null);
              }}
              onBlur={() => setFocused(false)}
              onKeyDown={(event) => {
                if (event.key === "Escape") closeSearch();
              }}
            />
            {searchOpen && (
              <button
                type="button"
                className={styles.clearSearch}
                aria-label="Close search"
                onClick={closeSearch}
              >
                <CloseIcon />
              </button>
            )}
          </div>
        )}
        <AnimatePresence initial={false}>
          {(!expandSearch || !searchOpen) && (
            <motion.div
              key="toggles"
              className={styles.toggles}
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              transition={transition}
            >
              <button
                type="button"
                className={classnames(styles.toggle, {
                  [styles.toggleActive]: expanded === "sort",
                })}
                aria-expanded={expanded === "sort"}
                onClick={() => toggle("sort")}
              >
                Sort by
              </button>
              <button
                type="button"
                className={classnames(styles.toggle, {
                  [styles.toggleActive]: expanded === "filter" || state.filters.length > 0,
                })}
                aria-expanded={expanded === "filter"}
                onClick={() => toggle("filter")}
              >
                Filter{state.filters.length > 0 ? ` (${state.filters.length})` : ""}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <AnimatePresence initial={false} mode="wait">
        {expanded && (
          <motion.div
            key={expanded}
            className={styles.optionsPanel}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={transition}
          >
            <div
              className={styles.options}
              role="group"
              aria-label={expanded === "sort" ? "Sort by" : "Filters"}
            >
              {(expanded === "sort" ? sorts : filters).map((option) => {
                const active = expanded === "sort"
                  ? state.sort === option.id
                  : state.filters.includes(option.id);
                return (
                  <button
                    key={option.id}
                    type="button"
                    className={classnames(styles.option, { [styles.optionActive]: active })}
                    aria-pressed={active}
                    onClick={() => {
                      if (expanded === "sort") {
                        onChange({ ...state, sort: option.id });
                        setExpanded(null);
                      } else {
                        onChange({
                          ...state,
                          filters: active
                            ? state.filters.filter((id) => id !== option.id)
                            : [...state.filters, option.id],
                        });
                      }
                    }}
                  >
                    {option.label}
                  </button>
                );
              })}
              {expanded === "filter" && filters.length === 0 && emptyFilters && (
                <p className={styles.notice}>{emptyFilters}</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {children}
    </div>
  );
}
