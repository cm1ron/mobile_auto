const MobileHelper = require('./utils/mobile-helper');

async function main() {
  const mobile = new MobileHelper();
  
  try {
    mobile.log('🚀 [Step 0] 디바이스 준비 및 기존 앱 삭제');

    // 1. 화면 켜기
    mobile.log('📱 화면 켜는 중...');
    mobile.adb('shell input keyevent KEYCODE_WAKEUP');
    await new Promise(r => setTimeout(r, 2000)); // 1s -> 2s

    // 2. 잠금 해제 (PIN 입력)
    mobile.log('🔐 잠금 해제 시도 (Swipe + PIN 0000)');
    // 스와이프 시간을 300ms -> 500ms로 늘려 안정성 확보
    mobile.adb('shell input swipe 540 1500 540 500 500'); 
    await new Promise(r => setTimeout(r, 1000));
    mobile.adb('shell input text 0000'); // PIN 입력
    mobile.adb('shell input keyevent 66'); // ENTER
    await new Promise(r => setTimeout(r, 2000)); // 1s -> 2s (잠금 해제 대기)

    // 3. 최근 앱 정리 (모두 닫기) - 사용자 요청 순서 반영
    mobile.log('🧹 최근 앱 정리 시도...');
    mobile.adb('shell input keyevent KEYCODE_APP_SWITCH'); 
    await new Promise(r => setTimeout(r, 1500));
    
    // '모두 닫기' 또는 'Close all' 버튼 찾기
    const closeAllClicked = await mobile.findAndClick('모두 닫기', 3, false); 
    if (!closeAllClicked) {
        await mobile.findAndClick('Close all', 3, false);
    }
    await new Promise(r => setTimeout(r, 1000));

    // 4. 홈 화면 이동 (뒤로가기 대신 확실하게 홈으로)
    mobile.log('🏠 홈 화면으로 이동...');
    mobile.adb('shell input keyevent KEYCODE_HOME');
    await new Promise(r => setTimeout(r, 1000));
    
    // 5. 앱 서랍 열기
    mobile.log('📂 앱 서랍 열기 (위로 스와이프)...');
    mobile.adb('shell input swipe 720 2200 720 500 500');
    await new Promise(r => setTimeout(r, 2000));

    // 6. 'OVERDARE' 앱 찾기 및 삭제
    const targetAppName = 'OVERDARE';
    const targetPackage = 'com.overdare.overdare.dev';
    
    mobile.log(`🔍 '${targetAppName}' 앱 검색 및 삭제 시도...`);

    // 스마트 탐색으로 앱 존재 여부 확인
    // findAppInDrawer는 찾으면 true를 반환하고, 화면을 해당 앱이 있는 페이지로 이동시킴
    let found = await mobile.findAppInDrawer(targetAppName);
    
    // 대소문자 이슈 대비
    if (!found) {
        found = await mobile.findAppInDrawer('Overdare');
    }

    if (found) {
        mobile.log(`✅ '${targetAppName}' 앱 발견! 삭제를 진행합니다.`);
        
        // UI상에서 롱탭 후 삭제를 누르는 건 복잡하고 불안정하므로
        // 앱 존재가 확인되었으면 adb uninstall로 깔끔하게 삭제
        try {
            mobile.adb(`uninstall ${targetPackage}`);
            mobile.log(`🗑️ '${targetAppName}' (${targetPackage}) 삭제 완료`);
        } catch (e) {
            mobile.log(`⚠️ 삭제 명령 실패 (이미 삭제되었거나 권한 문제): ${e.message}`, 'WARN');
        }
        
        // 삭제 후 잠시 대기
        await new Promise(r => setTimeout(r, 2000));
        
        // 홈으로 이동하여 마무리
        mobile.adb('shell input keyevent KEYCODE_HOME');

    } else {
        mobile.log(`ℹ️ '${targetAppName}' 앱을 찾을 수 없습니다. (이미 삭제됨) -> 패스`);
        // 홈으로 이동
        mobile.adb('shell input keyevent KEYCODE_HOME');
    }

  } catch (error) {
    mobile.error(`Step 0 실패: ${error.message}`, 'step00_delete');
    process.exit(1);
  }
}

main();
