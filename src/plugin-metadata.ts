export interface ReleaseUpdate {
  version: string;
  tag: string;
}

export function compareVersions(a: string, b: string): number {
  const aParts = a.split('.').map(Number);
  const bParts = b.split('.').map(Number);

  for (let index = 0; index < Math.max(aParts.length, bParts.length); index++) {
    const aValue = aParts[index] || 0;
    const bValue = bParts[index] || 0;
    if (aValue !== bValue) return aValue - bValue;
  }

  return 0;
}

export function shouldShowUpdate(latestTag: string, currentVersion: string): ReleaseUpdate | undefined {
  const latestVersion = latestTag.replace(/^v/, '');
  if (!latestVersion || compareVersions(latestVersion, currentVersion) <= 0) return undefined;
  return { version: latestVersion, tag: latestTag };
}

export function latestReleaseUrl(owner: string, repo: string, tag: string): string {
  return `https://github.com/${owner}/${repo}/releases/tag/${tag}`;
}
