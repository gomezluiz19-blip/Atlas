// Hashes invite codes for a closed beta: node scripts/invite-hash.mjs CODE [CODE…]
// Put the printed line in VITE_INVITE_HASHES; only the hashes ship with the app, never the codes.
import { createHash } from "node:crypto";
const codes = process.argv.slice(2);
if (!codes.length) { console.error("Usage: node scripts/invite-hash.mjs CODE [CODE…]"); process.exit(1); }
console.log(`VITE_INVITE_HASHES=${codes.map((c) => createHash("sha256").update(c.trim().toLowerCase()).digest("hex")).join(",")}`);
