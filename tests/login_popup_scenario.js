const AdbDriver = require('../src/driver/AdbDriver');
const LoginPage = require('../src/pages/LoginPage');
const PopupPage = require('../src/pages/PopupPage');

async function run() {
    const driver = new AdbDriver();
    const loginPage = new LoginPage(driver);
    const popupPage = new PopupPage(driver);

    try {
        driver.log('🚀 Starting Login/Popup Scenario...');

        // 1. Check if already logged in
        if (await loginPage.isLoggedIn()) {
            driver.log('✅ Already logged in. Proceeding to popup handling.');
        } else {
            // 2. Decide login method (Command line args: node login_scenario.js <account>)
            // android=... 인자 제외
            const args = process.argv.slice(2).filter(arg => !arg.startsWith('android='));
            const specificAccount = args[0];

            if (specificAccount) {
                // Google Login
                await loginPage.loginWithGoogle(specificAccount);
            } else {
                // Guest Login
                const success = await loginPage.loginAsGuest();
                if (!success) {
                    // Fallback to Google if Guest failed or not found (and not explicit guest mode)
                    driver.log('⚠️ Guest login skipped or failed. Trying Google...');
                    await loginPage.loginWithGoogle('odqa01'); // Default account
                }
            }
        }

        // 3. Popup handling (after login or if already logged in)
        await popupPage.handleMainPopups();
        
        driver.log('🎉 로그인/팝업 처리 완료!');

    } catch (e) {
        driver.error(`Scenario Failed: ${e.message}`, 'login_failure');
        process.exit(1);
    }
}

run();

