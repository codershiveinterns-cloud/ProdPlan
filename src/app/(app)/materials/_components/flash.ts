/** `?flash=` toast messages shown after a redirecting mutation (create / update / delete). Pure. */
export const FLASH_MESSAGES: Record<string, string> = {
  created: "Material created",
  updated: "Material saved",
  deleted: "Material deleted",
};

export function flashMessage(value: string | string[] | undefined): string | null {
  const key = Array.isArray(value) ? value[0] : value;
  return key ? (FLASH_MESSAGES[key] ?? null) : null;
}
