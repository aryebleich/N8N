/** Route params may arrive percent-encoded (conversation ids contain ":", "<", "@"). */
export const decodeParam = (v: string) => {
  try { return v.includes('%') ? decodeURIComponent(v) : v; } catch { return v; }
};
