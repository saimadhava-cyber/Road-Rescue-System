const reporter = require('./selenium-tests/utils/testReporter');

// This file is used by mocha to run global hooks

after(async function () {
    // Generate the combined report at the end of all test suites
    await reporter.generateReport();
});

// We can also have a global afterEach to log test names if needed
afterEach(async function () {
    const testTitle = this.currentTest.title;
    const suite = this.currentTest.parent.title;
    const state = this.currentTest.state;
    const duration = this.currentTest.duration || 0;
    const error = this.currentTest.err ? this.currentTest.err.message : '';

    if (state === 'passed') {
        reporter.addResult(suite, testTitle, 'PASSED', duration);
    } else if (state === 'failed') {
        reporter.addResult(suite, testTitle, 'FAILED', duration, error);
        
        // Take a screenshot on failure if driver is available in global scope
        if (global.driver) {
            try {
                const fs = require('fs');
                const path = require('path');
                const screenshotDir = path.join(__dirname, 'Test Results', 'Screenshots');
                if (!fs.existsSync(screenshotDir)) {
                    fs.mkdirSync(screenshotDir, { recursive: true });
                }
                const image = await global.driver.takeScreenshot();
                const sanitizedTitle = testTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                const filepath = path.join(screenshotDir, `${sanitizedTitle}.png`);
                fs.writeFileSync(filepath, image, 'base64');
                console.log(`[Screenshot Captured] ${filepath}`);
            } catch (err) {
                console.error('Failed to take screenshot:', err);
            }
        }
    } else {
        reporter.addResult(suite, testTitle, 'SKIPPED', 0);
    }
});
