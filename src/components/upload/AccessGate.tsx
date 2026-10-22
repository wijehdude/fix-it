"use client";

import { KeyRound } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { HealthResponse } from "@/lib/api/contracts";
import { useAnalysisStore } from "@/store/useAnalysisStore";

/** Optional ACCESS_CODE gate: asks once per session (kept in memory only). */
export function AccessGate({ children }: { children: ReactNode }) {
  const health = useAnalysisStore((s) => s.health);
  const accessCode = useAnalysisStore((s) => s.accessCode);
  const set = useAnalysisStore((s) => s.set);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  if (!health?.accessCodeRequired || (accessCode && health.accessOk)) return <>{children}</>;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setChecking(true);
    setError(null);
    try {
      const res = await fetch("/api/health", { headers: { "x-access-code": code }, cache: "no-store" });
      const h = (await res.json()) as HealthResponse;
      if (h.accessOk) set({ accessCode: code, health: h });
      else setError("That code is not correct.");
    } catch {
      setError("Could not verify the code. Check your connection.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="mx-auto mt-24 w-full max-w-sm px-4">
      <form onSubmit={submit} className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <KeyRound className="size-5" aria-hidden />
          <h2 className="font-semibold">Access code required</h2>
        </div>
        <p className="text-sm text-muted-foreground">Enter the access code you were given. It is kept in memory for this tab only.</p>
        <div className="space-y-1.5">
          <Label htmlFor="access-code">Access code</Label>
          <Input id="access-code" type="password" value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
        </div>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" disabled={!code || checking} className="w-full">
          {checking ? "Checking…" : "Continue"}
        </Button>
      </form>
    </div>
  );
}
