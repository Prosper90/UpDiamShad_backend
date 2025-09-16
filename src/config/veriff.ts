export interface VeriffConfig {
  apiKey: string;
  baseUrl: string;
  apiSecret: string; // Master signature key for HMAC
  webhookSecret?: string; // Optional webhook secret (if different)
  publicKey?: string; // Optional public key for SDK
}

export const veriffConfig: VeriffConfig = {
  apiKey: process.env.VERIFF_API_KEY || '',
  baseUrl: process.env.VERIFF_BASE_URL || 'https://stationapi.veriff.com',
  apiSecret: process.env.VERIFF_API_SECRET || process.env.VERIFF_WEBHOOK_SECRET || '', // Try both
  webhookSecret: process.env.VERIFF_WEBHOOK_SECRET,
  publicKey: process.env.VERIFF_PUBLIC_KEY
};

// Validate required Veriff configuration
export const validateVeriffConfig = (): boolean => {
  const requiredFields: (keyof VeriffConfig)[] = ['apiKey', 'apiSecret'];
  
  for (const field of requiredFields) {
    if (!veriffConfig[field] || veriffConfig[field]!.includes('your-veriff-')) {
      console.error(`Missing or invalid Veriff configuration: ${field}`);
      return false;
    }
  }
  
  // Check if API key looks valid (UUID format)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(veriffConfig.apiKey)) {
    console.error('Veriff API key does not appear to be in valid UUID format');
    return false;
  }
  
  console.log('✅ Veriff configuration validation passed');
  return true;
};

// Veriff API endpoints
export const VERIFF_ENDPOINTS = {
  CREATE_SESSION: '/v1/sessions',
  GET_DECISION: '/v1/sessions/{sessionId}/decision',
  GET_MEDIA: '/v1/sessions/{sessionId}/media'
} as const;