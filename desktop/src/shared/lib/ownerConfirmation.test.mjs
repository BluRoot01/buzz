import assert from "node:assert/strict";
import test from "node:test";

import {
  extractCrmOperationalAccessConfirmation,
  extractWorkDriveOwnerConfirmation,
} from "./ownerConfirmation.ts";

const payload = {
  type: "switchboard_workdrive_profile",
  tenant_id: "tenant",
  channel_id: "5f8584fb-46fd-43c7-984d-4c25cbf79ea6",
  owner_pubkey: "a".repeat(64),
  capability_profile: "transcript_upload",
  upgrade_connection_id: "connection",
  scopes: [
    "WorkDrive.users.READ",
    "WorkDrive.team.READ",
    "WorkDrive.teamfolders.READ",
    "WorkDrive.files.READ",
    "ZohoFiles.files.READ",
    "WorkDrive.files.CREATE",
  ],
  actions: ["workdrive.files.upload"],
};

const message = (value) =>
  `Approve this bounded connection upgrade.\n\n\`\`\`buzz:owner-confirmation\n${JSON.stringify(value)}\n\`\`\``;

test("accepts the exact create-only WorkDrive profile", () => {
  assert.deepEqual(
    extractWorkDriveOwnerConfirmation(message(payload)),
    payload,
  );
});

test("rejects added operations and fields", () => {
  assert.equal(
    extractWorkDriveOwnerConfirmation(
      message({
        ...payload,
        actions: ["workdrive.files.upload", "workdrive.files.delete"],
      }),
    ),
    null,
  );
  assert.equal(
    extractWorkDriveOwnerConfirmation(
      message({ ...payload, callback_url: "https://evil.test" }),
    ),
    null,
  );
});

test("rejects any changed scope set", () => {
  assert.equal(
    extractWorkDriveOwnerConfirmation(
      message({ ...payload, scopes: payload.scopes.slice(1) }),
    ),
    null,
  );
});

const crmPayload = {
  type: "switchboard_operational_access",
  tenant_id: "tenant",
  channel_id: "5f8584fb-46fd-43c7-984d-4c25cbf79ea6",
  connection_id: "b".repeat(32),
  principals: [
    "a".repeat(64),
    "0f3a6f2f1e2d60769a231ae87b87f56aa9ddf4f3bdbb0a9d264bdc46cf21f614",
    "2d104e99e88ad140ce47a8107be62fc39c8b79a9dc9442ba2de599788fd792a1",
    "203dde935fe1070dcfa1f62ff9405b40c34147e11a41828f6fa4efd887e7a70f",
    "d381664f05e6e2b41badbdf7feb13568699e4253da5db624d725f8fc4998530e",
  ],
  actions: [
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
  ],
};

test("accepts an exact CRM operational access request", () => {
  assert.deepEqual(
    extractCrmOperationalAccessConfirmation(message(crmPayload)),
    crmPayload,
  );
});

test("rejects malformed CRM principal and action lists", () => {
  assert.equal(
    extractCrmOperationalAccessConfirmation(
      message({ ...crmPayload, principals: ["not-a-pubkey"] }),
    ),
    null,
  );
  assert.equal(
    extractCrmOperationalAccessConfirmation(
      message({ ...crmPayload, actions: ["records.read", "records.read"] }),
    ),
    null,
  );
});
