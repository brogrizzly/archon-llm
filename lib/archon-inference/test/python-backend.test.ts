import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { PythonArchonBackend } from "../src/python-backend.js";

const workspaceRoot = path.resolve(
  fileURLToPath(new URL("../../../", import.meta.url)),
);

describe("Python Archon process bridge", () => {
  it("maps the real Python checkpoint-missing response without fallback output", async () => {
    const runDirectory = await mkdtemp(
      path.join(tmpdir(), "archon-no-checkpoint-"),
    );
    try {
      const localPython = path.join(workspaceRoot, ".pythonlibs/bin/python");
      const backend = new PythonArchonBackend({
        workspaceRoot,
        runDirectory,
        pythonExecutable:
          process.env["ARCHON_PYTHON"] ??
          (existsSync(localPython) ? localPython : "python"),
        timeoutMs: 20_000,
      });
      await assert.rejects(
        () => backend.generate("Return one proposal."),
        (error: unknown) =>
          error instanceof Error &&
          "code" in error &&
          error.code === "CHECKPOINT_UNAVAILABLE",
      );
    } finally {
      await rm(runDirectory, { recursive: true, force: true });
    }
  });
});
