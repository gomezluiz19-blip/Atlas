// The rules of joining Terreno, kept pure so they're tested on their own (tests/auth.test.ts): what counts as
// an email address, a handle and a code; what an OAuth return looks like; what a server error means in plain
// words; whether an invite code is one of ours; and how long to wait before sending a code again.

/** A plausible email address: one @, something before it, a dot in the domain, no spaces. */
export function validEmail(s: string): boolean {
  const v = s.trim();
  return v.length <= 254 && /^[^@\s"<>]+@[^@\s"<>]+\.[^@\s"<>.]{2,}$/.test(v) && !v.includes("..");
}

/** Common slips in the domain, and what was probably meant ("gmial.com" → "gmail.com"). */
const DOMAIN_FIX: Record<string, string> = {
  "gmial.com": "gmail.com", "gmai.com": "gmail.com", "gmail.co": "gmail.com", "gamil.com": "gmail.com", "gnail.com": "gmail.com", "gmail.con": "gmail.com",
  "hotmial.com": "hotmail.com", "hotmai.com": "hotmail.com", "hotmail.co": "hotmail.com", "yahoo.co": "yahoo.com", "yaho.com": "yahoo.com",
  "outlok.com": "outlook.com", "outloo.com": "outlook.com", "iclod.com": "icloud.com", "icloud.co": "icloud.com",
};
/** A suggested correction for a mistyped email domain, or null. */
export function emailSuggestion(s: string): string | null {
  const [user, domain] = s.trim().toLowerCase().split("@");
  if (!user || !domain) return null;
  const fix = DOMAIN_FIX[domain];
  return fix ? `${user}@${fix}` : null;
}

/** Handles: 2–24 lowercase letters, numbers, dots or underscores; not starting or ending with a dot. */
export function cleanHandle(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9._]/g, "").replace(/\.{2,}/g, ".").replace(/^\.+/, "").slice(0, 24);
}
/** Names a handle can't take: Terreno's own pages and words people would mistake for us. */
export const RESERVED = new Set(["terreno", "admin", "administrator", "support", "help", "about", "legal", "privacy", "terms", "settings", "account",
  "login", "signin", "signup", "join", "api", "app", "tv", "remote", "official", "staff", "team", "security", "root", "null", "undefined", "me", "you"]);
export type HandleProblem = "short" | "reserved" | "edge" | null;
/** What's wrong with a handle, if anything (pure; whether it's taken is asked separately). */
export function handleProblem(h: string): HandleProblem {
  if (h.length < 2) return "short";
  if (h.endsWith(".")) return "edge";
  if (RESERVED.has(h)) return "reserved";
  return null;
}
export const HANDLE_WORDS: Record<Exclude<HandleProblem, null>, string> = {
  short: "Your handle needs at least two letters or numbers.",
  reserved: "That handle is kept for Terreno itself. Try another.",
  edge: "A handle can't end with a dot.",
};

/** The six digits of a sign-in code, from whatever was typed or pasted ("123 456", "Code: 123456"). */
export function codeDigits(s: string): string {
  return s.replace(/\D/g, "").slice(0, 6);
}

export interface OAuthReturn { access_token: string; refresh_token: string; expires_in: number }
/** The tokens an OAuth provider sends back in the address (#access_token=…), or the error it gave, or null. */
export function parseOAuthReturn(hash: string): OAuthReturn | { error: string } | null {
  const p = new URLSearchParams(hash.replace(/^#/, ""));
  const err = p.get("error_description") ?? p.get("error");
  if (err) return { error: err.replace(/\+/g, " ") };
  const access = p.get("access_token"), refresh = p.get("refresh_token");
  if (!access || !refresh) return null;
  return { access_token: access, refresh_token: refresh, expires_in: Number(p.get("expires_in")) || 3600 };
}

/** A server's error, said plainly (pure). */
export function friendlyError(msg: string): string {
  const m = msg.toLowerCase();
  if (/rate|too many|security purposes|seconds/.test(m)) return "We've sent a few codes already. Wait a minute, then try again.";
  if (/signups? not allowed|signup.*disabled/.test(m)) return "Terreno isn't open for new accounts yet. Ask for an invite.";
  if (/expired|invalid.*(otp|token|code)|token.*(invalid|expired)|otp/.test(m)) return "That code didn't work. It may have expired: send a new one.";
  if (/invalid.*email|email.*invalid/.test(m)) return "That email address doesn't look right.";
  if (/network|failed to fetch|load failed|timeout/.test(m)) return "Couldn't reach Terreno's servers. Check your connection and try again.";
  return msg.length < 140 ? msg : "Something went wrong signing in. Try again in a moment.";
}

/** How many seconds until a code may be sent again (pure). */
export function resendIn(lastSent: number, now: number, gapS = 45): number {
  return Math.max(0, Math.ceil(gapS - (now - lastSent) / 1000));
}

/** SHA-256 of an invite code, lowercased and trimmed, as hex. */
export async function inviteHash(code: string): Promise<string> {
  const bytes = new TextEncoder().encode(code.trim().toLowerCase());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
/** Whether a code is one of the invite codes (only their hashes ship with the app). */
export async function inviteOk(code: string, hashes: string[]): Promise<boolean> {
  if (!hashes.length) return true;
  if (!code.trim()) return false;
  return hashes.includes(await inviteHash(code));
}

/** A first name from an email address, for the name field's first guess ("ana.silva@…" → "Ana Silva"). */
export function nameFromEmail(email: string): string {
  return email.split("@")[0].replace(/[._-]+/g, " ").replace(/\d+/g, "").trim().replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 40);
}
