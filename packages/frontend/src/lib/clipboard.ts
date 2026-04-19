/**
 * Clipboard utility that handles secure and non-secure contexts.
 *
 * The Clipboard API (navigator.clipboard) is only available in secure contexts
 * (HTTPS or localhost). In non-secure HTTP contexts, we fall back to
 * document.execCommand('copy') which also won't work, so we properly
 * detect availability and provide feedback.
 */

/**
 * Check if clipboard operations are available in the current context.
 * Requires secure context (HTTPS or localhost) for modern Clipboard API.
 */
export const isClipboardAvailable = (): boolean => {
  return typeof navigator !== 'undefined' && !!navigator.clipboard;
};

/**
 * Check if we're in a secure context where clipboard operations work.
 */
export const isSecureContext = (): boolean => {
  // @ts-ignore - secureContext may not be defined in older browsers
  return typeof window !== 'undefined' && (window.isSecureContext ?? true);
};

/**
 * Get a user-friendly message explaining why clipboard is unavailable.
 */
export const getClipboardUnavailableMessage = (): string => {
  if (!isSecureContext()) {
    return 'Copy requires HTTPS connection';
  }
  return 'Copy not available in this browser';
};

/**
 * Attempt to copy text to clipboard.
 * Returns success status. Falls back gracefully in non-secure contexts.
 */
export const copyToClipboard = async (text: string): Promise<boolean> => {
  if (!isClipboardAvailable()) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};
