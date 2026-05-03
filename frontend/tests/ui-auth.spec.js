import { test, expect } from '@playwright/test';

test.describe('Frontend UI: Authentication & Routing', () => {

  test('Login page should render correctly', async ({ page }) => {
    await page.goto('http://localhost:3000/');
    
    // Verify title
    await expect(page).toHaveTitle(/Proactive/i);
    
    // Verify login text/button exists
    const loginText = page.getByText(/Sign in/i);
    await expect(loginText).toBeVisible();
  });

  test('Protected routes should redirect to login', async ({ page }) => {
    // Attempt to access the emails dashboard directly without logging in
    await page.goto('http://localhost:3000/emails');
    
    // The app should redirect back to the login page
    await expect(page).toHaveURL(/.*login/);
  });



});
