import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { and, desc, eq } from "drizzle-orm";
import * as schema from "~/db/schema";
import { courses, lessons, modules, notes } from "~/db/schema";
import { MAX_NOTE_LENGTH } from "~/lib/notes";

// ─── Notes ───
// A Student's own plain-text writing about a Lesson. One per Student per
// Lesson (enforced by a unique index), private to the Student who wrote it:
// nothing outside that Student's Lesson page and Saved page reads a Note.
// Never rendered as Markdown. See GLOSSARY.md.
//
// Every function takes the database first, so tests can hand in an in-memory
// one.

export type Db = BetterSQLite3Database<typeof schema>;

type Note = typeof notes.$inferSelect;

export function getNote(db: Db, userId: number, lessonId: number) {
  return db
    .select()
    .from(notes)
    .where(and(eq(notes.userId, userId), eq(notes.lessonId, lessonId)))
    .get();
}

export type SaveNoteResult =
  | { ok: true; note: Note | null }
  | { ok: false; error: string };

/**
 * Stores the Student's Note on a Lesson, trimmed. Saving again replaces the
 * body and moves `updatedAt` on; `createdAt` stays. Saving an empty box
 * removes the Note (`note: null`). A body over MAX_NOTE_LENGTH is refused.
 */
export function saveNote(
  db: Db,
  userId: number,
  lessonId: number,
  body: string,
  now: Date
): SaveNoteResult {
  const trimmed = body.trim();
  if (trimmed.length > MAX_NOTE_LENGTH) {
    return {
      ok: false,
      error: `A note can be at most ${MAX_NOTE_LENGTH.toLocaleString("en-US")} characters.`,
    };
  }

  if (trimmed.length === 0) {
    db.delete(notes)
      .where(and(eq(notes.userId, userId), eq(notes.lessonId, lessonId)))
      .run();
    return { ok: true, note: null };
  }

  const timestamp = now.toISOString();
  const note = db
    .insert(notes)
    .values({
      userId,
      lessonId,
      body: trimmed,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoUpdate({
      target: [notes.userId, notes.lessonId],
      set: { body: trimmed, updatedAt: timestamp },
    })
    .returning()
    .get();

  return { ok: true, note };
}

/** The Student's Notes, last edited first, with the Lesson and Course each belongs to. */
export function listNotes(db: Db, userId: number) {
  return db
    .select({
      id: notes.id,
      body: notes.body,
      updatedAt: notes.updatedAt,
      lessonId: lessons.id,
      lessonTitle: lessons.title,
      moduleTitle: modules.title,
      courseTitle: courses.title,
      courseSlug: courses.slug,
    })
    .from(notes)
    .innerJoin(lessons, eq(notes.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(eq(notes.userId, userId))
    .orderBy(desc(notes.updatedAt), desc(notes.id))
    .all();
}
