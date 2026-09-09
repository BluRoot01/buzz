export type WorkDriveOwnerConfirmation = {
  type: "switchboard_workdrive_profile";
  tenant_id: string;
  channel_id: string;
  owner_pubkey: string;
  capability_profile: "transcript_upload";
  upgrade_connection_id: string;
  scopes: string[];
  actions: ["workdrive.files.upload"];
};

export type CrmOperationalAccessConfirmation = {
  type: "switchboard_operational_access";
  tenant_id: string;
  channel_id: string;
  connection_id: string;
  principals: string[];
  actions: string[];
};

export type OwnerConfirmation =
  | WorkDriveOwnerConfirmation
  | CrmOperationalAccessConfirmation;

const FENCE_OPEN = "```buzz:owner-confirmation";
const FENCE_CLOSE = "```";
const EXPECTED_SCOPES = [
  "WorkDrive.files.CREATE",
  "WorkDrive.files.READ",
  "WorkDrive.team.READ",
  "WorkDrive.teamfolders.READ",
  "WorkDrive.users.READ",
  "ZohoFiles.files.READ",
].sort();
const CRM_AGENT_PRINCIPALS = [
  "0f3a6f2f1e2d60769a231ae87b87f56aa9ddf4f3bdbb0a9d264bdc46cf21f614",
  "2d104e99e88ad140ce47a8107be62fc39c8b79a9dc9442ba2de599788fd792a1",
  "203dde935fe1070dcfa1f62ff9405b40c34147e11a41828f6fa4efd887e7a70f",
  "d381664f05e6e2b41badbdf7feb13568699e4253da5db624d725f8fc4998530e",
].sort();
const CRM_STANDARD_ACTIONS = [
  "metadata.snapshot.read",
  "metadata.fields.read",
  "workflow.snapshot.read",
  "templates.email.read",
  "functions.list.read",
  "functions.code.read",
  "deals.stage_counts.read",
  "records.read",
  "records.search.read",
  "records.timeline.read",
  "records.related.read",
  "records.coql.read",
  "contact_roles.catalog.read",
  "contact_roles.deals.read",
  "records.create",
  "records.update",
  "records.batch_create",
  "records.batch_update",
  "records.batch_upsert",
  "contact_roles.batch_associate",
  "schema.field_create",
  "schema.field_update",
  "functions.code.update",
].sort();

function exactKeys(
  value: Record<string, unknown>,
  expected: string[],
): boolean {
  return (
    Object.keys(value).sort().join("\u0000") === expected.sort().join("\u0000")
  );
}

export function extractWorkDriveOwnerConfirmation(
  content: string,
): WorkDriveOwnerConfirmation | null {
  const open = content.indexOf(FENCE_OPEN);
  if (open < 0) return null;
  const start = content.indexOf("\n", open);
  const end = start < 0 ? -1 : content.indexOf(`\n${FENCE_CLOSE}`, start);
  if (start < 0 || end < 0) return null;

  try {
    const parsed: unknown = JSON.parse(content.slice(start + 1, end).trim());
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return null;
    }
    const value = parsed as Record<string, unknown>;
    if (
      !exactKeys(value, [
        "type",
        "tenant_id",
        "channel_id",
        "owner_pubkey",
        "capability_profile",
        "upgrade_connection_id",
        "scopes",
        "actions",
      ]) ||
      value.type !== "switchboard_workdrive_profile" ||
      value.capability_profile !== "transcript_upload" ||
      typeof value.tenant_id !== "string" ||
      !value.tenant_id ||
      typeof value.channel_id !== "string" ||
      !value.channel_id ||
      typeof value.owner_pubkey !== "string" ||
      !/^[0-9a-f]{64}$/i.test(value.owner_pubkey) ||
      typeof value.upgrade_connection_id !== "string" ||
      !value.upgrade_connection_id ||
      !Array.isArray(value.scopes) ||
      !value.scopes.every((scope) => typeof scope === "string") ||
      [...value.scopes].sort().join("\u0000") !==
        EXPECTED_SCOPES.join("\u0000") ||
      !Array.isArray(value.actions) ||
      value.actions.length !== 1 ||
      value.actions[0] !== "workdrive.files.upload"
    ) {
      return null;
    }
    return parsed as WorkDriveOwnerConfirmation;
  } catch {
    return null;
  }
}

export function extractCrmOperationalAccessConfirmation(
  content: string,
): CrmOperationalAccessConfirmation | null {
  const open = content.indexOf(FENCE_OPEN);
  if (open < 0) return null;
  const start = content.indexOf("\n", open);
  const end = start < 0 ? -1 : content.indexOf(`\n${FENCE_CLOSE}`, start);
  if (start < 0 || end < 0) return null;

  try {
    const parsed: unknown = JSON.parse(content.slice(start + 1, end).trim());
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return null;
    }
    const value = parsed as Record<string, unknown>;
    if (
      !exactKeys(value, [
        "type",
        "tenant_id",
        "channel_id",
        "connection_id",
        "principals",
        "actions",
      ]) ||
      value.type !== "switchboard_operational_access" ||
      typeof value.tenant_id !== "string" ||
      !value.tenant_id ||
      typeof value.channel_id !== "string" ||
      !value.channel_id ||
      typeof value.connection_id !== "string" ||
      !/^[0-9a-f]{32,64}$/.test(value.connection_id) ||
      !Array.isArray(value.principals) ||
      value.principals.length !== CRM_AGENT_PRINCIPALS.length + 1 ||
      !value.principals.every(
        (principal) =>
          typeof principal === "string" && /^[0-9a-f]{64}$/.test(principal),
      ) ||
      new Set(value.principals).size !== value.principals.length ||
      !CRM_AGENT_PRINCIPALS.every((principal) =>
        (value.principals as unknown[]).includes(principal),
      ) ||
      !Array.isArray(value.actions) ||
      !value.actions.every((action) => typeof action === "string") ||
      new Set(value.actions).size !== value.actions.length ||
      [...value.actions].sort().join("\u0000") !==
        CRM_STANDARD_ACTIONS.join("\u0000")
    ) {
      return null;
    }
    return parsed as CrmOperationalAccessConfirmation;
  } catch {
    return null;
  }
}
