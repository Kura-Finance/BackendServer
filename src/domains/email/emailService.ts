import { Resend } from 'resend';
import { logDebug, logError, logBusinessEvent } from '../logger';

/**
 * Email Service - Handles all email sending via Resend API
 */
export class EmailService {
  private static resend: Resend | null = null;

  /**
   * Initialize Resend instance with API key
   */
  private static initializeResend(): Resend {
    if (this.resend) {
      return this.resend;
    }

    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
      throw new Error('Resend API key not configured. Set RESEND_API_KEY environment variable.');
    }

    try {
      this.resend = new Resend(apiKey);

      logDebug('Resend instance initialized', { apiKey: apiKey.substring(0, 10) + '...' });

      return this.resend;
    } catch (error) {
      logError('Failed to initialize Resend', error);
      throw new Error('Resend initialization failed');
    }
  }

  /**
   * Send email verification code to user
   */
  static async sendVerificationEmail(email: string, verificationCode: string, userName?: string): Promise<boolean> {
    try {
      // Development mode: skip email sending if API key is not configured
      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey || apiKey.trim() === '') {
        logDebug('Email verification skipped - RESEND_API_KEY not configured (development mode)', { email, verificationCode });
        return true; // Return success to allow development flow
      }

      const resend = this.initializeResend();
      const fromEmail = process.env.RESEND_FROM_EMAIL;
      const appName = process.env.APP_NAME || 'Kura';
      const appUrl = process.env.APP_URL;

      if (!fromEmail || !appUrl) {
        throw new Error('Missing required environment variables: RESEND_FROM_EMAIL and APP_URL must be set');
      }

      // Create email HTML content
      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 0; }
              .container { max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); overflow: hidden; }
              .header { background-color: #6366f1; padding: 30px; text-align: center; color: white; }
              .header h1 { margin: 0; font-size: 28px; }
              .content { padding: 40px 30px; text-align: center; }
              .greeting { font-size: 16px; color: #333; margin-bottom: 10px; }
              .message { font-size: 14px; color: #666; margin: 20px 0; line-height: 1.6; }
              .code-box { background-color: #f0f4ff; border: 2px solid #6366f1; border-radius: 8px; padding: 20px; margin: 30px 0; }
              .verification-code { font-size: 32px; font-weight: bold; color: #6366f1; letter-spacing: 4px; font-family: monospace; }
              .code-validity { font-size: 12px; color: #999; margin-top: 10px; }
              .footer { background-color: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #999; border-top: 1px solid #eee; }
              .footer a { color: #6366f1; text-decoration: none; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>${appName}</h1>
              </div>
              <div class="content">
                <p class="greeting">Hi ${userName || 'there'}!</p>
                <p class="message">
                  Thank you for signing up for ${appName}. To complete your email verification, please use the following verification code:
                </p>
                <div class="code-box">
                  <div class="verification-code">${verificationCode}</div>
                  <div class="code-validity">This code is valid for 10 minutes</div>
                </div>
                <p class="message">
                  If you didn't request this verification code, please ignore this email.
                </p>
              </div>
              <div class="footer">
                <p>
                  © 2026 ${appName}. All rights reserved.<br>
                  <a href="${appUrl}">Visit ${appName}</a>
                </p>
              </div>
            </div>
          </body>
        </html>
      `;

      const textContent = `
Hello ${userName || 'there'}!

Thank you for signing up for ${appName}. To complete your email verification, please use the following verification code:

${verificationCode}

This code is valid for 10 minutes.

If you didn't request this verification code, please ignore this email.

© 2026 ${appName}. All rights reserved.
      `.trim();

      logDebug('Sending verification email', { email });

      const response = await resend.emails.send({
        from: fromEmail,
        to: email,
        subject: `Verify your email for ${appName}`,
        html: htmlContent,
        text: textContent,
      });

      logBusinessEvent('verification_email_sent', undefined, { email, messageId: response.data?.id || 'unknown' });
      return true;
    } catch (error) {
      logError('Failed to send verification email', error, { email });
      return false;
    }
  }

  /**
   * Send password reset email with verification code
   */
  static async sendPasswordResetEmail(email: string, resetCode: string, userName?: string): Promise<boolean> {
    try {
      // Development mode: skip email sending if API key is not configured
      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey || apiKey.trim() === '') {
        logDebug('Password reset email skipped - RESEND_API_KEY not configured (development mode)', { email, resetCode });
        return true; // Return success to allow development flow
      }

      const resend = this.initializeResend();
      const fromEmail = process.env.RESEND_FROM_EMAIL;
      const appName = process.env.APP_NAME || 'Kura';
      const appUrl = process.env.APP_URL;

      if (!fromEmail || !appUrl) {
        throw new Error('Missing required environment variables: RESEND_FROM_EMAIL and APP_URL must be set');
      }

      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 0; }
              .container { max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); overflow: hidden; }
              .header { background-color: #6366f1; padding: 30px; text-align: center; color: white; }
              .header h1 { margin: 0; font-size: 28px; }
              .content { padding: 40px 30px; text-align: center; }
              .greeting { font-size: 16px; color: #333; margin-bottom: 10px; }
              .message { font-size: 14px; color: #666; margin: 20px 0; line-height: 1.6; }
              .code-box { background-color: #f0f4ff; border: 2px solid #6366f1; border-radius: 8px; padding: 20px; margin: 30px 0; }
              .verification-code { font-size: 32px; font-weight: bold; color: #6366f1; letter-spacing: 4px; font-family: monospace; }
              .code-validity { font-size: 12px; color: #999; margin-top: 10px; }
              .footer { background-color: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #999; border-top: 1px solid #eee; }
              .footer a { color: #6366f1; text-decoration: none; }
              .warning { color: #dc2626; font-size: 12px; margin-top: 10px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>${appName}</h1>
              </div>
              <div class="content">
                <p class="greeting">Hi ${userName || 'there'}!</p>
                <p class="message">
                  We received a request to reset the password for your ${appName} account. To reset your password, please use the following verification code:
                </p>
                <div class="code-box">
                  <div class="verification-code">${resetCode}</div>
                  <div class="code-validity">This code is valid for 10 minutes</div>
                </div>
                <p class="message warning">
                  If you didn't request this password reset, please ignore this email and your password will remain unchanged.
                </p>
              </div>
              <div class="footer">
                <p>
                  © 2026 ${appName}. All rights reserved.<br>
                  <a href="${appUrl}">Visit ${appName}</a>
                </p>
              </div>
            </div>
          </body>
        </html>
      `;

      const textContent = `
Hello ${userName || 'there'}!

We received a request to reset the password for your ${appName} account. To reset your password, please use the following verification code:

${resetCode}

This code is valid for 10 minutes.

If you didn't request this password reset, please ignore this email and your password will remain unchanged.

© 2026 ${appName}. All rights reserved.
      `.trim();

      logDebug('Sending password reset email', { email });

      const response = await resend.emails.send({
        from: fromEmail,
        to: email,
        subject: `Reset your password for ${appName}`,
        html: htmlContent,
        text: textContent,
      });

      logBusinessEvent('password_reset_email_sent', undefined, { email, messageId: response.data?.id || 'unknown' });
      return true;
    } catch (error) {
      logError('Failed to send password reset email', error, { email });
      return false;
    }
  }
}
