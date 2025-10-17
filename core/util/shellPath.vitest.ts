import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import { getEnvPathFromUserShell } from "./shellPath";

vi.mock("fs");
vi.mock("os");
vi.mock("child_process", () => ({
  exec: vi.fn((cmd, opts, callback) => {
    if (typeof opts === "function") {
      callback = opts;
    }
    // Simulate successful command execution
    if (cmd.includes("echo $PATH")) {
      callback(null, "/usr/local/bin:/usr/bin:/bin", "");
    } else if (cmd.includes("GetEnvironmentVariable")) {
      callback(null, "C:\\Windows\\System32;C:\\Program Files\\nodejs", "");
    } else {
      callback(new Error("Command failed"), "", "");
    }
  }),
}));
import { exec } from "child_process";
import { promisify } from "util";

describe("shellPath", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(os.homedir).mockReturnValue("/home/user");
  });

  it("should find Node.js paths on Unix systems", async () => {
    Object.defineProperty(process, "platform", {
      value: "darwin",
      writable: true,
    });
    process.env.SHELL = "/bin/bash";

    vi.mocked(fs.existsSync).mockImplementation((path) => {
      const p = path.toString();
      return p.includes("/usr/local/bin") || p.includes(".nvm");
    });

    vi.mocked(fs.readdirSync).mockReturnValue(["v20.0.0"] as any);

    const result = await getEnvPathFromUserShell();

    expect(result).toBeDefined();
    expect(result).toContain("/usr/local/bin");
  });

  it("should handle Windows PATH resolution", async () => {
    Object.defineProperty(process, "platform", {
      value: "win32",
      writable: true,
    });

    vi.mocked(fs.existsSync).mockImplementation((path) => {
      const p = path.toString();
      return p.includes("nodejs") || p.includes("npm");
    });

    const result = await getEnvPathFromUserShell();

    expect(result).toBeDefined();
    expect(result).toContain("nodejs");
  });

  it("should handle fish shell syntax", async () => {
    Object.defineProperty(process, "platform", {
      value: "linux",
      writable: true,
    });
    process.env.SHELL = "/usr/bin/fish";

    vi.mocked(fs.existsSync).mockReturnValue(false);

    const result = await getEnvPathFromUserShell();

    expect(result).toBeDefined();
    // Should have called fish-specific command
    expect(exec).toHaveBeenCalledWith(
      expect.stringContaining("fish"),
      expect.any(Object),
    );
  });

  it("should fallback to process.env.PATH when shell command fails", async () => {
    Object.defineProperty(process, "platform", {
      value: "linux",
      writable: true,
    });
    process.env.SHELL = "/bin/bash";
    process.env.PATH = "/fallback/path";

    // Make exec fail
    vi.mocked(exec).mockImplementation((cmd, opts, callback) => {
      if (typeof opts === "function") {
        callback = opts;
      }
      callback(new Error("Shell failed"), "", "");
    });

    vi.mocked(fs.existsSync).mockReturnValue(false);

    const result = await getEnvPathFromUserShell();

    expect(result).toBe("/fallback/path");
  });

  it("should handle missing SHELL environment variable", async () => {
    Object.defineProperty(process, "platform", {
      value: "linux",
      writable: true,
    });
    delete process.env.SHELL;
    process.env.PATH = "/default/path";

    vi.mocked(fs.existsSync).mockImplementation((path) => {
      const p = path.toString();
      return p === "/usr/local/bin";
    });

    const result = await getEnvPathFromUserShell();

    expect(result).toBeDefined();
    expect(result).toContain("/usr/local/bin");
  });
});
