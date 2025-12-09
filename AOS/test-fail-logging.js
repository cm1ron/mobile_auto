const MobileHelper = require('./utils/mobile-helper');

async function main() {
  const mobile = new MobileHelper();
  
  try {
    mobile.log('🧪 실패 로깅 및 스크린샷 테스트 시작');

    // 1. 존재하지 않는 요소 찾기 시도 (고의 실패 유발)
    mobile.log('🔍 존재하지 않는 요소 찾는 중...');
    const result = await mobile.findAndClick('존재하지않는버튼_!@#', 3);
    
    if (!result) {
      throw new Error("테스트를 위해 고의로 발생시킨 에러입니다.");
    }

  } catch (error) {
    // 2. 에러 로깅 및 스크린샷 캡처
    // error 메서드는 로그 파일에 에러를 기록하고, 현재 화면을 캡처하여 저장합니다.
    const screenshotPath = mobile.error(`단계별 실패 테스트 중 에러 발생: ${error.message}`, 'test_fail_logging');
    
    console.log('\n--- 테스트 결과 ---');
    console.log(`✅ 로그 파일 확인: ${mobile.logFile}`);
    console.log(`✅ 스크린샷 저장 확인: ${screenshotPath}`);
  }
}

main();

