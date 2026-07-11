"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailService = void 0;
const resend_1 = require("resend");
const logger_1 = require("../logger");
/**
 * 郵件服務 - 透過 Resend API 處理所有郵件發送
 */
class EmailService {
    static resend = null;
    /**
     * 使用 API key 初始化 Resend 實例
     */
    static initializeResend() {
        if (this.resend) {
            return this.resend;
        }
        const apiKey = process.env.RESEND_API_KEY;
        if (!apiKey) {
            throw new Error('Resend API key not configured. Set RESEND_API_KEY environment variable.');
        }
        try {
            this.resend = new resend_1.Resend(apiKey);
            (0, logger_1.logDebug)('Resend instance initialized', { apiKey: apiKey.substring(0, 10) + '...' });
            return this.resend;
        }
        catch (error) {
            (0, logger_1.logError)('Failed to initialize Resend', error);
            throw new Error('Resend initialization failed');
        }
    }
    /**
     * 發送管理操作通知郵件
     */
    static async sendAdminOperationEmail(operationType, operationDetails) {
        try {
            const apiKey = process.env.RESEND_API_KEY;
            if (!apiKey || apiKey.trim() === '') {
                (0, logger_1.logDebug)('Admin operation email skipped - RESEND_API_KEY not configured (development mode)', { operationType, operationDetails });
                return true;
            }
            const resend = this.initializeResend();
            const fromEmail = process.env.RESEND_FROM_EMAIL;
            const appName = process.env.APP_NAME || 'Kura';
            const adminEmail = 'admin@kura-finance.com';
            if (!fromEmail) {
                throw new Error('Missing required environment variable: RESEND_FROM_EMAIL');
            }
            // 建立操作詳情的 HTML
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
            (0, logger_1.logDebug)('Sending admin operation email', { operationType, adminEmail });
            const response = await resend.emails.send({
                from: fromEmail,
                to: adminEmail,
                subject: `[${appName}] Admin Operation Notice - ${operationType}`,
                html: htmlContent,
                text: textContent,
            });
            (0, logger_1.logBusinessEvent)('admin_operation_email_sent', 'system', { operationType, messageId: response.data?.id || 'unknown' });
            return true;
        }
        catch (error) {
            (0, logger_1.logError)('Failed to send admin operation email', error, { operationType });
            return false;
        }
    }
}
exports.EmailService = EmailService;
//# sourceMappingURL=emailService.js.map