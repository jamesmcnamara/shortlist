"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, type RoomDetail } from "@/app/lib/api";
import { CYCLE_LENGTHS } from "@/app/lib/cycles";
import { PRESETS, type PresetName } from "@/app/lib/rooms";
import { withTargetValue } from "@/app/lib/utils";
import type { CycleLength, RoomRole } from "@/src/db/schema";
import { useRoom } from "../RoomContext";
import styles from "./page.module.css";

const CYCLE_LABELS: Record<CycleLength, string> = {
  month: "Every month",
  week: "Every week",
  never: "Never — one running list",
};

export default function RoomSettingsPage() {
  const { room, client, isAdmin } = useRoom();
  const router = useRouter();

  const [detail, setDetail] = useState<RoomDetail | null>(null);
  const [name, setName] = useState(room.name);
  const [nominationsPerCycle, setNominationsPerCycle] = useState(
    room.nominationsPerCycle,
  );
  const [votesPerCycle, setVotesPerCycle] = useState(room.votesPerCycle);
  const [cycleLength, setCycleLength] = useState<CycleLength>(room.cycleLength);
  const [allowSelfVote, setAllowSelfVote] = useState(room.allowSelfVote);
  const [allowDuplicates, setAllowDuplicates] = useState(
    room.allowDuplicateNominations,
  );

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [inviteKind, setInviteKind] = useState<"member" | "admin">("member");

  useEffect(() => {
    client
      .get()
      .then(setDetail)
      .catch((error: Error) => setError(error.message));
  }, [client]);

  if (!isAdmin) {
    return (
      <main className={styles.shell}>
        <p className={styles.error}>Only room admins can change settings.</p>
        <Link className={styles.back} href={`/r/${room.slug}`}>
          Back to the list
        </Link>
      </main>
    );
  }

  const applyPreset = (preset: PresetName) => {
    const values = PRESETS[preset];
    setNominationsPerCycle(values.nominationsPerCycle);
    setVotesPerCycle(values.votesPerCycle);
    setCycleLength(values.cycleLength);
    setAllowSelfVote(values.allowSelfVote);
    setAllowDuplicates(values.allowDuplicateNominations);
  };

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    setIsSaving(true);
    try {
      await client.update({
        name: name.trim(),
        nominationsPerCycle,
        votesPerCycle,
        cycleLength,
        allowSelfVote,
        allowDuplicateNominations: allowDuplicates,
      });
      setMessage("Saved.");
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to save.");
    } finally {
      setIsSaving(false);
    }
  }

  async function rotateInvite() {
    setError("");
    try {
      const updated = await client.rotateInvite(inviteKind);
      setDetail((prev) => (prev ? { ...prev, ...updated } : prev));
      setMessage("The old link no longer works.");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to rotate the link.",
      );
    }
  }

  async function changeRole(userId: string, role: RoomRole) {
    setError("");
    try {
      await client.members.setRole(userId, role);
      setDetail(await client.get());
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Unable to update that person.",
      );
    }
  }

  async function removeMember(userId: string) {
    setError("");
    try {
      await client.members.remove(userId);
      setDetail(await client.get());
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Unable to remove that person.",
      );
    }
  }

  async function deleteRoom() {
    if (
      !confirm(
        `Delete ${room.name}? Every nomination, vote and comment goes with it.`,
      )
    )
      return;
    try {
      await client.delete();
      router.push("/");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to delete the room.",
      );
    }
  }

  const inviteUrl = detail?.inviteCode
    ? `${typeof window === "undefined" ? "" : window.location.origin}/join/${detail.inviteCode}`
    : "";

  const adminInviteUrl = detail?.adminInviteCode
    ? `${typeof window === "undefined" ? "" : window.location.origin}/join/${detail.adminInviteCode}`
    : "";

  const activeInviteUrl = inviteKind === "admin" ? adminInviteUrl : inviteUrl;

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{room.name}</h1>
          <p className={styles.subtitle}>Room settings</p>
        </div>
        <Link className={styles.back} href={`/r/${room.slug}`}>
          Back to the list
        </Link>
      </header>

      {error && <p className={styles.error}>{error}</p>}
      {message && (
        <p className={styles.notice} role="status">
          {message}
        </p>
      )}

      <form className={styles.section} onSubmit={save}>
        <h2 className={styles.sectionTitle}>How it works</h2>

        <div className={styles.presetRow}>
          <span className={styles.label}>Start from</span>
          <button
            type="button"
            className={styles.ghostButton}
            onClick={() => applyPreset("club")}
          >
            Movie club
          </button>
          <button
            type="button"
            className={styles.ghostButton}
            onClick={() => applyPreset("watchlist")}
          >
            Watch list
          </button>
        </div>

        <label className={styles.field}>
          <span className={styles.label}>Name</span>
          <input
            className={styles.input}
            value={name}
            onChange={withTargetValue(setName)}
            required
          />
        </label>

        <div className={styles.field}>
          <span className={styles.label}>
            Nominations per person, per cycle
          </span>
          <div className={styles.inlineRow}>
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={nominationsPerCycle === null}
                onChange={(event) =>
                  setNominationsPerCycle(event.target.checked ? null : 1)
                }
              />
              <span>Unlimited</span>
            </label>
            {nominationsPerCycle !== null && (
              <input
                className={styles.number}
                type="number"
                min={1}
                value={nominationsPerCycle}
                onChange={withTargetValue((value) =>
                  setNominationsPerCycle(Number(value)),
                )}
              />
            )}
          </div>
        </div>

        <label className={styles.field}>
          <span className={styles.label}>Votes per person, per cycle</span>
          <input
            className={styles.number}
            type="number"
            min={0}
            value={votesPerCycle}
            onChange={withTargetValue((value) =>
              setVotesPerCycle(Number(value)),
            )}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Reset</span>
          <select
            className={styles.input}
            value={cycleLength}
            onChange={withTargetValue((value) =>
              setCycleLength(value as CycleLength),
            )}
          >
            {CYCLE_LENGTHS.map((length) => (
              <option key={length} value={length}>
                {CYCLE_LABELS[length]}
              </option>
            ))}
          </select>
          <span className={styles.hint}>
            Cannot be changed once the room has nominations.
          </span>
        </label>

        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={allowSelfVote}
            onChange={(event) => setAllowSelfVote(event.target.checked)}
          />
          <span>People can vote for their own picks</span>
        </label>

        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={allowDuplicates}
            onChange={(event) => setAllowDuplicates(event.target.checked)}
          />
          <span>The same movie can be added more than once</span>
        </label>

        <button className={styles.submit} type="submit" disabled={isSaving}>
          {isSaving ? "Saving…" : "Save"}
        </button>
      </form>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Invite</h2>
        <p className={styles.hint}>
          Anyone with this link can join. Rotating it locks out anyone who has
          not used it yet.
        </p>
        <div
          className={styles.radioGroup}
          role="radiogroup"
          aria-label="Invite link type"
        >
          <label className={styles.checkbox}>
            <input
              type="radio"
              name="inviteKind"
              value="member"
              checked={inviteKind === "member"}
              onChange={() => setInviteKind("member")}
            />
            <span>Member invite</span>
          </label>
          <label className={styles.checkbox}>
            <input
              type="radio"
              name="inviteKind"
              value="admin"
              checked={inviteKind === "admin"}
              onChange={() => setInviteKind("admin")}
            />
            <span>Admin invite</span>
          </label>
        </div>
        {inviteKind === "admin" && (
          <p className={styles.hint}>
            Anyone who opens this link joins as an admin, with full access to
            settings and members.
          </p>
        )}
        <div className={styles.inlineRow}>
          <input className={styles.input} readOnly value={activeInviteUrl} />
          <button
            type="button"
            className={styles.ghostButton}
            onClick={() => navigator.clipboard?.writeText(activeInviteUrl)}
          >
            Copy
          </button>
          <button
            type="button"
            className={styles.ghostButton}
            onClick={rotateInvite}
          >
            Rotate
          </button>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Members</h2>
        <ul className={styles.members}>
          {detail?.members.map((member) => (
            <li key={member.id} className={styles.member}>
              <div className={styles.memberIdentity}>
                <span className={styles.memberName}>{member.name}</span>
                <span className={styles.hint}>{member.email}</span>
              </div>
              <select
                className={styles.roleSelect}
                value={member.role}
                onChange={withTargetValue((role) =>
                  changeRole(member.id, role as RoomRole),
                )}
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
              <button
                type="button"
                className={styles.ghostButton}
                onClick={() => removeMember(member.id)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className={`${styles.section} ${styles.danger}`}>
        <h2 className={styles.sectionTitle}>Danger zone</h2>
        <p className={styles.hint}>
          Deleting the room removes every nomination, vote and comment in it.
        </p>
        <button
          type="button"
          className={styles.destructive}
          onClick={deleteRoom}
        >
          Delete this room
        </button>
      </section>
    </main>
  );
}
