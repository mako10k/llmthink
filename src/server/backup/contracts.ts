import { z } from "zod";

export const LLMTHINK_BACKUP_MANIFEST_FORMAT =
  "llmthink-backup-generation-v1" as const;
export const LLMTHINK_BACKUP_RECEIPT_FORMAT =
  "llmthink-backup-receipt-v1" as const;

const SHA256 = /^sha256:[0-9a-f]{64}$/;
const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{15,127}$/;
const SAFE_PROFILE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const RESTIC_SNAPSHOT_ID = /^[0-9a-f]{64}$/;
const digestSchema = z.string().regex(SHA256);
const timestampSchema = z.string().datetime({ offset: true });
const byteSizeSchema = z.number().int().nonnegative().safe();

const componentSchema = z
  .object({
    kind: z.enum(["lifecycle_sqlite", "thought_repository"]),
    name: z.enum(["lifecycle.sqlite", "thought-data"]),
    format_version: z.number().int().positive().safe(),
    byte_size: byteSizeSchema,
    sha256: digestSchema,
  })
  .strict()
  .superRefine((component, context) => {
    const expected =
      component.kind === "lifecycle_sqlite"
        ? "lifecycle.sqlite"
        : "thought-data";
    if (component.name !== expected)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "backup_component_name_mismatch",
      });
  });

export const backupGenerationManifestSchema = z
  .object({
    format: z.literal(LLMTHINK_BACKUP_MANIFEST_FORMAT),
    generation_id: z.string().regex(OPAQUE_ID),
    created_at: timestampSchema,
    recovery_point_at: timestampSchema,
    producer_version: z.string().regex(SAFE_PROFILE),
    profile_id: z.string().regex(SAFE_PROFILE),
    components: z.array(componentSchema).length(2),
  })
  .strict()
  .superRefine((manifest, context) => {
    if (new Set(manifest.components.map(({ kind }) => kind)).size !== 2) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "backup_components_incomplete",
      });
    }
    if (
      Date.parse(manifest.recovery_point_at) > Date.parse(manifest.created_at)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "backup_recovery_point_after_creation",
      });
    }
  });

export type BackupGenerationManifest = z.infer<
  typeof backupGenerationManifestSchema
>;

export const backupReceiptSchema = z
  .object({
    format: z.literal(LLMTHINK_BACKUP_RECEIPT_FORMAT),
    generation_id: z.string().regex(OPAQUE_ID),
    manifest_sha256: digestSchema,
    snapshot_id: z.string().regex(RESTIC_SNAPSHOT_ID),
    repository_format: z.number().int().positive().safe(),
    restic_version: z.string().regex(SAFE_PROFILE),
    profile_id: z.string().regex(SAFE_PROFILE),
    tags: z.array(z.string().regex(SAFE_PROFILE)).max(8),
    files_new: z.number().int().nonnegative().safe(),
    bytes_added: byteSizeSchema,
    snapshot_observed_at: timestampSchema,
    check_state: z.enum(["not_checked", "structure_ok", "full_data_ok"]),
  })
  .strict();

export type BackupReceipt = z.infer<typeof backupReceiptSchema>;

export class BackupContractError extends Error {
  readonly code: "invalid_manifest" | "invalid_receipt" | "unsafe_path";
  constructor(code: BackupContractError["code"]) {
    super(code);
    this.name = "BackupContractError";
    this.code = code;
  }
}

export function parseBackupGenerationManifest(
  value: unknown,
): BackupGenerationManifest {
  const parsed = backupGenerationManifestSchema.safeParse(value);
  if (!parsed.success) throw new BackupContractError("invalid_manifest");
  return parsed.data;
}

export function parseBackupReceipt(value: unknown): BackupReceipt {
  const parsed = backupReceiptSchema.safeParse(value);
  if (!parsed.success) throw new BackupContractError("invalid_receipt");
  return parsed.data;
}

export function encodeBackupGenerationManifest(value: unknown): `${string}\n` {
  const manifest = parseBackupGenerationManifest(value);
  const components = [...manifest.components].sort((left, right) =>
    left.kind.localeCompare(right.kind),
  );
  return `${JSON.stringify({ ...manifest, components })}\n`;
}
