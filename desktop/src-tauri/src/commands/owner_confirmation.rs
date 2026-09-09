use nostr::{EventBuilder, Kind, Tag};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::{
    app_state::AppState,
    nostr_convert,
    relay::{query_relay, submit_event},
};

const FENCE_OPEN: &str = "```buzz:owner-confirmation";
const EXPECTED_SCOPES: [&str; 6] = [
    "WorkDrive.files.CREATE",
    "WorkDrive.files.READ",
    "WorkDrive.team.READ",
    "WorkDrive.teamfolders.READ",
    "WorkDrive.users.READ",
    "ZohoFiles.files.READ",
];
const CRM_AGENT_PRINCIPALS: [&str; 4] = [
    "0f3a6f2f1e2d60769a231ae87b87f56aa9ddf4f3bdbb0a9d264bdc46cf21f614",
    "2d104e99e88ad140ce47a8107be62fc39c8b79a9dc9442ba2de599788fd792a1",
    "203dde935fe1070dcfa1f62ff9405b40c34147e11a41828f6fa4efd887e7a70f",
    "d381664f05e6e2b41badbdf7feb13568699e4253da5db624d725f8fc4998530e",
];
const CRM_STANDARD_ACTIONS: [&str; 23] = [
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
];

#[derive(Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
struct WorkDriveApproval {
    r#type: String,
    tenant_id: String,
    channel_id: String,
    owner_pubkey: String,
    capability_profile: String,
    upgrade_connection_id: String,
    scopes: Vec<String>,
    actions: Vec<String>,
}

#[derive(Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
struct CrmOperationalAccessApproval {
    r#type: String,
    tenant_id: String,
    channel_id: String,
    connection_id: String,
    principals: Vec<String>,
    actions: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct OwnerConfirmationWire {
    event_id: String,
}

fn extract_payload(content: &str) -> Result<WorkDriveApproval, String> {
    serde_json::from_str(extract_payload_json(content)?)
        .map_err(|_| "owner confirmation payload is invalid".to_string())
}

fn extract_payload_json(content: &str) -> Result<&str, String> {
    let open = content
        .find(FENCE_OPEN)
        .ok_or_else(|| "owner confirmation payload not found".to_string())?;
    let start = content[open..]
        .find('\n')
        .map(|offset| open + offset + 1)
        .ok_or_else(|| "owner confirmation payload is malformed".to_string())?;
    let end = content[start..]
        .find("\n```")
        .map(|offset| start + offset)
        .ok_or_else(|| "owner confirmation payload is malformed".to_string())?;
    Ok(content[start..end].trim())
}

fn validate_payload(
    payload: &WorkDriveApproval,
    channel_id: &str,
    owner_pubkey: &str,
) -> Result<(), String> {
    let mut scopes = payload
        .scopes
        .iter()
        .map(String::as_str)
        .collect::<Vec<_>>();
    scopes.sort_unstable();
    if payload.r#type != "switchboard_workdrive_profile"
        || payload.capability_profile != "transcript_upload"
        || payload.tenant_id.trim().is_empty()
        || payload.upgrade_connection_id.trim().is_empty()
        || payload.channel_id != channel_id
        || !payload.owner_pubkey.eq_ignore_ascii_case(owner_pubkey)
        || scopes != EXPECTED_SCOPES
        || payload.actions != ["workdrive.files.upload"]
    {
        return Err(
            "owner confirmation request does not match the create-only WorkDrive profile"
                .to_string(),
        );
    }
    Ok(())
}

fn extract_crm_payload(content: &str) -> Result<CrmOperationalAccessApproval, String> {
    serde_json::from_str(extract_payload_json(content)?)
        .map_err(|_| "owner confirmation payload is invalid".to_string())
}

fn validate_crm_payload(
    payload: &CrmOperationalAccessApproval,
    channel_id: &str,
    owner_pubkey: &str,
) -> Result<(), String> {
    let mut expected_principals = CRM_AGENT_PRINCIPALS
        .iter()
        .map(|value| (*value).to_string())
        .collect::<Vec<_>>();
    expected_principals.push(owner_pubkey.to_lowercase());
    expected_principals.sort_unstable();
    expected_principals.dedup();
    let principal_count = payload.principals.len();
    let mut principals = payload
        .principals
        .iter()
        .map(|value| value.to_lowercase())
        .collect::<Vec<_>>();
    principals.sort_unstable();
    principals.dedup();
    let mut actions = payload
        .actions
        .iter()
        .map(String::as_str)
        .collect::<Vec<_>>();
    actions.sort_unstable();
    let mut expected_actions = CRM_STANDARD_ACTIONS.to_vec();
    expected_actions.sort_unstable();
    if payload.r#type != "switchboard_operational_access"
        || payload.tenant_id.trim().is_empty()
        || !(32..=64).contains(&payload.connection_id.len())
        || !payload
            .connection_id
            .chars()
            .all(|value| value.is_ascii_hexdigit())
        || payload.channel_id != channel_id
        || principal_count != expected_principals.len()
        || principals != expected_principals
        || actions != expected_actions
    {
        return Err("owner confirmation request does not match canonical CRM access".to_string());
    }
    Ok(())
}

fn has_tag(event: &nostr::Event, name: &str, value: &str) -> bool {
    event.tags.iter().any(|tag| {
        let values = tag.as_slice();
        values.first().map(String::as_str) == Some(name)
            && values.get(1).map(String::as_str) == Some(value)
    })
}

#[tauri::command]
pub async fn confirm_workdrive_owner_request(
    request_event_id: String,
    channel_id: String,
    state: State<'_, AppState>,
) -> Result<OwnerConfirmationWire, String> {
    uuid::Uuid::parse_str(&channel_id).map_err(|_| "invalid channel id".to_string())?;
    let events = query_relay(
        &state,
        &[serde_json::json!({
            "ids": [request_event_id],
            "kinds": [9],
            "#h": [channel_id],
            "limit": 1,
        })],
    )
    .await?;
    let request = events
        .first()
        .ok_or_else(|| "owner confirmation request not found".to_string())?;
    if !has_tag(request, "h", &channel_id) {
        return Err("owner confirmation request belongs to another channel".to_string());
    }

    let owner_pubkey = state.signing_keys()?.public_key().to_hex();
    let roster_events = query_relay(
        &state,
        &[serde_json::json!({"kinds": [39002], "#d": [channel_id], "limit": 1})],
    )
    .await?;
    let roster = roster_events
        .first()
        .ok_or_else(|| "channel members not found".to_string())
        .and_then(nostr_convert::channel_members_from_event)?;
    if !roster.members.iter().any(|member| {
        member.role == "bot" && member.pubkey.eq_ignore_ascii_case(&request.pubkey.to_hex())
    }) {
        return Err("owner confirmation requests must come from a channel agent".to_string());
    }
    if !roster
        .members
        .iter()
        .any(|member| member.role == "owner" && member.pubkey.eq_ignore_ascii_case(&owner_pubkey))
    {
        return Err("only the channel owner can confirm this request".to_string());
    }

    let mut payload = extract_payload(&request.content)?;
    validate_payload(&payload, &channel_id, &owner_pubkey)?;
    payload.scopes.sort_unstable();
    payload.actions.sort_unstable();
    let content = serde_json::to_string(&payload)
        .map_err(|error| format!("serialize owner confirmation: {error}"))?;
    let tags = vec![
        Tag::parse(["h", channel_id.as_str()]).map_err(|e| format!("invalid tag: {e}"))?,
        Tag::parse(["e", request.id.to_hex().as_str(), "", "reply"])
            .map_err(|e| format!("invalid tag: {e}"))?,
    ];
    let result = submit_event(
        EventBuilder::new(Kind::Custom(9), content).tags(tags),
        &state,
    )
    .await?;
    Ok(OwnerConfirmationWire {
        event_id: result.event_id,
    })
}

#[tauri::command]
pub async fn confirm_crm_operational_access_request(
    request_event_id: String,
    channel_id: String,
    state: State<'_, AppState>,
) -> Result<OwnerConfirmationWire, String> {
    uuid::Uuid::parse_str(&channel_id).map_err(|_| "invalid channel id".to_string())?;
    let events = query_relay(
        &state,
        &[serde_json::json!({
            "ids": [request_event_id], "kinds": [9], "#h": [channel_id], "limit": 1,
        })],
    )
    .await?;
    let request = events
        .first()
        .ok_or_else(|| "owner confirmation request not found".to_string())?;
    if !has_tag(request, "h", &channel_id) {
        return Err("owner confirmation request belongs to another channel".to_string());
    }
    let owner_pubkey = state.signing_keys()?.public_key().to_hex();
    let roster_events = query_relay(
        &state,
        &[serde_json::json!({
            "kinds": [39002], "#d": [channel_id], "limit": 1,
        })],
    )
    .await?;
    let roster = roster_events
        .first()
        .ok_or_else(|| "channel members not found".to_string())
        .and_then(nostr_convert::channel_members_from_event)?;
    if !roster.members.iter().any(|member| {
        member.role == "bot" && member.pubkey.eq_ignore_ascii_case(&request.pubkey.to_hex())
    }) {
        return Err("owner confirmation requests must come from a channel agent".to_string());
    }
    if !roster
        .members
        .iter()
        .any(|member| member.role == "owner" && member.pubkey.eq_ignore_ascii_case(&owner_pubkey))
    {
        return Err("only the channel owner can confirm this request".to_string());
    }
    let mut payload = extract_crm_payload(&request.content)?;
    validate_crm_payload(&payload, &channel_id, &owner_pubkey)?;
    payload.principals.sort_unstable();
    payload.actions.sort_unstable();
    let content = serde_json::to_string(&payload)
        .map_err(|error| format!("serialize owner confirmation: {error}"))?;
    let tags = vec![
        Tag::parse(["h", channel_id.as_str()]).map_err(|e| format!("invalid tag: {e}"))?,
        Tag::parse(["e", request.id.to_hex().as_str(), "", "reply"])
            .map_err(|e| format!("invalid tag: {e}"))?,
    ];
    let result = submit_event(
        EventBuilder::new(Kind::Custom(9), content).tags(tags),
        &state,
    )
    .await?;
    Ok(OwnerConfirmationWire {
        event_id: result.event_id,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn approval() -> WorkDriveApproval {
        WorkDriveApproval {
            r#type: "switchboard_workdrive_profile".into(),
            tenant_id: "tenant".into(),
            channel_id: "5f8584fb-46fd-43c7-984d-4c25cbf79ea6".into(),
            owner_pubkey: "a".repeat(64),
            capability_profile: "transcript_upload".into(),
            upgrade_connection_id: "connection".into(),
            scopes: EXPECTED_SCOPES
                .iter()
                .map(|scope| (*scope).into())
                .collect(),
            actions: vec!["workdrive.files.upload".into()],
        }
    }

    #[test]
    fn exact_payload_is_accepted() {
        let payload = approval();
        assert_eq!(
            validate_payload(&payload, &payload.channel_id, &payload.owner_pubkey),
            Ok(())
        );
    }

    #[test]
    fn tampered_operation_is_rejected() {
        let mut payload = approval();
        payload.actions.push("workdrive.files.delete".into());
        assert!(validate_payload(&payload, &payload.channel_id, &payload.owner_pubkey).is_err());
    }

    #[test]
    fn unknown_json_field_is_rejected() {
        let content = format!(
            "{FENCE_OPEN}\n{}\n```",
            serde_json::json!({
                "type": "switchboard_workdrive_profile", "tenant_id": "tenant",
                "channel_id": "channel", "owner_pubkey": "owner",
                "capability_profile": "transcript_upload", "upgrade_connection_id": "id",
                "scopes": EXPECTED_SCOPES, "actions": ["workdrive.files.upload"],
                "callback_url": "https://evil.test"
            })
        );
        assert!(extract_payload(&content).is_err());
    }

    #[test]
    fn exact_crm_repair_is_accepted_and_scope_expansion_is_rejected() {
        let owner = "e".repeat(64);
        let mut principals = CRM_AGENT_PRINCIPALS
            .iter()
            .map(|value| (*value).to_string())
            .collect::<Vec<_>>();
        principals.push(owner.clone());
        let mut payload = CrmOperationalAccessApproval {
            r#type: "switchboard_operational_access".into(),
            tenant_id: "tenant".into(),
            channel_id: "5f8584fb-46fd-43c7-984d-4c25cbf79ea6".into(),
            connection_id: "a".repeat(32),
            principals,
            actions: CRM_STANDARD_ACTIONS
                .iter()
                .map(|value| (*value).into())
                .collect(),
        };
        assert_eq!(
            validate_crm_payload(&payload, &payload.channel_id, &owner),
            Ok(())
        );
        payload.actions.push("records.delete".into());
        assert!(validate_crm_payload(&payload, &payload.channel_id, &owner).is_err());
    }
}
