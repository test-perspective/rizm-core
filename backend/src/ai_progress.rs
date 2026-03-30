use serde::Serialize;
use tokio::sync::mpsc;

use crate::models::ProjectManifest;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScmConfigResult {
    pub workspace: String,
    pub repo_slug: String,
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum AiProgressEvent {
    Phase { message: String },
    ToolCall { name: String },
    LlmOutput { text: String },
    Result {
        manifest: ProjectManifest,
        #[serde(rename = "scmConfig")]
        #[serde(skip_serializing_if = "Option::is_none")]
        scm_config: Option<ScmConfigResult>,
    },
    ChatResult { message: String },
    Error { message: String },
}

#[derive(Clone, Debug)]
pub struct AiProgressSender {
    tx: mpsc::Sender<String>,
}

impl AiProgressSender {
    pub fn new(tx: mpsc::Sender<String>) -> Self {
        Self { tx }
    }

    pub async fn send(&self, event: AiProgressEvent) -> Result<(), ()> {
        let line = serde_json::to_string(&event).map_err(|_| ())? + "\n";
        self.tx.send(line).await.map_err(|_| ())
    }
}

#[cfg(test)]
mod tests {
    use super::AiProgressEvent;

    #[test]
    fn serializes_llm_output_event_type() {
        let event = AiProgressEvent::LlmOutput {
            text: "Thinking...".to_string(),
        };
        let encoded = serde_json::to_string(&event).expect("serialize llm output");
        assert_eq!(encoded, r#"{"type":"llmOutput","text":"Thinking..."}"#);
    }
}
