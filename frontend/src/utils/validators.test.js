import { describe, it, expect } from 'vitest';
import { validateEmail, formatCurrency } from './validators';

describe('Frontend White Box Testing: Validators & Currencies', () => {
  
  describe('validateEmail()', () => {
    it('should return true for valid emails', () => {
      expect(validateEmail('test@example.com')).to.be.true;
      expect(validateEmail('user.name+tag@domain.co.uk')).to.be.true;
    });

    it('should return false for invalid emails', () => {
      expect(validateEmail('invalid-email')).to.be.false;
      expect(validateEmail('user@')).to.be.false;
      expect(validateEmail('@domain.com')).to.be.false;
      expect(validateEmail('user@domain')).to.be.false;
    });
  });

  describe('formatCurrency()', () => {
    it('should format numbers as USD by default', () => {
      expect(formatCurrency(1234.56)).to.contain('$1,234.56');
    });

    it('should support other currencies like EUR', () => {
      const result = formatCurrency(100, 'EUR');
      // The exact formatting depends on environment, but it should contain the number
      expect(result).to.contain('100');
    });
  });

});
