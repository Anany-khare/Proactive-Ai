import { test, expect } from '@playwright/test';

test.describe('Backend API: Security & Black Box Verification', () => {

  const BACKEND_URL = 'http://localhost:8000';

  test('Backend server should be running and responsive', async ({ request }) => {
    // We test the Swagger docs endpoint as a health check
    const response = await request.get(`${BACKEND_URL}/docs`);
    expect(response.status()).toBe(200);
  });

  test('Email API should reject unauthenticated requests', async ({ request }) => {
    // Attempt to fetch emails without a Google Auth token
    const response = await request.get(`${BACKEND_URL}/api/emails/`);
    
    // Security Test: It MUST return 401 or 403
    expect([401, 403]).toContain(response.status());
    
    const body = await response.json();
    expect(body.detail).toBeDefined();
  });

  test('Smart Reply API should reject unauthenticated requests', async ({ request }) => {
    // Attempt to analyze an email without a token
    const response = await request.post(`${BACKEND_URL}/api/ai/smart-reply`, {
      data: {
        email_id: "test-email-id-123"
      }
    });
    
    // Security Test: It MUST return 401 or 403
    expect([401, 403]).toContain(response.status());
  });

  test('Proactive Sync API should validate payloads even if unauthenticated', async ({ request }) => {
    // Send a completely empty payload to see how the server handles it
    const response = await request.post(`${BACKEND_URL}/api/ai/execute-proactive-sync`, {
      data: {}
    });
    
    // Should be caught by FastAPI payload validation (422 Unprocessable Entity) 
    // or by Auth middleware (401)
    const status = response.status();
    expect([401, 403, 422]).toContain(status);
  });

});
