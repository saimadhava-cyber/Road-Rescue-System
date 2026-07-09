const { Builder, Browser } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

async function createDriver() {
    const options = new chrome.Options();
    // Run in headless mode for CI/CD compatibility
    options.addArguments('--headless=new');
    options.addArguments('--no-sandbox');
    options.addArguments('--disable-dev-shm-usage');
    options.addArguments('--disable-gpu');
    // Set a mobile-like viewport to match the phone-mockup UI
    options.addArguments('--window-size=430,932');

    const driver = await new Builder()
        .forBrowser(Browser.CHROME)
        .setChromeOptions(options)
        .build();

    // Set implicit wait
    await driver.manage().setTimeouts({ implicit: 5000 });

    return driver;
}

module.exports = { createDriver };
