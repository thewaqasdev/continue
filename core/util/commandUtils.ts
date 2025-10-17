import { exec } from "child_process";
import { promisify } from "util";
import * as path from "path";
import * as fs from "fs";

const execAsync = promisify(exec);

/**
 * Attempts to find the full path to a command using which/where
 */
export async function findCommandPath(command: string): Promise<string | null> {
  // If it's already an absolute path, check if it exists
  if (path.isAbsolute(command)) {
    if (fs.existsSync(command)) {
      return command;
    }
    return null;
  }

  try {
    const findCmd = process.platform === "win32" ? "where" : "which";
    const { stdout } = await execAsync(`${findCmd} ${command}`, {
      encoding: "utf8",
      timeout: 5000,
    });

    const foundPath = stdout.trim().split("\n")[0]; // Take first result
    if (foundPath && fs.existsSync(foundPath)) {
      return foundPath;
    }
  } catch {
    // Command not found via which/where
  }

  // On Windows, also try common locations for batch files
  if (process.platform === "win32") {
    const possiblePaths = [
      path.join(process.env.APPDATA || "", "npm", `${command}.cmd`),
      path.join(process.env.APPDATA || "", "npm", `${command}.bat`),
      path.join(
        process.env.ProgramFiles || "C:\\Program Files",
        "nodejs",
        `${command}.cmd`,
      ),
      path.join(
        process.env.ProgramFiles || "C:\\Program Files",
        "nodejs",
        `${command}.bat`,
      ),
      path.join(
        process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)",
        "nodejs",
        `${command}.cmd`,
      ),
      path.join(
        process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)",
        "nodejs",
        `${command}.bat`,
      ),
    ];

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }
  }

  return null;
}

/**
 * Resolves a command to its full path if possible, otherwise returns the original command
 */
export async function resolveCommand(command: string): Promise<string> {
  const resolved = await findCommandPath(command);
  return resolved || command;
}
