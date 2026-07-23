// ======================================================
// BLACKBOX LAB — VERSION + UPDATE CHECK
//
// APP_VERSION mirrors package.json — bump both together
// when releasing. checkForUpdate() asks GitHub's public
// releases API once on startup; offline or rate-limited
// just means silence, never an error for the pilot.
// ======================================================

export const APP_VERSION = "0.3.0";

const RELEASES_API =
  "https://api.github.com/repos/hillbilly1975/Blackbox_Lab/releases/latest";

function parseVersion(text) {
  const match = String(text).trim().match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function isNewerVersion(candidate, current) {
  const a = parseVersion(candidate);
  const b = parseVersion(current);
  if (!a || !b) return false;

  for (let i = 0; i < 3; i += 1) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return false;
}

/**
 * Resolves to { version, url } when a newer release exists,
 * otherwise null. Never throws.
 */
export async function checkForUpdate(currentVersion = APP_VERSION) {
  try {
    const response = await fetch(RELEASES_API, {
      headers: { Accept: "application/vnd.github+json" }
    });
    if (!response.ok) return null;

    const release = await response.json();
    if (release.draft || release.prerelease) return null;

    if (isNewerVersion(release.tag_name, currentVersion)) {
      return { version: release.tag_name, url: release.html_url };
    }
    return null;
  } catch {
    return null;
  }
}
