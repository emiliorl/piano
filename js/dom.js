// The one place that touches document lookups, so other modules can stay testable.
export const $ = id => document.getElementById(id);
