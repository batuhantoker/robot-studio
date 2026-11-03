// A robot is published when upstream states a license, or when it is Montaj1 (the author's own CAD).
export function publishable(robots) {
  const ok = (r) => Boolean(r.license?.spdx) || r.collection === 'montaj1';
  return { kept: robots.filter(ok), dropped: robots.filter((r) => !ok(r)) };
}
