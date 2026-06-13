const SLUG_RE = /^[a-zA-Z0-9][a-zA-Z0-9/_-]*$/;

export function isValidSlug(slug: string): boolean {
  const trimmed = slug.trim();
  if (!trimmed || !SLUG_RE.test(trimmed)) {
    return false;
  }
  const segments = trimmed.split("/");
  return segments.every((segment) => segment.length > 0 && segment !== "..");
}

export function slugToRelativePath(slug: string): string {
  if (!isValidSlug(slug)) {
    throw new Error(`invalid slug: ${slug}`);
  }
  return `${slug}.md`;
}

export function relativePathToSlug(relativePath: string): string | null {
  if (!relativePath.endsWith(".md")) {
    return null;
  }
  const slug = relativePath.slice(0, -3);
  return isValidSlug(slug) ? slug : null;
}
