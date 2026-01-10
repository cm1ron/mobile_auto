const AdbDriver = require('../src/driver/AdbDriver');
const SurveyPage = require('../src/pages/SurveyPage');

async function run() {
    const driver = new AdbDriver();
    const surveyPage = new SurveyPage(driver);

    try {
        driver.log('🚀 [Scenario] 서베이 전체 프로세스 테스트');

        // (이미 서베이 진입 상태라면 홈 이동 건너뛰고 바로 진행해도 되지만, 안전하게 처음부터)
        // 만약 현재 2단계 화면이라면 바로 submitAndClose()만 호출해서 테스트하고 싶으시죠?
        // 하지만 상태를 모르니 처음부터 다시 하는 게 안전합니다.
        
        // 1. 홈 이동
        driver.log('🏠 홈 탭으로 이동...');
        await driver.findAndClick('Home', 5, false);
        await driver.sleep(2000);

        // 2. 진입
        const entered = await surveyPage.enterSurveyFromHome();
        if (!entered) throw new Error('서베이 진입 실패');
        await driver.sleep(5000);

        // 3. 1단계 (네 -> 다음)
        const step1 = await surveyPage.handleSurvey();
        if (!step1) throw new Error('1단계 응답 실패');
        
        // 4. 2단계 (ID 추출 -> 제출 -> 닫기)
        await surveyPage.submitAndClose();

    } catch (e) {
        driver.error(`Scenario Failed: ${e.message}`, 'survey_full_fail');
    }
}

run();
