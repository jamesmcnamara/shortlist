import _ from 'lodash'
import type { Movie, NomCom, Nomination, User, Vote } from "@/src/db/schema";
import { VOTES_PER_MONTH } from "@/app/lib/constants";
import { filter, some, find } from 'shades'

interface CacheInput {
  movies: Movie[];
  nominations: Nomination[];
  nomcoms: NomCom[];
  votes: Vote[];
  users: User[];
}

export class EntityCache {
  movies = new Map<number, Movie>();
  nominations = new Map<number, Nomination>();
  nomcoms = new Map<number, NomCom>();
  votes = new Map<number, Vote>();
  users = new Map<string, User>();
  nominationsByMovie = new Map<number, Nomination>();
  votesByNomination = new Map<number, Vote[]>();
  nomcomsByNomination = new Map<number, NomCom[]>();

  constructor(data?: CacheInput) {
    if (data) {
      this.movies = mapify(data.movies);
      this.nominations = mapify(data.nominations);
      this.nomcoms = mapify(data.nomcoms);
      this.votes = mapify(data.votes);
      this.users = mapify(data.users);
      this.refresh();
    }
  }

  clone(): EntityCache {
    const cache = new EntityCache();
    cache.movies = this.movies;
    cache.nominations = this.nominations;
    cache.nomcoms = this.nomcoms;
    cache.votes = this.votes;
    cache.users = this.users;
    cache.refresh();
    return cache;
  }

  private refresh () {
    this.nominationsByMovie = new Map(this.nominations.values().map((nomination) => [nomination.movieId, nomination]));
    this.votesByNomination = new Map(Object.entries(_.groupBy(Array.from(this.votes.values()), 'nominationId')).map(([key, value]) => [Number(key), value]));
    this.nomcomsByNomination = new Map(Object.entries(_.groupBy(Array.from(this.nomcoms.values()), 'nominationId')).map(([key, value]) => [Number(key), value]));
  }

  ///////////////////////// Mutations
  addNomination(movie: Movie, nomination: Nomination): EntityCache {
    this.movies.set(movie.id, movie);
    this.nominations.set(nomination.id, nomination);
    return this.clone();
  }

  addVote(vote: Vote): EntityCache {
    this.votes.set(vote.id, vote);
    return this.clone();
  }

  deleteVoteForUser (movieId: number, userId: string | undefined): EntityCache {
    const nomination = this.nominationsByMovie.get(movieId);
    if (!nomination) return this;
    const votes = this.votesByNomination.get(nomination.id) || [];
    const voteToDelete = find({ userId })(votes)
    if (!voteToDelete) return this;
    this.votes.delete(voteToDelete.id);
    return this.clone();
  }

  ///////////////////////// Utils
  votesForMovie (movieId: number): Vote[] {
    const nomination = this.nominationsByMovie.get(movieId);
    if (!nomination) return [];
    return this.votesByNomination.get(nomination.id) || [];
  }


  votesRemaining (userId: string | undefined, month: number) {
    const votes = filter({ userId, month })(this.votes);
    return Math.max(0, VOTES_PER_MONTH - votes.size)
  }

  hasUserNominatedThisMonth (userId: string | undefined, month: number) {
    return false
    // return some({ userId, month })(this.nominations);
  }

  isNominatedBy (movieId: number, userId?: string) {
    const nomination = this.nominationsByMovie.get(movieId);
    if (!nomination) return false;
    return nomination.userId === userId;
  }

  nominees (): Movie[] {
    return Array.from(this.nominations.values())
      .sort((a, b) => (this.votesByNomination.get(b.id)?.length || 0) - (this.votesByNomination.get(a.id)?.length || 0))
      .map((nomination) => this.movies.get(nomination.movieId))
      .filter(Boolean) as Movie[];
  }

}

export function mapify<T extends { id: S}, S>(xs: T[]): Map<S, T> {
  return new Map(xs.map((x) => [x.id, x]));
}