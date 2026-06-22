import { useEffect, useState, useCallback } from 'react';
import { Plus, Trash2, Save, Boxes, Server, Copy, ChevronDown, ChevronRight } from 'lucide-react';
import { api } from '../lib/api';
import type { PiAiApi, PiAiCustomProviderDef, PiAiCustomModelDef } from '../lib/api';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { PageHeader } from '../components/layout/PageHeader';
import { PageContainer } from '../components/layout/PageContainer';
import { useToast } from '../contexts/ToastContext';

const PI_APIS: PiAiApi[] = [
  'openai-completions',
  'openai-responses',
  'openai-codex-responses',
  'azure-openai-responses',
  'anthropic-messages',
  'google-generative-ai',
  'google-generative-ai-vertex',
];

const selectClass =
  'w-full bg-bg-input border border-border-glass rounded-sm px-2 py-1.5 font-body text-[13px] text-text focus:outline-none focus:border-accent';
const labelClass = 'font-body text-[11px] text-text-muted block mb-0.5';
const helpClass = 'font-body text-[10px] text-text-secondary mt-1 leading-snug';
const helpKeyClass = 'font-mono text-text-muted';

/**
 * Valid keys for pi-ai's per-API compat override objects. Sourced from
 * @earendil-works/pi-ai's OpenAICompletionsCompat / OpenAIResponsesCompat /
 * AnthropicMessagesCompat types. Only these APIs accept compat overrides;
 * the Google APIs have no compat shape (`never`).
 */
const COMPAT_FIELDS: Record<string, { key: string; type: string; desc: string }[]> = {
  'openai-completions': [
    { key: 'supportsStore', type: 'bool', desc: 'supports the `store` field' },
    { key: 'supportsDeveloperRole', type: 'bool', desc: 'uses `developer` role vs `system`' },
    { key: 'supportsReasoningEffort', type: 'bool', desc: 'supports `reasoning_effort`' },
    {
      key: 'supportsUsageInStreaming',
      type: 'bool',
      desc: 'stream_options.include_usage (default true)',
    },
    {
      key: 'maxTokensField',
      type: '"max_completion_tokens" | "max_tokens"',
      desc: 'which max-tokens field to send',
    },
    { key: 'requiresToolResultName', type: 'bool', desc: 'tool results require `name`' },
    {
      key: 'requiresAssistantAfterToolResult',
      type: 'bool',
      desc: 'need assistant msg between tool result and user',
    },
    {
      key: 'requiresThinkingAsText',
      type: 'bool',
      desc: 'convert thinking blocks to <thinking> text',
    },
    {
      key: 'requiresReasoningContentOnAssistantMessages',
      type: 'bool',
      desc: 'replay empty reasoning_content on assistants',
    },
    {
      key: 'thinkingFormat',
      type: 'string',
      desc: 'openai | openrouter | deepseek | together | zai | qwen | qwen-chat-template | string-thinking | ant-ling',
    },
    { key: 'openRouterRouting', type: 'object', desc: 'OpenRouter `provider` routing preferences' },
    { key: 'vercelGatewayRouting', type: 'object', desc: 'Vercel AI Gateway routing preferences' },
    { key: 'zaiToolStream', type: 'bool', desc: 'z.ai top-level `tool_stream: true`' },
    {
      key: 'supportsStrictMode',
      type: 'bool',
      desc: 'supports `strict` on tool defs (default true)',
    },
    {
      key: 'cacheControlFormat',
      type: '"anthropic"',
      desc: 'Anthropic-style cache_control markers',
    },
    {
      key: 'sendSessionAffinityHeaders',
      type: 'bool',
      desc: 'send session-affinity headers when caching',
    },
    {
      key: 'supportsLongCacheRetention',
      type: 'bool',
      desc: '24h prompt cache retention (default true)',
    },
  ],
  'openai-responses': [
    {
      key: 'supportsDeveloperRole',
      type: 'bool',
      desc: 'uses `developer` role vs `system` (default true)',
    },
    {
      key: 'sendSessionIdHeader',
      type: 'bool',
      desc: 'send OpenAI `session_id` cache-affinity header (default true)',
    },
    {
      key: 'supportsLongCacheRetention',
      type: 'bool',
      desc: 'supports `prompt_cache_retention: "24h"` (default true)',
    },
  ],
  'azure-openai-responses': [
    {
      key: 'supportsDeveloperRole',
      type: 'bool',
      desc: 'uses `developer` role vs `system` (default true)',
    },
    {
      key: 'sendSessionIdHeader',
      type: 'bool',
      desc: 'send OpenAI `session_id` cache-affinity header (default true)',
    },
    {
      key: 'supportsLongCacheRetention',
      type: 'bool',
      desc: 'supports `prompt_cache_retention: "24h"` (default true)',
    },
  ],
  'openai-codex-responses': [
    {
      key: 'supportsDeveloperRole',
      type: 'bool',
      desc: 'uses `developer` role vs `system` (default true)',
    },
    {
      key: 'sendSessionIdHeader',
      type: 'bool',
      desc: 'send OpenAI `session_id` cache-affinity header (default true)',
    },
    {
      key: 'supportsLongCacheRetention',
      type: 'bool',
      desc: 'supports `prompt_cache_retention: "24h"` (default true)',
    },
  ],
  'anthropic-messages': [
    {
      key: 'supportsEagerToolInputStreaming',
      type: 'bool',
      desc: 'per-tool `eager_input_streaming` (default true)',
    },
    {
      key: 'supportsLongCacheRetention',
      type: 'bool',
      desc: 'cache_control.ttl "1h" (default true)',
    },
    {
      key: 'sendSessionAffinityHeaders',
      type: 'bool',
      desc: 'send x-session-affinity header when caching',
    },
    {
      key: 'supportsCacheControlOnTools',
      type: 'bool',
      desc: 'cache_control on tool defs (default true)',
    },
    { key: 'supportsTemperature', type: 'bool', desc: 'accepts `temperature` (default true)' },
    {
      key: 'forceAdaptiveThinking',
      type: 'bool',
      desc: 'force thinking.type "adaptive" + output_config.effort',
    },
    {
      key: 'allowEmptySignature',
      type: 'bool',
      desc: 'replay empty thinking signatures as `signature: ""`',
    },
  ],
};

/** Renders the valid compat override keys for the given upstream API. */
function CompatHelp({ api }: { api?: PiAiApi }) {
  if (!api) {
    return (
      <p className={helpClass}>
        Shape depends on the base model&apos;s upstream API. See the selected API&apos;s compat keys
        when defining a standalone model.
      </p>
    );
  }
  const fields = COMPAT_FIELDS[api];
  if (!fields) {
    return (
      <p className={helpClass}>
        The <span className={helpKeyClass}>{api}</span> API has no compat overrides — leave empty.
      </p>
    );
  }
  return (
    <details className={helpClass}>
      <summary className="cursor-pointer">
        Valid keys for <span className={helpKeyClass}>{api}</span> ({fields.length}). All optional;
        deep-merged onto pi-ai defaults.
      </summary>
      <ul className="mt-1 ml-3 list-disc">
        {fields.map((f) => (
          <li key={f.key}>
            <span className={helpKeyClass}>{f.key}</span>{' '}
            <span className="text-text-secondary">({f.type})</span> — {f.desc}
          </li>
        ))}
      </ul>
    </details>
  );
}

/**
 * Valid keys for pi-ai's `thinkingLevelMap`. Sourced from the `ThinkingLevelMap`
 * type in @earendil-works/pi-ai (minimal/low/medium/high/xhigh/off). Values are
 * provider-specific strings, or `null` to mark a level as unsupported. Omitted
 * keys fall back to the provider's default.
 */
const THINKING_LEVELS: { key: string; desc: string }[] = [
  { key: 'minimal', desc: 'minimal reasoning effort' },
  { key: 'low', desc: 'low reasoning effort' },
  { key: 'medium', desc: 'medium reasoning effort' },
  { key: 'high', desc: 'high reasoning effort' },
  { key: 'xhigh', desc: 'extra-high reasoning effort' },
  { key: 'off', desc: 'reasoning disabled' },
];

/** Renders help for the thinkingLevelMap JSON field. */
function ThinkingLevelMapHelp() {
  return (
    <details className={helpClass}>
      <summary className="cursor-pointer">
        Valid keys ({THINKING_LEVELS.length}). Values are provider-specific strings, or{' '}
        <span className={helpKeyClass}>null</span> to mark a level unsupported. Omitted keys use
        provider defaults.
      </summary>
      <ul className="mt-1 ml-3 list-disc">
        {THINKING_LEVELS.map((l) => (
          <li key={l.key}>
            <span className={helpKeyClass}>{l.key}</span> — {l.desc}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Parse a JSON textarea, returning undefined for empty and throwing on invalid. */
function parseJsonField(raw: string): Record<string, any> | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  const parsed = JSON.parse(t);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  throw new Error('Must be a JSON object');
}

/** Union of every compat key across all APIs — used to validate inherit-mode overrides. */
const ALL_COMPAT_KEYS = new Set(
  Object.values(COMPAT_FIELDS)
    .flat()
    .map((f) => f.key)
);
/** Allowed thinking-level keys. */
const THINKING_LEVEL_KEYS = new Set(THINKING_LEVELS.map((l) => l.key));

/**
 * Validate the keys of a parsed compat object against the allowed set for the
 * given upstream API. Returns the list of unknown keys (empty = ok). When the
 * API is unknown (inherit mode) or has no compat shape, falls back to the
 * cross-API union so typos are still caught.
 */
function unknownCompatKeys(obj: Record<string, any>, api: PiAiApi | undefined): string[] {
  const allowed = api ? COMPAT_FIELDS[api] : undefined;
  const set = allowed && allowed.length > 0 ? new Set(allowed.map((f) => f.key)) : ALL_COMPAT_KEYS;
  return Object.keys(obj).filter((k) => !set.has(k));
}

/** Validate thinkingLevelMap keys against the allowed set. */
function unknownThinkingLevelKeys(obj: Record<string, any>): string[] {
  return Object.keys(obj).filter((k) => !THINKING_LEVEL_KEYS.has(k));
}

export function PiRegistry() {
  const toast = useToast();
  const [providers, setProviders] = useState<Record<string, PiAiCustomProviderDef>>({});
  const [models, setModels] = useState<Record<string, PiAiCustomModelDef>>({});
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [p, m] = await Promise.all([api.getPiCustomProviders(), api.getPiCustomModels()]);
      setProviders(p);
      setModels(m);
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to load registries');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <PageContainer>
      <PageHeader
        title="pi-ai Registry"
        subtitle="Define custom providers and new/inherited models for the beta inference path that aren't yet in pi-ai's built-in registry."
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <CustomProvidersCard
          providers={providers}
          models={models}
          loading={loading}
          onChanged={reload}
        />
      </div>
    </PageContainer>
  );
}

// ─── Custom Providers ────────────────────────────────────────────────────────

function CustomProvidersCard({
  providers,
  models,
  loading,
  onChanged,
}: {
  providers: Record<string, PiAiCustomProviderDef>;
  models: Record<string, PiAiCustomModelDef>;
  loading: boolean;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [draftName, setDraftName] = useState('');

  const entries = Object.entries(providers);

  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <Server size={16} className="text-text-muted" />
        <h3 className="font-body text-[14px] font-semibold text-text">Custom Providers</h3>
      </div>
      <p className="font-body text-[12px] text-text-muted mb-3">
        A custom provider supplies the upstream wire API (and optional compat overrides) for a niche
        host pi-ai doesn&apos;t recognise. Reference it from a Plexus provider&apos;s{' '}
        <span className="font-mono">pi-ai Provider</span> field.
      </p>

      <div className="flex gap-2 mb-4">
        <Input
          placeholder="new provider id (e.g. niche-host)"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          style={{ flex: 1 }}
        />
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<Plus size={14} />}
          disabled={!draftName.trim() || !!providers[draftName.trim()]}
          onClick={async () => {
            const name = draftName.trim();
            try {
              await api.savePiCustomProvider(name, { api: 'openai-completions' });
              setDraftName('');
              toast.success(`Created provider '${name}'`);
              onChanged();
            } catch (e: any) {
              toast.error(e?.message ?? 'Failed to create');
            }
          }}
        >
          Add
        </Button>
      </div>

      {loading && <div className="font-body text-[12px] text-text-muted">Loading…</div>}
      {!loading && entries.length === 0 && (
        <div className="font-body text-[12px] text-text-secondary italic">
          No custom providers defined.
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {entries.map(([name, def]) => (
          <ProviderRow key={name} name={name} def={def} models={models} onChanged={onChanged} />
        ))}
      </div>
    </Card>
  );
}

function ProviderRow({
  name,
  def,
  models,
  onChanged,
}: {
  name: string;
  def: PiAiCustomProviderDef;
  models: Record<string, PiAiCustomModelDef>;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [apiVal, setApiVal] = useState<PiAiApi>(def.api);
  const [displayName, setDisplayName] = useState(def.display_name ?? '');
  const [compatText, setCompatText] = useState(
    def.compat ? JSON.stringify(def.compat, null, 2) : ''
  );
  const [open, setOpen] = useState(true);
  const [modelsOpen, setModelsOpen] = useState(true);
  const [draftModel, setDraftModel] = useState('');

  // Child models: those scoped to this provider (def.provider === name).
  const childModels = Object.entries(models).filter(([, m]) => m.provider === name);

  return (
    <div className="border border-border-glass rounded-md">
      <div
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-bg-hover"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span className="font-mono text-[13px] text-text">{name}</span>
          <Badge status="neutral" style={{ fontSize: '10px', padding: '2px 8px' }}>
            {apiVal}
          </Badge>
          <Badge status="neutral" style={{ fontSize: '10px', padding: '2px 8px' }}>
            {childModels.length} model{childModels.length === 1 ? '' : 's'}
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={async (e) => {
            e.stopPropagation();
            try {
              await api.deletePiCustomProvider(name);
              toast.success(`Deleted '${name}'`);
              onChanged();
            } catch (e: any) {
              toast.error(e?.message ?? 'Failed to delete');
            }
          }}
        >
          <Trash2 size={14} style={{ color: 'var(--color-danger)' }} />
        </Button>
      </div>
      {open && (
        <div className="p-3 pt-0">
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <div style={{ flex: 1 }}>
              <label className={labelClass}>Upstream API</label>
              <select
                className={selectClass}
                value={apiVal}
                onChange={(e) => setApiVal(e.target.value as PiAiApi)}
              >
                {PI_APIS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label className={labelClass}>Display name (optional)</label>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </div>
          </div>
          <label className={labelClass}>compat overrides (JSON object, optional)</label>
          <textarea
            className={`${selectClass} font-mono`}
            rows={4}
            placeholder='{ "maxTokensField": "max_tokens" }'
            value={compatText}
            onChange={(e) => setCompatText(e.target.value)}
          />
          <CompatHelp api={apiVal} />
          <div className="flex justify-end mt-2">
            <Button
              size="sm"
              leftIcon={<Save size={14} />}
              onClick={async () => {
                let compat: Record<string, any> | undefined;
                try {
                  compat = parseJsonField(compatText);
                } catch (e: any) {
                  toast.error(`Invalid compat JSON: ${e.message}`);
                  return;
                }
                if (compat) {
                  const unknown = unknownCompatKeys(compat, apiVal);
                  if (unknown.length) {
                    toast.error(`Unknown compat key(s) for ${apiVal}: ${unknown.join(', ')}`);
                    return;
                  }
                }
                try {
                  await api.savePiCustomProvider(name, {
                    api: apiVal,
                    ...(displayName.trim() ? { display_name: displayName.trim() } : {}),
                    ...(compat ? { compat } : {}),
                  });
                  toast.success(`Saved '${name}'`);
                  onChanged();
                } catch (e: any) {
                  toast.error(e?.message ?? 'Failed to save');
                }
              }}
            >
              Save
            </Button>
          </div>

          {/* Nested child models scoped to this provider. */}
          <div className="border-t border-border-glass mt-3 pt-3">
            <button
              type="button"
              className="flex items-center gap-1.5 cursor-pointer w-full text-left mb-2"
              onClick={() => setModelsOpen((v) => !v)}
            >
              {modelsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <Boxes size={14} className="text-text-muted" />
              <span className="font-body text-[12px] font-semibold text-text">
                Models under {name}
              </span>
              <Badge status="neutral" style={{ fontSize: '10px', padding: '2px 8px' }}>
                {childModels.length}
              </Badge>
            </button>
            {modelsOpen && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div className="flex gap-2">
                  <Input
                    placeholder="new model id (e.g. gpt-5.6)"
                    value={draftModel}
                    onChange={(e) => setDraftModel(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    leftIcon={<Plus size={14} />}
                    disabled={!draftModel.trim() || !!models[draftModel.trim()]}
                    onClick={async () => {
                      const id = draftModel.trim();
                      try {
                        // Seed under this provider; user edits the rest below.
                        await api.savePiCustomModel(id, {
                          provider: name,
                          api: 'openai-completions',
                        });
                        setDraftModel('');
                        toast.success(`Created model '${id}' under ${name}`);
                        onChanged();
                      } catch (e: any) {
                        toast.error(e?.message ?? 'Failed to create');
                      }
                    }}
                  >
                    Add Model
                  </Button>
                </div>
                {childModels.length === 0 && (
                  <div className="font-body text-[12px] text-text-secondary italic">
                    No models under this provider yet.
                  </div>
                )}
                {childModels.map(([mName, mDef]) => (
                  <ModelRow
                    key={mName}
                    name={mName}
                    def={mDef}
                    providerId={name}
                    onChanged={onChanged}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ModelRow({
  name,
  def,
  providerId,
  onChanged,
}: {
  name: string;
  def: PiAiCustomModelDef;
  /** Parent custom provider id this model is scoped to. */
  providerId: string;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [mode, setMode] = useState<'inherit' | 'standalone'>(
    def.inherits ? 'inherit' : 'standalone'
  );
  const [inheritProvider, setInheritProvider] = useState(def.inherits?.provider ?? '');
  const [inheritModel, setInheritModel] = useState(def.inherits?.model_id ?? '');
  const [apiVal, setApiVal] = useState<PiAiApi>(def.api ?? 'openai-completions');
  const [contextWindow, setContextWindow] = useState(def.contextWindow?.toString() ?? '');
  const [maxTokens, setMaxTokens] = useState(def.maxTokens?.toString() ?? '');
  const [reasoning, setReasoning] = useState(def.reasoning ?? false);
  const [compatText, setCompatText] = useState(
    def.compat ? JSON.stringify(def.compat, null, 2) : ''
  );
  const [tlmText, setTlmText] = useState(
    def.thinkingLevelMap ? JSON.stringify(def.thinkingLevelMap, null, 2) : ''
  );
  const [displayName, setDisplayName] = useState(def.name ?? '');
  const [inputText, setInputText] = useState(def.input?.includes('text') ?? false);
  const [inputImage, setInputImage] = useState(def.input?.includes('image') ?? false);
  const [costInput, setCostInput] = useState(def.cost?.input?.toString() ?? '');
  const [costOutput, setCostOutput] = useState(def.cost?.output?.toString() ?? '');
  const [costCacheRead, setCostCacheRead] = useState(def.cost?.cacheRead?.toString() ?? '');
  const [costCacheWrite, setCostCacheWrite] = useState(def.cost?.cacheWrite?.toString() ?? '');
  const [cloning, setCloning] = useState(false);

  // Built-in pi-ai registry providers + models, for the inherit-base dropdowns.
  const [piProviders, setPiProviders] = useState<string[]>([]);
  const [inheritModels, setInheritModels] = useState<
    Array<{ id: string; name: string; api: string }>
  >([]);

  useEffect(() => {
    api
      .getPiProviders()
      .then(setPiProviders)
      .catch(() => setPiProviders([]));
  }, []);

  // When the selected base provider changes, load its built-in models.
  useEffect(() => {
    if (!inheritProvider) {
      setInheritModels([]);
      return;
    }
    api
      .getPiModels(inheritProvider)
      .then((ms) => setInheritModels(ms.filter((m) => !m.custom)))
      .catch(() => setInheritModels([]));
  }, [inheritProvider]);

  const num = (s: string): number | undefined => {
    const n = parseInt(s, 10);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };

  const float = (s: string): number | undefined => {
    const n = parseFloat(s);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  };

  /** Fetch the base registry model and bake its fields into a standalone config. */
  const cloneFromBase = async () => {
    const p = inheritProvider.trim();
    const m = inheritModel.trim();
    if (!p || !m) {
      toast.error('Pick a base provider and model id to clone');
      return;
    }
    setCloning(true);
    try {
      const spec = await api.getPiRegistryModel(p, m);
      if (spec.api) setApiVal(spec.api);
      setDisplayName(spec.name ?? '');
      if (typeof spec.contextWindow === 'number') setContextWindow(String(spec.contextWindow));
      if (typeof spec.maxTokens === 'number') setMaxTokens(String(spec.maxTokens));
      setReasoning(spec.reasoning ?? false);
      setTlmText(spec.thinkingLevelMap ? JSON.stringify(spec.thinkingLevelMap, null, 2) : '');
      setCompatText(spec.compat ? JSON.stringify(spec.compat, null, 2) : '');
      setInputText(spec.input?.includes('text') ?? false);
      setInputImage(spec.input?.includes('image') ?? false);
      setCostInput(spec.cost?.input?.toString() ?? '');
      setCostOutput(spec.cost?.output?.toString() ?? '');
      setCostCacheRead(spec.cost?.cacheRead?.toString() ?? '');
      setCostCacheWrite(spec.cost?.cacheWrite?.toString() ?? '');
      setMode('standalone');
      toast.success(`Cloned ${p}/${m} into a standalone config — review and Save`);
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to clone base model');
    } finally {
      setCloning(false);
    }
  };

  return (
    <div className="border border-border-glass rounded-md p-3">
      <div className="flex items-center justify-between mb-2 gap-2">
        <span className="font-mono text-[13px] text-text">{name}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            try {
              await api.deletePiCustomModel(name);
              toast.success(`Deleted '${name}'`);
              onChanged();
            } catch (e: any) {
              toast.error(e?.message ?? 'Failed to delete');
            }
          }}
        >
          <Trash2 size={14} style={{ color: 'var(--color-danger)' }} />
        </Button>
      </div>

      <div className="flex gap-3 mb-2">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="radio" checked={mode === 'inherit'} onChange={() => setMode('inherit')} />
          <span className="font-body text-[12px] text-text">Inherit a base model</span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="radio"
            checked={mode === 'standalone'}
            onChange={() => setMode('standalone')}
          />
          <span className="font-body text-[12px] text-text">Standalone</span>
        </label>
      </div>

      {mode === 'inherit' ? (
        <>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <div style={{ flex: 1 }}>
              <label className={labelClass}>Base provider</label>
              <select
                className={selectClass}
                value={inheritProvider}
                onChange={(e) => {
                  setInheritProvider(e.target.value);
                  setInheritModel('');
                }}
              >
                <option value="">— select —</option>
                {piProviders.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label className={labelClass}>Base model id</label>
              <select
                className={selectClass}
                value={inheritModel}
                onChange={(e) => setInheritModel(e.target.value)}
                disabled={!inheritProvider}
              >
                <option value="">— select —</option>
                {inheritModels.map((m) => (
                  <option key={m.id} value={m.id} title={m.api}>
                    {m.id}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end mb-2">
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Copy size={14} />}
              disabled={cloning}
              onClick={cloneFromBase}
            >
              {cloning ? 'Cloning…' : 'Clone to standalone'}
            </Button>
          </div>
          <p className={`${helpClass} mb-2`}>
            Inherit keeps a live link to the base (deep-merged at request time).{' '}
            <span className={helpKeyClass}>Clone to standalone</span> copies the base&apos;s full
            field set into this model so you can edit it independently — the link is severed on
            Save.
          </p>
        </>
      ) : (
        <div style={{ marginBottom: '8px' }}>
          <label className={labelClass}>Upstream API</label>
          <select
            className={selectClass}
            value={apiVal}
            onChange={(e) => setApiVal(e.target.value as PiAiApi)}
          >
            {PI_APIS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
        <div style={{ flex: 1 }}>
          <label className={labelClass}>
            Context window {mode === 'inherit' ? '(override)' : ''}
          </label>
          <Input
            type="number"
            placeholder="tokens"
            value={contextWindow}
            onChange={(e) => setContextWindow(e.target.value)}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label className={labelClass}>
            Max output tokens {mode === 'inherit' ? '(override)' : ''}
          </label>
          <Input
            type="number"
            placeholder="tokens"
            value={maxTokens}
            onChange={(e) => setMaxTokens(e.target.value)}
          />
        </div>
        <label className="flex items-end gap-1.5 cursor-pointer pb-1.5">
          <input
            type="checkbox"
            checked={reasoning}
            onChange={(e) => setReasoning(e.target.checked)}
          />
          <span className="font-body text-[12px] text-text">Reasoning</span>
        </label>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
        <div style={{ flex: 2 }}>
          <label className={labelClass}>
            Display name {mode === 'inherit' ? '(override)' : '(optional)'}
          </label>
          <Input
            placeholder={name}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label className={labelClass}>
            Input modalities {mode === 'inherit' ? '(override)' : ''}
          </label>
          <div className="flex items-center gap-3 h-[27px]">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={inputText}
                onChange={(e) => setInputText(e.target.checked)}
              />
              <span className="font-body text-[12px] text-text">text</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={inputImage}
                onChange={(e) => setInputImage(e.target.checked)}
              />
              <span className="font-body text-[12px] text-text">image</span>
            </label>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: '8px' }}>
        <label className={labelClass}>
          Cost per million tokens ($) {mode === 'inherit' ? '(override)' : '(optional)'}
        </label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ flex: 1 }}>
            <Input
              type="number"
              step="any"
              min="0"
              placeholder="input"
              value={costInput}
              onChange={(e) => setCostInput(e.target.value)}
            />
          </div>
          <div style={{ flex: 1 }}>
            <Input
              type="number"
              step="any"
              min="0"
              placeholder="output"
              value={costOutput}
              onChange={(e) => setCostOutput(e.target.value)}
            />
          </div>
          <div style={{ flex: 1 }}>
            <Input
              type="number"
              step="any"
              min="0"
              placeholder="cache read"
              value={costCacheRead}
              onChange={(e) => setCostCacheRead(e.target.value)}
            />
          </div>
          <div style={{ flex: 1 }}>
            <Input
              type="number"
              step="any"
              min="0"
              placeholder="cache write"
              value={costCacheWrite}
              onChange={(e) => setCostCacheWrite(e.target.value)}
            />
          </div>
        </div>
      </div>

      <label className={labelClass}>thinkingLevelMap (JSON, optional)</label>
      <textarea
        className={`${selectClass} font-mono`}
        rows={3}
        placeholder='{ "off": null, "low": "LOW", "high": "HIGH" }'
        value={tlmText}
        onChange={(e) => setTlmText(e.target.value)}
      />
      <ThinkingLevelMapHelp />
      <label className={`${labelClass} mt-2`}>compat overrides (JSON, optional)</label>
      <textarea
        className={`${selectClass} font-mono`}
        rows={3}
        placeholder='{ "supportsReasoningEffort": true }'
        value={compatText}
        onChange={(e) => setCompatText(e.target.value)}
      />
      <CompatHelp api={mode === 'standalone' ? apiVal : undefined} />

      <div className="flex justify-end mt-2">
        <Button
          size="sm"
          leftIcon={<Save size={14} />}
          onClick={async () => {
            let compat: Record<string, any> | undefined;
            let tlm: Record<string, any> | undefined;
            try {
              compat = parseJsonField(compatText);
              tlm = parseJsonField(tlmText);
            } catch (e: any) {
              toast.error(`Invalid JSON: ${e.message}`);
              return;
            }
            if (compat) {
              const compatApi = mode === 'standalone' ? apiVal : undefined;
              const unknown = unknownCompatKeys(compat, compatApi);
              if (unknown.length) {
                toast.error(
                  `Unknown compat key(s) for ${
                    compatApi ?? 'the inherited model'
                  }: ${unknown.join(', ')}`
                );
                return;
              }
            }
            if (tlm) {
              const unknown = unknownThinkingLevelKeys(tlm);
              if (unknown.length) {
                toast.error(`Unknown thinkingLevelMap key(s): ${unknown.join(', ')}`);
                return;
              }
            }
            const def: PiAiCustomModelDef = {
              // Preserve the parent provider association.
              provider: providerId,
              ...(mode === 'inherit'
                ? inheritProvider.trim() && inheritModel.trim()
                  ? {
                      inherits: { provider: inheritProvider.trim(), model_id: inheritModel.trim() },
                    }
                  : {}
                : { api: apiVal }),
              ...(displayName.trim() ? { name: displayName.trim() } : {}),
              ...(num(contextWindow) ? { contextWindow: num(contextWindow) } : {}),
              ...(num(maxTokens) ? { maxTokens: num(maxTokens) } : {}),
              ...(reasoning ? { reasoning: true } : {}),
              ...(tlm ? { thinkingLevelMap: tlm } : {}),
              ...(compat ? { compat } : {}),
            };
            const inputs: Array<'text' | 'image'> = [];
            if (inputText) inputs.push('text');
            if (inputImage) inputs.push('image');
            if (inputs.length) def.input = inputs;
            const cost: Record<string, number> = {};
            if (float(costInput) != null) cost.input = float(costInput)!;
            if (float(costOutput) != null) cost.output = float(costOutput)!;
            if (float(costCacheRead) != null) cost.cacheRead = float(costCacheRead)!;
            if (float(costCacheWrite) != null) cost.cacheWrite = float(costCacheWrite)!;
            if (Object.keys(cost).length) def.cost = cost;
            if (!def.inherits && !def.api) {
              toast.error('Provide an inheritance base or an upstream API');
              return;
            }
            try {
              await api.savePiCustomModel(name, def);
              toast.success(`Saved '${name}'`);
              onChanged();
            } catch (e: any) {
              toast.error(e?.message ?? 'Failed to save');
            }
          }}
        >
          Save
        </Button>
      </div>
    </div>
  );
}
