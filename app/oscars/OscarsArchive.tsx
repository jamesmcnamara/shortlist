"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { filter, not } from "shades";
import {
  formatOscarCategory,
  formatOscarNomineeDetail,
  getOscarMovieIds,
  isMajorCategory,
  oscarsCategoryRank,
  useOscars,
  type OscarNominee,
  type OscarNominees,
} from "@/app/lib/data/oscars";
import { SlideOpen } from "@/app/components/SlideOpen";
import chevronStyles from "@/app/components/Chevron.module.css";
import styles from "./page.module.css";

interface Award {
  category: string;
  nominees: OscarNominee[];
}

export function OscarsArchive() {
  const { data, error, mutate } = useOscars();
  const movieIds = useMemo(() => getOscarMovieIds(data), [data]);
  const decades = useMemo(() => groupDecades(data?.nominees ?? {}), [data]);

  if (error) {
    return (
      <div role="alert" className={styles.error}>
        <p>Couldn&apos;t load the Oscar archive. Please try again.</p>
        <button type="button" onClick={() => void mutate()}>
          Try again
        </button>
      </div>
    );
  }
  if (!data) return <p role="status">Loading the Oscar archive…</p>;
  if (decades.length === 0) return <p>No Oscar results are available yet.</p>;

  return (
    <ol className={styles.list} aria-label="Oscar decades">
      {decades.map(([decade, years]) => (
        <li key={decade} className={styles.decade}>
          <Accordion
            title={<span className={styles.decadeTitle}>{decade}s</span>}
          >
            <ol className={styles.nested} aria-label={`${decade}s award years`}>
              {years.map(([year, awards]) => {
                const bestPicture = awards.find(
                  ({ category }) => category === "BEST PICTURE",
                );
                const winners = filter("winner")(bestPicture?.nominees ?? []);
                return (
                  <li key={year} className={styles.entry}>
                    <Accordion
                      title={
                        <>
                          <span className={styles.year}>{year}</span>{" "}
                          <span className={styles.winnerTitle}>
                            {winners.map(filmTitle).join(" / ") ||
                              "Best Picture winner unavailable"}
                          </span>
                        </>
                      }
                      links={
                        <MovieLinks nominees={winners} movieIds={movieIds} />
                      }
                    >
                      <ol
                        className={styles.nested}
                        aria-label={`Categories for ${year}`}
                      >
                        {awards.map((award) => (
                          <AwardRow
                            key={award.category}
                            award={award}
                            year={year}
                            movieIds={movieIds}
                          />
                        ))}
                      </ol>
                    </Accordion>
                  </li>
                );
              })}
            </ol>
          </Accordion>
        </li>
      ))}
    </ol>
  );
}

interface AccordionProps {
  title: ReactNode;
  links?: ReactNode;
  children: ReactNode;
}

function Accordion({ title, links, children }: AccordionProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className={styles.row}>
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <span className={styles.copy}>{title}</span>
          <span className={chevronStyles.chevron} aria-hidden="true" />
        </button>
        {links}
      </div>
      <SlideOpen open={open} className={styles.reveal}>
        {children}
      </SlideOpen>
    </>
  );
}

interface AwardRowProps {
  award: Award;
  year: string;
  movieIds: Map<number, number[]>;
}

function AwardRow({ award, year, movieIds }: AwardRowProps) {
  const winners = filter("winner")(award.nominees);
  const others = filter(not("winner"))(award.nominees);
  const title = (
    <>
      <span className={styles.category}>
        {formatOscarCategory(award.category)}
      </span>{" "}
      {winners.map((nominee) => (
        <NomineeCopy key={nominee.id} nominee={nominee} />
      ))}
    </>
  );
  const links = <MovieLinks nominees={winners} movieIds={movieIds} />;

  return (
    <li className={styles.entry}>
      {others.length > 0 ? (
        <Accordion title={title} links={links}>
          <ol
            className={styles.nominees}
            aria-label={`Other nominees for ${formatOscarCategory(award.category)}, ${year}`}
          >
            {others.map((nominee) => {
              const ids = movieIds.get(nominee.id) ?? [];
              const copy = <NomineeCopy nominee={nominee} />;
              return (
                <li key={nominee.id} className={styles.nominee}>
                  {ids.length === 1 ? (
                    <Link
                      href={`/m/${ids[0]}`}
                      className={styles.nomineeLink}
                      prefetch={false}
                    >
                      {copy}
                    </Link>
                  ) : (
                    <>
                      {copy}
                      <MovieLinks nominees={[nominee]} movieIds={movieIds} />
                    </>
                  )}
                </li>
              );
            })}
          </ol>
        </Accordion>
      ) : (
        <div className={styles.row}>
          <div className={styles.staticCopy}>{title}</div>
          {links}
        </div>
      )}
    </li>
  );
}

interface NomineeCopyProps {
  nominee: OscarNominee;
}

function NomineeCopy({ nominee }: NomineeCopyProps) {
  const detail = formatOscarNomineeDetail(nominee);
  return (
    <span className={styles.copy}>
      <span className={styles.winnerTitle}>{filmTitle(nominee)}</span>{" "}
      {detail && <span className={styles.detail}>{detail}</span>}
    </span>
  );
}

interface MovieLinksProps {
  nominees: OscarNominee[];
  movieIds: Map<number, number[]>;
}

function MovieLinks({ nominees, movieIds }: MovieLinksProps) {
  const links = nominees.flatMap((nominee) =>
    (movieIds.get(nominee.id) ?? []).map((id, index, ids) => ({
      id,
      label: `View movie${ids.length > 1 ? ` ${index + 1}` : ""}`,
      title: filmTitle(nominee),
    })),
  );
  if (links.length === 0) return null;
  return (
    <span className={styles.movieLinks}>
      {links.map(({ id, label, title }, index) => (
        <Link
          key={`${id}-${index}`}
          href={`/m/${id}`}
          prefetch={false}
          aria-label={`${label}: ${title}`}
        >
          {label}
        </Link>
      ))}
    </span>
  );
}

const filmTitle = (nominee: OscarNominee) => nominee.film ?? nominee.name;

function groupDecades(nominees: OscarNominees) {
  const years = Object.entries(nominees).reduce<Record<string, Award[]>>(
    (years, [key, entries]) => {
      const [year, category] = key.split("|");
      return {
        ...years,
        [year]: [...(years[year] ?? []), { category, nominees: entries ?? [] }],
      };
    },
    {},
  );
  const decades = Object.entries(years)
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([year, awards]): [string, Award[]] => [
      year,
      awards.toSorted(
        (left, right) =>
          oscarsCategoryRank({
            category: left.category,
            major: isMajorCategory(left.category),
          }) -
            oscarsCategoryRank({
              category: right.category,
              major: isMajorCategory(right.category),
            }) || left.category.localeCompare(right.category),
      ),
    ])
    .reduce<Record<string, [string, Award[]][]>>((decades, [year, awards]) => {
      const decade = Math.floor(parseInt(year, 10) / 10) * 10;
      return {
        ...decades,
        [decade]: [...(decades[decade] ?? []), [year, awards]],
      };
    }, {});
  return Object.entries(decades).sort(([left], [right]) =>
    right.localeCompare(left),
  );
}
