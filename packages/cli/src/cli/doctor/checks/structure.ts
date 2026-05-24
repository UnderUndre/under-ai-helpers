import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "pathe";
import type { HealthCheck } from "../types.js";

const REQUIRED_DIRS = ["commands", "agents", "skills"];

function parseFrontmatter(content: string): Record<string, string> | null {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match?.[1]) return null;
  const fm: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    fm[key] = value;
  }
  return Object.keys(fm).length > 0 ? fm : null;
}

async function dirExists(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}

async function collectMdFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const subFiles = await collectMdFiles(join(dir, entry.name));
      files.push(...subFiles);
    } else if (entry.name.endsWith(".md")) {
      files.push(join(dir, entry.name));
    }
  }
  return files;
}

async function detectOrphanSkills(claudeDir: string): Promise<string[]> {
  const agentsDir = join(claudeDir, "agents");
  const skillsDir = join(claudeDir, "skills");

  let agentFiles: string[];
  try {
    agentFiles = await collectMdFiles(agentsDir);
  } catch {
    return [];
  }

  let availableSkills: Set<string>;
  try {
    const skillDirs = await readdir(skillsDir, { withFileTypes: true });
    availableSkills = new Set(
      skillDirs.filter((e) => e.isDirectory()).map((e) => e.name),
    );
  } catch {
    return [];
  }

  const orphans: string[] = [];
  for (const agentFile of agentFiles) {
    try {
      const content = await readFile(agentFile, "utf8");
      const fm = parseFrontmatter(content);
      if (!fm?.skills) continue;

      const skillList = fm.skills
        .split(",")
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 0);

      for (const skill of skillList) {
        if (!availableSkills.has(skill)) {
          orphans.push(skill);
        }
      }
    } catch {
      continue;
    }
  }

  return [...new Set(orphans)];
}

export async function checkStructure(): Promise<HealthCheck> {
  const root = process.cwd();
  const claudeDir = join(root, ".claude");

  const claudeExists = await dirExists(claudeDir);
  if (!claudeExists) {
    return {
      name: "structure.claude-dir",
      category: "structure",
      status: "fail",
      detail: ".claude/ directory not found",
      critical: true,
    };
  }

  const missingDirs: string[] = [];
  for (const dir of REQUIRED_DIRS) {
    if (!(await dirExists(join(claudeDir, dir)))) {
      missingDirs.push(dir);
    }
  }

  const issues: string[] = [];
  if (missingDirs.length > 0) {
    issues.push(`Missing dirs: ${missingDirs.join(", ")}`);
  }

  let invalidFmCount = 0;
  const validDirs = REQUIRED_DIRS.filter((d) => !missingDirs.includes(d));
  for (const dir of validDirs) {
    const dirPath = join(claudeDir, dir);
    let mdFiles: string[];
    try {
      mdFiles = await collectMdFiles(dirPath);
    } catch {
      continue;
    }
    for (const filePath of mdFiles) {
      try {
        const content = await readFile(filePath, "utf8");
        const fm = parseFrontmatter(content);
        if (!fm || !fm.name || !fm.description) {
          invalidFmCount++;
        }
      } catch {
        invalidFmCount++;
      }
    }
  }

  if (invalidFmCount > 0) {
    issues.push(`${invalidFmCount} file(s) with invalid/missing frontmatter`);
  }

  if (!missingDirs.includes("agents") && !missingDirs.includes("skills")) {
    const orphans = await detectOrphanSkills(claudeDir);
    if (orphans.length > 0) {
      issues.push(`Orphan skill refs in agents: ${orphans.join(", ")}`);
    }
  }

  if (issues.length === 0) {
    return {
      name: "structure.claude-dir",
      category: "structure",
      status: "pass",
      detail: ".claude/ structure valid (commands, agents, skills present)",
      critical: false,
    };
  }

  return {
    name: "structure.claude-dir",
    category: "structure",
    status: missingDirs.length > 0 ? "fail" : "warn",
    detail: issues.join("; "),
    critical: missingDirs.length > 0,
  };
}
