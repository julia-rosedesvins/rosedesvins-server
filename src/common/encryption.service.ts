import * as CryptoJS from 'crypto-js';

export class EncryptionService {
  private static readonly SECRET_KEY = process.env.ENCRYPTION_KEY || 'your-super-secret-encryption-key-change-in-production-32-chars';

  /**
   * Encrypt password using AES (reversible encryption)
   */
  static encrypt(password: string): string {
    try {
      const encrypted = CryptoJS.AES.encrypt(password, this.SECRET_KEY).toString();
      return encrypted;
    } catch (error) {
      console.error('Encryption error:', error);
      throw new Error('Failed to encrypt password');
    }
  }

  /**
   * Decrypt password using AES (get back original password)
   */
  static decrypt(encryptedPassword: string): string {
    try {
      const decrypted = CryptoJS.AES.decrypt(encryptedPassword, this.SECRET_KEY);
      const originalPassword = decrypted.toString(CryptoJS.enc.Utf8);
      
      if (!originalPassword) {
        throw new Error('Failed to decrypt password - invalid key or corrupted data');
      }
      
      return originalPassword;
    } catch (error) {
      console.error('Decryption error:', error);
      throw new Error('Failed to decrypt password');
    }
  }

  /**
   * Test encryption/decryption functionality
   */
  static test() {
    const testPassword = 'TestPassword123!';
    console.log('🔑 Testing encryption service...');
    console.log('Original:', testPassword);
    
    const encrypted = this.encrypt(testPassword);
    console.log('Encrypted:', encrypted);
    
    const decrypted = this.decrypt(encrypted);
    console.log('Decrypted:', decrypted);
    console.log('Match:', testPassword === decrypted ? '✅' : '❌');
    
    return testPassword === decrypted;
  }
}
