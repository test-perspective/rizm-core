use super::{merge_refreshed_token, token_should_refresh, BITBUCKET_REFRESH_SKEW_MS};
use crate::api::scm_api::{BitbucketStoredToken, BitbucketTokenResponse};

#[test]
fn token_refresh_respects_skew_window() {
    let now_ms = 10_000_000i64;
    let obtained_at = now_ms - (3600 * 1000) + (BITBUCKET_REFRESH_SKEW_MS + 1);
    let token = BitbucketStoredToken {
        access_token: "access".to_string(),
        refresh_token: Some("refresh".to_string()),
        expires_in: Some(3600),
        token_type: Some("bearer".to_string()),
        scopes: None,
        obtained_at: Some(obtained_at),
    };
    assert!(!token_should_refresh(&token, now_ms));

    let obtained_at = now_ms - (3600 * 1000) + (BITBUCKET_REFRESH_SKEW_MS - 1);
    let token = BitbucketStoredToken {
        obtained_at: Some(obtained_at),
        ..token
    };
    assert!(token_should_refresh(&token, now_ms));
}

#[test]
fn merge_refresh_response_keeps_existing_refresh_token() {
    let previous = BitbucketStoredToken {
        access_token: "old".to_string(),
        refresh_token: Some("refresh-old".to_string()),
        expires_in: Some(3600),
        token_type: Some("bearer".to_string()),
        scopes: None,
        obtained_at: Some(1),
    };
    let refreshed = BitbucketTokenResponse {
        access_token: "new".to_string(),
        refresh_token: None,
        expires_in: Some(7200),
        token_type: "bearer".to_string(),
        scopes: Some("repo".to_string()),
    };
    let merged = merge_refreshed_token(previous, refreshed, 5);
    assert_eq!(merged.access_token, "new");
    assert_eq!(merged.refresh_token.as_deref(), Some("refresh-old"));
    assert_eq!(merged.expires_in, Some(7200));
    assert_eq!(merged.obtained_at, Some(5));
}
