const path = require('path');
const ExcelReporter = require('../utils/ExcelReporter');

exports.config = {
    // ====================
    // Runner Configuration
    // ====================
    runner: 'local',
    port: 4723,

    // ==================
    // Specify Test Files
    // ==================
    specs: [
        '../specs/**/*.spec.js'
    ],
    exclude: [
        // 'path/to/excluded/files'
    ],

    // ============
    // Capabilities
    // ============
    maxInstances: 1,
    capabilities: [{
        platformName: 'Android',
        'appium:automationName': 'UiAutomator2',
        // Optional: Specify an explicit device name or UUID if needed
        // 'appium:deviceName': 'Pixel_6_Pro_API_33',
        
        // This will connect to the Capacitor app installed on the device.
        // Update the appPackage and appActivity if they differ in your Capacitor project.
        'appium:appPackage': 'com.roadrescue.app',
        'appium:appActivity': 'com.roadrescue.app.MainActivity',
        
        // Automatically switch to WebView context since this is a Capacitor App
        'appium:autoWebview': true,
        'appium:noReset': true
    }],

    // ===================
    // Test Configurations
    // ===================
    logLevel: 'info',
    bail: 0,
    baseUrl: 'http://localhost',
    waitforTimeout: 10000,
    connectionRetryTimeout: 120000,
    connectionRetryCount: 3,

    services: [
        ['appium', {
            args: {
                address: 'localhost',
                port: 4723
            },
            logPath: './appium-tests/reports/'
        }]
    ],

    framework: 'mocha',
    reporters: [
        'spec',
        [ExcelReporter, {}]
    ],

    mochaOpts: {
        ui: 'bdd',
        timeout: 60000
    },

    afterTest: async function(test, context, { error, result, duration, passed, retries }) {
        if (error) {
            const fs = require('fs');
            const screenshotDir = path.join(process.cwd(), 'Test Results', 'Screenshots');
            if (!fs.existsSync(screenshotDir)) {
                fs.mkdirSync(screenshotDir, { recursive: true });
            }
            const sanitizedTitle = test.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            const screenshotPath = path.join(screenshotDir, `${sanitizedTitle}.png`);
            try {
                await browser.saveScreenshot(screenshotPath);
                console.log(`[Screenshot Captured] ${screenshotPath}`);
            } catch (err) {
                console.error('Failed to take screenshot:', err);
            }
        }
    }
};
