use crate::auth::{AuthedUser, Role};
use crate::ApiError;

pub(crate) fn ensure_admin(user: &AuthedUser) -> Result<(), ApiError> {
    if user.role != Role::Admin {
        return Err(ApiError::forbidden("forbidden"));
    }
    Ok(())
}

pub(crate) fn normalize_email(email: &str) -> Option<String> {
    let e = email.trim().to_lowercase();
    if e.is_empty() || !e.contains('@') {
        return None;
    }
    Some(e)
}

pub(crate) fn generate_temp_password() -> String {
    use rand::{distributions::Alphanumeric, Rng};
    let mut rng = rand::thread_rng();
    (0..16).map(|_| rng.sample(Alphanumeric) as char).collect()
}

pub(crate) fn hash_password(password: &str) -> String {
    use argon2::password_hash::{rand_core::OsRng, PasswordHasher, SaltString};
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = argon2::Argon2::default();
    argon2
        .hash_password(password.as_bytes(), &salt)
        .expect("hash password")
        .to_string()
}
