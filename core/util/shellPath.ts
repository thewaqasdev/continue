import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const execAsync = promisify(exec);

/**
 * Attempts to find Node.js/npm/npx in common installation locations
 */
function findNodePaths(): string[] {
  const paths: string[] = [];
  const homeDir = os.homedir();

  if (process.platform === "win32") {
    // Common Windows Node.js installation paths
    const windowsPaths = [
      path.join(process.env.ProgramFiles || "C:\\Program Files", "nodejs"),
      path.join(
        process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)",
        "nodejs",
      ),
      path.join(
        process.env.LOCALAPPDATA || path.join(homeDir, "AppData", "Local"),
        "Programs",
        "nodejs",
      ),
      path.join(homeDir, "scoop", "apps", "nodejs", "current"),
      path.join(homeDir, "scoop", "apps", "nodejs", "current", "bin"),
      path.join(
        process.env.APPDATA || path.join(homeDir, "AppData", "Roaming"),
        "npm",
      ),
      path.join(
        process.env.APPDATA || path.join(homeDir, "AppData", "Roaming"),
        "fnm_multishells",
        "*",
        "installation",
        "bin",
      ),
    ];

    for (const p of windowsPaths) {
      if (fs.existsSync(p)) {
        paths.push(p);
      }
    }
  } else {
    // Common Unix-like Node.js installation paths
    const unixPaths = [
      "/usr/local/bin",
      "/usr/bin",
      "/opt/homebrew/bin",
      path.join(homeDir, ".nvm", "versions", "node"),
      path.join(homeDir, ".fnm", "node-versions"),
      path.join(homeDir, ".volta", "bin"),
      path.join(homeDir, ".asdf", "shims"),
      path.join(homeDir, "n", "bin"),
    ];

    for (const p of unixPaths) {
      if (fs.existsSync(p)) {
        // For version managers, try to find the actual node binary
        if (p.includes(".nvm") || p.includes(".fnm")) {
          try {
            const versions = fs.readdirSync(p);
            for (const version of versions) {
              const binPath = path.join(p, version, "bin");
              if (fs.existsSync(binPath)) {
                paths.push(binPath);
              }
            }
          } catch {}
        } else {
          paths.push(p);
        }
      }
    }
  }

  return paths;
}

export async function getEnvPathFromUserShell(): Promise<string | undefined> {
  if (process.platform === "win32") {
    // On Windows, try to get PATH from PowerShell or cmd
    try {
      const { stdout: psPath } = await execAsync(
        "powershell -NoProfile -Command \"[Environment]::GetEnvironmentVariable('PATH', 'User') + ';' + [Environment]::GetEnvironmentVariable('PATH', 'Machine')\"",
        { encoding: "utf8" },
      ).catch(() => ({ stdout: "" }));

      if (psPath && psPath.trim()) {
        const nodePaths = findNodePaths();
        const existingPath = psPath.trim();
        const allPaths = [...nodePaths, ...existingPath.split(";")].filter(
          Boolean,
        );
        return [...new Set(allPaths)].join(";");
      }
    } catch {}

    // Fallback: add common Node paths to existing PATH
    const nodePaths = findNodePaths();
    if (nodePaths.length > 0) {
      const existingPath = process.env.PATH || "";
      const allPaths = [...nodePaths, ...existingPath.split(";")].filter(
        Boolean,
      );
      return [...new Set(allPaths)].join(";");
    }

    return process.env.PATH;
  }

  if (!process.env.SHELL) {
    // If no shell is set, try to find Node paths manually
    const nodePaths = findNodePaths();
    if (nodePaths.length > 0) {
      const existingPath = process.env.PATH || "";
      const allPaths = [...nodePaths, ...existingPath.split(":")].filter(
        Boolean,
      );
      return [...new Set(allPaths)].join(":");
    }
    return process.env.PATH;
  }

  try {
    // Source common profile files including fish config
    let command: string;
    const shell = process.env.SHELL;

    if (shell?.includes("fish")) {
      // Fish shell has different syntax
      command = `${shell} -l -c 'echo $PATH | tr " " ":"'`;
    } else {
      // Bash/Zsh/other POSIX shells
      command = `${shell} -l -c 'for f in ~/.zprofile ~/.zshrc ~/.bash_profile ~/.bashrc ~/.profile; do [ -f "$f" ] && source "$f" 2>/dev/null; done; echo $PATH'`;
    }

    const { stdout } = await execAsync(command, {
      encoding: "utf8",
      timeout: 5000, // Add timeout to prevent hanging
    });

    const shellPath = stdout.trim();

    // Also add manually detected Node paths
    const nodePaths = findNodePaths();
    if (nodePaths.length > 0) {
      const allPaths = [...nodePaths, ...shellPath.split(":")].filter(Boolean);
      return [...new Set(allPaths)].join(":");
    }

    return shellPath;
  } catch (error) {
    // Fallback: try to find Node paths manually
    const nodePaths = findNodePaths();
    if (nodePaths.length > 0) {
      const existingPath = process.env.PATH || "";
      const allPaths = [...nodePaths, ...existingPath.split(":")].filter(
        Boolean,
      );
      return [...new Set(allPaths)].join(":");
    }
    return process.env.PATH; // Fallback to current PATH
  }
}
