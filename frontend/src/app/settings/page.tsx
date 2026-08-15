"use client";

import { useCallback, useEffect, useState } from "react";

import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import Toggle from "@/components/Toggle";
import { IconAlert, IconCheck, IconLock } from "@/components/icons";
import { PROVIDERS, getProvider } from "@/lib/demo/providers";
import {
  getSettings,
  listModels,
  testLlm,
  updateSettings,
  type RuntimeSettings,
  type SettingsPatch,
} from "@/lib/api";

type TestResult = { ok: boolean; provider: string; model: string; detail: string };

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card mt-5 p-5">
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">{description}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<RuntimeSettings | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const load = useCallback(async () => {
    try {
      setSettings(await getSettings());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load settings");
    }
  }, []);

  const loadModels = useCallback(async () => {
    try {
      const { models: m } = await listModels();
      setModels(m);
    } catch {
      // Non-fatal: the model field still accepts free text.
    }
  }, []);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- async on-mount fetch; state lands post-await */
    load();
    loadModels();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [load, loadModels]);

  // Local mutation of the loaded snapshot keeps the form controlled without a
  // second copy of every field; Save sends the whole snapshot as a patch.
  function patch(updater: (s: RuntimeSettings) => RuntimeSettings) {
    setSettings((s) => (s ? updater(s) : s));
  }

  async function apply(p: SettingsPatch, note: string) {
    setSaving(true);
    setError(null);
    try {
      setSettings(await updateSettings(p));
      setSavedAt(note);
      setTimeout(() => setSavedAt(null), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function saveAll() {
    if (!settings) return;
    await apply(
      {
        provider: settings.llm.provider,
        model: settings.llm.model,
        base_url: settings.llm.base_url,
        enable_thinking: settings.llm.enable_thinking,
        temperature: settings.gen.temperature,
        max_tokens: settings.gen.max_tokens,
        guardrails_enabled: settings.guardrails.enabled,
        injection: settings.guardrails.injection,
        grounding: settings.guardrails.grounding,
        pii_detect: settings.guardrails.pii_detect,
        safety: settings.guardrails.safety,
        pii_mask: settings.guardrails.pii_mask,
        safety_model: settings.guardrails.safety_model,
        ratelimit_enabled: settings.ratelimit.enabled,
        ratelimit_per_minute: settings.ratelimit.per_minute,
      },
      "All settings saved"
    );
  }

  async function runTest() {
    setTesting(true);
    setTestResult(null);
    setError(null);
    try {
      setTestResult(await testLlm());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Test failed");
    } finally {
      setTesting(false);
    }
  }

  if (!settings) {
    return (
      <AppShell>
        <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
          <PageHeader title="Settings" subtitle="Model, key and guardrail controls." />
          <p className="mt-6 text-sm text-faint">{error ? `Error: ${error}` : "Loading..."}</p>
        </div>
      </AppShell>
    );
  }

  const { llm, gen, guardrails, ratelimit } = settings;
  const provider = getProvider(llm.provider);
  const providerName = provider?.label.split(" (")[0] ?? "provider";
  const keySet = llm.openrouter_user_key_set;
  const needsKey = llm.needs_key ?? (!!provider?.needsKey && !keySet);

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
        <PageHeader
          title="Settings"
          subtitle="Switch the model behind the assistant, bring your own key, and tune the guardrails. Changes apply to the next question, with no redeploy."
          actions={
            <button onClick={saveAll} disabled={saving} className="btn btn-primary">
              {saving ? "Saving..." : "Save changes"}
            </button>
          }
        />

        {savedAt && (
          <p className="mt-4 flex items-center gap-2 rounded-xl border border-ok-line bg-ok-soft px-4 py-2.5 text-sm text-ok">
            <IconCheck size={15} /> {savedAt}
          </p>
        )}
        {error && (
          <p className="mt-4 flex items-start gap-2 rounded-xl border border-danger-line bg-danger-soft px-4 py-2.5 text-sm text-danger">
            <IconAlert size={15} className="mt-0.5 shrink-0" /> {error}
          </p>
        )}

        {/* Key first: nothing else here matters until the assistant can reach a model. */}
        <Section
          title="Your API key"
          description={`The assistant runs on your own key, so nobody else spends it. It is stored in an httpOnly cookie in your browser, never readable by this page, and sent only to ${providerName}.`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-sm font-medium">
              <IconLock size={15} className="text-faint" />
              {providerName}
            </span>
            <span className={`badge ${needsKey ? "badge-warn" : keySet ? "badge-ok" : "badge-neutral"}`}>
              {needsKey ? "Key required" : keySet ? "Key set" : "No key needed"}
            </span>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder={provider?.keyPlaceholder ?? "your API key"}
              aria-label={`${providerName} API key`}
              className="field min-w-56 flex-1"
            />
            <button
              onClick={() => {
                apply({ api_key: apiKeyInput }, "Key saved");
                setApiKeyInput("");
              }}
              disabled={saving || !apiKeyInput.trim()}
              className="btn btn-primary"
            >
              Save key
            </button>
            {keySet && (
              <button
                onClick={() => apply({ api_key: "" }, "Key removed")}
                disabled={saving}
                className="btn btn-secondary"
              >
                Remove
              </button>
            )}
          </div>

          {provider?.keyUrl && (
            <a
              href={provider.keyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-xs font-medium text-accent hover:underline"
            >
              Get a {providerName} key
            </a>
          )}
        </Section>

        <Section
          title="Model"
          description="Every provider here speaks the OpenAI chat-completions format, so switching is a base URL and a model id."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="provider">
                Provider
              </label>
              <select
                id="provider"
                value={llm.provider}
                onChange={(e) => {
                  // Carry the provider's own endpoint and default model across, so
                  // switching never leaves you pointed at the previous one.
                  const next = getProvider(e.target.value);
                  patch((s) => ({
                    ...s,
                    llm: {
                      ...s.llm,
                      provider: e.target.value,
                      base_url: next?.baseUrl ?? s.llm.base_url,
                      model: next?.defaultModel ?? s.llm.model,
                    },
                  }));
                }}
                className="field"
              >
                {PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="model">
                Model
              </label>
              <input
                id="model"
                list="model-options"
                value={llm.model}
                onChange={(e) => patch((s) => ({ ...s, llm: { ...s.llm, model: e.target.value } }))}
                placeholder="anthropic/claude-sonnet-4.5"
                className="field"
              />
              <datalist id="model-options">
                {(models.length ? models : (provider?.models ?? [])).map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="mt-4">
            <label className="label" htmlFor="base-url">
              Base URL
            </label>
            <input
              id="base-url"
              value={llm.base_url}
              onChange={(e) => patch((s) => ({ ...s, llm: { ...s.llm, base_url: e.target.value } }))}
              className="field font-mono text-xs"
            />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="temperature">
                Temperature
                <span className="ml-1 font-mono tabular-nums text-faint">
                  {gen.temperature.toFixed(2)}
                </span>
              </label>
              <input
                id="temperature"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={gen.temperature}
                onChange={(e) =>
                  patch((s) => ({ ...s, gen: { ...s.gen, temperature: Number(e.target.value) } }))
                }
                className="w-full accent-[var(--accent)]"
              />
            </div>
            <div>
              <label className="label" htmlFor="max-tokens">
                Max tokens
              </label>
              <input
                id="max-tokens"
                type="number"
                min={1}
                max={8192}
                value={gen.max_tokens}
                onChange={(e) =>
                  patch((s) => ({ ...s, gen: { ...s.gen, max_tokens: Number(e.target.value) } }))
                }
                className="field"
              />
            </div>
          </div>

          <div className="mt-2 divide-y divide-[var(--line)]">
            <Toggle
              checked={llm.enable_thinking}
              onChange={(v) => patch((s) => ({ ...s, llm: { ...s.llm, enable_thinking: v } }))}
              label="Reasoning"
              description="Let reasoning models think before answering. Slower, and only meaningful on models that support it."
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button onClick={runTest} disabled={testing} className="btn btn-secondary btn-sm">
              {testing ? "Testing..." : "Test connection"}
            </button>
            {testResult && (
              <span
                className={`flex items-center gap-1.5 text-sm ${testResult.ok ? "text-ok" : "text-danger"}`}
              >
                {testResult.ok ? <IconCheck size={14} /> : <IconAlert size={14} />}
                {testResult.model} - {testResult.detail}
              </span>
            )}
          </div>
        </Section>

        <Section
          title="Guardrails"
          description="Input guardrails run before retrieval, output guardrails after generation. The first switch gates every other one."
        >
          <div className="divide-y divide-[var(--line)]">
            <Toggle
              checked={guardrails.enabled}
              onChange={(v) => patch((s) => ({ ...s, guardrails: { ...s.guardrails, enabled: v } }))}
              label="Guardrails enabled"
              description="Master switch for every input and output check below."
            />
            <Toggle
              checked={guardrails.injection}
              onChange={(v) => patch((s) => ({ ...s, guardrails: { ...s.guardrails, injection: v } }))}
              label="Prompt-injection blocking"
              description="Refuse known jailbreak and instruction-override patterns before retrieval runs."
              disabled={!guardrails.enabled}
            />
            <Toggle
              checked={guardrails.grounding}
              onChange={(v) => patch((s) => ({ ...s, guardrails: { ...s.guardrails, grounding: v } }))}
              label="Citation grounding check"
              description="Flag answers that cite a source outside the set that was actually retrieved."
              disabled={!guardrails.enabled}
            />
            <Toggle
              checked={guardrails.pii_detect}
              onChange={(v) => patch((s) => ({ ...s, guardrails: { ...s.guardrails, pii_detect: v } }))}
              label="PII detection"
              description="Flag emails, phone numbers, national IDs and card numbers in the answer."
              disabled={!guardrails.enabled || guardrails.pii_mask}
            />
            <Toggle
              checked={guardrails.pii_mask}
              onChange={(v) => patch((s) => ({ ...s, guardrails: { ...s.guardrails, pii_mask: v } }))}
              label="PII masking"
              description="Replace detected PII with [REDACTED_*] placeholders. Implies detection."
              disabled={!guardrails.enabled}
            />
            <Toggle
              checked={guardrails.safety}
              onChange={(v) => patch((s) => ({ ...s, guardrails: { ...s.guardrails, safety: v } }))}
              label="Safety classifier"
              description="Run an optional ShieldGemma-style safety model over the input."
              disabled={!guardrails.enabled}
            />
          </div>
        </Section>

        <Section
          title="Rate limit"
          description="A ceiling on questions per minute. Skipped entirely when the request runs on your own key."
        >
          <div className="divide-y divide-[var(--line)]">
            <Toggle
              checked={ratelimit.enabled}
              onChange={(v) => patch((s) => ({ ...s, ratelimit: { ...s.ratelimit, enabled: v } }))}
              label="Rate limiting enabled"
            />
          </div>
          <div className="mt-3 max-w-40">
            <label className="label" htmlFor="rpm">
              Requests per minute
            </label>
            <input
              id="rpm"
              type="number"
              min={1}
              max={120}
              value={ratelimit.per_minute}
              onChange={(e) =>
                patch((s) => ({
                  ...s,
                  ratelimit: { ...s.ratelimit, per_minute: Number(e.target.value) },
                }))
              }
              className="field"
              disabled={!ratelimit.enabled}
            />
          </div>
        </Section>

        <div className="mt-6 mb-4 flex justify-end">
          <button onClick={saveAll} disabled={saving} className="btn btn-primary">
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>
    </AppShell>
  );
}
