use anyhow::Context;
use serde_json::Value;

pub fn parse_jsonrpc_request(v: &Value) -> anyhow::Result<(Option<Value>, String, Value)> {
    let obj = v.as_object().context("request must be a json object")?;
    let jsonrpc = obj
        .get("jsonrpc")
        .and_then(Value::as_str)
        .unwrap_or("2.0");
    if jsonrpc != "2.0" {
        anyhow::bail!("unsupported jsonrpc version");
    }
    let id = obj.get("id").cloned();
    let method = obj
        .get("method")
        .and_then(Value::as_str)
        .context("missing method")?
        .to_string();
    let params = obj.get("params").cloned().unwrap_or_else(|| Value::Null);
    Ok((id, method, params))
}

pub fn read_string_arg(args: &Value, keys: &[&str]) -> Option<String> {
    let obj = args.as_object()?;
    for k in keys {
        if let Some(s) = obj.get(*k).and_then(Value::as_str) {
            let s = s.trim();
            if !s.is_empty() {
                return Some(s.to_string());
            }
        }
    }
    None
}

pub fn read_string_array_arg(args: &Value, keys: &[&str]) -> Option<Vec<String>> {
    let obj = args.as_object()?;
    for k in keys {
        if let Some(v) = obj.get(*k) {
            if let Some(arr) = v.as_array() {
                let items: Vec<String> = arr
                    .iter()
                    .filter_map(|x| x.as_str())
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect();
                if !items.is_empty() {
                    return Some(items);
                }
            }
            if let Some(s) = v.as_str() {
                let s = s.trim();
                if !s.is_empty() {
                    return Some(vec![s.to_string()]);
                }
            }
        }
    }
    None
}

pub fn tool_text_result(text: String) -> Value {
    serde_json::json!({
        "content": [
            { "type": "text", "text": text }
        ],
        "isError": false
    })
}

pub fn tool_error_result(message: String) -> Value {
    serde_json::json!({
        "content": [
            { "type": "text", "text": message }
        ],
        "isError": true
    })
}

pub fn ok_response(id: Value, result: Value) -> Value {
    serde_json::json!({
        "jsonrpc": "2.0",
        "id": id,
        "result": result
    })
}

pub fn error_response(id: Value, code: i64, message: &str) -> Value {
    serde_json::json!({
        "jsonrpc": "2.0",
        "id": id,
        "error": {
            "code": code,
            "message": message
        }
    })
}
