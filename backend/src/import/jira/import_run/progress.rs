/// How often to persist import job progress (SQLite). Higher = faster bulk import; `1` = every issue (debug).
pub(super) fn jira_import_progress_flush_interval() -> i64 {
    const DEFAULT: i64 = 20;
    match std::env::var("KEEL_JIRA_IMPORT_PROGRESS_INTERVAL") {
        Ok(s) => s.parse::<i64>().unwrap_or(DEFAULT).max(1),
        Err(_) => DEFAULT,
    }
}

pub(super) fn jira_import_progress_should_flush(
    partial_done: i64,
    last_flushed_partial: i64,
    total_issues: i64,
    interval: i64,
    end_of_fetched_page: bool,
) -> bool {
    if total_issues <= 0 {
        return false;
    }
    if interval <= 1 {
        return true;
    }
    if partial_done >= total_issues {
        return true;
    }
    if last_flushed_partial == 0 {
        return true;
    }
    if partial_done - last_flushed_partial >= interval {
        return true;
    }
    end_of_fetched_page
}

#[cfg(test)]
mod tests {
    use super::jira_import_progress_should_flush;

    #[test]
    fn flush_interval_one_always_when_total_positive() {
        assert!(jira_import_progress_should_flush(1, 0, 10, 1, false));
        assert!(jira_import_progress_should_flush(5, 4, 10, 1, false));
    }

    #[test]
    fn flush_first_and_every_interval() {
        assert!(jira_import_progress_should_flush(1, 0, 100, 25, false));
        assert!(!jira_import_progress_should_flush(10, 1, 100, 25, false));
        assert!(jira_import_progress_should_flush(26, 1, 100, 25, false));
    }

    #[test]
    fn flush_end_of_page_even_if_below_interval() {
        assert!(!jira_import_progress_should_flush(99, 76, 1000, 25, false));
        assert!(jira_import_progress_should_flush(100, 76, 1000, 25, true));
    }

    #[test]
    fn flush_when_reached_total() {
        assert!(jira_import_progress_should_flush(1000, 990, 1000, 25, false));
    }

    #[test]
    fn no_flush_when_total_unknown() {
        assert!(!jira_import_progress_should_flush(1, 0, 0, 25, true));
    }
}
