describe('Road Rescue E2E Android Test', () => {
    
    it('should load the login page and authenticate successfully', async () => {
        // Wait for Webview to be fully loaded
        await browser.waitUntil(
            async () => (await browser.getTitle()) !== '',
            {
                timeout: 10000,
                timeoutMsg: 'expected Webview to be loaded'
            }
        );

        // Find and fill login inputs
        const emailInput = await $('#email');
        const passwordInput = await $('#password');
        const loginBtn = await $('#loginBtn');

        await emailInput.waitForExist({ timeout: 5000 });
        await emailInput.setValue('testuser@roadrescue.com');
        await passwordInput.setValue('securePassword123');
        
        await loginBtn.click();

        // Verify successful navigation to Dashboard
        const dashboardHeader = await $('#dashboard-header');
        await dashboardHeader.waitForExist({ timeout: 5000 });
        
        const headerText = await dashboardHeader.getText();
        expect(headerText).toContain('Dashboard');
    });

    it('should trigger the Emergency SOS button and verify alert', async () => {
        const sosButton = await $('#sos-button');
        await sosButton.waitForExist({ timeout: 5000 });
        
        // Tap the SOS button
        await sosButton.click();

        // Handle the confirmation dialog/alert that should appear
        const sosConfirmation = await $('#sos-confirmation-modal');
        await sosConfirmation.waitForExist({ timeout: 5000 });
        
        const confirmBtn = await $('#confirm-sos-btn');
        await confirmBtn.click();

        // Verify SOS sent success message
        const successMessage = await $('#toast-message');
        await successMessage.waitForExist({ timeout: 5000 });
        
        const text = await successMessage.getText();
        expect(text).toContain('Emergency Request Sent');
    });

    it('should navigate to report hazard page and submit a report', async () => {
        const reportHazardTab = await $('#tab-report-hazard');
        await reportHazardTab.click();

        const hazardTypeSelect = await $('#hazard-type');
        await hazardTypeSelect.waitForExist({ timeout: 5000 });
        await hazardTypeSelect.selectByVisibleText('Pothole');

        const descriptionInput = await $('#hazard-description');
        await descriptionInput.setValue('Large pothole in the middle lane causing damage.');

        const submitReportBtn = await $('#submit-report-btn');
        await submitReportBtn.click();

        // Verify success
        const successToast = await $('#toast-message');
        await successToast.waitForExist({ timeout: 5000 });
        
        const text = await successToast.getText();
        expect(text).toContain('Hazard Reported Successfully');
    });
});
