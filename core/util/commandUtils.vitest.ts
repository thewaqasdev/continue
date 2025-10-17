import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { findCommandPath, resolveCommand } from "./commandUtils";

vi.mock("fs");
vi.mock("child_process", () => ({
  exec: vi.fn((cmd, opts, callback) => {
    if (typeof opts === "function") {
      callback = opts;
    }

    if (cmd.includes("which npx")) {
      callback(null, "/usr/local/bin/npx", "");
    } else if (cmd.includes("where npx")) {
      callback(null, "C:\\Program Files\\nodejs\\npx.cmd", "");
    } else {
      callback(new Error("Command not found"), "", "");
    }
  }),
}));

describe("commandUtils", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("findCommandPath", () => {
    it("should return absolute paths as-is if they exist", async () => {
      const absolutePath = "/usr/bin/node";
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const result = await findCommandPath(absolutePath);

      expect(result).toBe(absolutePath);
    });

    it("should return null for non-existent absolute paths", async () => {
      const absolutePath = "/usr/bin/nonexistent";
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = await findCommandPath(absolutePath);

      expect(result).toBeNull();
    });

    it("should find commands using which on Unix", async () => {
      Object.defineProperty(process, "platform", {
        value: "darwin",
        writable: true,
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const result = await findCommandPath("npx");

      expect(result).toBe("/usr/local/bin/npx");
    });

    it("should find commands using where on Windows", async () => {
      Object.defineProperty(process, "platform", {
        value: "win32",
        writable: true,
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const result = await findCommandPath("npx");

      expect(result).toBe("C:\\Program Files\\nodejs\\npx.cmd");
    });

    it("should check common Windows locations for batch files", async () => {
      Object.defineProperty(process, "platform", {
        value: "win32",
        writable: true,
      });
      process.env.APPDATA = "C:\\Users\\test\\AppData\\Roaming";

      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = p.toString();
        return pathStr === "C:\\Users\\test\\AppData\\Roaming\\npm\\npx.cmd";
      });

      // Make where command fail
      const { exec } = await import("child_process");
      vi.mocked(exec).mockImplementation((cmd, opts, callback) => {
        if (typeof opts === "function") {
          callback = opts;
        }
        callback(new Error("Not found"), "", "");
      });

      const result = await findCommandPath("npx");

      expect(result).toBe("C:\\Users\\test\\AppData\\Roaming\\npm\\npx.cmd");
    });

    it("should return null when command is not found", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { exec } = await import("child_process");
      vi.mocked(exec).mockImplementation((cmd, opts, callback) => {
        if (typeof opts === "function") {
          callback = opts;
        }
        callback(new Error("Not found"), "", "");
      });

      const result = await findCommandPath("nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("resolveCommand", () => {
    it("should return resolved path when command is found", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const result = await resolveCommand("npx");

      expect(result).toMatch(/npx/);
    });

    it("should return original command when not found", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { exec } = await import("child_process");
      vi.mocked(exec).mockImplementation((cmd, opts, callback) => {
        if (typeof opts === "function") {
          callback = opts;
        }
        callback(new Error("Not found"), "", "");
      });

      const result = await resolveCommand("nonexistent");

      expect(result).toBe("nonexistent");
    });
  });
});
