import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { safeAdminPath } from "@/lib/auth/paths";

describe("safeAdminPath", () => {
  it("keeps a path inside the admin surface", () => {
    assert.equal(safeAdminPath("/admin"), "/admin");
    assert.equal(safeAdminPath("/admin/musicas/12"), "/admin/musicas/12");
    assert.equal(
      safeAdminPath("/admin/musicas/12/letra?voz=todos"),
      "/admin/musicas/12/letra?voz=todos",
    );
  });

  it("refuses to send anyone off-origin", () => {
    for (const value of [
      "https://evil.tld/admin",
      "//evil.tld",
      "/\\evil.tld",
      "http://localhost:3000/admin",
      "javascript:alert(1)",
    ]) {
      assert.equal(safeAdminPath(value), "/admin", value);
    }
  });

  it("refuses a path outside the admin surface", () => {
    assert.equal(safeAdminPath("/"), "/admin");
    assert.equal(safeAdminPath("/kits"), "/admin");
    assert.equal(safeAdminPath("/administrador"), "/admin");
  });

  it("falls back for anything that is not a string", () => {
    assert.equal(safeAdminPath(undefined), "/admin");
    assert.equal(safeAdminPath(["/admin", "/admin"]), "/admin");
    assert.equal(safeAdminPath(42), "/admin");
  });
});
