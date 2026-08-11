"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import styles from "./page.module.css";

type Variant = "room" | "roomCalm" | "roomSignal" | "roomTable" | "feed" | "ballot";

const movies = [
  {
    title: "The Strangers",
    year: "2008",
    nominator: "Jackie O",
    initials: "JO",
    votes: 3,
    image:
      "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=700&q=85"
  },
  {
    title: "Us",
    year: "2019",
    nominator: "Theo K",
    initials: "TK",
    votes: 2,
    image:
      "https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&w=700&q=85"
  },
  {
    title: "Death Becomes Her",
    year: "1992",
    nominator: "Maya R",
    initials: "MR",
    votes: 0,
    image:
      "https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=700&q=85"
  }
];

const comments = [
  ["MS", "Meryl Streep", '“I absolutely love the needle drop in Mama Tried.”'],
  ["TK", "Theo K", "“The atmosphere is immaculate.”"]
];

export default function MockupsPage() {
  const [variant, setVariant] = useState<Variant>("room");

  return (
    <main className={styles.page}>
      {/* THESIS: Make choosing a movie feel like a shared ritual, not a dense admin panel.
          OWN-WORLD: Cream paper, ink black, restrained blue, and tactile film-strip geometry.
          STORY: Scan the contenders, understand the group signal, then join one conversation.
          FIRST VIEWPORT: The decision is visible before any discussion detail; the active thread follows.
          FORM: Three viable mobile compositions, staged as a side-by-side design exploration. */}
      <div className={styles.chrome}>
        <span className={styles.wordmark}>Shortlist</span>
        <span className={styles.chromeNote}>design explorations / mobile</span>
      </div>

      <div className={styles.switcher} role="tablist" aria-label="Mockup variants">
        <button className={variant === "room" ? styles.selectedTab : ""} onClick={() => setVariant("room")} role="tab" aria-selected={variant === "room"}>
          Room / Base
        </button>
        <button className={variant === "roomCalm" ? styles.selectedTab : ""} onClick={() => setVariant("roomCalm")} role="tab" aria-selected={variant === "roomCalm"}>
          Room / Calm
        </button>
        <button className={variant === "roomSignal" ? styles.selectedTab : ""} onClick={() => setVariant("roomSignal")} role="tab" aria-selected={variant === "roomSignal"}>
          Room / Signal
        </button>
        <button className={variant === "roomTable" ? styles.selectedTab : ""} onClick={() => setVariant("roomTable")} role="tab" aria-selected={variant === "roomTable"}>
          Room / Table
        </button>
        <button className={variant === "feed" ? styles.selectedTab : ""} onClick={() => setVariant("feed")} role="tab" aria-selected={variant === "feed"}>
          Feed
        </button>
        <button className={variant === "ballot" ? styles.selectedTab : ""} onClick={() => setVariant("ballot")} role="tab" aria-selected={variant === "ballot"}>
          Ballot
        </button>
      </div>

      <div className={styles.phone} data-variant={variant}>
        {variant === "room" && <RoomVariant />}
        {variant === "roomCalm" && <RoomCalmVariant />}
        {variant === "roomSignal" && <RoomSignalVariant />}
        {variant === "roomTable" && <RoomTableVariant />}
        {variant === "feed" && <FeedVariant />}
        {variant === "ballot" && <BallotVariant />}
      </div>
    </main>
  );
}

function AppHeader() {
  return (
    <header className={styles.appHeader}>
      <span className={styles.appLogo}>Shortlist</span>
      <div className={styles.profile}>
        <span className={styles.avatar}>MS</span>
        <span className={styles.profileName}>Meryl</span>
        <button className={styles.signOut}>Sign out</button>
      </div>
    </header>
  );
}

function Poster({ movie, rank }: { movie: (typeof movies)[number]; rank: number }) {
  return (
    <div className={styles.poster}>
      <img src={movie.image} alt="" />
      <span className={styles.posterRank}>{String(rank).padStart(2, "0")}</span>
      <span className={styles.posterShade} />
      <span className={styles.posterLabel}>
        <strong>{movie.title}</strong>
        <small>{movie.year}</small>
      </span>
    </div>
  );
}

function Intro({ label = "And the nominees are..." }: { label?: string }) {
  return (
    <div className={styles.intro}>
      <div>
        <h1>{label}</h1>
        <p>7 nominees <span>·</span> 2 votes left this month</p>
      </div>
      <button className={styles.primaryButton}>Add a nominee <span>+</span></button>
    </div>
  );
}

function VoteButton({ votes, compact = false }: { votes: number; compact?: boolean }) {
  return (
    <button className={`${styles.voteButton} ${compact ? styles.voteCompact : ""}`}>
      <span className={styles.voteMark}>+</span>
      {compact ? `${votes} ${votes === 1 ? "vote" : "votes"}` : "Vote for this"}
    </button>
  );
}

function RoomVariant() {
  const active = movies[0];
  return (
    <>
      <AppHeader />
      <Intro />
      <section className={styles.roomStage}>
        <div className={styles.roomPosters}>
          {movies.map((movie, index) => (
            <div className={index === 0 ? styles.activePoster : styles.secondaryPoster} key={movie.title}>
              <Poster movie={movie} rank={index + 1} />
              <div className={styles.posterMeta}><span>{movie.initials}</span><b>{movie.votes}</b></div>
            </div>
          ))}
        </div>
        <div className={styles.threadHeader}>
          <div>
            <span className={styles.kicker}>The room is talking about</span>
            <h2>{active.title}</h2>
          </div>
          <VoteButton votes={active.votes} />
        </div>
        <p className={styles.pullQuote}>“It&apos;s pretty meh, but Liv Tyler!”</p>
        <div className={styles.threadSignal}><span><b>3</b> people are in</span><span>2 replies</span></div>
        <div className={styles.comments}>
          {comments.map(([initials, name, copy]) => <p key={name}><span className={styles.avatarSmall}>{initials}</span><span><b>{name}</b> {copy}</span></p>)}
        </div>
        <div className={styles.commentInput}>Add to the conversation... <button>↗</button></div>
      </section>
    </>
  );
}

function RoomCalmVariant() {
  const active = movies[0];
  return (
    <>
      <AppHeader />
      <Intro label="Choose a movie for movie night." />
      <section className={`${styles.roomStage} ${styles.roomCalm}`}>
        <div className={styles.roomPosters}>
          {movies.map((movie, index) => <div className={index === 0 ? styles.activePoster : styles.secondaryPoster} key={movie.title}><Poster movie={movie} rank={index + 1} /><div className={styles.posterMeta}><span>{movie.initials}</span><b>{movie.votes} votes</b></div></div>)}
        </div>
        <div className={styles.threadHeader}>
          <div><span className={styles.kicker}>Current favorite</span><h2>{active.title}</h2></div>
          <VoteButton votes={active.votes} />
        </div>
        <div className={styles.calmQuote}><span className={styles.avatarSmall}>JO</span><div><b>Jackie O</b><p>“It&apos;s pretty meh, but Liv Tyler!”</p></div></div>
        <div className={styles.calmQuote}><span className={`${styles.avatarSmall} ${styles.gold}`}>MS</span><div><b>Meryl Streep</b><p>“I absolutely love the needle drop in Mama Tried.”</p></div></div>
        <div className={styles.commentInput}>Add to the conversation... <button>↗</button></div>
      </section>
    </>
  );
}

function RoomSignalVariant() {
  const active = movies[0];
  return (
    <>
      <AppHeader />
      <Intro label="And the nominees are..." />
      <section className={`${styles.roomStage} ${styles.roomSignal}`}>
        <div className={styles.roomPosters}>
          {movies.map((movie, index) => <div className={index === 0 ? styles.activePoster : styles.secondaryPoster} key={movie.title}><Poster movie={movie} rank={index + 1} /><div className={styles.posterMeta}><span>{movie.initials}</span><b>{movie.votes}</b></div></div>)}
        </div>
        <div className={styles.signalPanel}>
          <div className={styles.signalTop}><span className={styles.kicker}>Live discussion</span><span className={styles.liveDot}>● 3 in the room</span></div>
          <div className={styles.threadHeader}><div><h2>{active.title}</h2><span className={styles.signalMeta}>Nominated by Jackie O</span></div><VoteButton votes={active.votes} /></div>
          <p className={styles.pullQuote}>“It&apos;s pretty meh, but Liv Tyler!”</p>
          <div className={styles.signalReply}><span className={`${styles.avatarSmall} ${styles.gold}`}>MS</span><span><b>Meryl Streep</b> “The needle drop is perfect.”</span></div>
          <div className={styles.signalInput}>Write a reply... <button>↗</button></div>
        </div>
      </section>
    </>
  );
}

function RoomTableVariant() {
  const active = movies[0];
  return (
    <>
      <AppHeader />
      <Intro label="And the nominees are..." />
      <section className={`${styles.roomStage} ${styles.roomTable}`}>
        <div className={styles.roomPosters}>
          {movies.map((movie, index) => <div className={index === 0 ? styles.activePoster : styles.secondaryPoster} key={movie.title}><Poster movie={movie} rank={index + 1} /><div className={styles.posterMeta}><span>{movie.initials}</span><b>{movie.votes}</b></div></div>)}
        </div>
        <div className={styles.tableHead}><span>Discussion</span><span>2 replies</span></div>
        <div className={styles.tableTitle}><h2>{active.title}</h2><VoteButton votes={active.votes} /></div>
        <div className={styles.tableRow}><span className={styles.avatarSmall}>JO</span><div><b>Jackie O</b><p>“It&apos;s pretty meh, but Liv Tyler!”</p></div></div>
        <div className={styles.tableRow}><span className={`${styles.avatarSmall} ${styles.gold}`}>MS</span><div><b>Meryl Streep</b><p>“I absolutely love the needle drop in Mama Tried.”</p></div></div>
        <div className={styles.commentInput}>Add to the conversation... <button>↗</button></div>
      </section>
    </>
  );
}

function FeedVariant() {
  return (
    <>
      <AppHeader />
      <div className={styles.feedIntro}>
        <span className={styles.kicker}>This month</span>
        <h1>Pick the next movie.</h1>
        <p>Vote, make your case, and see what the group is leaning toward.</p>
      </div>
      <div className={styles.filmstrip}>
        {movies.map((movie, index) => <div className={styles.filmItem} key={movie.title}><Poster movie={movie} rank={index + 1} /><VoteButton votes={movie.votes} compact /></div>)}
      </div>
      <div className={styles.feedHeading}><h2>What&apos;s happening</h2><span>Latest first</span></div>
      <div className={styles.activity}>
        <Activity initials="JO" accent="blue"><b>Jackie O</b> nominated <strong>The Strangers</strong><small>12 min ago</small></Activity>
        <Activity initials="MS" accent="gold"><b>Meryl Streep</b> voted for <strong>The Strangers</strong><small>8 min ago</small></Activity>
        <Activity initials="TK" accent="green"><b>Theo K</b> replied to <strong>Us</strong><small>Yesterday</small></Activity>
      </div>
      <button className={styles.wideButton}>Open all discussions <span>→</span></button>
    </>
  );
}

function Activity({ initials, accent, children }: { initials: string; accent: string; children: ReactNode }) {
  return <article className={styles.activityItem}><span className={`${styles.avatarSmall} ${styles[accent]}`}>{initials}</span><p>{children}</p></article>;
}

function BallotVariant() {
  return (
    <>
      <AppHeader />
      <div className={styles.ballotTop}><span className={styles.kicker}>The group ballot</span><h1>What gets watched next?</h1><p>Choose one. Your vote is private until you cast it.</p></div>
      <div className={styles.ballotList}>
        {movies.map((movie, index) => <article className={styles.ballotRow} key={movie.title}>
          <span className={styles.ballotNumber}>0{index + 1}</span>
          <Poster movie={movie} rank={index + 1} />
          <div className={styles.ballotCopy}><h2>{movie.title}</h2><p>{movie.year} <span>·</span> nominated by {movie.nominator}</p><div className={styles.voteMeter}><span style={{ width: `${movie.votes ? movie.votes * 24 : 8}%` }} /></div><small>{movie.votes} votes so far</small></div>
          <button className={styles.radio} aria-label={`Vote for ${movie.title}`} />
        </article>)}
      </div>
      <div className={styles.ballotFooter}><span>Votes reset on the first of the month.</span><button className={styles.primaryButton}>Cast your vote <span>→</span></button></div>
    </>
  );
}
