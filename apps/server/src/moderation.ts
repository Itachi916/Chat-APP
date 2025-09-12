// Simple phone number filter: blocks patterns that look like phone numbers
const PHONE_REGEX = /(?:\+?\d[\s-]?)?(?:\(?\d{3}\)?[\s-]?)?\d{3}[\s-]?\d{4}/g;

export function containsPhoneNumber(text: string): boolean {
  return PHONE_REGEX.test(text);
}

