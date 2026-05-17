/**
 * Wrap an async function for use in React onClick handlers.
 * The returned function catches rejections so unhandled promise
 * rejections don't pollute the console or trigger error boundaries.
 */
export function cli(fn: () => Promise<unknown>) {
  return () => {
    fn().catch(() => {});
  };
}
