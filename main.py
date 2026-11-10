from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import re
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Any

from fasthtml.common import fast_app, serve
from pymongo import MongoClient
from pymongo.collection import Collection
from pymongo.errors import DuplicateKeyError
from starlette.concurrency import run_in_threadpool
from starlette.requests import Request
from starlette.responses import FileResponse, JSONResponse, Response

logger = logging.getLogger(__name__)
SITE_DIR = Path(__file__).parent / "site"
ADMIN_SESSION_COOKIE = "folingoo_admin_session"
ADMIN_SESSION_SECONDS = 8 * 60 * 60
ADMIN_SESSION_PATTERN = re.compile(r"^(\d{10})\.([a-f0-9]{64})$")
EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
PAGE_SIZE = 50

_mongo_client: MongoClient[dict[str, Any]] | None = None
_mongo_index_ready = False
_mongo_lock = threading.Lock()


def fasthtml_key_file() -> str:
    if os.environ.get("VERCEL") == "1":
        return "/tmp/folingoo-fasthtml-sesskey"
    return ".sesskey"


app, rt = fast_app(
    static_path=str(SITE_DIR),
    default_hdrs=False,
    key_fname=fasthtml_key_file(),
)


def get_signup_collection() -> Collection[dict[str, Any]]:
    global _mongo_client, _mongo_index_ready

    uri = os.environ.get("MONGODB_URI")
    database_name = os.environ.get("MONGODB_DB")
    if not uri or not database_name:
        raise RuntimeError("Missing MongoDB configuration.")

    with _mongo_lock:
        if _mongo_client is None:
            _mongo_client = MongoClient(uri)

        collection = _mongo_client[database_name]["beta_signups"]
        if not _mongo_index_ready:
            collection.create_index("email", unique=True)
            _mongo_index_ready = True

    return collection


def parse_signup(body: object) -> tuple[dict[str, str] | None, str | None]:
    if not isinstance(body, dict):
        return None, "Please enter a valid email address and choose a device."

    email_value = body.get("email")
    email = email_value.strip().lower() if isinstance(email_value, str) else ""
    device = body.get("device")
    consent = body.get("contactConsent") in (True, "yes")

    if len(email) > 254 or not EMAIL_PATTERN.fullmatch(email) or ".." in email:
        return None, "Please enter a valid email address."
    if device not in ("ios", "android"):
        return None, "Please choose iOS or Android."
    if not consent:
        return None, "Please agree to receive beta access instructions by email."

    return {"email": email, "device": device}, None


def save_signup(signup: dict[str, str]) -> int:
    collection = get_signup_collection()
    update = {
        "$set": {"device": signup["device"]},
        "$setOnInsert": {"email": signup["email"], "createdAt": datetime.now().astimezone()},
    }

    try:
        result = collection.update_one({"email": signup["email"]}, update, upsert=True)
    except DuplicateKeyError:
        collection.update_one(
            {"email": signup["email"]},
            {"$set": {"device": signup["device"]}},
        )
        return 200

    return 201 if result.upserted_id is not None else 200


def configured_admin_credentials() -> tuple[str, str, str] | None:
    username = os.environ.get("ADMIN_USERNAME")
    password = os.environ.get("ADMIN_PASSWORD")
    secret = os.environ.get("ADMIN_SESSION_SECRET")
    if (
        not username
        or not password
        or len(username) > 1024
        or len(password) > 1024
        or not secret
        or len(secret.encode()) < 32
    ):
        return None
    return username, password, secret


def credentials_match(username: object, password: object) -> bool:
    configured = configured_admin_credentials()
    if (
        configured is None
        or not isinstance(username, str)
        or not isinstance(password, str)
        or len(username) > 1024
        or len(password) > 1024
    ):
        return False

    expected_username, expected_password, _ = configured
    username_matches = hmac.compare_digest(
        hashlib.sha256(username.encode()).digest(),
        hashlib.sha256(expected_username.encode()).digest(),
    )
    password_matches = hmac.compare_digest(
        hashlib.sha256(password.encode()).digest(),
        hashlib.sha256(expected_password.encode()).digest(),
    )
    return username_matches and password_matches


def create_admin_session(now: int | None = None) -> str | None:
    configured = configured_admin_credentials()
    if configured is None:
        return None

    expires_at = (int(time.time()) if now is None else now) + ADMIN_SESSION_SECONDS
    secret = configured[2].encode()
    signature = hmac.new(secret, str(expires_at).encode(), hashlib.sha256).hexdigest()
    return f"{expires_at}.{signature}"


def is_valid_admin_session(token: object, now: int | None = None) -> bool:
    configured = configured_admin_credentials()
    if configured is None or not isinstance(token, str):
        return False

    match = ADMIN_SESSION_PATTERN.fullmatch(token)
    current_time = int(time.time()) if now is None else now
    if match is None:
        return False

    expires_at = int(match.group(1))
    if expires_at <= current_time or expires_at > current_time + ADMIN_SESSION_SECONDS:
        return False

    expected = hmac.new(
        configured[2].encode(),
        match.group(1).encode(),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(match.group(2), expected)


def set_admin_cookie(response: Response, request: Request, token: str) -> None:
    response.set_cookie(
        ADMIN_SESSION_COOKIE,
        token,
        max_age=ADMIN_SESSION_SECONDS,
        path="/api/admin",
        secure=request.url.scheme == "https",
        httponly=True,
        samesite="strict",
    )


def signup_list(page: int) -> dict[str, Any]:
    collection = get_signup_collection()
    total = collection.count_documents({})
    records = (
        collection.find(
            {},
            {"_id": 0, "email": 1, "device": 1, "createdAt": 1},
        )
        .sort([("createdAt", -1), ("email", 1)])
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
    )
    signups = []
    for record in records:
        created_at = record.get("createdAt")
        signups.append(
            {
                "email": record.get("email", ""),
                "device": record.get("device", ""),
                "createdAt": created_at.isoformat() if isinstance(created_at, datetime) else None,
            }
        )

    return {
        "signups": signups,
        "page": page,
        "pageSize": PAGE_SIZE,
        "total": total,
        "totalPages": max(1, (total + PAGE_SIZE - 1) // PAGE_SIZE),
    }


@rt("/")
def get_home() -> FileResponse:
    return FileResponse(SITE_DIR / "index.html")


@rt("/admin")
def get_admin() -> FileResponse:
    return FileResponse(SITE_DIR / "admin.html")


@rt("/api/beta-signups", methods=["POST"])
async def post_beta_signup(req: Request) -> JSONResponse:
    try:
        body = await req.json()
    except (ValueError, json.JSONDecodeError):
        return JSONResponse(
            {"message": "Please enter a valid email address and choose a device."},
            status_code=400,
            headers={"Cache-Control": "no-store"},
        )

    signup, error = parse_signup(body)
    if error is not None:
        return JSONResponse(
            {"message": error},
            status_code=400,
            headers={"Cache-Control": "no-store"},
        )

    try:
        status_code = await run_in_threadpool(save_signup, signup)
    except Exception as error:
        logger.error(
            "Beta signup could not be saved.",
            extra={"errorName": type(error).__name__},
        )
        return JSONResponse(
            {"message": "We couldn’t save your request right now. Please try again later."},
            status_code=503,
            headers={"Cache-Control": "no-store"},
        )

    return JSONResponse(
        {"ok": True},
        status_code=status_code,
        headers={"Cache-Control": "no-store"},
    )


@rt("/api/admin/login", methods=["POST"])
async def post_admin_login(req: Request) -> JSONResponse:
    if configured_admin_credentials() is None:
        return JSONResponse(
            {"message": "Admin access is not configured correctly."},
            status_code=503,
            headers={"Cache-Control": "no-store"},
        )

    try:
        body = await req.json()
    except (ValueError, json.JSONDecodeError):
        body = None

    if not isinstance(body, dict) or not credentials_match(body.get("username"), body.get("password")):
        return JSONResponse(
            {"message": "The username or password is incorrect."},
            status_code=401,
            headers={"Cache-Control": "no-store"},
        )

    session = create_admin_session()
    if session is None:
        return JSONResponse(
            {"message": "Admin access is not configured correctly."},
            status_code=503,
            headers={"Cache-Control": "no-store"},
        )

    response = JSONResponse({"ok": True}, headers={"Cache-Control": "no-store"})
    set_admin_cookie(response, req, session)
    return response


@rt("/api/admin/logout", methods=["POST"])
def post_admin_logout(req: Request) -> JSONResponse:
    response = JSONResponse({"ok": True}, headers={"Cache-Control": "no-store"})
    response.delete_cookie(
        ADMIN_SESSION_COOKIE,
        path="/api/admin",
        secure=os.environ.get("VERCEL") == "1",
        httponly=True,
        samesite="strict",
    )
    return response


@rt("/api/admin/signups", methods=["GET"])
async def get_admin_signups(req: Request) -> JSONResponse:
    if not is_valid_admin_session(req.cookies.get(ADMIN_SESSION_COOKIE)):
        return JSONResponse(
            {"message": "Please sign in to view beta testers."},
            status_code=401,
            headers={"Cache-Control": "no-store"},
        )

    raw_page = req.query_params.get("page", "1")
    if not raw_page.isdecimal():
        return JSONResponse(
            {"message": "Invalid page number."},
            status_code=400,
            headers={"Cache-Control": "no-store"},
        )

    page = int(raw_page)
    if page < 1 or page > (2**53 - 1) // PAGE_SIZE:
        return JSONResponse(
            {"message": "Invalid page number."},
            status_code=400,
            headers={"Cache-Control": "no-store"},
        )

    try:
        result = await run_in_threadpool(signup_list, page)
    except Exception as error:
        logger.error(
            "Beta signup list could not be loaded.",
            extra={"errorName": type(error).__name__},
        )
        return JSONResponse(
            {"message": "The tester list is temporarily unavailable."},
            status_code=503,
            headers={"Cache-Control": "no-store"},
        )

    return JSONResponse(result, headers={"Cache-Control": "no-store"})


if __name__ == "__main__":
    serve()
