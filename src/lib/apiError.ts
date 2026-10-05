// Turns the backend's error envelope ({ message, errors }) into something a
// person can act on. Kept free of axios/React so it's trivially testable.

/**
 * Error thrown by every API helper. `.message` is always human-readable.
 * `.fieldErrors` maps a form field name -> its first validation message
 * (when the backend sent per-field details), so a form can highlight the
 * exact input instead of only saying "Validation failed.".
 */
export class ApiRequestError extends Error {
  status?: number;
  fieldErrors: Record<string, string>;

  constructor(message: string, status?: number, fieldErrors: Record<string, string> = {}) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

interface BackendIssue {
  message?: unknown;
  path?: unknown;
}

function humanizeField(path: string): string {
  return path
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[._]+/g, ' ')
    .toLowerCase()
    .trim();
}

/**
 * Reads the zod issue list the backend sends on a 400 ("Validation failed.")
 * and returns readable messages plus a { field: firstMessage } map.
 * Anything that isn't an issue array (e.g. Mongoose error maps) is ignored.
 */
export function parseValidationIssues(details: unknown): { messages: string[]; fieldErrors: Record<string, string> } {
  const messages: string[] = [];
  const fieldErrors: Record<string, string> = {};
  if (!Array.isArray(details)) return { messages, fieldErrors };

  for (const raw of details as BackendIssue[]) {
    let text = typeof raw?.message === 'string' ? raw.message.trim() : '';
    if (!text) continue;

    const field = Array.isArray(raw.path) ? raw.path.join('.') : '';
    if (field) {
      const label = humanizeField(field);
      // Our custom messages already name the field ("Password must be…").
      // Zod's built-in ones ("Required", "String must contain…") don't, so name it.
      if (!text.toLowerCase().includes(label)) {
        const nice = label.charAt(0).toUpperCase() + label.slice(1);
        text = text.toLowerCase() === 'required' ? `${nice} is required.` : `${nice}: ${text}`;
      }
      if (!fieldErrors[field]) fieldErrors[field] = text;
    }
    if (!messages.includes(text)) messages.push(text);
  }
  return { messages, fieldErrors };
}