use axum::http::{header, HeaderMap};
use axum_extra::extract::cookie::{Cookie, SameSite};
use base64::Engine;
use rand::{rngs::OsRng, RngCore};

use crate::app_state::AppState;

pub(crate) fn normalize_email(email: &str) -> Option<String> {
    let e = email.trim().to_lowercase();
    if e.is_empty() || !e.contains('@') {
        return None;
    }
    Some(e)
}

pub(crate) fn build_session_cookie(state: &AppState, session_id: &str) -> Cookie<'static> {
    Cookie::build((state.auth.cookie_name.clone(), session_id.to_string()))
        .path("/")
        .http_only(true)
        .secure(state.auth.cookie_secure)
        .same_site(SameSite::Lax)
        .build()
}

pub(crate) fn get_cookie(headers: &HeaderMap, name: &str) -> Option<String> {
    let cookie = headers.get(header::COOKIE)?.to_str().ok()?;
    for part in cookie.split(';') {
        let part = part.trim();
        if let Some((k, v)) = part.split_once('=') {
            if k.trim() == name {
                return Some(v.trim().to_string());
            }
        }
    }
    None
}

pub(crate) fn new_session_id() -> String {
    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

pub fn hash_password_for_bootstrap(password: &str) -> String {
    use argon2::password_hash::{rand_core::OsRng, PasswordHasher, SaltString};
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = argon2::Argon2::default();
    argon2
        .hash_password(password.as_bytes(), &salt)
        .expect("hash password")
        .to_string()
}

pub(crate) fn verify_password(hash: &str, password: &str) -> bool {
    use argon2::password_hash::{PasswordHash, PasswordVerifier};
    let parsed = match PasswordHash::new(hash) {
        Ok(h) => h,
        Err(_) => return false,
    };
    argon2::Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok()
}

pub(crate) fn client_ip(headers: &HeaderMap) -> Option<String> {
    let xff = headers.get("x-forwarded-for")?.to_str().ok()?;
    let first = xff.split(',').next()?.trim();
    if first.is_empty() {
        None
    } else {
        Some(first.to_string())
    }
}

pub(crate) fn json_meta(email: &str, ip: &str) -> String {
    serde_json::json!({ "email": email, "ip": ip }).to_string()
}
