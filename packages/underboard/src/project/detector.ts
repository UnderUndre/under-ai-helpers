import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

export interface ProjectInfo {
  id: string;
  stableKey: string;
  displayName: string;
  rootPath: string;
}

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function detectProject(cwd: string): ProjectInfo {
  let current = path.resolve(cwd);
  let rootPath: string | undefined;

  while (true) {
    const gitDir = path.join(current, '.git');
    const markerFile = path.join(current, '.under-project');

    if (fs.existsSync(gitDir) || fs.existsSync(markerFile)) {
      rootPath = fs.realpathSync(current);
      break;
    }

    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  if (!rootPath) {
    rootPath = fs.realpathSync(path.resolve(cwd));
  }

  const displayName = path.basename(rootPath) || 'global';
  const id = sha256(rootPath).slice(0, 16);

  let stableKey: string;
  try {
    const remoteUrl = execSync('git remote get-url origin', {
      cwd: rootPath,
      encoding: 'utf-8',
    }).trim();
    stableKey = sha256(remoteUrl);
  } catch {
    stableKey = id;
  }

  return { id, stableKey, displayName, rootPath };
}
