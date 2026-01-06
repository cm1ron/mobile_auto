const AdbDriver = require('../src/driver/AdbDriver');
const AppManagerPage = require('../src/pages/AppManagerPage');
const LoginPage = require('../src/pages/LoginPage');
const PopupPage = require('../src/pages/PopupPage'); // [New] 팝업 모듈 추가

async function run() {
    const driver = new AdbDriver();
    const appManager = new AppManagerPage(driver);
    const loginPage = new LoginPage(driver);
    const popupPage = new PopupPage(driver); // [New] 인스턴스 생성
    
    const APP_NAME = 'OVERDARE';
    const PACKAGE_NAME = 'com.overdare.overdare.dev';
    const TESTER_APP = 'App Tester';

    try {
        // Step 0 ~ 2: 삭제 -> 설치 -> 실행 -> QA선택
        await appManager.deleteApp(APP_NAME, PACKAGE_NAME);
        await appManager.installApp(TESTER_APP, PACKAGE_NAME);
        await appManager.launchApp(PACKAGE_NAME);
        await appManager.selectQaEnvironment();

        // --- 로그인 상태 판별 및 분기 ---
        driver.log('🔍 로그인 상태 확인 중...');
        await driver.sleep(3000); // 앱 진입 대기

        const isLogged = await loginPage.isLoggedIn();

        if (isLogged) {
            driver.log('✅ 이미 로그인된 상태(홈/팝업)입니다. 로그인을 건너뛰고 팝업 처리로 이동합니다.');
        } else {
            driver.log('ℹ️ 로그인되어 있지 않습니다. [Step 3] 로그인을 진행합니다.');
            const success = await loginPage.loginAsGuest();
            if (!success) {
                driver.log('⚠️ 게스트 로그인 실패, 구글 로그인(odqa01) 시도...');
                await loginPage.loginWithGoogle('odqa01');
            }
        }

        // [Step 4] 팝업 처리 (로그인을 했든 건너뛰었든 무조건 실행)
        // 로그인 직후에는 팝업이 뜰 수 있고, 이미 로그인된 상태라도 팝업이 떠 있을 수 있음.
        await popupPage.handleMainPopups();
        
        driver.log('🎉 모든 초기 세팅(설치 ~ 로그인 ~ 팝업) 완료! 테스트 준비 끝.');

    } catch (e) {
        driver.error(`Setup Failed: ${e.message}`, 'setup_failure');
        process.exit(1);
    }
}

run();

