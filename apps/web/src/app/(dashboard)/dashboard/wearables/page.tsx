"use client";

import { useEffect, useMemo, useState } from "react";
import { PredictSpinner } from "@/src/components/predict-loader";
import { Loader2, PlugZap, RefreshCw } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";

interface ProviderOption {
  provider?: string;
  id?: string;
  name: string;
  is_enabled?: boolean;
  has_cloud_api?: boolean;
  icon_url?: string | null;
}

function getProviderKey(provider: ProviderOption) {
  const raw = provider.provider || provider.id || "";
  return raw.toLowerCase().trim();
}

function getProviderDisplayName(provider: ProviderOption) {
  return provider.name || getProviderKey(provider) || "Unknown provider";
}

export default function WearablesPage() {
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadProviders = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/patient/wearables/oauth/providers?enabled_only=true&cloud_only=true");
      if (!response.ok) {
        throw new Error("Unable to fetch wearable providers.");
      }
      const data = await response.json();
      setProviders(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProviders();
  }, []);

  const handleConnect = async (provider: ProviderOption) => {
    const providerKey = getProviderKey(provider);

    if (!providerKey) {
      setError("The selected provider is invalid. Please try again.");
      return;
    }

    try {
      setConnectingProvider(providerKey);
      setError(null);

      const userId = typeof window !== "undefined" ? window.localStorage.getItem("predictfit_user_id") : null;
      const params = new URLSearchParams({
        user_id: userId || "6e9456a7-b071-4bd7-b012-04a8ab0efa40",
      });
      const response = await fetch(`/api/patient/wearables/oauth/${providerKey}/authorize?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Unable to start OAuth flow.");
      }

      const data = await response.json();
      if (data?.authorization_url) {
        window.location.href = data.authorization_url;
        return;
      }

      throw new Error("Authorization URL not received from Open Wearables.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to connect your wearable.");
      setConnectingProvider(null);
    }
  };

  const providerCards = useMemo(() => providers, [providers]);

  return (
    <div className="flex min-h-screen flex-col gap-4 bg-transparent p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex">
          <div>
            <h1 className="text-2xl font-semibold">Connect your wearable</h1>
            <p className="text-sm text-muted-foreground">
              Connect Open Wearables providers and sync your device data from one place.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">


        <Button variant="outline" size="sm" onClick={() => void loadProviders()} className="rounded-full">
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
        </div>
      </div>

      {error ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="py-5 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {loading ? (
          <div className="col-span-full flex min-h-[240px] items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/5 p-8">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <PredictSpinner className="size-6" />
              Loading available wearables...
            </div>
          </div>
        ) : null}

        {!loading && providerCards.length === 0 ? (
          <div className="col-span-full rounded-2xl border border-dashed border-white/10 bg-white/5 p-8 text-sm text-muted-foreground">
            No wearable providers are available right now.
          </div>
        ) : null}

        {!loading && providerCards.length > 0
          ? providerCards.map((provider) => {
              const providerKey = getProviderKey(provider);
              return (
                <Card key={providerKey || provider.name} className="border-white/10 bg-white/5 backdrop-blur-sm">
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                        <PlugZap className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{getProviderDisplayName(provider)}</CardTitle>
                        <CardDescription>Connect via Open Wearables</CardDescription>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    {provider.has_cloud_api ? "OAuth connect supported" : "Provider available"}
                  </div>
                  <Button
 size="sm"
 onClick={() => void handleConnect(provider)}
 disabled={connectingProvider === providerKey || !provider.has_cloud_api}
 >
                    {connectingProvider === providerKey ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      "Connect"
                    )}
                  </Button>
                </CardContent>
              </Card>
              );
            })
          : null}
      </div>
    </div>
  );
}
