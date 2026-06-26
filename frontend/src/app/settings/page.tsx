"use client";

import { useCallback, useEffect, useState } from "react";

import Sidebar from "@/components/Sidebar";
import Toggle from "@/components/Toggle";
import {
  getSettings,
  listModels,
  testLlm,
  updateSettings,
  type RuntimeSettings,
  type SettingsPatch,
} from "@/lib/api";

const INPUT =
  "w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-white/20 dark:focus:border-blue-400";

type TestResult = { ok: boolean; provider: string; model: string; detail: string };

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
      const s = await getSettings();
      setSettings(s);
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
      const next = await updateSettings(p);
      setSettings(next);
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
      <Sidebar>
        <div className="mx-auto max-w-3xl px-6 py-8">
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="mt-4 text-sm text-black/50 dark:text-white/50">
            {error ? `Error: ${error}` : "Loading..."}
          </p>
        </div>
      </Sidebar>
    );
  }

  const { llm, gen, guardrails, ratelimit } = settings;

  return (
    <Sidebar>
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Settings</h1>
            <p className="mt-1 text-sm text-black/60 dark:text-white/60">
              Switch models, bring your own key, and tune guardrails. Changes apply live.
            </p>
          </div>
          <button
            onClick={saveAll}
            disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>

        {savedAt && (
          <div className="mt-4 rounded-lg bg-green-50 px-4 py-2 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
            ✓ {savedAt}
          </div>
        )}
        {error && (
          <div className="mt-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Model & Provider */}
        <section className="mt-6 rounded-xl border border-black/10 bg-white p-6 dark:border-white/10 dark:bg-black">
          <h2 className="text-lg font-semibold">Model &amp; Provider</h2>
          <p className="mt-1 text-sm text-black/50 dark:text-white/50">
            OpenRouter fronts OpenAI, Anthropic, Google and more through one gateway.
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-black/60 dark:text-white/60">
                Provider
              </label>
              <select
                value={llm.provider}
                onChange={(e) => patch((s) => ({ ...s, llm: { ...s.llm, provider: e.target.value } }))}
                className={INPUT}
              >
                <option value="openrouter">OpenRouter</option>
                <option value="openai">OpenAI</option>
                <option value="ollama">Ollama (local)</option>
                <option value="custom">Custom endpoint</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-black/60 dark:text-white/60">
                Model
              </label>
              <input
                list="model-options"
                value={llm.model}
                onChange={(e) => patch((s) => ({ ...s, llm: { ...s.llm, model: e.target.value } }))}
                placeholder="anthropic/claude-sonnet-4.5"
                className={INPUT}
              />
              <datalist id="model-options">
                {models.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="mt-4">
            <label className="mb-1 block text-xs font-medium text-black/60 dark:text-white/60">
              Base URL
            </label>
            <input
              value={llm.base_url}
              onChange={(e) => patch((s) => ({ ...s, llm: { ...s.llm, base_url: e.target.value } }))}
              className={INPUT}
            />
          </div>

          {/* OpenRouter API key */}
          <div className="mt-4 rounded-lg border border-black/10 p-4 dark:border-white/10">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Your OpenRouter API key</p>
              <span
                className={`rounded px-2 py-0.5 text-[10px] font-medium uppercase ${
                  llm.using_demo_key
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                    : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                }`}
              >
                {llm.using_demo_key ? "Using shared demo key" : "Using your key"}
              </span>
            </div>
            <p className="mt-1 text-xs text-black/50 dark:text-white/50">
              The shared demo key is rate limited to {ratelimit.per_minute}/min. Add your own to lift it.
            </p>
            <div className="mt-3 flex gap-2">
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="sk-or-..."
                className={INPUT}
              />
              <button
                onClick={() => {
                  apply({ openrouter_api_key: apiKeyInput }, "Key saved");
                  setApiKeyInput("");
                }}
                disabled={saving || !apiKeyInput.trim()}
                className="shrink-0 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
              >
                Save key
              </button>
              {llm.openrouter_user_key_set && (
                <button
                  onClick={() => apply({ openrouter_api_key: "" }, "Reverted to demo key")}
                  disabled={saving}
                  className="shrink-0 rounded-lg border border-black/15 px-3 py-2 text-sm font-medium text-black/60 hover:bg-black/5 disabled:opacity-40 dark:border-white/20 dark:text-white/60 dark:hover:bg-white/5"
                >
                  Use demo
                </button>
              )}
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-black/60 dark:text-white/60">
                Temperature ({gen.temperature.toFixed(2)})
              </label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={gen.temperature}
                onChange={(e) =>
                  patch((s) => ({ ...s, gen: { ...s.gen, temperature: Number(e.target.value) } }))
                }
                className="w-full"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-black/60 dark:text-white/60">
                Max tokens
              </label>
              <input
                type="number"
                min={1}
                max={8192}
                value={gen.max_tokens}
                onChange={(e) =>
                  patch((s) => ({ ...s, gen: { ...s.gen, max_tokens: Number(e.target.value) } }))
                }
                className={INPUT}
              />
            </div>
          </div>

          <div className="mt-2">
            <Toggle
              checked={llm.enable_thinking}
              onChange={(v) => patch((s) => ({ ...s, llm: { ...s.llm, enable_thinking: v } }))}
              label="Enable reasoning"
              description="Let reasoning models think before answering (slower; Ollama only effect)."
            />
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={runTest}
              disabled={testing}
              className="rounded-lg border border-black/15 px-3 py-2 text-sm font-medium text-black/70 hover:bg-black/5 disabled:opacity-40 dark:border-white/20 dark:text-white/70 dark:hover:bg-white/5"
            >
              {testing ? "Testing..." : "Test connection"}
            </button>
            {testResult && (
              <span
                className={`text-sm ${
                  testResult.ok
                    ? "text-green-600 dark:text-green-400"
                    : "text-red-600 dark:text-red-400"
                }`}
              >
                {testResult.ok ? "✓" : "✗"} {testResult.model} - {testResult.detail}
              </span>
            )}
          </div>
        </section>

        {/* Guardrails */}
        <section className="mt-6 rounded-xl border border-black/10 bg-white p-6 dark:border-white/10 dark:bg-black">
          <h2 className="text-lg font-semibold">Guardrails &amp; Safety</h2>
          <p className="mt-1 text-sm text-black/50 dark:text-white/50">
            The master switch gates every check below.
          </p>

          <div className="mt-3 divide-y divide-black/5 dark:divide-white/5">
            <Toggle
              checked={guardrails.enabled}
              onChange={(v) =>
                patch((s) => ({ ...s, guardrails: { ...s.guardrails, enabled: v } }))
              }
              label="Guardrails enabled"
              description="Master kill switch for all input and output guardrails."
            />
            <Toggle
              checked={guardrails.injection}
              onChange={(v) =>
                patch((s) => ({ ...s, guardrails: { ...s.guardrails, injection: v } }))
              }
              label="Prompt-injection blocking"
              description="Block known jailbreak / instruction-override patterns before retrieval."
              disabled={!guardrails.enabled}
            />
            <Toggle
              checked={guardrails.grounding}
              onChange={(v) =>
                patch((s) => ({ ...s, guardrails: { ...s.guardrails, grounding: v } }))
              }
              label="Citation grounding check"
              description="Flag answers that cite sources outside the retrieved range."
              disabled={!guardrails.enabled}
            />
            <Toggle
              checked={guardrails.pii_detect}
              onChange={(v) =>
                patch((s) => ({ ...s, guardrails: { ...s.guardrails, pii_detect: v } }))
              }
              label="PII detection"
              description="Flag emails, phone numbers, SSNs and cards in the answer."
              disabled={!guardrails.enabled || guardrails.pii_mask}
            />
            <Toggle
              checked={guardrails.pii_mask}
              onChange={(v) =>
                patch((s) => ({ ...s, guardrails: { ...s.guardrails, pii_mask: v } }))
              }
              label="PII masking"
              description="Replace detected PII with [REDACTED_*] placeholders in the answer."
              disabled={!guardrails.enabled}
            />
            <Toggle
              checked={guardrails.safety}
              onChange={(v) => patch((s) => ({ ...s, guardrails: { ...s.guardrails, safety: v } }))}
              label="LLM safety classifier"
              description="Run an optional ShieldGemma-style safety model on the input."
              disabled={!guardrails.enabled}
            />
          </div>
        </section>

        {/* Rate limiting */}
        <section className="mt-6 mb-8 rounded-xl border border-black/10 bg-white p-6 dark:border-white/10 dark:bg-black">
          <h2 className="text-lg font-semibold">Rate Limiting</h2>
          <p className="mt-1 text-sm text-black/50 dark:text-white/50">
            Protects the shared demo key. Skipped automatically when you use your own key.
          </p>

          <div className="mt-3">
            <Toggle
              checked={ratelimit.enabled}
              onChange={(v) =>
                patch((s) => ({ ...s, ratelimit: { ...s.ratelimit, enabled: v } }))
              }
              label="Rate limiting enabled"
            />
          </div>
          <div className="mt-2 max-w-[12rem]">
            <label className="mb-1 block text-xs font-medium text-black/60 dark:text-white/60">
              Requests per minute
            </label>
            <input
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
              className={INPUT}
            />
          </div>
        </section>
      </div>
    </Sidebar>
  );
}
