import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  closeDatabase,
  getCurrentDialect,
  getDatabase,
  getSchema,
  initializeDatabase,
} from '../../../db/client';
import { runMigrations } from '../../../db/migrate';
import { QuotaScheduler } from '../quota-scheduler';
import { CooldownManager } from '../../cooldown-manager';
import type { QuotaChecker, QuotaCheckResult } from '../../../types/quota';

const CHECKER_ID = 'quota-persistence-checker';

const makeChecker = (): QuotaChecker => ({
  config: {
    id: CHECKER_ID,
    provider: 'test-provider',
    type: 'test',
    enabled: true,
    intervalMinutes: 60,
    options: {},
  },
  async checkQuota() {
    return {
      provider: 'test-provider',
      checkerId: CHECKER_ID,
      checkedAt: new Date('2026-02-08T15:08:22.000Z'),
      success: true,
      windows: [
        {
          windowType: 'subscription',
          limit: 100,
          used: 15,
          remaining: 85,
          utilizationPercent: 15,
          unit: 'requests',
          resetsAt: new Date('2026-02-09T00:00:00.000Z'),
          status: 'ok',
          description: 'test window',
        },
      ],
    };
  },
});

describe('QuotaScheduler persistence', () => {
  beforeEach(async () => {
    await closeDatabase();
    process.env.DATABASE_URL = process.env.PLEXUS_TEST_DB_URL ?? process.env.DATABASE_URL;
    initializeDatabase(process.env.DATABASE_URL);
    await runMigrations();

    const db = getDatabase() as any;
    const schema = getSchema() as any;
    await db.delete(schema.quotaSnapshots);
  });

  afterEach(async () => {
    QuotaScheduler.getInstance().stop();
    await closeDatabase();
  });

  it('persists quota windows with resetsAt without timestamp conversion errors', async () => {
    const scheduler = QuotaScheduler.getInstance() as any;
    scheduler.checkers.set(CHECKER_ID, makeChecker());

    await QuotaScheduler.getInstance().runCheckNow(CHECKER_ID);

    const db = getDatabase() as any;
    const schema = getSchema() as any;
    const rows = await db
      .select()
      .from(schema.quotaSnapshots)
      .where(eq(schema.quotaSnapshots.checkerId, CHECKER_ID));

    expect(rows).toHaveLength(1);
    expect(rows[0]?.windowType).toBe('subscription');
    if (getCurrentDialect() === 'sqlite') {
      expect(rows[0]?.resetsAt).toBeInstanceOf(Date);
    } else {
      expect(typeof rows[0]?.resetsAt).toBe('number');
    }
    expect(rows[0]?.success).toBe(true);
  });
});

describe('QuotaScheduler maxUtilizationPercent', () => {
  const PROVIDER = 'threshold-test-provider';

  beforeEach(async () => {
    await closeDatabase();
    process.env.DATABASE_URL = process.env.PLEXUS_TEST_DB_URL ?? process.env.DATABASE_URL;
    initializeDatabase(process.env.DATABASE_URL);
    await runMigrations();

    const db = getDatabase() as any;
    const schema = getSchema() as any;
    await db.delete(schema.quotaSnapshots);
  });

  afterEach(async () => {
    QuotaScheduler.getInstance().stop();
    // Clean up any cooldowns we injected
    const cooldownManager = CooldownManager.getInstance();
    await cooldownManager.markProviderSuccess(PROVIDER, '');
    await closeDatabase();
  });

  const makeResult = (utilizationPercent: number): QuotaCheckResult => ({
    provider: PROVIDER,
    checkerId: 'threshold-checker',
    checkedAt: new Date(),
    success: true,
    windows: [
      {
        windowType: 'rolling_five_hour',
        limit: 1000,
        used: Math.round((utilizationPercent / 100) * 1000),
        remaining: Math.round(((100 - utilizationPercent) / 100) * 1000),
        utilizationPercent,
        unit: 'requests',
        resetsAt: new Date(Date.now() + 5 * 60 * 60 * 1000), // 5 hours from now
        status: utilizationPercent >= 99 ? 'exhausted' : 'ok',
        description: 'Rolling 5-hour limit',
      },
    ],
  });

  it('defaults to 99% threshold when no maxUtilizationPercent set', async () => {
    const scheduler = QuotaScheduler.getInstance() as any;
    const checker: QuotaChecker = {
      config: {
        id: 'threshold-checker',
        provider: PROVIDER,
        type: 'synthetic',
        enabled: true,
        intervalMinutes: 60,
        options: {}, // no maxUtilizationPercent
      },
      async checkQuota() {
        return makeResult(98);
      },
    };
    scheduler.checkers.set('threshold-checker', checker);

    await scheduler.applyCooldownsFromResult(makeResult(98));

    const isHealthy = await CooldownManager.getInstance().isProviderHealthy(PROVIDER, '');
    expect(isHealthy).toBe(true); // 98% < 99% default — should stay healthy
  });

  it('triggers cooldown at 99% with default threshold', async () => {
    const scheduler = QuotaScheduler.getInstance() as any;
    const checker: QuotaChecker = {
      config: {
        id: 'threshold-checker',
        provider: PROVIDER,
        type: 'synthetic',
        enabled: true,
        intervalMinutes: 60,
        options: {},
      },
      async checkQuota() {
        return makeResult(99);
      },
    };
    scheduler.checkers.set('threshold-checker', checker);

    await scheduler.applyCooldownsFromResult(makeResult(99));

    const isHealthy = await CooldownManager.getInstance().isProviderHealthy(PROVIDER, '');
    expect(isHealthy).toBe(false); // 99% >= 99% — should cooldown
  });

  it('respects maxUtilizationPercent: 30 — cooldowns at 30%', async () => {
    const scheduler = QuotaScheduler.getInstance() as any;
    const checker: QuotaChecker = {
      config: {
        id: 'threshold-checker',
        provider: PROVIDER,
        type: 'synthetic',
        enabled: true,
        intervalMinutes: 60,
        options: { maxUtilizationPercent: 30 },
      },
      async checkQuota() {
        return makeResult(30);
      },
    };
    scheduler.checkers.set('threshold-checker', checker);

    await scheduler.applyCooldownsFromResult(makeResult(30));

    const isHealthy = await CooldownManager.getInstance().isProviderHealthy(PROVIDER, '');
    expect(isHealthy).toBe(false); // 30% >= 30% threshold — should cooldown
  });

  it('respects maxUtilizationPercent: 30 — does not cooldown at 29%', async () => {
    const scheduler = QuotaScheduler.getInstance() as any;
    const checker: QuotaChecker = {
      config: {
        id: 'threshold-checker',
        provider: PROVIDER,
        type: 'synthetic',
        enabled: true,
        intervalMinutes: 60,
        options: { maxUtilizationPercent: 30 },
      },
      async checkQuota() {
        return makeResult(29);
      },
    };
    scheduler.checkers.set('threshold-checker', checker);

    await scheduler.applyCooldownsFromResult(makeResult(29));

    const isHealthy = await CooldownManager.getInstance().isProviderHealthy(PROVIDER, '');
    expect(isHealthy).toBe(true); // 29% < 30% threshold — should stay healthy
  });
});
