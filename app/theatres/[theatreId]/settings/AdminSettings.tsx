"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { withTargetValue } from "@/app/lib/utils";
import { joinPath } from "@/lib/theatre-path";
import type { TheatreRole } from "@/src/db/schema";
import { useTheatre } from "../TheatreContext";
import styles from "./page.module.css";

export function AdminSettings() {
  const { theatre, client, detail } = useTheatre();
  const router = useRouter();

  const [name, setName] = useState(theatre.name);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [inviteKind, setInviteKind] = useState<"member" | "admin">("member");

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    setIsSaving(true);
    try {
      await client.update({ name: name.trim() });
      setMessage("Saved.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to save.");
    } finally {
      setIsSaving(false);
    }
  }

  async function rotateInvite() {
    setError("");
    try {
      await client.rotateInvite(inviteKind);
      setMessage("The old link no longer works.");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to rotate the link.",
      );
    }
  }

  async function changeRole(userId: string, role: TheatreRole) {
    setError("");
    try {
      await client.members.setRole(userId, role);
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
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Unable to remove that person.",
      );
    }
  }

  async function deleteTheatre() {
    if (!confirm(`Delete ${theatre.name}? Every movie and comment goes with it.`))
      return;
    try {
      await client.delete();
      router.push("/theatres");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to delete the theatre.",
      );
    }
  }

  const inviteUrl = detail?.inviteCode
    ? `${typeof window === "undefined" ? "" : window.location.origin}${joinPath(detail.inviteCode)}`
    : "";

  const adminInviteUrl = detail?.adminInviteCode
    ? `${typeof window === "undefined" ? "" : window.location.origin}${joinPath(detail.adminInviteCode)}`
    : "";

  const activeInviteUrl = inviteKind === "admin" ? adminInviteUrl : inviteUrl;

  return (
    <>
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
          The public list URL already lets anyone view this list. These invite
          links can also preview it while signed out, and let signed-in visitors
          join: the member link adds a member, while the admin link grants admin
          access. Rotating a link revokes preview and joining through its old
          code; existing members keep their access.
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
            Anyone signed in who opens this link joins as an admin, with full
            access to settings and members.
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
          {(detail.members ?? []).map((member) => (
            <li key={member.id} className={styles.member}>
              <div className={styles.memberIdentity}>
                <span className={styles.memberName}>{member.name}</span>
                <span className={styles.hint}>{member.email}</span>
              </div>
              <select
                className={styles.roleSelect}
                value={member.role}
                onChange={withTargetValue((role) =>
                  changeRole(member.id, role as TheatreRole),
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
          Deleting the theatre removes every movie and comment in it.
        </p>
        <button
          type="button"
          className={styles.destructive}
          onClick={deleteTheatre}
        >
          Delete this theatre
        </button>
      </section>
    </>
  );
}
