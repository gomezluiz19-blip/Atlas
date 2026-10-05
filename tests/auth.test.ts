import { describe, expect, it } from "vitest";
import { cleanHandle, codeDigits, emailSuggestion, friendlyError, handleProblem, inviteHash, inviteOk, nameFromEmail, parseOAuthReturn, resendIn, validEmail } from "../src/auth/model";

describe("joining Terreno", () => {
  it("knows an email address when it sees one", () => {
    for (const ok of ["ana@example.com", "a.b+tag@sub.domain.org", "x@y.io"]) expect(validEmail(ok)).toBe(true);
    for (const bad of ["", "ana", "ana@", "@x.com", "ana@x", "ana@x.c", "a b@x.com", "ana@x..com", "ana@@x.com"]) expect(validEmail(bad)).toBe(false);
  });
  it("catches the usual slips in an email's domain", () => {
    expect(emailSuggestion("ana@gmial.com")).toBe("ana@gmail.com");
    expect(emailSuggestion("ana@hotmial.com")).toBe("ana@hotmail.com");
    expect(emailSuggestion("ana@gmail.com")).toBeNull();
    expect(emailSuggestion("ana")).toBeNull();
  });
  it("keeps handles tidy and refuses Terreno's own words", () => {
    expect(cleanHandle("Ana Silva!")).toBe("anasilva");
    expect(cleanHandle("José.Núñez_1")).toBe("jose.nunez_1");
    expect(cleanHandle("..a..b")).toBe("a.b");
    expect(cleanHandle("x".repeat(40))).toHaveLength(24);
    expect(handleProblem("a")).toBe("short");
    expect(handleProblem("admin")).toBe("reserved");
    expect(handleProblem("ana.")).toBe("edge");
    expect(handleProblem("ana.silva")).toBeNull();
  });
  it("reads the code from whatever was pasted", () => {
    expect(codeDigits("123 456")).toBe("123456");
    expect(codeDigits("Your code: 987654.")).toBe("987654");
    expect(codeDigits("12345678")).toBe("123456");
  });
  it("takes tokens or an error back from Google or Apple", () => {
    expect(parseOAuthReturn("#access_token=a&refresh_token=r&expires_in=7200&token_type=bearer")).toEqual({ access_token: "a", refresh_token: "r", expires_in: 7200 });
    expect(parseOAuthReturn("#error=access_denied&error_description=User+cancelled")).toEqual({ error: "User cancelled" });
    expect(parseOAuthReturn("#/p/mount-everest")).toBeNull();
    expect(parseOAuthReturn("")).toBeNull();
  });
  it("says server errors plainly", () => {
    expect(friendlyError("For security purposes, you can only request this after 42 seconds.")).toMatch(/Wait a minute/);
    expect(friendlyError("Token has expired or is invalid")).toMatch(/didn't work/);
    expect(friendlyError("Signups not allowed for otp")).toMatch(/invite/);
    expect(friendlyError("Failed to fetch")).toMatch(/connection/);
    expect(friendlyError("x".repeat(200))).toMatch(/Try again/);
  });
  it("waits its turn before sending another code", () => {
    expect(resendIn(0, 10_000)).toBe(35);
    expect(resendIn(0, 45_000)).toBe(0);
    expect(resendIn(0, 90_000)).toBe(0);
  });
  it("checks invite codes against their hashes only", async () => {
    const h = await inviteHash("  Terra-2026 ");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(await inviteOk("terra-2026", [h])).toBe(true);
    expect(await inviteOk("TERRA-2026", [h])).toBe(true);
    expect(await inviteOk("nope", [h])).toBe(false);
    expect(await inviteOk("", [h])).toBe(false);
    expect(await inviteOk("", [])).toBe(true);
  });
  it("guesses a name from an email address", () => {
    expect(nameFromEmail("ana.silva@x.com")).toBe("Ana Silva");
    expect(nameFromEmail("jo_99@x.com")).toBe("Jo");
  });
});
