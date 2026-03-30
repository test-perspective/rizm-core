//! BlockNote-shaped JSON helpers shared by ADF and wiki conversion.

use serde_json::{json, Value};

pub(crate) fn block_props() -> Value {
    json!({
        "backgroundColor": "default",
        "textColor": "default",
        "textAlignment": "left"
    })
}

pub fn image_block(url: &str) -> Value {
    let id = uuid::Uuid::new_v4().to_string();
    json!({
        "id": id,
        "type": "image",
        "props": {
            "textAlignment": "left",
            "backgroundColor": "default",
            "url": url,
            "caption": "",
            "previewWidth": 512,
            "showPreview": true
        },
        "children": []
    })
}

pub fn paragraph_file_attachment(url: &str, filename: &str) -> Value {
    let id = uuid::Uuid::new_v4().to_string();
    let text = format!("Attachment: {} — {}", filename, url);
    json!({
        "id": id,
        "type": "paragraph",
        "props": block_props(),
        "content": [{
            "type": "text",
            "text": text,
            "styles": {}
        }],
        "children": []
    })
}
