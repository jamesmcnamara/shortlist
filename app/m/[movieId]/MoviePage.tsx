"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence } from "motion/react";
import { MovieDetail } from "@/app/components/MovieDetail";
import { AddToLists } from "@/app/components/AddToLists/AddToLists";
import { useDataSession } from "@/app/lib/data/DataProvider";
import type { Movie } from "@/src/db/schema";

export function MoviePage({ movie }: { movie: Movie }) {
  const router = useRouter();
  const { userId } = useDataSession();
  const [addingMovie, setAddingMovie] = useState<Movie | null>(null);
  return (
    <>
      <MovieDetail
        movie={movie}
        onBack={() => router.push("/")}
        onAdd={userId ? setAddingMovie : undefined}
      />
      <AnimatePresence>
        {addingMovie && (
          <AddToLists
            movie={addingMovie}
            onClose={() => setAddingMovie(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
