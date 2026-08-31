import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isUniqueViolation, ServiceError } from "@/services/errors";

describe("isUniqueViolation", () => {
  it("recognises the code on the error itself", () => {
    assert.equal(
      isUniqueViolation(Object.assign(new Error("x"), { code: "23505" })),
      true,
    );
  });

  it("recognises it through the wrapper Drizzle throws", () => {
    // The shape actually observed: Drizzle's "Failed query" Error carrying the
    // NeonDbError as its cause. Checking only the top level reported this as a
    // 500 and the duplicate-slug message never reached the form.
    const driverError = Object.assign(new Error("duplicate key value"), {
      code: "23505",
    });

    assert.equal(
      isUniqueViolation(
        new Error("Failed query: insert into ...", { cause: driverError }),
      ),
      true,
    );
  });

  it("ignores other failures", () => {
    assert.equal(isUniqueViolation(new Error("connection reset")), false);
    assert.equal(
      isUniqueViolation(Object.assign(new Error("x"), { code: "23503" })),
      false,
    );
    assert.equal(isUniqueViolation(null), false);
    assert.equal(isUniqueViolation(undefined), false);
  });

  it("does not hang on a cause chain that loops", () => {
    const a = new Error("a");
    const b = new Error("b", { cause: a });
    (a as Error & { cause?: unknown }).cause = b;

    assert.equal(isUniqueViolation(a), false);
  });
});

describe("ServiceError", () => {
  it("carries the status its code maps to", () => {
    assert.equal(new ServiceError("not_found", "x").status, 404);
    assert.equal(new ServiceError("conflict", "x").status, 409);
    assert.equal(new ServiceError("invalid", "x").status, 422);
    assert.equal(new ServiceError("upload_missing", "x").status, 409);
  });
});
