import { spawn } from "node:child_process";
import { resolve } from "node:path";

export type InferenceFinishReason = "eos" | "max_new_tokens" | "context_limit";

export interface LocalInferenceOutput {
  text: string;
  modelDigest: string;
  finishReason: InferenceFinishReason;
}

export interface PythonArchonOptions {
  workspaceRoot: string;
  runDirectory: string;
  pythonExecutable?: string;
  timeoutMs?: number;
  maxNewTokens?: number;
  maxPromptBytes?: number;
  maxOutputBytes?: number;
}

export class LocalInferenceError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "LocalInferenceError";
    this.code = code;
  }
}

export interface InferenceBackend {
  generate(prompt: string): Promise<LocalInferenceOutput>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFinishReason(value: unknown): value is InferenceFinishReason {
  return (
    value === "eos" ||
    value === "max_new_tokens" ||
    value === "context_limit"
  );
}

export class PythonArchonBackend implements InferenceBackend {
  private readonly workspaceRoot: string;
  private readonly runDirectory: string;
  private readonly pythonExecutable: string;
  private readonly timeoutMs: number;
  private readonly maxNewTokens: number;
  private readonly maxPromptBytes: number;
  private readonly maxOutputBytes: number;

  constructor(options: PythonArchonOptions) {
    this.workspaceRoot = resolve(options.workspaceRoot);
    this.runDirectory = resolve(this.workspaceRoot, options.runDirectory);
    this.pythonExecutable = options.pythonExecutable ?? "python";
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.maxNewTokens = options.maxNewTokens ?? 128;
    this.maxPromptBytes = options.maxPromptBytes ?? 8_192;
    this.maxOutputBytes = options.maxOutputBytes ?? 32_768;
    if (
      !Number.isSafeInteger(this.timeoutMs) ||
      this.timeoutMs < 1 ||
      !Number.isSafeInteger(this.maxNewTokens) ||
      this.maxNewTokens < 1 ||
      this.maxNewTokens > 256 ||
      !Number.isSafeInteger(this.maxPromptBytes) ||
      this.maxPromptBytes < 1 ||
      !Number.isSafeInteger(this.maxOutputBytes) ||
      this.maxOutputBytes < 128
    ) {
      throw new TypeError("Invalid local inference process limits.");
    }
  }

  generate(prompt: string): Promise<LocalInferenceOutput> {
    if (typeof prompt !== "string" || prompt.trim().length === 0) {
      return Promise.reject(
        new LocalInferenceError(
          "INVALID_REQUEST",
          "Prompt must be non-empty text.",
        ),
      );
    }
    if (Buffer.byteLength(prompt, "utf8") > this.maxPromptBytes) {
      return Promise.reject(
        new LocalInferenceError(
          "PROMPT_TOO_LARGE",
          "Prompt exceeds the configured byte limit; it was not truncated.",
        ),
      );
    }

    return new Promise((resolvePromise, rejectPromise) => {
      const child = spawn(
        this.pythonExecutable,
        [
          "-m",
          "archon.inference",
          "--run-dir",
          this.runDirectory,
        ],
        {
          cwd: this.workspaceRoot,
          stdio: ["pipe", "pipe", "pipe"],
          env: {
            PATH: process.env["PATH"],
            HOME: process.env["HOME"],
            LANG: process.env["LANG"],
            LC_ALL: process.env["LC_ALL"],
            TMPDIR: process.env["TMPDIR"],
            PYTHONPATH: process.env["PYTHONPATH"],
            PYTHONHOME: process.env["PYTHONHOME"],
            VIRTUAL_ENV: process.env["VIRTUAL_ENV"],
            LD_LIBRARY_PATH: process.env["LD_LIBRARY_PATH"],
            PYTHONUNBUFFERED: "1",
          },
        },
      );
      const stdoutChunks: Buffer[] = [];
      let stdoutBytes = 0;
      let settled = false;
      let timer: NodeJS.Timeout;

      const settleError = (error: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        child.kill("SIGKILL");
        rejectPromise(error);
      };

      timer = setTimeout(() => {
        settleError(
          new LocalInferenceError(
            "INFERENCE_TIMEOUT",
            "Local inference exceeded its configured time limit.",
          ),
        );
      }, this.timeoutMs);

      child.once("error", () => {
        settleError(
          new LocalInferenceError(
            "INFERENCE_UNAVAILABLE",
            "The configured local Python inference process could not start.",
          ),
        );
      });

      child.stdout.on("data", (chunk: Buffer) => {
        stdoutBytes += chunk.length;
        if (stdoutBytes > this.maxOutputBytes) {
          settleError(
            new LocalInferenceError(
              "OUTPUT_TOO_LARGE",
              "Local inference output exceeded its configured byte limit.",
            ),
          );
          return;
        }
        stdoutChunks.push(chunk);
      });
      child.stderr.resume();
      child.stdin.on("error", () => {
        // The process close handler reports its bounded JSON response or failure.
      });

      child.once("close", (exitCode) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        let response: unknown;
        try {
          response = JSON.parse(Buffer.concat(stdoutChunks).toString("utf8"));
        } catch {
          rejectPromise(
            new LocalInferenceError(
              "INVALID_INFERENCE_RESPONSE",
              "Local inference did not return its required JSON response.",
            ),
          );
          return;
        }

        if (
          isRecord(response) &&
          response.ok === false &&
          isRecord(response.error) &&
          typeof response.error.code === "string" &&
          typeof response.error.message === "string"
        ) {
          rejectPromise(
            new LocalInferenceError(
              response.error.code,
              response.error.message,
            ),
          );
          return;
        }

        const result = isRecord(response) ? response.result : null;
        if (
          exitCode !== 0 ||
          !isRecord(response) ||
          response.ok !== true ||
          !isRecord(result) ||
          typeof result.text !== "string" ||
          typeof result.model_digest !== "string" ||
          !/^[a-f0-9]{64}$/.test(result.model_digest) ||
          !isFinishReason(result.finish_reason)
        ) {
          rejectPromise(
            new LocalInferenceError(
              "INVALID_INFERENCE_RESPONSE",
              "Local inference response did not match the expected contract.",
            ),
          );
          return;
        }

        resolvePromise({
          text: result.text,
          modelDigest: result.model_digest,
          finishReason: result.finish_reason,
        });
      });

      child.stdin.end(
        JSON.stringify({ prompt, max_new_tokens: this.maxNewTokens }),
        "utf8",
      );
    });
  }
}
