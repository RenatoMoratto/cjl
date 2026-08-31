import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  decideAdminAccess,
  isAdminApiEnabled,
  isAllowedAdminEmail,
  parseAdminEmails,
} from "@/lib/auth/admins";

const ORIGINAL_EMAILS = process.env.ADMIN_EMAILS;
const ORIGINAL_ENABLED = process.env.ADMIN_API_ENABLED;

function setEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}

afterEach(() => {
  setEnv("ADMIN_EMAILS", ORIGINAL_EMAILS);
  setEnv("ADMIN_API_ENABLED", ORIGINAL_ENABLED);
});

describe("parseAdminEmails", () => {
  it("returns nothing for an unset or empty list", () => {
    assert.deepEqual(parseAdminEmails(undefined), []);
    assert.deepEqual(parseAdminEmails(""), []);
    assert.deepEqual(parseAdminEmails("   "), []);
    assert.deepEqual(parseAdminEmails(",,,"), []);
  });

  it("trims, lowercases and drops empty entries", () => {
    assert.deepEqual(
      parseAdminEmails(" Maestro@Gmail.com , ,regente@gmail.com,"),
      ["maestro@gmail.com", "regente@gmail.com"],
    );
  });
});

describe("isAllowedAdminEmail", () => {
  it("admits an address on the list, whatever its casing", () => {
    setEnv("ADMIN_EMAILS", "maestro@gmail.com");

    assert.equal(isAllowedAdminEmail("maestro@gmail.com"), true);
    assert.equal(isAllowedAdminEmail("Maestro@Gmail.com"), true);
    assert.equal(isAllowedAdminEmail("  maestro@gmail.com  "), true);
  });

  it("admits nobody when the list is empty — the door fails closed", () => {
    setEnv("ADMIN_EMAILS", undefined);
    assert.equal(isAllowedAdminEmail("maestro@gmail.com"), false);

    setEnv("ADMIN_EMAILS", "");
    assert.equal(isAllowedAdminEmail("maestro@gmail.com"), false);

    setEnv("ADMIN_EMAILS", "   ");
    assert.equal(isAllowedAdminEmail("maestro@gmail.com"), false);
  });

  it("refuses an address that merely contains an allowed one", () => {
    setEnv("ADMIN_EMAILS", "maestro@gmail.com");

    // The whole point of comparing full strings rather than testing for a
    // substring or a suffix: every address below would pass a looser check.
    for (const email of [
      "maestro@gmail.com.evil.tld",
      "evil-maestro@gmail.com",
      "maestro@gmail.como",
      "x maestro@gmail.com",
    ]) {
      assert.equal(isAllowedAdminEmail(email), false, email);
    }
  });

  it("refuses a missing address", () => {
    setEnv("ADMIN_EMAILS", "maestro@gmail.com");

    assert.equal(isAllowedAdminEmail(null), false);
    assert.equal(isAllowedAdminEmail(undefined), false);
    assert.equal(isAllowedAdminEmail(""), false);
  });
});

describe("isAdminApiEnabled", () => {
  it("accepts only the exact string true", () => {
    setEnv("ADMIN_API_ENABLED", "true");
    assert.equal(isAdminApiEnabled(), true);

    for (const value of ["1", "TRUE", "True", " true", "yes", "", undefined]) {
      setEnv("ADMIN_API_ENABLED", value);
      assert.equal(isAdminApiEnabled(), false, String(value));
    }
  });
});

describe("decideAdminAccess", () => {
  it("answers 404 while the kill switch is off, signed in or not", () => {
    setEnv("ADMIN_EMAILS", "maestro@gmail.com");

    for (const email of [null, "maestro@gmail.com", "estranho@gmail.com"]) {
      const decision = decideAdminAccess({ enabled: false, email });

      assert.equal(decision.ok, false);
      assert.equal(decision.ok === false && decision.status, 404);
    }
  });

  it("answers 401 for an anonymous caller once enabled", () => {
    setEnv("ADMIN_EMAILS", "maestro@gmail.com");

    const decision = decideAdminAccess({ enabled: true, email: null });

    assert.equal(decision.ok, false);
    assert.equal(decision.ok === false && decision.status, 401);
  });

  it("answers 403 for a session whose address left the list", () => {
    setEnv("ADMIN_EMAILS", "regente@gmail.com");

    const decision = decideAdminAccess({
      enabled: true,
      email: "maestro@gmail.com",
    });

    assert.equal(decision.ok, false);
    assert.equal(decision.ok === false && decision.status, 403);
  });

  it("lets an allowlisted session through", () => {
    setEnv("ADMIN_EMAILS", "maestro@gmail.com,regente@gmail.com");

    assert.deepEqual(
      decideAdminAccess({ enabled: true, email: "Regente@gmail.com" }),
      { ok: true },
    );
  });
});
