import { describe, it, expect } from 'vitest';
import { formatDate, truncateText } from './formatters';

describe('Frontend White Box Testing: Formatters', () => {
  
  describe('formatDate()', () => {
    it('should return N/A for empty input', () => {
      expect(formatDate(null)).to.equal('N/A');
      expect(formatDate('')).to.equal('N/A');
    });

    it('should format valid date strings correctly', () => {
      const input = '2026-05-04T12:00:00Z';
      const result = formatDate(input);
      // Expected result depends on locale, but we can check if it contains the month/day
      expect(result).to.contain('May');
      expect(result).to.contain('4');
      expect(result).to.contain('2026');
    });
  });

  describe('truncateText()', () => {
    it('should not truncate short text', () => {
      const text = 'Hello world';
      expect(truncateText(text, 20)).to.equal('Hello world');
    });

    it('should truncate long text and add ellipsis', () => {
      const text = 'This is a very long text that needs truncation';
      const result = truncateText(text, 10);
      expect(result).to.equal('This is a ...');
      expect(result).to.have.lengthOf(13); // 10 chars + 3 dots
    });

    it('should return empty string for null input', () => {
      expect(truncateText(null)).to.equal('');
    });
  });

});
