import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { BusinessProfile, BusinessProfileInput } from "@/types/business";

interface BusinessFormProps {
  profile: BusinessProfile | null | undefined;
  onSave: (input: BusinessProfileInput) => void;
  isSaving?: boolean;
}

const emptyForm: BusinessProfileInput = {
  companyName: "",
  website: "",
  industry: "",
  description: "",
  mission: "",
  vision: "",
  primaryDomain: "",
  primaryCountry: "",
  primaryLanguage: "",
  timezone: "",
  currency: "",
};

export function BusinessForm({ profile, onSave, isSaving }: BusinessFormProps) {
  const [form, setForm] = useState<BusinessProfileInput>(emptyForm);

  useEffect(() => {
    if (profile) {
      setForm({
        companyName: profile.companyName,
        website: profile.website ?? "",
        industry: profile.industry ?? "",
        description: profile.description ?? "",
        mission: profile.mission ?? "",
        vision: profile.vision ?? "",
        primaryDomain: profile.primaryDomain ?? "",
        primaryCountry: profile.primaryCountry ?? "",
        primaryLanguage: profile.primaryLanguage ?? "",
        timezone: profile.timezone ?? "",
        currency: profile.currency ?? "",
      });
    }
  }, [profile]);

  function update<K extends keyof BusinessProfileInput>(key: K, value: BusinessProfileInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave(form);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Company</CardTitle>
        <CardDescription>The core identity Atlas uses across every module.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="companyName">Company Name</Label>
              <Input
                id="companyName"
                value={form.companyName}
                onChange={(e) => update("companyName", e.target.value)}
                placeholder="Acme Inc."
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                type="url"
                value={form.website ?? ""}
                onChange={(e) => update("website", e.target.value)}
                placeholder="https://acme.com"
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="industry">Industry</Label>
            <Input
              id="industry"
              value={form.industry ?? ""}
              onChange={(e) => update("industry", e.target.value)}
              placeholder="e.g. B2B SaaS"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={form.description ?? ""}
              onChange={(e) => update("description", e.target.value)}
              placeholder="What does the business do?"
              rows={3}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="mission">Mission</Label>
              <Textarea
                id="mission"
                value={form.mission ?? ""}
                onChange={(e) => update("mission", e.target.value)}
                placeholder="Why does the business exist?"
                rows={3}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="vision">Vision</Label>
              <Textarea
                id="vision"
                value={form.vision ?? ""}
                onChange={(e) => update("vision", e.target.value)}
                placeholder="What does success look like?"
                rows={3}
              />
            </div>
          </div>

          <div className="space-y-4 border-t border-border/60 pt-4">
            <h3 className="text-sm font-medium">Business Identity</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="primaryDomain">Primary Domain</Label>
                <Input
                  id="primaryDomain"
                  value={form.primaryDomain ?? ""}
                  onChange={(e) => update("primaryDomain", e.target.value)}
                  placeholder="acme.com"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="primaryCountry">Primary Country</Label>
                <Input
                  id="primaryCountry"
                  value={form.primaryCountry ?? ""}
                  onChange={(e) => update("primaryCountry", e.target.value)}
                  placeholder="e.g. United States"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="primaryLanguage">Primary Language</Label>
                <Input
                  id="primaryLanguage"
                  value={form.primaryLanguage ?? ""}
                  onChange={(e) => update("primaryLanguage", e.target.value)}
                  placeholder="e.g. English"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="timezone">Timezone</Label>
                <Input
                  id="timezone"
                  value={form.timezone ?? ""}
                  onChange={(e) => update("timezone", e.target.value)}
                  placeholder="e.g. America/New_York"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="currency">Currency</Label>
                <Input
                  id="currency"
                  value={form.currency ?? ""}
                  onChange={(e) => update("currency", e.target.value)}
                  placeholder="e.g. USD"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
