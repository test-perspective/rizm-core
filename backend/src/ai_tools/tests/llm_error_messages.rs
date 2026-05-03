use crate::ai_tools::build_llm_error_message;

#[test]
fn build_llm_error_message_401_with_openrouter_json_includes_api_key_hint() {
    let body = r#"{"error":{"message":"Invalid API key"}}"#;
    let msg = build_llm_error_message(401, body);
    assert!(msg.contains("Invalid API key"), "should mention API key");
    assert!(msg.contains("LLM settings"), "should hint at settings");
    assert!(msg.contains("Details:"), "should include provider details");
}

#[test]
fn build_llm_error_message_401_empty_body_returns_base_only() {
    let msg = build_llm_error_message(401, "");
    assert_eq!(msg, "Invalid API key. Please check your API key in LLM settings.");
}

#[test]
fn build_llm_error_message_429_returns_rate_limit() {
    let body = r#"{"error":{"message":"Rate limit exceeded"}}"#;
    let msg = build_llm_error_message(429, body);
    assert!(msg.contains("Rate limit exceeded"));
    assert!(msg.contains("try again later"));
}

#[test]
fn build_llm_error_message_invalid_json_returns_base_only() {
    let msg = build_llm_error_message(401, "not valid json");
    assert_eq!(msg, "Invalid API key. Please check your API key in LLM settings.");
}

#[test]
fn build_llm_error_message_500_returns_generic() {
    let msg = build_llm_error_message(500, "");
    assert_eq!(msg, "LLM provider error (HTTP 500).");
}
