import { useEffect, useState } from "react";
import { getLocalEmailSettings, saveLocalEmailSettings } from "@/api/admin/admin.routes";
import { ApiError } from "@/api/http";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

export function LocalEmailSettings() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    getLocalEmailSettings().then((settings) => {
      if (alive) setEnabled(settings.enabled);
    }).catch((err) => {
      if (alive) setError(err instanceof ApiError ? err.message : "Não foi possível carregar a configuração.");
    });
    return () => { alive = false; };
  }, [reloadKey]);

  async function toggle(value: boolean) {
    if (enabled === null || saving) return;
    setSaving(true);
    setError(null);
    try {
      const settings = await saveLocalEmailSettings(value);
      setEnabled(settings.enabled);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível salvar a configuração.");
    } finally { setSaving(false); }
  }

  return (
    <Card className="mt-8">
      <CardHeader>
        <CardTitle>Testes locais</CardTitle>
        <CardDescription>O código continua aparecendo no login.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-4">
          <label htmlFor="local-email-enabled" className="text-sm font-medium">Enviar e-mails pela Zoho</label>
          <Switch id="local-email-enabled" checked={enabled ?? false} disabled={enabled === null || saving}
            onCheckedChange={(value) => void toggle(value)} />
        </div>
        {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
        {error && enabled === null && (
          <Button variant="outline" size="sm" className="mt-3" onClick={() => {
            setError(null);
            setReloadKey((key) => key + 1);
          }}>Tentar de novo</Button>
        )}
      </CardContent>
    </Card>
  );
}
