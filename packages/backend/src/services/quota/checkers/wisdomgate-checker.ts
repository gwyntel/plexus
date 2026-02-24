import type { QuotaCheckResult, QuotaWindow, QuotaCheckerConfig } from '../../../types/quota';
import { QuotaChecker } from '../quota-checker';
import { logger } from '../../../utils/logger';

interface WisdomGatePackageDetail {
  package_id: string;
  title: string;
  amount: number;
  total_amount: number;
  expiry_time: number;
  expiry_date: string;
  begin_time: number;
  begin_date: string;
}

interface WisdomGateUsageResponse {
  object: string;
  total_usage: number;
  total_available: number;
  regular_amount: number;
  package_details: WisdomGatePackageDetail[];
}

export class WisdomGateQuotaChecker extends QuotaChecker {
  async checkQuota(): Promise<QuotaCheckResult> {
    const sessionCookie = this.requireOption<string>('session').trim();

    try {
      const endpoint = 'https://wisdom-gate.juheapi.com/api/dashboard/billing/usage/details';
      logger.silly(`[wisdomgate] Calling ${endpoint}`);

      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          Cookie: `session=${sessionCookie}`,
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        return this.errorResult(new Error(`HTTP ${response.status}: ${response.statusText}`));
      }

      const data: WisdomGateUsageResponse = await response.json();

      // package_details is empty when Wisdom Gate quota is exceeded.
      const packageDetail = data.package_details?.[0];
      let limit = 0;
      let remaining = 0;
      let used = 0;
      let resetsAt: Date | undefined;

      if (packageDetail) {
        limit = packageDetail.total_amount;
        remaining = packageDetail.amount;
        used = limit - remaining;
        resetsAt = new Date(packageDetail.expiry_time * 1000);
      } else {
        // When quota is exceeded, the API returns empty package details; fall back to totals.
        const totalUsage = data.total_usage ?? 0;
        const totalAvailable = data.total_available ?? 0;
        remaining = Math.max(0, totalAvailable);
        used = totalUsage;
        limit = Math.max(totalUsage + totalAvailable, totalUsage);
      }

      const window: QuotaWindow = this.createWindow(
        'monthly',
        limit,
        used,
        remaining,
        'dollars',
        resetsAt,
        'Wisdom Gate monthly credits'
      );

      return this.successResult([window]);
    } catch (error) {
      return this.errorResult(error as Error);
    }
  }
}
