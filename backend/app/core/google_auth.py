from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from app.core.config import settings
from typing import Optional, Dict
import json

# OAuth 2.0 scopes
SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile'
]

def get_google_flow():
    """Create and return Google OAuth flow"""
    client_config = {
        "web": {
            "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [settings.GOOGLE_REDIRECT_URI]
        }
    }
    
    flow = Flow.from_client_config(
        client_config,
        scopes=SCOPES,
        redirect_uri=settings.GOOGLE_REDIRECT_URI
    )
    
    return flow

def get_authorization_url(state: Optional[str] = None):
    """Get Google OAuth authorization URL"""
    flow = get_google_flow()
    authorization_url, state = flow.authorization_url(
        access_type='offline',
        include_granted_scopes='true',
        state=state,
        prompt='consent'
    )
    return authorization_url, state

def exchange_code_for_tokens(code: str) -> Dict:
    """Exchange authorization code for access and refresh tokens"""
    flow = get_google_flow()
    flow.fetch_token(code=code)
    
    credentials = flow.credentials
    
    return {
        "token": credentials.token,
        "refresh_token": credentials.refresh_token,
        "token_uri": credentials.token_uri,
        "client_id": credentials.client_id,
        "client_secret": credentials.client_secret,
        "scopes": credentials.scopes,
        "expiry": credentials.expiry.isoformat() if credentials.expiry else None
    }

def refresh_access_token(refresh_token: str, client_id: str, client_secret: str) -> Dict:
    """Refresh expired access token using refresh token"""
    creds = Credentials(
        token=None,
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=client_id,
        client_secret=client_secret
    )
    
    creds.refresh(Request())
    
    return {
        "token": creds.token,
        "expiry": creds.expiry.isoformat() if creds.expiry else None
    }

