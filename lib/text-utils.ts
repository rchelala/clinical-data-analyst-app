// Shared text helpers for the Dashboard Brain orbital visualization.

// Long names collide with their neighbors when wedges/labels are narrow
// (many siblings sharing limited space). Truncating keeps labels readable;
// the full name is still shown elsewhere (e.g. a hover card) where space
// allows.
export const DEFAULT_MAX_LABEL_LENGTH = 16;

export function truncateLabel(name: string, maxLength: number = DEFAULT_MAX_LABEL_LENGTH): string {
  return name.length > maxLength
    ? `${name.slice(0, maxLength - 1).trimEnd()}…`
    : name;
}
