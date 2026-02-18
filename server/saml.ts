import { SAML, type SamlConfig as NodeSamlConfig, generateServiceProviderMetadata } from '@node-saml/node-saml';
import { XMLParser } from 'fast-xml-parser';
import { isIP } from 'net';
import type { SamlConfig } from '../types';

const DEFAULT_NAME_ID_FORMAT = 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress';
const HTTP_REDIRECT_BINDING = 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect';
const HTTP_POST_BINDING = 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: true,
  trimValues: true,
});

const MAX_METADATA_XML_BYTES = 512 * 1024;
const METADATA_FETCH_TIMEOUT_MS = 8000;

function isPrivateIpv4(value: string): boolean {
  if (!value) return false;
  if (value === '127.0.0.1') return true;
  const parts = value.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return false;
  if (parts[0] === 10) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] === 169 && parts[1] === 254) return true;
  if (parts[0] === 0) return true;
  return false;
}

function isPrivateIpv6(value: string): boolean {
  const normalized = value.toLowerCase();
  return normalized === '::1'
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || normalized.startsWith('fe80');
}

function assertSafeMetadataUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Metadata URL is invalid');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Metadata URL must use http or https');
  }

  const host = (parsed.hostname || '').toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.local')) {
    throw new Error('Metadata URL host is not allowed');
  }

  const ipType = isIP(host);
  if (ipType === 4 && isPrivateIpv4(host)) {
    throw new Error('Metadata URL private IPv4 hosts are not allowed');
  }
  if (ipType === 6 && isPrivateIpv6(host)) {
    throw new Error('Metadata URL private IPv6 hosts are not allowed');
  }

  return parsed;
}

export type ParsedIdpMetadata = {
  idpEntityId: string;
  entryPoint: string;
  idpCert: string;
  logoutUrl: string;
};

function ensureArray<T>(value: T | T[] | undefined | null): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function localName(key: string): string {
  const idx = key.indexOf(':');
  return idx >= 0 ? key.slice(idx + 1) : key;
}

function findNodeByLocalName(value: unknown, expectedLocalName: string): any | undefined {
  if (!value || typeof value !== 'object') return undefined;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findNodeByLocalName(item, expectedLocalName);
      if (found) return found;
    }
    return undefined;
  }

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (localName(key) === expectedLocalName) {
      if (Array.isArray(child)) return child[0];
      return child;
    }
    const found = findNodeByLocalName(child, expectedLocalName);
    if (found) return found;
  }

  return undefined;
}

function getAttribute(node: any, attributeName: string): string {
  if (!node || typeof node !== 'object') return '';
  const attr = node[`@_${attributeName}`];
  return typeof attr === 'string' ? attr.trim() : '';
}

function pickServiceLocation(serviceNode: any): string {
  const services = ensureArray(serviceNode);
  if (!services.length) return '';

  const preferred = services.find((svc) => getAttribute(svc, 'Binding') === HTTP_REDIRECT_BINDING)
    || services.find((svc) => getAttribute(svc, 'Binding') === HTTP_POST_BINDING)
    || services[0];

  return getAttribute(preferred, 'Location');
}

function readCertificateFromIdpDescriptor(idpDescriptor: any): string {
  const keyDescriptors = ensureArray(findNodeByLocalName(idpDescriptor, 'KeyDescriptor') ?? idpDescriptor?.KeyDescriptor);
  for (const keyDescriptor of keyDescriptors) {
    const keyInfo = findNodeByLocalName(keyDescriptor, 'KeyInfo') ?? keyDescriptor?.KeyInfo;
    const x509Data = findNodeByLocalName(keyInfo, 'X509Data') ?? keyInfo?.X509Data;
    const certNode = findNodeByLocalName(x509Data, 'X509Certificate') ?? x509Data?.X509Certificate;
    const certValue = Array.isArray(certNode) ? certNode[0] : certNode;
    if (typeof certValue === 'string' && certValue.trim()) {
      return certValue.trim();
    }
  }
  return '';
}

export async function parseIdpMetadata(options: { metadataMode: 'url' | 'xml'; metadataUrl?: string; metadataXml?: string }): Promise<ParsedIdpMetadata> {
  let metadataXml = options.metadataXml?.trim() || '';

  if (options.metadataMode === 'url') {
    if (!options.metadataUrl?.trim()) {
      throw new Error('Metadata URL is required when metadata mode is URL');
    }

    const safeUrl = assertSafeMetadataUrl(options.metadataUrl.trim());
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), METADATA_FETCH_TIMEOUT_MS);
    const response = await fetch(safeUrl.toString(), { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Failed to load metadata URL (${response.status})`);
    }

    const contentLength = Number(response.headers.get('content-length') || '0');
    if (contentLength > MAX_METADATA_XML_BYTES) {
      throw new Error('Metadata response is too large');
    }

    metadataXml = await response.text();
    if (Buffer.byteLength(metadataXml, 'utf8') > MAX_METADATA_XML_BYTES) {
      throw new Error('Metadata XML exceeds size limit');
    }
  }

  if (!metadataXml) {
    throw new Error('Metadata XML is required');
  }

  let parsed: any;
  try {
    parsed = parser.parse(metadataXml);
  } catch {
    throw new Error('Metadata XML is invalid');
  }

  const entityDescriptor = findNodeByLocalName(parsed, 'EntityDescriptor');
  if (!entityDescriptor) {
    throw new Error('Metadata does not contain an EntityDescriptor');
  }

  const idpDescriptor = findNodeByLocalName(entityDescriptor, 'IDPSSODescriptor');
  if (!idpDescriptor) {
    throw new Error('Metadata does not contain an IDPSSODescriptor');
  }

  const idpEntityId = getAttribute(entityDescriptor, 'entityID');
  const entryPoint = pickServiceLocation(findNodeByLocalName(idpDescriptor, 'SingleSignOnService'));
  const logoutUrl = pickServiceLocation(findNodeByLocalName(idpDescriptor, 'SingleLogoutService'));
  const idpCert = readCertificateFromIdpDescriptor(idpDescriptor);

  if (!entryPoint) {
    throw new Error('Metadata does not contain a usable SingleSignOnService endpoint');
  }
  if (!idpCert) {
    throw new Error('Metadata does not contain an IdP signing certificate');
  }

  return {
    idpEntityId,
    entryPoint,
    idpCert,
    logoutUrl,
  };
}

export function normalizePemCertificate(certificate: string): string {
  const trimmed = certificate.trim();
  if (!trimmed) return '';

  if (trimmed.includes('BEGIN CERTIFICATE')) {
    return trimmed;
  }

  const singleLine = trimmed.replace(/\s+/g, '');
  const chunks = singleLine.match(/.{1,64}/g) || [singleLine];
  return `-----BEGIN CERTIFICATE-----\n${chunks.join('\n')}\n-----END CERTIFICATE-----`;
}

export function buildDefaultSamlConfig(baseUrl: string): SamlConfig {
  return {
    providerType: 'saml',
    enabled: false,
    metadataMode: 'url',
    metadataUrl: '',
    metadataXml: '',
    idpEntityId: '',
    entryPoint: '',
    idpCert: '',
    logoutUrl: '',
    spEntityId: `${baseUrl}/api/auth/saml/metadata`,
    acsUrl: `${baseUrl}/api/auth/saml/callback`,
    nameIdFormat: DEFAULT_NAME_ID_FORMAT,
    emailAttribute: 'email',
    displayNameAttribute: 'name',
  };
}

export async function hydrateSamlConfigFromMetadata(baseConfig: SamlConfig): Promise<SamlConfig> {
  const parsed = await parseIdpMetadata({
    metadataMode: baseConfig.metadataMode,
    metadataUrl: baseConfig.metadataUrl,
    metadataXml: baseConfig.metadataXml,
  });

  return {
    ...baseConfig,
    idpEntityId: parsed.idpEntityId,
    entryPoint: parsed.entryPoint,
    idpCert: normalizePemCertificate(parsed.idpCert),
    logoutUrl: parsed.logoutUrl,
    nameIdFormat: baseConfig.nameIdFormat || DEFAULT_NAME_ID_FORMAT,
    emailAttribute: (baseConfig.emailAttribute || 'email').trim(),
    displayNameAttribute: (baseConfig.displayNameAttribute || 'name').trim(),
  };
}

export function toNodeSamlConfig(config: SamlConfig): NodeSamlConfig {
  return {
    idpCert: normalizePemCertificate(config.idpCert),
    entryPoint: config.entryPoint,
    callbackUrl: config.acsUrl,
    issuer: config.spEntityId,
    identifierFormat: config.nameIdFormat || DEFAULT_NAME_ID_FORMAT,
    disableRequestedAuthnContext: true,
    wantAssertionsSigned: true,
    wantAuthnResponseSigned: false,
    audience: config.spEntityId,
    acceptedClockSkewMs: 5000,
  };
}

export function createSamlClient(config: SamlConfig): SAML {
  return new SAML(toNodeSamlConfig(config));
}

export function generateSpMetadataXml(config: SamlConfig): string {
  return generateServiceProviderMetadata({
    issuer: config.spEntityId,
    callbackUrl: config.acsUrl,
    identifierFormat: config.nameIdFormat || DEFAULT_NAME_ID_FORMAT,
    wantAssertionsSigned: true,
  });
}

function getStringAttribute(profile: Record<string, unknown>, key: string): string {
  const value = profile[key];
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0].trim();
  return '';
}

export function extractIdentity(profile: Record<string, unknown>, config: SamlConfig): { email: string; displayName: string } {
  const configuredEmail = getStringAttribute(profile, config.emailAttribute);
  const configuredDisplayName = getStringAttribute(profile, config.displayNameAttribute);

  const email = configuredEmail
    || getStringAttribute(profile, 'email')
    || getStringAttribute(profile, 'mail')
    || getStringAttribute(profile, 'urn:oid:0.9.2342.19200300.100.1.3')
    || (typeof profile.nameID === 'string' ? profile.nameID.trim() : '');

  const displayName = configuredDisplayName
    || getStringAttribute(profile, 'displayName')
    || getStringAttribute(profile, 'name')
    || (email.includes('@') ? email.split('@')[0] : 'SAML User');

  return {
    email: email.toLowerCase(),
    displayName,
  };
}
