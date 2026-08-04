"use client";

import { FormEvent, useEffect, useState } from "react";

type Movie = {
  id: number;
  title: string;
  year: number | null;
};

export default function Home() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [title, setTitle] = useState("");
  const [year, setYear] = useState("");
  const [message, setMessage] = useState("");

  async function loadMovies() {
    const response = await fetch("/api/movies");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    setMovies(data);
  }

  useEffect(() => {
    loadMovies().catch((error: Error) => setMessage(error.message));
  }, []);

  async function addMovie(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    const response = await fetch("/api/movies", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, year })
    });
    const data = await response.json();

    if (!response.ok) {
      setMessage(data.error);
      return;
    }

    setTitle("");
    setYear("");
    loadMovies().catch((error: Error) => setMessage(error.message));
  }

  async function removeMovie(id: number) {
    const response = await fetch(`/api/movies?id=${id}`, { method: "DELETE" });
    if (!response.ok) {
      const data = await response.json();
      setMessage(data.error);
      return;
    }

    loadMovies().catch((error: Error) => setMessage(error.message));
  }

  return (
    <main>
      <h1>Movie shortlist</h1>
      <p>Keep track of what to watch next.</p>
      <form onSubmit={addMovie}>
        <input
          aria-label="Movie title"
          type="text"
          placeholder="Movie title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          required
        />
        <input
          aria-label="Year"
          type="number"
          min="1888"
          max="2200"
          placeholder="Year"
          value={year}
          onChange={(event) => setYear(event.target.value)}
        />
        <button>Add</button>
      </form>
      <div id="message" role="status">{message}</div>
      <ul>
        {movies.map((movie) => (
          <li key={movie.id}>
            <span>{movie.title}{movie.year ? ` (${movie.year})` : ""}</span>
            <button
              type="button"
              aria-label={`Remove ${movie.title}`}
              onClick={() => removeMovie(movie.id)}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
