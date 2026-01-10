const AdbDriver = require('../driver/AdbDriver');
const fs = require('fs');
const path = require('path');

class SurveyPage {
    constructor(driver) {
        this.driver = driver;
    }

    async enterSurveyFromHome() {
        this.driver.log('🔍 [SurveyPage] 홈 화면에서 서베이 진입 시도...');
        const keywords = ['Survey', '설문', 'Poll', 'Feedback'];
        const maxScrolls = 10; 
        for (let i = 0; i < maxScrolls; i++) {
            for (const key of keywords) {
                const found = await this.driver.findAndClick(key, 2, false);
                if (found) {
                    this.driver.log(`✅ 서베이 관련 버튼('${key}') 발견 및 클릭 성공!`);
                    return true;
                }
            }
            this.driver.log(`⬇️ (${i + 1}/${maxScrolls}) 화면에 없음. 스크롤합니다...`);
            this.driver.adb('shell input swipe 500 1500 500 500 500'); 
            await this.driver.sleep(2000); 
        }
        return false;
    }

    async handleSurvey() {
        this.driver.log('📝 [SurveyPage] 설문 응답 시작...');
        await this.driver.sleep(2000);
        await this.driver.findAndClick('네', 5);
        await this.driver.sleep(1000);
        await this.driver.findAndClick('다음', 5);
        this.driver.log('✅ 1단계 완료. 다음 페이지로 이동.');
        return true;
    }

    async submitAndClose() {
        this.driver.log('📝 [SurveyPage] 2단계: ID 추출 및 제출 진행...');
        await this.driver.sleep(3000);

        // 1. ID 추출
        const dumpPath = path.join(__dirname, '../../temp_survey_extract.xml');
        try {
            this.driver.adb('shell uiautomator dump /sdcard/temp_survey.xml');
            this.driver.adb(`pull /sdcard/temp_survey.xml "${dumpPath}"`);
        } catch(e) {}

        let accountId = 'Unknown';
        if (fs.existsSync(dumpPath)) {
            const content = fs.readFileSync(dumpPath, 'utf-8');
            const uuidMatch = content.match(/text="([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"/i);
            if (uuidMatch) {
                accountId = uuidMatch[1];
                this.driver.log(`🎯 [DATA] Account ID 추출 성공: ${accountId}`);
                fs.writeFileSync('account_id.txt', accountId);
            } else {
                this.driver.log('⚠️ Account ID(UUID)를 찾지 못했습니다.', 'WARN');
            }
        }

        // 2. 제출 버튼 찾기 (Submit)
        this.driver.log('🔍 "Submit" 버튼 찾는 중...');
        let submitClicked = await this.driver.findAndClick('Submit', 3, false); // content-desc 대응
        
        if (!submitClicked) {
            this.driver.log('⬇️ 버튼이 안 보여서 스크롤합니다.');
            this.driver.adb('shell input swipe 500 1500 500 500 500');
            await this.driver.sleep(1000);
            submitClicked = await this.driver.findAndClick('Submit', 3, false);
        }

        if (submitClicked) {
            this.driver.log('✅ "Submit" 버튼 클릭 완료');
        } else {
            this.driver.log('❌ "Submit" 버튼을 끝내 못 찾았습니다.', 'ERROR');
        }

        // 3. 완료 화면 대기 및 닫기
        await this.driver.sleep(3000);
        this.driver.log('❌ 상단 닫기(X) 버튼 클릭 시도 (좌표 기반)...');
        
        // 덤프에서 X 버튼 식별이 안 되어 좌측 상단 모서리 클릭 시도 (50, 100)
        // 안드로이드 Status Bar 아래 타이틀바 영역 예상
        this.driver.adb('shell input tap 50 100');
        this.driver.log('👆 좌측 상단(50, 100) 클릭 완료');
        
        // 혹시 모르니 우측 상단도 시도? (일단 좌측만)
    }
}

module.exports = SurveyPage;
