"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { Button, Card } from "@/components/ui";

const inputClass = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";
const labelClass = "text-sm";

/** Manual client entry — fills the gap where the only way to get a Client
 * (which every Proposal requires) used to be loading the demo seed data. */
export function ClientForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactRole, setContactRole] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Client name is required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const contact: Record<string, string> = {};
      if (contactName.trim()) contact.name = contactName.trim();
      if (contactRole.trim()) contact.role = contactRole.trim();
      if (contactEmail.trim()) contact.email = contactEmail.trim();
      const created = await api.createClient({
        name: name.trim(),
        company_name: companyName.trim() || null,
        industry: industry.trim() || null,
        contacts: Object.keys(contact).length ? [contact] : [],
      });
      router.push(`/clients/${created.client_id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create client");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>
            <span className="mb-1 block font-medium">Client name *</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} required />
          </label>
          <label className={labelClass}>
            <span className="mb-1 block font-medium">Company</span>
            <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className={inputClass} />
          </label>
          <label className={labelClass}>
            <span className="mb-1 block font-medium">Industry</span>
            <input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="Tech scale-up" className={inputClass} />
          </label>
          <label className={labelClass}>
            <span className="mb-1 block font-medium">Contact person</span>
            <input value={contactName} onChange={(e) => setContactName(e.target.value)} className={inputClass} />
          </label>
          <label className={labelClass}>
            <span className="mb-1 block font-medium">Contact role</span>
            <input value={contactRole} onChange={(e) => setContactRole(e.target.value)} placeholder="Head of Operations" className={inputClass} />
          </label>
          <label className={`${labelClass} sm:col-span-2`}>
            <span className="mb-1 block font-medium">Contact email</span>
            <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className={inputClass} />
          </label>
        </div>
      </Card>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <Button type="submit" disabled={submitting}>
        {submitting ? "Creating…" : "Create Client"}
      </Button>
    </form>
  );
}
