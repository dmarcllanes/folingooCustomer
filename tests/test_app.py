from __future__ import annotations

from datetime import datetime, timezone

from starlette.testclient import TestClient

import main


def test_fasthtml_uses_writable_session_key_path_on_vercel(monkeypatch) -> None:
    monkeypatch.setenv("VERCEL", "1")
    assert main.fasthtml_key_file() == "/tmp/folingoo-fasthtml-sesskey"

    monkeypatch.delenv("VERCEL")
    assert main.fasthtml_key_file() == ".sesskey"


def test_fast_html_serves_landing_page_and_assets() -> None:
    with TestClient(main.app) as client:
        homepage = client.get("/")
        admin_page = client.get("/admin.html")
        stylesheet = client.get("/styles.css")

    assert homepage.status_code == 200
    assert "Join the Folingoo beta." in homepage.text
    assert admin_page.status_code == 200
    assert 'id="admin-username"' in admin_page.text
    assert stylesheet.status_code == 200
    assert "font-family: Nunito" in stylesheet.text


def test_privacy_page_is_served_and_linked_from_home() -> None:
    with TestClient(main.app) as client:
        homepage = client.get("/")
        privacy = client.get("/privacy")

    assert privacy.status_code == 200
    assert "Privacy at Folingoo" in privacy.text
    assert "mailto:dandigital1688@gmail.com" in privacy.text
    assert 'href="/privacy"' in homepage.text
    assert "mailto:dandigital1688@gmail.com" in homepage.text
    assert "[NEEDS CONFIRMATION: support email]" not in homepage.text


def test_parse_signup_normalizes_valid_signup() -> None:
    signup, error = main.parse_signup(
        {"email": "  TEST@Example.com ", "device": "ios", "contactConsent": "yes"}
    )

    assert error is None
    assert signup == {"email": "test@example.com", "device": "ios"}


def test_parse_signup_rejects_invalid_values() -> None:
    assert "valid email" in main.parse_signup(
        {"email": "invalid", "device": "ios", "contactConsent": "yes"}
    )[1]
    assert "choose iOS or Android" in main.parse_signup(
        {"email": "test@example.com", "device": "other", "contactConsent": "yes"}
    )[1]
    assert "agree" in main.parse_signup(
        {"email": "test@example.com", "device": "android"}
    )[1]
    assert main.parse_signup([])[0] is None


def test_signup_endpoint_saves_valid_request(monkeypatch) -> None:
    saved: list[dict[str, str]] = []

    def save_signup(signup: dict[str, str]) -> int:
        saved.append(signup)
        return 201

    monkeypatch.setattr(main, "save_signup", save_signup)
    with TestClient(main.app) as client:
        response = client.post(
            "/api/beta-signups",
            json={"email": "TEST@example.com", "device": "android", "contactConsent": "yes"},
        )

    assert response.status_code == 201
    assert response.json() == {"ok": True}
    assert response.headers["cache-control"] == "no-store"
    assert saved == [{"email": "test@example.com", "device": "android"}]


def test_signup_endpoint_rejects_invalid_input_without_saving(monkeypatch) -> None:
    monkeypatch.setattr(
        main,
        "save_signup",
        lambda signup: (_ for _ in ()).throw(AssertionError("must not save invalid input")),
    )
    with TestClient(main.app) as client:
        response = client.post(
            "/api/beta-signups",
            json={"email": "invalid", "device": "ios", "contactConsent": True},
        )

    assert response.status_code == 400
    assert "valid email" in response.json()["message"]


def test_signup_endpoint_surfaces_storage_failure_safely(monkeypatch) -> None:
    def fail_signup(signup: dict[str, str]) -> int:
        raise RuntimeError("private database connection detail")

    monkeypatch.setattr(main, "save_signup", fail_signup)
    with TestClient(main.app) as client:
        response = client.post(
            "/api/beta-signups",
            json={"email": "test@example.com", "device": "ios", "contactConsent": "yes"},
        )

    assert response.status_code == 503
    assert "private database connection detail" not in response.text


def configure_admin(monkeypatch) -> tuple[str, str, str]:
    username = "beta-admin"
    password = "test-admin-password"
    secret = "test-signing-secret-that-is-at-least-32-bytes"
    monkeypatch.setenv("ADMIN_USERNAME", username)
    monkeypatch.setenv("ADMIN_PASSWORD", password)
    monkeypatch.setenv("ADMIN_SESSION_SECRET", secret)
    return username, password, secret


def test_admin_login_requires_both_credentials_and_sets_signed_cookie(monkeypatch) -> None:
    username, password, _ = configure_admin(monkeypatch)
    with TestClient(main.app) as client:
        rejected = client.post(
            "/api/admin/login",
            json={"username": username, "password": "wrong"},
        )
        accepted = client.post(
            "/api/admin/login",
            json={"username": username, "password": password},
        )

    assert rejected.status_code == 401
    assert accepted.status_code == 200
    cookie = accepted.cookies.get(main.ADMIN_SESSION_COOKIE)
    assert cookie is not None
    assert main.is_valid_admin_session(cookie)
    assert accepted.headers["set-cookie"].lower().find("httponly") >= 0


def test_admin_list_requires_login_and_returns_paged_testers(monkeypatch) -> None:
    configure_admin(monkeypatch)
    monkeypatch.setattr(
        main,
        "signup_list",
        lambda page: {
            "signups": [{
                "email": "tester@example.com",
                "device": "ios",
                "createdAt": datetime(2026, 11, 10, tzinfo=timezone.utc).isoformat(),
            }],
            "page": page,
            "pageSize": 50,
            "total": 1,
            "totalPages": 1,
        },
    )

    with TestClient(main.app) as client:
        denied = client.get("/api/admin/signups")
        client.post(
            "/api/admin/login",
            json={"username": "beta-admin", "password": "test-admin-password"},
        )
        listed = client.get("/api/admin/signups?page=1")

    assert denied.status_code == 401
    assert listed.status_code == 200
    assert listed.json()["signups"][0]["email"] == "tester@example.com"
    assert listed.json()["pageSize"] == 50


def test_admin_logout_clears_session_cookie(monkeypatch) -> None:
    configure_admin(monkeypatch)
    with TestClient(main.app) as client:
        login = client.post(
            "/api/admin/login",
            json={"username": "beta-admin", "password": "test-admin-password"},
        )
        assert login.status_code == 200
        assert client.cookies.get(main.ADMIN_SESSION_COOKIE)
        response = client.post("/api/admin/logout")

    assert response.status_code == 200
    assert "max-age=0" in response.headers["set-cookie"].lower()
