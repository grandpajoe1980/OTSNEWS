import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { getDb } from './db';
import type { EmailConfig } from '../types';

const EMAIL_SECRET_PREFIX = 'enc:v1';

function getEmailEncryptionKey(): Buffer {
    const keyMaterial = process.env.EMAIL_CONFIG_KEY || process.env.SESSION_SECRET;
    if (!keyMaterial) {
        throw new Error('EMAIL_CONFIG_KEY (or SESSION_SECRET fallback) is required to protect email credentials');
    }
    return createHash('sha256').update(keyMaterial).digest();
}

export function encryptSecretForStorage(plainText: string): string {
    if (!plainText) return '';
    const key = getEmailEncryptionKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${EMAIL_SECRET_PREFIX}:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptSecretFromStorage(storedValue: string): string {
    if (!storedValue) return '';
    if (!storedValue.startsWith(`${EMAIL_SECRET_PREFIX}:`)) {
        return storedValue;
    }

    const parts = storedValue.split(':');
    if (parts.length !== 5) {
        throw new Error('Stored email credential format is invalid');
    }

    const key = getEmailEncryptionKey();
    const iv = Buffer.from(parts[2], 'base64');
    const tag = Buffer.from(parts[3], 'base64');
    const encrypted = Buffer.from(parts[4], 'base64');

    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return plain.toString('utf8');
}

/**
 * Read the email config (single row, id=1) from the database.
 */
export async function getEmailConfig(): Promise<EmailConfig | null> {
    const db = await getDb();
    const rows = db.exec('SELECT provider, smtp_host, smtp_port, username, password, encryption, from_address, from_name, enabled FROM email_config WHERE id = 1');
    if (!rows.length || !rows[0].values.length) return null;
    const r = rows[0].values[0];
    const storedPassword = (r[4] as string) || '';
    return {
        provider: r[0] as EmailConfig['provider'],
        smtpHost: r[1] as string,
        smtpPort: r[2] as number,
        username: r[3] as string,
        password: decryptSecretFromStorage(storedPassword),
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
        tls: tls ? { minVersion: 'TLSv1.2', rejectUnauthorized: true } : undefined,
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
