import { expect, test } from "@playwright/test";

import { installMockBridge } from "../helpers/bridge";

const CHANNEL_ID = "9a1657ac-f7aa-5db0-b632-d8bbeb6dfb50";
const AGENT_PUBKEY =
  "a0b1c2d3e4f5061728394a5b6c7d8e9f0a1b2c3d4e5f6071829304a5b6c7d8e";

test("owner reviews and can cancel an exact create-only WorkDrive approval", async ({
  page,
}) => {
  await installMockBridge(page, {
    managedAgents: [
      {
        pubkey: AGENT_PUBKEY,
        name: "Switchboard",
        personaId: "builtin:fizz",
        status: "running",
        channelNames: ["general"],
      },
    ],
  });
  await page.goto("/");
  await page.getByTestId("channel-general").click();
  await expect(page.getByTestId("chat-title")).toHaveText("general");

  const content = `Please review this bounded connection upgrade.

\`\`\`buzz:owner-confirmation
${JSON.stringify({
  type: "switchboard_workdrive_profile",
  tenant_id: "tenant-rps",
  channel_id: CHANNEL_ID,
  owner_pubkey: "deadbeef".repeat(8),
  capability_profile: "transcript_upload",
  upgrade_connection_id: "connection-rps",
  scopes: [
    "WorkDrive.files.CREATE",
    "WorkDrive.files.READ",
    "WorkDrive.team.READ",
    "WorkDrive.teamfolders.READ",
    "WorkDrive.users.READ",
    "ZohoFiles.files.READ",
  ],
  actions: ["workdrive.files.upload"],
})}
\`\`\``;
  const request = await page.evaluate(
    ({ content, pubkey }) =>
      window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__?.({
        channelName: "general",
        content,
        pubkey,
      }) ?? null,
    { content, pubkey: AGENT_PUBKEY },
  );
  expect(request?.id).toBeTruthy();

  const card = page.getByText("Approve WorkDrive upload access?").locator("..");
  await expect(card).toContainText("Existing files cannot be overwritten");
  await card.getByRole("button", { name: "Review and approve" }).click();
  await expect(
    page.getByRole("heading", { name: "Allow create-only WorkDrive uploads?" }),
  ).toBeVisible();
  await expect(page.getByText("Not allowed:")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(
    page.getByRole("heading", { name: "Allow create-only WorkDrive uploads?" }),
  ).not.toBeVisible();
  await expect(
    card.getByRole("button", { name: "Review and approve" }),
  ).toBeVisible();
});

test("owner can review a bounded CRM access repair", async ({ page }) => {
  await installMockBridge(page, {
    managedAgents: [
      {
        pubkey: AGENT_PUBKEY,
        name: "Switchboard",
        personaId: "builtin:fizz",
        status: "running",
        channelNames: ["general"],
      },
    ],
  });
  await page.goto("/");
  await page.getByTestId("channel-general").click();

  const content = `Restore the canonical CRM principals.

\`\`\`buzz:owner-confirmation
${JSON.stringify({
  type: "switchboard_operational_access",
  tenant_id: "tenant-rps",
  channel_id: CHANNEL_ID,
  connection_id: "b".repeat(32),
  principals: [
    "deadbeef".repeat(8),
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
})}
\`\`\``;
  await page.evaluate(
    ({ content, pubkey }) =>
      window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__?.({
        channelName: "general",
        content,
        pubkey,
      }),
    { content, pubkey: AGENT_PUBKEY },
  );

  const card = page.getByText("Restore CRM channel access?").locator("..");
  await expect(card).toContainText("High-impact actions still require");
  await card.getByRole("button", { name: "Review and approve" }).click();
  await expect(
    page.getByRole("heading", { name: "Restore this channel’s CRM access?" }),
  ).toBeVisible();
  await expect(page.getByText("Still gated:")).toBeVisible();
});
