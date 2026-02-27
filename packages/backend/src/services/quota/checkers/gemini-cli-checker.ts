import type {
  QuotaCheckResult,
  QuotaCheckerConfig,
  QuotaWindow,
  QuotaWindowType,
} from '../../../types/quota';
import { QuotaChecker } from '../quota-checker';
import { OAuthAuthManager } from '../../oauth-auth-manager';
import type { OAuthProvider } from '@mariozechner/pi-ai';
import { logger } from '../../../utils/logger';

interface GeminiBucket {
  name?: string;
  limit?: string;
  remaining?: string;
  resetAt?: string | number;
  remainingFraction?: number;
  description?: string;
}

interface GeminiQuotaResponse {
  buckets?: GeminiBucket[];
  quota?: {
    buckets?: GeminiBucket[];
  };
  userQuota?: {
    buckets?: GeminiBucket[];
  };
}

export class GeminiCliQuotaChecker extends QuotaChecker {
  private endpoint: string;
  private userAgent: string;
  private googApiClient: string;
  private clientMetadata: string;

  constructor(config: QuotaCheckerConfig) {
    super(config);
    this.endpoint = this.getOption<string>(
      'endpoint',
      'https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota'
    );
    this.userAgent = this.getOption<string>('userAgent', 'google-api-nodejs-client/10.3.0');
    this.googApiClient = this.getOption<string>('googApiClient', 'gl-node/22.18.0');
    this.clientMetadata = this.getOption<string>(
      'clientMetadata',
      'ideType=IDE_UNSPECIFIED,platform=PLATFORM_UNSPECIFIED,pluginType=GEMINI'
    );
  }

  async checkQuota(): Promise<QuotaCheckResult> {
    try {
      const apiKey = await this.resolveApiKey();

      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': this.userAgent,
        'X-Goog-Api-Client': this.googApiClient,
        'Client-Metadata': this.clientMetadata,
      };

      logger.silly(`[gemini-cli-checker] Requesting usage from ${this.endpoint}`);

      const response = await fetch(this.endpoint, {
        method: 'GET',
        headers,
      });

      const bodyText = await response.text();
      if (!response.ok) {
        return this.errorResult(
          new Error(`quota request failed with status ${response.status}: ${bodyText}`)
        );
      }

      let data: GeminiQuotaResponse;
      try {
        data = JSON.parse(bodyText) as GeminiQuotaResponse;
      } catch (error) {
        return this.errorResult(
          new Error(`failed to parse gemini quota response: ${String(error)}`)
        );
      }

      const buckets = this.extractBuckets(data);
      if (!buckets || buckets.length === 0) {
        logger.debug(`[gemini-cli-checker] No buckets found in response: ${bodyText}`);
        return this.successResult([]);
      }

      const windows = this.buildWindows(buckets);
      return {
        ...this.successResult(windows),
        rawResponse: data,
      };
    } catch (error) {
      return this.errorResult(error as Error);
    }
  }

  private async resolveApiKey(): Promise<string> {
    const configuredApiKey = this.getOption<string>('apiKey', '').trim();
    if (configuredApiKey) {
      return configuredApiKey;
    }

    const provider =
      this.getOption<string>('oauthProvider', 'google-gemini-oauth').trim() ||
      'google-gemini-oauth';
    const oauthAccountId = this.getOption<string>('oauthAccountId', '').trim();
    const authManager = OAuthAuthManager.getInstance();

    try {
      return oauthAccountId
        ? await authManager.getApiKey(provider as OAuthProvider, oauthAccountId)
        : await authManager.getApiKey(provider as OAuthProvider);
    } catch (error) {
      authManager.reload();
      logger.info(
        `[gemini-cli-checker] Reloaded OAuth auth file and retrying token retrieval for provider '${provider}'.`
      );
      return oauthAccountId
        ? await authManager.getApiKey(provider as OAuthProvider, oauthAccountId)
        : await authManager.getApiKey(provider as OAuthProvider);
    }
  }

  private extractBuckets(data: GeminiQuotaResponse): GeminiBucket[] {
    if (Array.isArray(data.buckets)) return data.buckets;
    if (data.quota && Array.isArray(data.quota.buckets)) return data.quota.buckets;
    if (data.userQuota && Array.isArray(data.userQuota.buckets)) return data.userQuota.buckets;
    return [];
  }

  private buildWindows(buckets: GeminiBucket[]): QuotaWindow[] {
    return buckets.map((bucket, index) => {
      const remainingFraction = bucket.remainingFraction ?? 1.0;
      const usedPercent = (1.0 - remainingFraction) * 100;
      const remainingPercent = remainingFraction * 100;

      let resetsAt: Date | undefined;
      if (bucket.resetAt) {
        if (typeof bucket.resetAt === 'number') {
          // Detect if seconds or ms
          const millis = bucket.resetAt > 1e12 ? bucket.resetAt : bucket.resetAt * 1000;
          resetsAt = new Date(millis);
        } else {
          const parsed = new Date(bucket.resetAt);
          if (!isNaN(parsed.getTime())) {
            resetsAt = parsed;
          }
        }
      }

      // Default window types based on index or name if we can guess
      let windowType: QuotaWindowType = 'five_hour';
      const name = (bucket.name || bucket.description || '').toLowerCase();
      if (name.includes('day') || name.includes('daily')) windowType = 'daily';
      else if (name.includes('week')) windowType = 'weekly';
      else if (name.includes('month')) windowType = 'monthly';
      else if (index > 0) windowType = 'custom';

      return this.createWindow(
        windowType,
        100,
        usedPercent,
        remainingPercent,
        'percentage',
        resetsAt,
        bucket.description || bucket.name || `Gemini Quota ${index + 1}`
      );
    });
  }
}
