export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
