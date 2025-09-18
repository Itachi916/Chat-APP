// Enhanced phone number detection patterns - only flag actual phone numbers
const PHONE_PATTERNS = [
  // US/Canada formats: (123) 456-7890, 123-456-7890, 123.456.7890
  /(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})\b/g,
  // 10-digit numbers: 1234567890
  /\b\d{10}\b/g,
  // International formats: +1 123 456 7890, +44 20 7946 0958
  /\+\d{1,3}[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,9}\b/g,
  // WhatsApp style: +1234567890 (10+ digits)
  /\+[1-9]\d{9,14}\b/g,
  // Emergency numbers: 911, 999, 112
  /\b(911|999|112|000)\b/g,
  // Toll-free numbers: 1-800-XXX-XXXX
  /\b1[-.\s]?800[-.\s]?\d{3}[-.\s]?\d{4}\b/gi,
  // Extension numbers: 123-456-7890 ext 123
  /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}[-.\s]?(?:ext|extension|x)[-.\s]?\d{1,6}\b/gi
];

// Additional patterns for disguised phone numbers (10+ digits)
const DISGUISED_PATTERNS = [
  // Numbers with spaces: 1 2 3 4 5 6 7 8 9 0 (exactly 10+ digits)
  /\b\d(?:\s\d){9,}\b/g,
  // Numbers with mixed separators: 123-456.7890
  /\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/g,
  // Numbers in parentheses: (123) 456-7890
  /\(\d{3}\)\s?\d{3}[-.\s]?\d{4}\b/g,
  // Numbers with country code and spaces: +1 123 456 7890
  /\+\d{1,3}\s\d{1,4}\s\d{1,4}\s\d{1,9}\b/g
];

export interface ModerationResult {
  isBlocked: boolean;
  reason?: string;
  detectedPattern?: string;
  sanitizedContent?: string;
}

export function containsPhoneNumber(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  
  // FIRST: Check for 7+ digits in any sequence (ASCII 48-57 for 0-9)
  let digitCounter = 0;
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    if (charCode >= 48 && charCode <= 57) { // ASCII for 0-9
      digitCounter++;
      if (digitCounter >= 7) {
        return true;
      }
    }
  }
  
  // Check all phone number patterns
  for (const pattern of PHONE_PATTERNS) {
    if (pattern.test(text)) {
      return true;
    }
  }
  
  // Check disguised patterns
  for (const pattern of DISGUISED_PATTERNS) {
    if (pattern.test(text)) {
      return true;
    }
  }
  
  return false;
}

export function moderateMessage(text: string): ModerationResult {
  if (!text || typeof text !== 'string') {
    return { isBlocked: false };
  }

  // Check for phone numbers
  if (containsPhoneNumber(text)) {
    return {
      isBlocked: true,
      reason: 'Phone numbers are not allowed in messages',
      detectedPattern: 'phone_number'
    };
  }

  return { isBlocked: false };
}

export function sanitizePhoneNumbers(text: string): string {
  if (!text || typeof text !== 'string') return text;
  
  let sanitized = text;
  
  // Replace phone numbers with [PHONE NUMBER BLOCKED]
  for (const pattern of PHONE_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[PHONE NUMBER BLOCKED]');
  }
  
  for (const pattern of DISGUISED_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[PHONE NUMBER BLOCKED]');
  }
  
  return sanitized;
}

// Helper function to get detected phone numbers for logging
export function extractPhoneNumbers(text: string): string[] {
  if (!text || typeof text !== 'string') return [];
  
  const phoneNumbers: string[] = [];
  
  for (const pattern of [...PHONE_PATTERNS, ...DISGUISED_PATTERNS]) {
    const matches = text.match(pattern);
    if (matches) {
      phoneNumbers.push(...matches);
    }
  }
  
  return [...new Set(phoneNumbers)]; // Remove duplicates
}

