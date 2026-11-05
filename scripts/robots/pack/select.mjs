// A robot is published when upstream states a license.
export function publishable(robots) {
  const ok = (r) => Boolean(r.license?.spdx);
  return { kept: robots.filter(ok), dropped: robots.filter((r) => !ok(r)) };
}
