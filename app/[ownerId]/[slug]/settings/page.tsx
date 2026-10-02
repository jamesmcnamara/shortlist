"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, type RoomDetail } from "@/app/lib/api";
import { withTargetValue } from "@/app/lib/utils";
import type { RoomRole } from "@/src/db/schema";
import { useRoom } from "../RoomContext";
import { roomPath } from "@/lib/room-path";
import styles from "./page.module.css";

export default function RoomSettingsPage() {
  const { room, client, isAdmin } = useRoom();
  const router = useRouter();

  const [detail, setDetail] = useState<RoomDetail | null>(null);
  const [name, setName] = useState(room.name);

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
        <Link className={styles.back} href={roomPath(room)}>
          Back to the list
        </Link>
      </main>
    );
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    setIsSaving(true);
    try {
      await client.update({ name: name.trim() });
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
    if (!confirm(`Delete ${room.name}? Every movie and comment goes with it.`))
      return;
    try {
      await client.delete();
      router.push("/rooms");
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
        <Link className={styles.back} href={roomPath(room)}>
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
        <h2 className={styles.sectionTitle}>Details</h2>

        <label className={styles.field}>
          <span className={styles.label}>Name</span>
          <input
            className={styles.input}
            value={name}
            onChange={withTargetValue(setName)}
            required
          />
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
          Deleting the room removes every movie and comment in it.
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
