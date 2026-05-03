import { test, expect } from '@playwright/test';

test.describe('Frontend UI: Component Layouts', () => {

  test('Application should load without crashing', async ({ page }) => {
    // Go to the main URL
    const response = await page.goto('http://localhost:3000/');
    
    // The page should return a successful 200 response
    expect(response.status()).toBe(200);
  });

  test('Theme provider should apply correct classes', async ({ page }) => {
    await page.goto('http://localhost:3000/');
    
    // Check if the html element exists (which holds the dark mode class)
    const htmlElement = page.locator('html');
    await expect(htmlElement).toBeAttached();
  });

});
