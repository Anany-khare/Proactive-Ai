from sqlalchemy.orm import Session
from app.core.models import User, ServiceToken
from app.core.config import settings
from datetime import datetime, timezone
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request

def get_google_credentials(user: User, db: Session) -> dict:
    """Get decrypted Google credentials for user, refreshing if expired"""
    
    service_token = db.query(ServiceToken).filter(
        ServiceToken.user_id == user.id,
        ServiceToken.service_name == 'google'
    ).first()
    
    if not service_token:
        return None
    
    try:
        # Decrypt tokens
        access_token = ServiceToken.decrypt_token(service_token.access_token_encrypted)
        refresh_token = ServiceToken.decrypt_token(service_token.refresh_token_encrypted) if service_token.refresh_token_encrypted else None
        
        # Check if token is expired (check stored expiry or try to use credentials)
        needs_refresh = False
        if service_token.expires_at:
            # Check stored expiry time
            # Ensure expires_at is timezone-aware
            expiry = service_token.expires_at
            if expiry.tzinfo is None:
                expiry = expiry.replace(tzinfo=timezone.utc)
            
            if expiry < datetime.now(timezone.utc):
                needs_refresh = True
                print(f"Token expired for user {user.id} (expired at {service_token.expires_at})")
        else:
            # No expiry stored, create credentials and check if expired
            try:
                credentials = Credentials(
                    token=access_token,
                    refresh_token=refresh_token,
                    token_uri="https://oauth2.googleapis.com/token",
                    client_id=settings.GOOGLE_CLIENT_ID,
                    client_secret=settings.GOOGLE_CLIENT_SECRET
                )
                if credentials.expired:
                    needs_refresh = True
            except Exception:
                # If we can't check, assume it needs refresh if we have refresh token
                needs_refresh = bool(refresh_token)
        
        # Refresh token if expired
        if needs_refresh and refresh_token:
            try:
                credentials = Credentials(
                    token=None,
                    refresh_token=refresh_token,
                    token_uri="https://oauth2.googleapis.com/token",
                    client_id=settings.GOOGLE_CLIENT_ID,
                    client_secret=settings.GOOGLE_CLIENT_SECRET
                )
                credentials.refresh(Request())
                # Update stored token
                service_token.access_token_encrypted = ServiceToken.encrypt_token(credentials.token)
                if credentials.expiry:
                    service_token.expires_at = credentials.expiry
                db.commit()
                access_token = credentials.token
                print(f"Token refreshed successfully for user {user.id}")
            except Exception as e:
                print(f"Error refreshing token for user {user.id}: {e}")
                db.rollback()
                # Token refresh failed - user may need to re-authenticate
                return None
        
        credentials_dict = {
            "token": access_token,
            "token_uri": "https://oauth2.googleapis.com/token",
            "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "scopes": [
                'https://www.googleapis.com/auth/gmail.readonly',
                'https://www.googleapis.com/auth/gmail.modify',
                'https://www.googleapis.com/auth/calendar.readonly',
                'https://www.googleapis.com/auth/calendar',
                'https://www.googleapis.com/auth/userinfo.email',
                'https://www.googleapis.com/auth/userinfo.profile'
            ]
        }
        
        if refresh_token:
            credentials_dict["refresh_token"] = refresh_token
        
        return credentials_dict
    except Exception as e:
        print(f"Error getting credentials: {e}")
        return None
