import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { normalizeMigrationContent } from "./migration-content.js";

describe("normalizeMigrationContent", () => {
  it("normalizes Windows and legacy line endings before hashing migrations", () => {
    const lf = 'ALTER TABLE "projects"\nDROP COLUMN "environment_id";\n';
    const crlf = lf.replace(/\n/g, "\r\n");
    const carriageReturn = lf.replace(/\n/g, "\r");

    const hash = (content: string) => createHash("sha256").update(content).digest("hex");

    expect(normalizeMigrationContent(crlf)).toBe(lf);
    expect(normalizeMigrationContent(carriageReturn)).toBe(lf);
    expect(hash(normalizeMigrationContent(crlf))).toBe(hash(lf));
  });
});
