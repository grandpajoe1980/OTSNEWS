import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { getDb } from './db';
import type { EmailConfig } from '../types';

/**
 * Read the email config (single row, id=1) from the database.
 */
export async function getEmailConfig(): Promise<EmailConfig | null> {
    const db = await getDb();
    const rows = await db.exec('SELECT provider, smtp_host, smtp_port, username, password, encryption, from_address, from_name, enabled FROM email_config WHERE id = 1');
    if (!rows.length || !rows[0].values.length) return null;
    const r = rows[0].values[0];
    return {
        provider: r[0] as EmailConfig['provider'],
        smtpHost: r[1] as string,
        smtpPort: r[2] as number,
        username: r[3] as string,
        password: r[4] as string,
        encryption: r[5] as EmailConfig['encryption'],
        fromAddress: r[6] as string,
        fromName: r[7] as string,
        enabled: !!(r[8] as number),
    };
}

/**
 * Build a nodemailer transporter from an EmailConfig object.
 */
function buildTransporter(config: EmailConfig): Transporter {
    const secure = config.encryption === 'ssl';
    const tls = config.encryption === 'tls';

    return nodemailer.createTransport({
        host: config.smtpHost,
        port: config.smtpPort,
        secure,               // true for port 465 (SSL)
        auth: {
            user: config.username,
            pass: config.password,
        },
        tls: tls ? { rejectUnauthorized: false } : undefined,
    } as any);
}

/**
 * Test SMTP connection using the provided config.
 * Returns { success: true } or { success: false, error: string }.
 */
export async function testConnection(config: EmailConfig): Promise<{ success: boolean; error?: string }> {
    try {
        const transporter = buildTransporter(config);
        await transporter.verify();
        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message || 'Unknown error' };
    }
}

/**
 * Send a single email using the stored config.
 */
export async function sendEmail(to: string, subject: string, html: string): Promise<{ success: boolean; error?: string }> {
    const config = await getEmailConfig();
    if (!config || !config.enabled) {
        return { success: false, error: 'Email is not configured or not enabled' };
    }

    try {
        const transporter = buildTransporter(config);
        await transporter.sendMail({
            from: `"${config.fromName}" <${config.fromAddress}>`,
            to,
            subject,
            html,
        });
        return { success: true };
    } catch (err: any) {
        console.error('Email send failed:', err);
        return { success: false, error: err.message || 'Failed to send email' };
    }
}

/**
 * Send a test email to the given address.
 */
export async function sendTestEmail(config: EmailConfig, toAddress: string): Promise<{ success: boolean; error?: string }> {
    try {
        const transporter = buildTransporter(config);
        await transporter.sendMail({
            from: `"${config.fromName}" <${config.fromAddress}>`,
            to: toAddress,
            subject: 'OTS NEWS — Test Email',
            html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
          <h2 style="color: #1a1a1a;">🎉 Email Configuration Successful!</h2>
          <p style="color: #555;">Your OTS NEWS email settings are working correctly.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
          <p style="color: #999; font-size: 12px;">Sent from OTS NEWS Admin Panel</p>
        </div>
      `,
        });
        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message || 'Failed to send test email' };
    }
}
