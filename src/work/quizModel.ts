// Quizzes and tests: multiple choice, true or false, and "find it on the map".
// Shared with students as a link (the quiz travels inside the URL, no server)
// and marked in the browser; results come back as a code or a file.
import { metres } from "./geo";
import type { SlideCamera } from "./presentModel";

export type Question =
  | { id: string; kind: "choice"; prompt: string; options: string[]; answer: number; view?: QuestionView; explain?: string }
  | { id: string; kind: "truefalse"; prompt: string; answer: boolean; view?: QuestionView; explain?: string }
  | { id: string; kind: "map"; prompt: string; place: string; lon: number; lat: number; /** Full marks within this distance (km). */ tolerance: number; explain?: string };

export interface QuestionView { camera: SlideCamera; year?: number }

export interface Quiz { id: string; title: string; created: number; questions: Question[]; /** Seconds per question when hosting (0: no timer). */ seconds?: number }

export type Answer = number | boolean | [number, number] | null;

export interface Result { quiz: string; title: string; student: string; answers: Answer[]; score: number; total: number; at: number }

/** Marks one answer, 0 to 1. Map answers get full marks within the tolerance, sliding to zero at five times it. */
export function mark(q: Question, a: Answer): number {
  if (a === null || a === undefined) return 0;
  if (q.kind === "choice") return a === q.answer ? 1 : 0;
  if (q.kind === "truefalse") return a === q.answer ? 1 : 0;
  if (!Array.isArray(a)) return 0;
  const km = metres([q.lon, q.lat], a) / 1000;
  if (km <= q.tolerance) return 1;
  return Math.max(0, 1 - (km - q.tolerance) / (q.tolerance * 4));
}

export function markAll(quiz: Quiz, answers: Answer[]): { score: number; total: number; each: number[] } {
  const each = quiz.questions.map((q, i) => mark(q, answers[i] ?? null));
  return { score: Math.round(each.reduce((s, x) => s + x, 0) * 10) / 10, total: quiz.questions.length, each };
}

// ---- Links and result codes: compact, URL-safe ----------------------------------------------

const b64url = (bytes: Uint8Array) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const unb64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

export async function pack(data: unknown): Promise<string> {
  return b64url(await pipe(new TextEncoder().encode(JSON.stringify(data)), new CompressionStream("deflate-raw")));
}

export async function unpack<T>(code: string): Promise<T> {
  return JSON.parse(new TextDecoder().decode(await pipe(unb64url(code.trim()), new DecompressionStream("deflate-raw")))) as T;
}

/** Checks a quiz that arrived from a link or file. */
export function validQuiz(v: unknown): v is Quiz {
  const q = v as Quiz;
  return !!q && typeof q.title === "string" && Array.isArray(q.questions) && q.questions.every((x) =>
    x && typeof x.prompt === "string" && (
      (x.kind === "choice" && Array.isArray(x.options) && typeof x.answer === "number") ||
      (x.kind === "truefalse" && typeof x.answer === "boolean") ||
      (x.kind === "map" && Number.isFinite(x.lon) && Number.isFinite(x.lat) && Number.isFinite(x.tolerance))));
}

/** Class results: each student's score, and how the class did on each question. */
export function gradebook(quiz: Quiz, results: Result[]) {
  const latest = new Map<string, Result>();
  for (const r of results.filter((r) => r.quiz === quiz.id)) {
    const k = r.student.trim().toLowerCase();
    const prev = latest.get(k);
    if (!prev || prev.at < r.at) latest.set(k, r);
  }
  const rows = [...latest.values()].sort((a, b) => a.student.localeCompare(b.student)).map((r) => ({ ...r, ...markAll(quiz, r.answers) }));
  const perQuestion = quiz.questions.map((_, i) => (rows.length ? rows.reduce((s, r) => s + r.each[i], 0) / rows.length : 0));
  const average = rows.length ? rows.reduce((s, r) => s + r.score / r.total, 0) / rows.length : 0;
  return { rows, perQuestion, average };
}
