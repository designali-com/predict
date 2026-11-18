"use client"

import { useEffect, useState } from "react"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Switch } from "@workspace/ui/components/switch"
import { Textarea } from "@workspace/ui/components/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"

import { AI_MODEL_NOTES, AI_PROVIDERS, aiProvider, type AiProvider } from "@workspace/db/ai-providers"

interface AiConfig {
  id: string
  enabled: boolean
  provider: AiProvider
  model: string
  temperature: number
  maxOutputTokens: number
  additionalInstructions: string
  dailyMessageLimitPerUser: number
}

export function AiConfigForm() {
  const [config, setConfig] = useState<AiConfig | null>(null)
  const [customModel, setCustomModel] = useState(false)
  // Which providers the patient app has a key for — asked of that app, since
  // the key lives in its environment. null: it could not be reached.
  const [keys, setKeys] = useState<Record<string, boolean | null>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch("/api/superadmin/ai-config")
      .then((r) => r.json())
      .then((data) => {
        if (data.config) {
          setConfig(data.config)
          setKeys(data.providerKeys ?? {})
          setCustomModel(!aiProvider(data.config.provider).models.includes(data.config.model))
        } else {
          setError("No AI config found — run `pnpm --filter @workspace/db create:ai-config` first.")
        }
      })
      .catch(() => setError("Failed to load config"))
      .finally(() => setLoading(false))
  }, [])

  async function handleSave() {
    if (!config) return
    setSaving(true)
    setError(null)
    setSaved(false)

    const res = await fetch("/api/superadmin/ai-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled: config.enabled,
        provider: config.provider,
        model: config.model,
        temperature: config.temperature,
        maxOutputTokens: config.maxOutputTokens,
        additionalInstructions: config.additionalInstructions,
        dailyMessageLimitPerUser: config.dailyMessageLimitPerUser,
      }),
    })

    const data = await res.json()
    setSaving(false)

    if (!res.ok) {
      setError(data.error ?? "Failed to save")
      return
    }

    setConfig(data.config)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (loading) {
    return <p className="p-6 text-sm text-muted-foreground">Loading...</p>
  }

  if (!config) {
    return <p className="p-6 text-sm text-destructive">{error}</p>
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-4 lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">Predict AI Assistant</h1>
        </div>

        {/* Up here with the title rather than at the foot of a long form: on a
            two-column layout the bottom of one column is nowhere in
            particular, and this is the only action on the page. */}
        <div className="flex items-center gap-3">
          {saved && <span className="text-sm text-emerald-600">Saved.</span>}
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <Card>
          <CardHeader>
            <CardTitle>Availability</CardTitle>
            <CardDescription>
              Turn the assistant off instantly for all patients — no deploy needed.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <Label htmlFor="ai-enabled">AI Assistant enabled for patients</Label>
            <Switch
              id="ai-enabled"
              checked={config.enabled}
              onCheckedChange={(checked) => setConfig({ ...config, enabled: !!checked })}
            />
          </CardContent>
        </Card>

        <Card className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <CardHeader>
            <CardTitle>Model & limits</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Provider</Label>
              <Select
                value={config.provider}
                onValueChange={(v) => {
                  const next = aiProvider(v as string)
                  // Switching provider moves the model with it. Keeping the old
                  // name would leave a gpt- model pointed at Google, which fails
                  // at the first message rather than here.
                  setConfig({ ...config, provider: next.value, model: next.models[0] ?? config.model })
                  setCustomModel(false)
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a provider" />
                </SelectTrigger>
                <SelectContent>
                  {AI_PROVIDERS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                      {keys[p.value] === false ? " — no API key configured" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {keys[config.provider] === false && (
                <p className="text-xs text-destructive">
                  The patient app has no {aiProvider(config.provider).envKey} set, so the assistant
                  will refuse every message until it does. Set it in apps/web/.env and restart that app.
                </p>
              )}
              {keys[config.provider] === true && (
                <p className="text-xs text-emerald-600">
                  The patient app has {aiProvider(config.provider).envKey} set.
                </p>
              )}
              {keys[config.provider] === null && (
                <p className="text-xs text-muted-foreground">
                  Could not reach the patient app to check its {aiProvider(config.provider).envKey} —
                  is it running?
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Model</Label>
              {customModel ? (
                <Input
                  value={config.model}
                  onChange={(e) => setConfig({ ...config, model: e.target.value })}
                  placeholder={aiProvider(config.provider).models[0] ?? "model name"}
                />
              ) : (
                <Select
                  value={config.model}
                  onValueChange={(v) => setConfig({ ...config, model: (v as string) ?? config.model })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a model" />
                  </SelectTrigger>
                  <SelectContent>
                    {aiProvider(config.provider).models.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                        {AI_MODEL_NOTES[m] ? (
                          <span className="ml-2 text-xs text-muted-foreground">{AI_MODEL_NOTES[m]}</span>
                        ) : null}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {AI_MODEL_NOTES[config.model] && (
                <p className="text-xs text-muted-foreground">
                  {AI_MODEL_NOTES[config.model]}, shared by every patient. Past that, patients are
                  told the assistant is busy until the limit resets.
                </p>
              )}
              <Button variant="link" size="sm" className="text-muted-foreground underline"
 type="button"

 onClick={() => setCustomModel((v) => !v)}
 >
                {customModel ? "Choose from list" : "Enter a custom model name"}
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="temperature">Temperature (0–2)</Label>
                <Input
                  id="temperature"
                  type="number"
                  min={0}
                  max={2}
                  step={0.1}
                  value={config.temperature}
                  onChange={(e) => setConfig({ ...config, temperature: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxOutputTokens">Max response tokens</Label>
                <Input
                  id="maxOutputTokens"
                  type="number"
                  min={50}
                  max={4000}
                  value={config.maxOutputTokens}
                  onChange={(e) => setConfig({ ...config, maxOutputTokens: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dailyLimit">Daily messages per patient</Label>
              <Input
                id="dailyLimit"
                type="number"
                min={1}
                max={1000}
                value={config.dailyMessageLimitPerUser}
                onChange={(e) => setConfig({ ...config, dailyMessageLimitPerUser: Number(e.target.value) })}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Additional guidance</CardTitle>
            <CardDescription>
              Tone and extra instructions only — this cannot loosen the core rule that the assistant
              only discusses this patient&apos;s own reports and biomarker data. It can never be
              used to make the assistant answer unrelated or out-of-system questions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              rows={6}
              value={config.additionalInstructions}
              onChange={(e) => setConfig({ ...config, additionalInstructions: e.target.value })}
              placeholder="e.g. Keep answers concise and encouraging in tone."
            />
          </CardContent>
        </Card>

      </div>
    </div>
  )
}
