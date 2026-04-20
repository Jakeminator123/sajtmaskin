"use client";

import { AVAILABLE_MODELS } from '@/components/lib/ai/provider-registry';

type Props = {
  value: string;
  onChange: (value: string) => void;
};

export function ModelSelector({ value, onChange }: Props) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">Model</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border bg-background px-3 py-2 text-sm"
      >
        {AVAILABLE_MODELS.map((model) => (
          <option key={model.id} value={model.id}>
            {model.provider} · {model.label}
          </option>
        ))}
      </select>
    </label>
  );
}
