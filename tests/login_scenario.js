const AdbDriver = require('../src/driver/AdbDriver');
const LoginPage = require('../src/pages/LoginPage');

async function run() {
    const driver = new AdbDriver();
    const loginPage = new LoginPage(driver);

    try {
        driver.log('🚀 Starting Login Scenario...');

        // 1. Check if already logged in
        if (await loginPage.isLoggedIn()) {
            driver.log('✅ Already logged in. Skipping.');
            return;
        }

        // 2. Decide login method (Command line args: node login_scenario.js <account>)
        const args = process.argv.slice(2);
        const specificAccount = args[0];

        if (specificAccount) {
            // Google Login
            await loginPage.loginWithGoogle(specificAccount);
        } else {
            // Guest Login
            const success = await loginPage.loginAsGuest();
            if (!success) {
                // Fallback to Google if Guest failed or not found (and not explicit guest mode)
                // Note: Simplified logic here.
                driver.log('⚠️ Guest login skipped or failed. Trying Google...');
                await loginPage.loginWithGoogle('odqa01'); // Default account
            }
        }

    } catch (e) {
        driver.error(`Scenario Failed: ${e.message}`, 'login_failure');
        process.exit(1);
    }
}

run();

