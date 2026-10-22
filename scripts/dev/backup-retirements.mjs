// Jakob approved retiring exactly these six archived backup branches on 2026-10-22.
// This is a deletion-only exception, never permission to move a backup tip.
// Both tidy and pre-push require the existing archive/<branch> tag on the remote.
export const BACKUP_RETIREMENTS = Object.freeze({
  BRA_19191919: "1695a8eb729e0a4f9b33a1ace900d3e2212f9ab8",
  BRA_FORSTA_BRA_SAJTEN_2026_09_01: "1b710d229d685ade3d0e6d5453a8734eff9fc98e",
  BRA_PRE_OPENCLAW_BUILDER_2026_08_24: "22673963a88cca84264929abcdfb3fa8a4afe611",
  BRA_PREVIEW_BEFORE_RESTORE_2026_08_27: "8fdc7232b1a6f56336512562439c9651946fee94",
  BRA_backup_branch_999999: "fb14ab3d65103f5e9b40e0d31baf9c9d3c32df2e",
  JAKOB_BRA_9999_INNNAN_MVP_BRA: "991bb82f2d11972d1eaf6ed62c2e78361539924e",
});

export function approvedBackupRetirement(branch) {
  return Object.hasOwn(BACKUP_RETIREMENTS, branch) ? BACKUP_RETIREMENTS[branch] : null;
}
