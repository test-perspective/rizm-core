use serde_json::json;
use uuid::Uuid;

pub(super) fn generate_task_title<R: rand::Rng>(rng: &mut R) -> String {
    let verbs = vec![
        "Implement",
        "Design",
        "Refactor",
        "Fix",
        "Optimize",
        "Review",
        "Test",
        "Document",
        "Deploy",
        "Configure",
        "Update",
        "Create",
        "Add",
        "Remove",
        "Improve",
        "Analyze",
    ];
    let nouns = vec![
        "user authentication",
        "database schema",
        "API endpoint",
        "UI component",
        "error handling",
        "performance",
        "security",
        "logging",
        "caching",
        "validation",
        "migration",
        "integration",
        "dashboard",
        "reporting",
        "notification",
        "search",
        "filtering",
        "pagination",
    ];
    let contexts = vec![
        "for production",
        "in staging",
        "across modules",
        "with tests",
        "for mobile",
        "in the backend",
        "on the frontend",
        "for admins",
        "for users",
    ];

    let verb = &verbs[rng.gen_range(0..verbs.len())];
    let noun = &nouns[rng.gen_range(0..nouns.len())];
    let context = if rng.gen_bool(0.5) {
        format!(" {}", contexts[rng.gen_range(0..contexts.len())])
    } else {
        String::new()
    };
    format!("{} {}{}", verb, noun, context)
}

pub(super) fn generate_task_description<R: rand::Rng>(
    rng: &mut R,
    project_key: &str,
    task_num: usize,
) -> String {
    let task_key = format!("{}-{}", project_key, task_num);
    let paragraphs = vec![
        "This task involves implementing the requested feature.".to_string(),
        format!("Related to task {}", task_key),
        "Please review the requirements before starting.".to_string(),
    ];

    let mut blocks = Vec::new();
    blocks.push(json!({
        "id": Uuid::new_v4().to_string(),
        "type": "heading",
        "props": { "level": 2 },
        "content": [{"type": "text", "text": "Description"}],
        "children": []
    }));

    for para in paragraphs.iter().take(rng.gen_range(1..=3)) {
        blocks.push(json!({
            "id": Uuid::new_v4().to_string(),
            "type": "paragraph",
            "content": [{"type": "text", "text": para}],
            "children": []
        }));
    }

    if rng.gen_bool(0.7) {
        let items = vec![
            "Check existing implementation",
            "Write unit tests",
            "Update documentation",
        ];
        for item in items.iter().take(rng.gen_range(2..=3)) {
            blocks.push(json!({
                "id": Uuid::new_v4().to_string(),
                "type": "bulletListItem",
                "content": [{"type": "text", "text": item}],
                "children": []
            }));
        }
    }

    serde_json::to_string(&blocks).unwrap_or_else(|_| "[]".to_string())
}

pub(super) fn generate_wiki_title<R: rand::Rng>(rng: &mut R) -> String {
    let prefixes = vec![
        "Meeting Notes",
        "Design Document",
        "Architecture",
        "Requirements",
        "User Guide",
        "API Documentation",
        "Troubleshooting",
        "Best Practices",
        "FAQ",
        "Changelog",
    ];
    let topics = vec![
        "Authentication",
        "Database",
        "Frontend",
        "Backend",
        "Deployment",
        "Testing",
        "Performance",
        "Security",
        "Integration",
        "Migration",
    ];

    let prefix = &prefixes[rng.gen_range(0..prefixes.len())];
    let topic = &topics[rng.gen_range(0..topics.len())];
    format!("{}: {}", prefix, topic)
}

pub(super) fn generate_wiki_doc<R: rand::Rng>(
    rng: &mut R,
    project_key: &str,
    max_task_seq: usize,
) -> String {
    let mut blocks = Vec::new();
    blocks.push(json!({
        "id": Uuid::new_v4().to_string(),
        "type": "heading",
        "props": { "level": 2 },
        "content": [{"type": "text", "text": "Overview"}],
        "children": []
    }));

    let summaries = vec![
        "This page summarizes current scope and open questions.",
        "Quick notes captured during recent sync.",
        "High-level context and background for this area.",
    ];
    blocks.push(json!({
        "id": Uuid::new_v4().to_string(),
        "type": "paragraph",
        "content": [{"type": "text", "text": summaries[rng.gen_range(0..summaries.len())]}],
        "children": []
    }));

    blocks.push(json!({
        "id": Uuid::new_v4().to_string(),
        "type": "heading",
        "props": { "level": 3 },
        "content": [{"type": "text", "text": "Key Points"}],
        "children": []
    }));

    let points = vec![
        "Confirm scope with stakeholders",
        "Track risks and dependencies",
        "Keep changes small and reviewable",
        "Align on acceptance criteria",
    ];
    for point in points.iter().take(rng.gen_range(2..=4)) {
        blocks.push(json!({
            "id": Uuid::new_v4().to_string(),
            "type": "bulletListItem",
            "content": [{"type": "text", "text": point}],
            "children": []
        }));
    }

    blocks.push(json!({
        "id": Uuid::new_v4().to_string(),
        "type": "heading",
        "props": { "level": 3 },
        "content": [{"type": "text", "text": "Decisions"}],
        "children": []
    }));
    let ref_task = if max_task_seq > 0 {
        format!("{}-{}", project_key, rng.gen_range(1..=max_task_seq))
    } else {
        format!("{}-1", project_key)
    };
    blocks.push(json!({
        "id": Uuid::new_v4().to_string(),
        "type": "paragraph",
        "content": [{"type": "text", "text": format!("Follow up with task {} for implementation details.", ref_task)}],
        "children": []
    }));

    if rng.gen_bool(0.5) {
        blocks.push(json!({
            "id": Uuid::new_v4().to_string(),
            "type": "heading",
            "props": { "level": 3 },
            "content": [{"type": "text", "text": "Next Steps"}],
            "children": []
        }));
        let steps = vec![
            "Validate with QA",
            "Prepare rollout checklist",
            "Update project wiki",
        ];
        for step in steps.iter().take(rng.gen_range(1..=2)) {
            blocks.push(json!({
                "id": Uuid::new_v4().to_string(),
                "type": "bulletListItem",
                "content": [{"type": "text", "text": step}],
                "children": []
            }));
        }
    }

    serde_json::to_string(&blocks).unwrap_or_else(|_| "[]".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::rngs::StdRng;
    use rand::SeedableRng;

    #[test]
    fn task_description_is_blocknote_array_json() {
        let mut rng = StdRng::seed_from_u64(42);
        let doc = generate_task_description(&mut rng, "PRJ001", 7);
        let value: serde_json::Value = serde_json::from_str(&doc).expect("parse json");
        assert!(value.is_array(), "task description should be JSON array");
    }

    #[test]
    fn wiki_doc_is_blocknote_array_json() {
        let mut rng = StdRng::seed_from_u64(123);
        let doc = generate_wiki_doc(&mut rng, "PRJ001", 10);
        let value: serde_json::Value = serde_json::from_str(&doc).expect("parse json");
        assert!(value.is_array(), "wiki doc should be JSON array");
    }
}
