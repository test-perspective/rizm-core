use crate::models::{ProjectManifest, PropertyDefinition, PropertyType, ViewType};

pub fn extract_json_value(s: &str) -> Result<serde_json::Value, &'static str> {
    let mut t = s.trim();
    if t.is_empty() {
        return Err("empty model output");
    }

    // Fast path: already valid JSON.
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(t) {
        return Ok(v);
    }

    // Strip markdown code fences if present.
    if t.starts_with("```") {
        if let Some(end) = t.rfind("```") {
            let inner = &t[3..end];
            // Drop optional language hint line.
            let inner = inner.strip_prefix("json").unwrap_or(inner);
            let inner = inner.trim_matches(['\n', '\r', ' ']);
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(inner) {
                return Ok(v);
            }
            t = inner;
        }
    }

    // Heuristic: take first {...} block.
    let start = t.find('{').ok_or("no json object found")?;
    let end = t.rfind('}').ok_or("no json object found")?;
    if end <= start {
        return Err("no json object found");
    }
    let sub = &t[start..=end];
    serde_json::from_str::<serde_json::Value>(sub)
        .map_err(|_| "failed to parse json from model output")
}

pub fn extract_non_json_text(s: &str) -> Option<String> {
    let t = s.trim();
    if t.is_empty() {
        return None;
    }

    if serde_json::from_str::<serde_json::Value>(t).is_ok() {
        return None;
    }

    let start = t.find('{');
    let end = t.rfind('}');
    if let (Some(start), Some(end)) = (start, end) {
        if end > start {
            let candidate = &t[start..=end];
            if serde_json::from_str::<serde_json::Value>(candidate).is_ok() {
                let before = t[..start].trim();
                let after = t[end + 1..].trim();
                let merged = match (before.is_empty(), after.is_empty()) {
                    (true, true) => String::new(),
                    (false, true) => before.to_string(),
                    (true, false) => after.to_string(),
                    (false, false) => format!("{before}\n{after}"),
                };
                let merged = merged.trim().to_string();
                if merged.is_empty() {
                    return None;
                }
                return Some(merged);
            }
        }
    }

    Some(t.to_string())
}

pub fn extract_reasoning_text_from_json(v: &serde_json::Value) -> Option<String> {
    fn collect(node: &serde_json::Value, out: &mut Vec<String>) {
        let Some(obj) = node.as_object() else {
            return;
        };
        for (k, val) in obj {
            let key = k.to_ascii_lowercase();
            let is_reasoning_key = key.contains("reason")
                || key.contains("thinking")
                || key.contains("thought")
                || key == "analysis";
            if is_reasoning_key {
                if let Some(s) = val.as_str().map(str::trim).filter(|s| !s.is_empty()) {
                    out.push(s.to_string());
                }
            }
            match val {
                serde_json::Value::Object(_) => collect(val, out),
                serde_json::Value::Array(arr) => {
                    for child in arr {
                        collect(child, out);
                    }
                }
                _ => {}
            }
        }
    }

    let mut chunks = Vec::<String>::new();
    collect(v, &mut chunks);
    if chunks.is_empty() {
        return None;
    }
    Some(chunks.join("\n"))
}

pub fn validate_manifest(m: &ProjectManifest) -> Result<(), String> {
    if m.name.trim().is_empty() {
        return Err("manifest.name is required".to_string());
    }
    if m.entities.is_empty() {
        return Err("manifest.entities must not be empty".to_string());
    }
    if m.views.is_empty() {
        return Err("manifest.views must not be empty".to_string());
    }

    // entities + properties
    let mut entity_ids = std::collections::HashSet::<String>::new();
    let mut entity_prop_names: std::collections::HashMap<
        String,
        std::collections::HashSet<String>,
    > = std::collections::HashMap::new();

    for e in &m.entities {
        if e.id.trim().is_empty() {
            return Err("entities[].id must not be empty".to_string());
        }
        if e.name.trim().is_empty() {
            return Err(format!("entity '{}' name must not be empty", e.id));
        }
        if e.name_plural.trim().is_empty() {
            return Err(format!("entity '{}' namePlural must not be empty", e.id));
        }
        if !entity_ids.insert(e.id.clone()) {
            return Err(format!("duplicate entity id: {}", e.id));
        }

        let mut prop_names = std::collections::HashSet::<String>::new();
        for p in &e.properties {
            if p.name.trim().is_empty() {
                return Err(format!("entity '{}' property.name must not be empty", e.id));
            }
            if !prop_names.insert(p.name.clone()) {
                return Err(format!(
                    "entity '{}' has duplicate property name: {}",
                    e.id, p.name
                ));
            }
            if matches!(p.type_, PropertyType::Select) {
                if p.options
                    .as_ref()
                    .map(|opts| opts.is_empty())
                    .unwrap_or(false)
                {
                    return Err(format!(
                        "select property '{}' requires non-empty options",
                        p.name
                    ));
                }
            }
            if matches!(p.type_, PropertyType::Labels) {
                if let Some(opts) = p.options.as_ref() {
                    if opts.is_empty() {
                        return Err(format!(
                            "labels property '{}' requires non-empty options when provided",
                            p.name
                        ));
                    }
                    if opts.iter().any(|opt| opt.trim().is_empty()) {
                        return Err(format!(
                            "labels property '{}' options must be non-empty strings",
                            p.name
                        ));
                    }
                }
            }
        }
        entity_prop_names.insert(e.id.clone(), prop_names);
    }

    // views + defaultView
    let mut view_ids = std::collections::HashSet::<String>::new();
    for v in &m.views {
        if v.id.trim().is_empty() {
            return Err("view.id must not be empty".to_string());
        }
        if !view_ids.insert(v.id.clone()) {
            return Err(format!("duplicate view id: {}", v.id));
        }
        if v.entity_id.trim().is_empty() {
            return Err(format!("view '{}' entityId must not be empty", v.id));
        }
        let props = entity_prop_names.get(&v.entity_id).ok_or_else(|| {
            format!(
                "view '{}' references unknown entityId '{}'",
                v.id, v.entity_id
            )
        })?;

        for vp in &v.visible_properties {
            if !props.contains(vp) {
                return Err(format!(
                    "view '{}' references unknown property '{}'",
                    v.id, vp
                ));
            }
        }

        if matches!(v.type_, ViewType::Board) {
            let gb = v
                .group_by
                .as_deref()
                .ok_or_else(|| format!("board view '{}' requires groupBy", v.id))?;
            if !props.contains(gb) {
                return Err(format!(
                    "board view '{}' groupBy '{}' not found in entity '{}' properties",
                    v.id, gb, v.entity_id
                ));
            }
            // Board columns are driven by select options in the current UI implementation.
            let gb_prop = m
                .entities
                .iter()
                .find(|e| e.id == v.entity_id)
                .and_then(|e| e.properties.iter().find(|p| p.name == gb));
            if let Some(p) = gb_prop {
                if !matches!(p.type_, PropertyType::Select) {
                    return Err(format!(
                        "board view '{}' groupBy '{}' should be a select property",
                        v.id, gb
                    ));
                }
                if p.options.as_ref().map(|o| o.is_empty()).unwrap_or(true) {
                    return Err(format!(
                        "board view '{}' groupBy '{}' select property requires non-empty options",
                        v.id, gb
                    ));
                }
            }
        }
    }

    if !view_ids.contains(&m.default_view) {
        return Err("manifest.defaultView must match an existing view id".to_string());
    }

    Ok(())
}

pub fn normalize_manifest(mut m: ProjectManifest) -> ProjectManifest {
    // Convert deprecated view type "list" to "table" (frontend rejects "list").
    for v in &mut m.views {
        if matches!(v.type_, ViewType::List) {
            v.type_ = ViewType::Table;
        }
    }

    // Normalize "label-like" properties from AI output:
    // if the model emits select label/tags without options, convert to labels so free-form tags work.
    for entity in &mut m.entities {
        for prop in &mut entity.properties {
            let name = prop.name.trim().to_ascii_lowercase();
            let is_label_like = matches!(name.as_str(), "label" | "labels" | "tag" | "tags");
            if !is_label_like {
                continue;
            }
            if !matches!(prop.type_, PropertyType::Select) {
                continue;
            }
            let has_non_empty_options = prop
                .options
                .as_ref()
                .map(|opts| !opts.is_empty())
                .unwrap_or(false);
            if has_non_empty_options {
                continue;
            }
            prop.type_ = PropertyType::Labels;
            prop.options = None;
        }
    }

    // If the model proposes a board view grouped by a non-select property (or missing),
    // the current UI cannot build columns. We auto-fix per entity by ensuring a `status`
    // select exists and redirecting board `groupBy` to it.
    let mut entity_idx: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    for (i, e) in m.entities.iter().enumerate() {
        entity_idx.insert(e.id.clone(), i);
    }

    let status_name = "status".to_string();

    for v in &mut m.views {
        if !matches!(v.type_, ViewType::Board) {
            continue;
        }

        let Some(&ei) = entity_idx.get(&v.entity_id) else {
            continue;
        };

        let gb = v.group_by.clone().unwrap_or_else(|| status_name.clone());
        let mut needs_fix = true;
        {
            let entity = &m.entities[ei];
            if let Some(p) = entity.properties.iter().find(|p| p.name == gb) {
                if matches!(p.type_, PropertyType::Select)
                    && p.options.as_ref().map(|o| !o.is_empty()).unwrap_or(false)
                {
                    needs_fix = false;
                }
            }
        }

        if !needs_fix {
            continue;
        }

        let entity = &mut m.entities[ei];
        match entity.properties.iter_mut().find(|p| p.name == status_name) {
            Some(p) => {
                if !matches!(p.type_, PropertyType::Select) {
                    p.type_ = PropertyType::Select;
                }
                if p.options.as_ref().map(|o| o.is_empty()).unwrap_or(true) {
                    p.options = Some(vec![
                        "Todo".to_string(),
                        "In Progress".to_string(),
                        "Done".to_string(),
                    ]);
                }
                if p.visible.is_none() {
                    p.visible = Some(true);
                }
            }
            None => {
                entity.properties.push(PropertyDefinition {
                    name: status_name.clone(),
                    type_: PropertyType::Select,
                    options: Some(vec![
                        "Todo".to_string(),
                        "In Progress".to_string(),
                        "Done".to_string(),
                    ]),
                    visible: Some(true),
                });
            }
        }

        v.group_by = Some(status_name.clone());
        if !v.visible_properties.iter().any(|p| p == &status_name) {
            v.visible_properties.push(status_name.clone());
        }
    }

    m
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{EntityDefinition, PropertyDefinition, PropertyType, ViewConfig, ViewType};

    fn base_manifest() -> ProjectManifest {
        ProjectManifest {
            name: "Test".to_string(),
            entities: vec![EntityDefinition {
                id: "task".to_string(),
                name: "Task".to_string(),
                name_plural: "Tasks".to_string(),
                properties: vec![PropertyDefinition {
                    name: "title".to_string(),
                    type_: PropertyType::Text,
                    options: None,
                    visible: Some(true),
                }],
                default_view: Some("table".to_string()),
            }],
            views: vec![ViewConfig {
                id: "table".to_string(),
                name: "Table".to_string(),
                type_: ViewType::Table,
                entity_id: "task".to_string(),
                group_by: None,
                visible_properties: vec!["title".to_string()],
                sort_by: Some("updatedAt".to_string()),
                sort_order: Some(crate::models::SortOrder::Desc),
                column_order: None,
                hidden_columns: None,
                board_dividers: None,
            }],
            default_view: "table".to_string(),
        }
    }

    #[test]
    fn validate_manifest_accepts_labels_without_options() {
        let mut manifest = base_manifest();
        manifest.entities[0].properties.push(PropertyDefinition {
            name: "labels".to_string(),
            type_: PropertyType::Labels,
            options: None,
            visible: Some(true),
        });
        assert!(validate_manifest(&manifest).is_ok());
    }

    #[test]
    fn extract_non_json_text_returns_none_for_json_only() {
        let out = extract_non_json_text(r#"{"manifest":{"name":"X"}}"#);
        assert_eq!(out, None);
    }

    #[test]
    fn extract_non_json_text_keeps_prefix_and_suffix() {
        let out = extract_non_json_text(r#"Thinking... {"manifest":{"name":"X"}} done."#);
        assert_eq!(out, Some("Thinking...\ndone.".to_string()));
    }

    #[test]
    fn extract_non_json_text_keeps_plain_text() {
        let out = extract_non_json_text("Need to check schema before final JSON");
        assert_eq!(
            out,
            Some("Need to check schema before final JSON".to_string())
        );
    }

    #[test]
    fn extract_reasoning_text_from_json_collects_reasoning_keys() {
        let v = serde_json::json!({
            "manifest": {"name":"X"},
            "reasoning": "First thought",
            "meta": {"analysis": "Second thought"}
        });
        let out = extract_reasoning_text_from_json(&v).expect("expected reasoning text");
        assert!(out.contains("First thought"));
        assert!(out.contains("Second thought"));
    }

    #[test]
    fn normalize_manifest_converts_label_select_without_options_to_labels() {
        let mut manifest = base_manifest();
        manifest.entities[0].properties.push(PropertyDefinition {
            name: "labels".to_string(),
            type_: PropertyType::Select,
            options: None,
            visible: Some(true),
        });
        let normalized = normalize_manifest(manifest);
        let labels = normalized.entities[0]
            .properties
            .iter()
            .find(|p| p.name == "labels")
            .expect("labels property");
        assert!(matches!(labels.type_, PropertyType::Labels));
        assert!(labels.options.is_none());
    }

    #[test]
    fn normalize_manifest_converts_list_view_to_table() {
        let mut manifest = base_manifest();
        manifest.views[0].type_ = ViewType::List;
        let normalized = normalize_manifest(manifest);
        assert!(
            matches!(normalized.views[0].type_, ViewType::Table),
            "list view should be converted to table"
        );
    }
}
