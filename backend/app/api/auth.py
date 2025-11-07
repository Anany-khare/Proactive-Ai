from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.models import User, ServiceToken
from app.core.google_auth import get_authorization_url, exchange_code_for_tokens
from app.core.security import create_access_token
from app.core.schemas import Token, UserResponse
from app.core.dependencies import get_current_user
from app.core.config import settings
from datetime import timedelta, datetime
import secrets
import json

router = APIRouter(prefix="/auth", tags=["authentication"])

# Store state temporarily (in production, use Redis or database)
oauth_states = {}

@router.get("/login")
async def google_login():
    """Redirect to Google OAuth consent screen"""
    state = secrets.token_urlsafe(32)
    authorization_url, state_returned = get_authorization_url(state=state)
    oauth_states[state] = True
    return RedirectResponse(url=authorization_url)

@router.get("/callback")
async def google_callback(
    code: str = None,
    state: str = None,
    error: str = None,
    db: Session = Depends(get_db)
):
    """Handle OAuth callback from Google"""
    if error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"OAuth error: {error}"
        )
    
    if not code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Authorization code not provided"
        )
    
    # Verify state
    if state not in oauth_states:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid state parameter"
        )
    
    try:
        # Exchange code for tokens
        tokens = exchange_code_for_tokens(code)
        
        # Get user info from Google
        from google.oauth2.credentials import Credentials
        from googleapiclient.discovery import build
        
        creds = Credentials.from_authorized_user_info(tokens)
        service = build('oauth2', 'v2', credentials=creds)
        user_info = service.userinfo().get().execute()
        
        # Get or create user
        user = db.query(User).filter(User.email == user_info['email']).first()
        if not user:
            user = User(
                email=user_info['email'],
                name=user_info.get('name'),
                picture=user_info.get('picture')
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        else:
            # Update user info
            user.name = user_info.get('name', user.name)
            user.picture = user_info.get('picture', user.picture)
            db.commit()
        
        # Store service tokens (encrypted)
        service_token = db.query(ServiceToken).filter(
            ServiceToken.user_id == user.id,
            ServiceToken.service_name == 'google'
        ).first()
        
        if service_token:
            service_token.access_token_encrypted = ServiceToken.encrypt_token(tokens['token'])
            if tokens.get('refresh_token'):
                service_token.refresh_token_encrypted = ServiceToken.encrypt_token(tokens['refresh_token'])
            if tokens.get('expiry'):
                service_token.expires_at = datetime.fromisoformat(tokens['expiry'])
        else:
            service_token = ServiceToken(
                user_id=user.id,
                service_name='google',
                access_token_encrypted=ServiceToken.encrypt_token(tokens['token']),
                refresh_token_encrypted=ServiceToken.encrypt_token(tokens['refresh_token']) if tokens.get('refresh_token') else None,
                expires_at=datetime.fromisoformat(tokens['expiry']) if tokens.get('expiry') else None
            )
            db.add(service_token)
        
        db.commit()
        
        # Create JWT token
        access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": str(user.id), "email": user.email},
            expires_delta=access_token_expires
        )
        
        # Clean up state
        del oauth_states[state]
        
        # Redirect to frontend with token
        frontend_url = f"{settings.FRONTEND_URL}/auth/callback?token={access_token}"
        return RedirectResponse(url=frontend_url)
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Authentication failed: {str(e)}"
        )

@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: User = Depends(get_current_user)
):
    """Get current user information"""
    return current_user


