//! BlockNote JSON detection and normalization helpers.

use serde_json::Value;

/// True if `s` is a JSON array of BlockNote blocks (each object has non-empty string `type`).
pub fn is_blocknote_doc_json_string(s: &str) -> bool {
    let t = s.trim();
    if !t.starts_with('[') {
        return false;
    }
    let Ok(arr) = serde_json::from_str::<Vec<Value>>(t) else {
        return false;
    };
    if arr.is_empty() {
        return true;
    }
    arr.iter().all(|b| {
        b.as_object()
            .and_then(|o| o.get("type"))
            .and_then(|ty| ty.as_str())
            .map(|x| !x.is_empty())
            .unwrap_or(false)
    })
}

fn strip_blocknote_ids(v: &mut Value) {
    match v {
        Value::Array(items) => {
            for x in items {
                strip_blocknote_ids(x);
            }
        }
        Value::Object(map) => {
            map.remove("id");
            for (_, x) in map.iter_mut() {
                strip_blocknote_ids(x);
            }
        }
        _ => {}
    }
}

/// Sort object keys so two logically equal BlockNote JSON trees compare equal after id stripping.
fn canonicalize_json_value(v: &Value) -> Value {
    match v {
        Value::Array(items) => Value::Array(items.iter().map(canonicalize_json_value).collect()),
        Value::Object(map) => {
            let mut keys: Vec<String> = map.keys().cloned().collect();
            keys.sort();
            let mut out = serde_json::Map::new();
            for k in keys {
                if let Some(x) = map.get(&k) {
                    out.insert(k, canonicalize_json_value(x));
                }
            }
            Value::Object(out)
        }
        x => x.clone(),
    }
}

pub(super) fn blocknote_json_semantic_equal(a: &str, b: &str) -> bool {
    let Ok(mut va) = serde_json::from_str::<Value>(a) else {
        return false;
    };
    let Ok(mut vb) = serde_json::from_str::<Value>(b) else {
        return false;
    };
    strip_blocknote_ids(&mut va);
    strip_blocknote_ids(&mut vb);
    canonicalize_json_value(&va) == canonicalize_json_value(&vb)
}
