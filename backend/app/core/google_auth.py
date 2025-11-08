from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from app.core.config import settings
from typing import Optional, Dict
import json
import os

# Allow insecure transport for localhost development (HTTP instead of HTTPS)
os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'

# OAuth 2.0 scopes
# Note: 'openid' is automatically added by Google, so we include it explicitly
# Updated to include write permissions for email and calendar management
SCOPES = [
    'openid',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.modify',  # For email actions (reply, forward, delete, mark read/unread)
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar',  # For meeting CRUD operations
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

def exchange_code_for_tokens(code: str, authorization_response_url: Optional[str] = None) -> Dict:
    """Exchange authorization code for access and refresh tokens"""
    flow = get_google_flow()
    
    # For localhost, use code directly instead of full URL to avoid HTTPS requirement
    # Use authorization_response_url only if it's HTTPS (production)
    if authorization_response_url and authorization_response_url.startswith('https://'):
        try:
            flow.fetch_token(authorization_response=authorization_response_url)
        except Exception as e:
            # Fallback to code-only if URL approach fails
            flow.fetch_token(code=code)
    else:
        # For localhost (HTTP), use code directly
        try:
            print(f"Fetching token with code (length: {len(code) if code else 0})...")
            flow.fetch_token(code=code)
            print("Token fetched successfully")
        except Exception as e:
            error_msg = str(e)
            print(f"Error fetching token: {error_msg}")
            # If scope mismatch, try without strict validation
            if "Scope has changed" in error_msg:
                print("Attempting to fetch token without strict scope validation...")
                # Create flow without scope validation
                client_config = {
                    "web": {
                        "client_id": settings.GOOGLE_CLIENT_ID,
                        "client_secret": settings.GOOGLE_CLIENT_SECRET,
                        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                        "token_uri": "https://oauth2.googleapis.com/token",
                        "redirect_uris": [settings.GOOGLE_REDIRECT_URI]
                    }
                }
                # Create flow with all possible scopes to avoid validation error
                flow = Flow.from_client_config(
                    client_config,
                    scopes=None,  # Don't validate scopes strictly
                    redirect_uri=settings.GOOGLE_REDIRECT_URI
                )
                flow.fetch_token(code=code)
                print("Token fetched successfully with relaxed scope validation")
            else:
                print(f"Raising error: {error_msg}")
                raise
    
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

