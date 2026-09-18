"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { TextField } from "@yacht-charter/ui/components/form/text-field";
import { Upload } from "lucide-react";
import { useId, useRef } from "react";

import { Image } from "@/components/shared/data-display/image";

export interface PhotoFieldProps {
  label: string;
  hint: string;
  alt: string;
  value: string;
  onChange: (value: string) => void;
  uploading: boolean;
  uploadLabel: string;
  uploadingLabel: string;
  /** Absent where this environment cannot store an upload, which leaves the URL field alone. */
  onUpload?: (file: File | undefined) => void;
}

/* A photo slot: its preview, the URL it is served from, and an upload that fills that URL in. */
export default function PhotoField({
  label,
  hint,
  alt,
  value,
  onChange,
  uploading,
  uploadLabel,
  uploadingLabel,
  onUpload,
}: PhotoFieldProps) {
  const inputId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const preview = value.trim();

  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-start">
      <div className="relative aspect-4/3 w-full shrink-0 overflow-hidden rounded-xl bg-natural-100 md:w-56">
        {preview ? (
          <Image src={preview} alt={alt} fill sizes="224px" className="object-cover" />
        ) : null}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <TextField
          id={inputId}
          fieldClassName="h-12"
          label={label}
          supportingText={hint}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        {onUpload ? (
          <>
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              className="hidden"
              onChange={(event) => {
                onUpload(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="neutral"
              size="sm"
              className="w-fit"
              disabled={uploading}
              onClick={() => fileInput.current?.click()}
            >
              <Upload className="size-4" />
              {uploading ? uploadingLabel : uploadLabel}
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}
