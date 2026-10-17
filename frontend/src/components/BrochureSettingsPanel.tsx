"use client";

import { useRef, useState } from "react";
import { Check, ImagePlus, Loader2, X } from "lucide-react";
import type { BrochureLanguage, BrochureSettings, Client } from "@/lib/types";
import { api } from "@/lib/api";
import { Button, fieldInputClass, fieldLabelClass } from "@/components/ui";

const LANGUAGES: { value: BrochureLanguage; label: string }[] = [
  { value: "en", label: "English" },
  { value: "nl", label: "Nederlands" },
];

// The logo is stored with the folder as a data: URL, so it's shrunk in the
// browser first: a cover logo never needs more than this, and a phone photo
// of a logo would otherwise be megabytes.
const LOGO_MAX_W = 480;
const LOGO_MAX_H = 200;
const LOGO_MAX_CHARS = 600_000;

function readLogo(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, LOGO_MAX_W / img.naturalWidth, LOGO_MAX_H / img.naturalHeight);
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      URL.revokeObjectURL(url);
      if (!ctx) return reject(new Error("Could not read that image."));
      ctx.drawImage(img, 0, 0, w, h);
      const data = canvas.toDataURL("image/png");
      if (data.length > LOGO_MAX_CHARS) return reject(new Error("That logo is too detailed — try a simpler PNG or SVG."));
      resolve(data);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file isn't an image we can read — use a PNG, JPG or SVG."));
    };
    img.src = url;
  });
}

function settingsOf(client: Client): BrochureSettings {
  return {
    brochure_language: client.brochure_language === "nl" ? "nl" : "en",
    contact_name: client.contact_name ?? null,
    contact_role: client.contact_role ?? null,
    contact_phone: client.contact_phone ?? null,
    contact_email: client.contact_email ?? null,
    logo_url: client.logo_url ?? null,
  };
}

/** What the live link shows besides the buildings: its language, the broker
 * the client should contact (per folder — a colleague may run the deal) and
 * the client's own logo on the cover. Saved on its own endpoint, so it never
 * touches the folder's other details. */
export function BrochureSettingsPanel({ client, onUpdated }: { client: Client; onUpdated: (next: Client) => void }) {
  const [form, setForm] = useState<BrochureSettings>(() => settingsOf(client));
  const [saved, setSaved] = useState<BrochureSettings>(() => settingsOf(client));
  const [busy, setBusy] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const set = <K extends keyof BrochureSettings>(key: K, value: BrochureSettings[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setJustSaved(false);
  };

  async function onLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    try {
      set("logo_url", await readLogo(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that image.");
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const next = await api.updateClientBrochure(client.client_id, form);
      const settings = settingsOf(next);
      setForm(settings);
      setSaved(settings);
      setJustSaved(true);
      onUpdated(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  const text = (key: "contact_name" | "contact_role" | "contact_phone" | "contact_email") => ({
    value: form[key] ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(key, e.target.value),
  });

  return (
    <section aria-labelledby="brochure-settings-title" className="mt-5 rounded-[20px] bg-surface p-5 shadow-card sm:p-7">
      <form onSubmit={save}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 id="brochure-settings-title" className="text-lg font-semibold tracking-tight">
              On the live link
            </h2>
            <p className="mt-1 max-w-[52ch] text-sm leading-relaxed text-muted">
              The language, who {client.display_name} should contact, and their logo on the cover.
            </p>
          </div>
          <div role="radiogroup" aria-label="Language of the live link" className="inline-flex rounded-full bg-input-bg p-1">
            {LANGUAGES.map((l) => (
              <button
                key={l.value}
                type="button"
                role="radio"
                aria-checked={form.brochure_language === l.value}
                onClick={() => set("brochure_language", l.value)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  form.brochure_language === l.value ? "bg-surface text-foreground shadow-card" : "text-muted hover:text-foreground"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_240px]">
          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="sr-only">Contact person</legend>
            <label className="flex flex-col gap-1.5">
              <span className={fieldLabelClass}>Contact person</span>
              <input {...text("contact_name")} autoComplete="name" placeholder="Mick Siero" className={fieldInputClass} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={fieldLabelClass}>Role</span>
              <input {...text("contact_role")} autoComplete="organization-title" placeholder="Tenant representation" className={fieldInputClass} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={fieldLabelClass}>Phone</span>
              <input {...text("contact_phone")} type="tel" autoComplete="tel" placeholder="+31 6 …" className={fieldInputClass} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={fieldLabelClass}>Email</span>
              <input {...text("contact_email")} type="email" autoComplete="email" placeholder="name@cushwake.com" className={fieldInputClass} />
            </label>
          </fieldset>

          <div className="flex flex-col gap-1.5">
            <span className={fieldLabelClass}>Client logo</span>
            <div className="flex min-h-[104px] flex-1 items-center justify-center rounded-xl bg-input-bg p-3">
              {form.logo_url ? (
                <div className="relative flex w-full items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a data: URL */}
                  <img src={form.logo_url} alt={`${client.display_name} logo`} className="max-h-16 max-w-full object-contain" />
                  <button
                    type="button"
                    onClick={() => set("logo_url", null)}
                    aria-label="Remove logo"
                    className="absolute -right-1 -top-1 rounded-full border border-border bg-surface p-1 text-muted hover:text-foreground"
                  >
                    <X size={13} aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="inline-flex flex-col items-center gap-1.5 text-xs font-medium text-muted hover:text-foreground"
                >
                  <ImagePlus size={18} aria-hidden="true" />
                  Upload PNG or SVG
                </button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/png,image/svg+xml,image/jpeg,image/webp" onChange={onLogo} className="sr-only" tabIndex={-1} />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
          {error && <p className="mr-auto text-sm text-red-600">{error}</p>}
          {justSaved && !dirty && (
            <span className="inline-flex items-center gap-1.5 text-sm text-success-foreground">
              <Check size={15} aria-hidden="true" /> Saved
            </span>
          )}
          <Button type="submit" disabled={busy || !dirty}>
            {busy && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
            Save
          </Button>
        </div>
      </form>
    </section>
  );
}
