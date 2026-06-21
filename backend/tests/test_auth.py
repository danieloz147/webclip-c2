import pytest
from backend.auth import create_access_token, verify_token, hash_password, verify_password, generate_api_key

def test_hash_and_verify_password():
    hashed = hash_password("mypassword")
    assert verify_password("mypassword", hashed)
    assert not verify_password("wrong", hashed)

def test_create_and_verify_token():
    token = create_access_token({"sub": "42", "role": "admin"})
    payload = verify_token(token)
    assert payload["sub"] == "42"
    assert payload["role"] == "admin"

def test_verify_expired_token_raises():
    import jwt
    token = create_access_token({"sub": "1"}, expire_minutes=-1)
    with pytest.raises(jwt.ExpiredSignatureError):
        verify_token(token)

def test_generate_api_key_length():
    key = generate_api_key()
    assert len(key) == 64
