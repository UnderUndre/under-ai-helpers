import consola from "consola";
import { createDatabase } from "#storage/database.js";
import { getProfile, exportProfile, forgetProfile } from "../knowledge/profile-service.js";
import { pushProfile, pullProfile } from "../knowledge/sync-service.js";
import fs from "node:fs";

export async function showProfileStatus(projectId: string): Promise<void> {
  const db = createDatabase();
  try {
    const profile = getProfile(db, projectId);
    if (!profile.exists) {
      consola.info(`No profile found for project: ${projectId}`);
      return;
    }
    consola.info(`Profile for project: ${projectId}`);
    consola.info(`  Level: ${profile.level}`);
    consola.info(`  Assessment Mode: ${profile.assessment_mode}`);
    consola.info(`  Level Source: ${profile.level_source}`);
    consola.info(`  Display Scale: ${profile.display_scale}`);
  } finally {
    db.close();
  }
}

export async function runProfileExport(projectId: string, path: string): Promise<void> {
  const db = createDatabase();
  try {
    const res = exportProfile(db, projectId);
    fs.writeFileSync(path, JSON.stringify(res.artifact, null, 2), "utf8");
    consola.success(`Successfully exported profile for ${projectId} to ${path}`);
  } finally {
    db.close();
  }
}

export async function runProfileForget(projectId: string, confirm: boolean): Promise<void> {
  const db = createDatabase();
  try {
    const res = forgetProfile(db, projectId, confirm);
    if (res.success) {
      consola.success(`Successfully deleted profile of ${projectId} (deleted ${res.deleted_rows} records, exports revoked: ${res.exports_revoked})`);
    } else {
      consola.info(`No profile found to delete for project ${projectId}`);
    }
  } finally {
    db.close();
  }
}

export async function runProfilePush(projectId: string, passphrase: string, path: string): Promise<void> {
  const db = createDatabase();
  try {
    await pushProfile(db, projectId, passphrase, { file_path: path });
    consola.success(`Successfully pushed profile for ${projectId} to ${path}`);
  } finally {
    db.close();
  }
}

export async function runProfilePull(projectId: string, passphrase: string, path: string): Promise<void> {
  const db = createDatabase();
  try {
    const res = await pullProfile(db, projectId, passphrase, { file_path: path });
    if (res.conflict) {
      consola.warn(`Sync conflict detected on pull! Remote level was ${res.remote_version?.level_internal}, local level is ${res.local_version?.level_internal}.`);
      consola.warn("Please resolve the conflict manually.");
    } else if (res.imported) {
      consola.success(`Successfully pulled and imported profile for ${projectId} from ${path}`);
    } else {
      consola.success(`Pulled profile for ${projectId} from ${path} (no action taken)`);
    }
  } finally {
    db.close();
  }
}