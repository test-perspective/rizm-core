use anyhow::Context;

use super::Db;

/// Per-project attachment usage: (project_id, project_name from projects row or None, count, total_size_bytes).
pub type AttachmentUsageRow = (String, Option<String>, i64, i64);

/// Per-project vec_entities row count: (project_id, row_count).
pub type VecEntitiesUsageRow = (String, i64);

impl Db {
    /// Aggregates attachment sizes from entities.properties_json.attachments[].size per project.
    /// Uses SQLite JSON functions; invalid or missing attachments are skipped.
    pub fn get_attachment_usage_per_project(&self) -> anyhow::Result<Vec<AttachmentUsageRow>> {
        let conn = self.pool.get().context("get sqlite conn")?;
        let sql = r#"
            SELECT e.project_id,
                   MAX(p.name) AS project_name,
                   COUNT(*) AS attachment_count,
                   COALESCE(SUM(CAST(json_extract(j.value, '$.size') AS INTEGER)), 0) AS total_size
            FROM entities e
            LEFT JOIN projects p ON p.id = e.project_id
            CROSS JOIN json_each(
                CASE
                    WHEN json_valid(e.properties_json) = 1
                         AND json_type(json_extract(e.properties_json, '$.attachments')) = 'array'
                    THEN json_extract(e.properties_json, '$.attachments')
                    ELSE NULL
                END
            ) AS j
            WHERE j.value IS NOT NULL
            GROUP BY e.project_id
            "#;
        let mut stmt = conn.prepare(sql).context("prepare attachment usage")?;
        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, i64>(3)?,
                ))
            })
            .context("query attachment usage")?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r?);
        }
        Ok(out)
    }

    /// Total attachment size (sum of all attachment sizes in metadata).
    pub fn get_attachment_usage_total(&self) -> anyhow::Result<i64> {
        let conn = self.pool.get().context("get sqlite conn")?;
        let sql = r#"
            SELECT COALESCE(SUM(CAST(json_extract(j.value, '$.size') AS INTEGER)), 0)
            FROM entities e
            CROSS JOIN json_each(
                CASE
                    WHEN json_valid(e.properties_json) = 1
                         AND json_type(json_extract(e.properties_json, '$.attachments')) = 'array'
                    THEN json_extract(e.properties_json, '$.attachments')
                    ELSE NULL
                END
            ) AS j
            WHERE j.value IS NOT NULL
            "#;
        let total: i64 = conn
            .query_row(sql, [], |row| row.get(0))
            .context("query attachment total")?;
        Ok(total)
    }

    /// Row counts per project in vec_entities. Returns (vec, total).
    /// On error (e.g. vec_entities not present), returns (vec![], 0) so admin UI does not break.
    pub fn get_vec_entities_usage(&self) -> anyhow::Result<(Vec<VecEntitiesUsageRow>, i64)> {
        let conn = self.pool.get().context("get sqlite conn")?;
        let sql = "SELECT project_id, COUNT(*) AS cnt FROM vec_entities GROUP BY project_id";
        let mut stmt = match conn.prepare(sql) {
            Ok(s) => s,
            Err(_) => return Ok((Vec::new(), 0)),
        };
        let rows = match stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        }) {
            Ok(r) => r,
            Err(_) => return Ok((Vec::new(), 0)),
        };
        let mut per_project = Vec::new();
        let mut total: i64 = 0;
        for r in rows {
            let row = r.context("vec_entities row")?;
            total += row.1;
            per_project.push(row);
        }
        Ok((per_project, total))
    }
}
