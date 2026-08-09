import { Resend } from 'resend';
import { getAdminEmail, getAppName, getSupportEmail } from '../../config/brand';
import { logDebug, logError, logBusinessEvent } from '../logger';

/**
 * Email service — all outbound mail via Resend API.
 */
export class EmailService {
  private static resend: Resend | null = null;

  private static escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** Initialize (or reuse) the Resend client from RESEND_API_KEY. */
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

  /** Send an admin-operation notification email. */
  static async sendAdminOperationEmail(operationType: string, operationDetails: any): Promise<boolean> {
    try {
      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey || apiKey.trim() === '') {
        logDebug('Admin operation email skipped - RESEND_API_KEY not configured (development mode)', { operationType, operationDetails });
        return true;
      }

      const resend = this.initializeResend();
      const fromEmail = process.env.RESEND_FROM_EMAIL;
      const appName = getAppName();
      const adminEmail = getAdminEmail();
      if (!adminEmail) {
        throw new Error('Missing required environment variable: ADMIN_EMAIL');
      }

      if (!fromEmail) {
        throw new Error('Missing required environment variable: RESEND_FROM_EMAIL');
      }

      // Build operation-details HTML rows
      let detailsHtml = '';
      for (const [key, value] of Object.entries(operationDetails)) {
        detailsHtml += `<tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>${key}:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${value}</td></tr>`;
      }

      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px;">
            🔔 Admin Operation Notice - ${appName}
          </h2>
          <p style="color: #666; font-size: 14px;">
            Time: <strong>${new Date().toLocaleString('en-US')}</strong>
          </p>
          <p style="color: #666; font-size: 14px;">
            Operation Type: <strong style="color: #007bff;">${operationType}</strong>
          </p>
          
          <h3 style="color: #333; margin-top: 20px;">Operation Details</h3>
          <table style="width: 100%; border-collapse: collapse; background-color: #f9f9f9;">
            ${detailsHtml}
          </table>
          
          <p style="color: #999; font-size: 12px; margin-top: 20px; padding-top: 10px; border-top: 1px solid #eee;">
            This is an automated email. Please do not reply. Contact your system administrator for questions.
          </p>
        </div>
      `.trim();

      const textContent = `
        Admin Operation Notice - ${appName}
        
        Time: ${new Date().toLocaleString('en-US')}
        Operation Type: ${operationType}
        
        Operation Details:
        ${Object.entries(operationDetails)
          .map(([key, value]) => `${key}: ${value}`)
          .join('\n')}
      `.trim();

      logDebug('Sending admin operation email', { operationType, adminEmail });

      const response = await resend.emails.send({
        from: fromEmail,
        to: adminEmail,
        subject: `[${appName}] Admin Operation Notice - ${operationType}`,
        html: htmlContent,
        text: textContent,
      });

      logBusinessEvent('admin_operation_email_sent', 'system', { operationType, messageId: response.data?.id || 'unknown' });
      return true;
    } catch (error) {
      logError('Failed to send admin operation email', error, { operationType });
      return false;
    }
  }

  /** Notify Support that a user requested a referral-cashback withdrawal. */
  static async sendCashbackWithdrawalNotice(details: {
    withdrawalId: string;
    userId: string;
    email: string | null;
    displayName: string | null;
    amount: number;
    currency: string;
    destinationAddress: string;
  }): Promise<boolean> {
    try {
      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey || apiKey.trim() === '') {
        logDebug('Cashback withdrawal email skipped - RESEND_API_KEY not configured', {
          withdrawalId: details.withdrawalId,
          userId: details.userId,
        });
        return true;
      }

      const resend = this.initializeResend();
      const fromEmail = process.env.RESEND_FROM_EMAIL;
      const appName = getAppName();
      const supportEmail = getSupportEmail();

      if (!fromEmail) {
        throw new Error('Missing required environment variable: RESEND_FROM_EMAIL');
      }

      const amountLabel = `${details.amount.toFixed(2)} ${details.currency.toUpperCase()}`;
      const userLabel = details.email || details.displayName || details.userId;
      const safe = {
        withdrawalId: this.escapeHtml(details.withdrawalId),
        userId: this.escapeHtml(details.userId),
        userLabel: this.escapeHtml(userLabel),
        displayName: this.escapeHtml(details.displayName || '—'),
        email: this.escapeHtml(details.email || '—'),
        amountLabel: this.escapeHtml(amountLabel),
        destinationAddress: this.escapeHtml(details.destinationAddress),
      };

      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px;">
            Referral Cashback Withdrawal Request - ${appName}
          </h2>
          <p style="color: #666; font-size: 14px;">
            Time: <strong>${new Date().toLocaleString('en-US')}</strong>
          </p>
          <table style="width: 100%; border-collapse: collapse; background-color: #f9f9f9;">
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Withdrawal ID:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${safe.withdrawalId}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>User ID:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${safe.userId}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>User:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${safe.userLabel}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Display Name:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${safe.displayName}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Email:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${safe.email}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Amount:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${safe.amountLabel}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Destination Address:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee; font-family: monospace;">${safe.destinationAddress}</td></tr>
          </table>
          <p style="color: #999; font-size: 12px; margin-top: 20px; padding-top: 10px; border-top: 1px solid #eee;">
            This is an automated email. Please process the manual payout and mark the withdrawal as completed.
          </p>
        </div>
      `.trim();

      const textContent = `
        Referral Cashback Withdrawal Request - ${appName}

        Time: ${new Date().toLocaleString('en-US')}
        Withdrawal ID: ${details.withdrawalId}
        User ID: ${details.userId}
        User: ${userLabel}
        Display Name: ${details.displayName || '—'}
        Email: ${details.email || '—'}
        Amount: ${amountLabel}
        Destination Address: ${details.destinationAddress}
      `.trim();

      logDebug('Sending cashback withdrawal notice', {
        withdrawalId: details.withdrawalId,
        supportEmail,
      });

      const response = await resend.emails.send({
        from: fromEmail,
        to: supportEmail,
        subject: `[${appName}] Cashback Withdrawal - ${userLabel} - ${amountLabel}`,
        html: htmlContent,
        text: textContent,
      });

      logBusinessEvent('cashback_withdrawal_email_sent', details.userId, {
        withdrawalId: details.withdrawalId,
        amount: details.amount,
        messageId: response.data?.id || 'unknown',
      });
      return true;
    } catch (error) {
      logError('Failed to send cashback withdrawal notice', error, {
        withdrawalId: details.withdrawalId,
        userId: details.userId,
      });
      return false;
    }
  }
}
