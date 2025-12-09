const MobileHelper = require('./utils/mobile-helper');
const fs = require('fs');

async function main() {
  const mobile = new MobileHelper();
  
  try {
    mobile.log('🚀 [Step 1] Overdare 앱 실행 및 QA 진입');

    // 1. 화면 켜기
    mobile.log('📱 화면 켜는 중...');
    mobile.adb('shell input keyevent KEYCODE_WAKEUP');
    await new Promise(r => setTimeout(r, 1000));

    // 2. 홈으로 이동 및 최근 앱 정리
    mobile.log('🏠 홈 화면으로 이동...');
    mobile.adb('shell input keyevent KEYCODE_HOME');
    await new Promise(r => setTimeout(r, 1000));
    mobile.adb('shell input keyevent KEYCODE_HOME');
    await new Promise(r => setTimeout(r, 1000));

    mobile.log('🧹 최근 앱 정리 시도...');
    mobile.adb('shell input keyevent KEYCODE_APP_SWITCH'); 
    await new Promise(r => setTimeout(r, 2000));
    
    const closeAllClicked = await mobile.findAndClick('모두 닫기', 5, false);
    if (!closeAllClicked) {
        await mobile.findAndClick('Close all', 3, false);
    }
    
    mobile.adb('shell input keyevent KEYCODE_HOME');
    await new Promise(r => setTimeout(r, 2000));

    // 3. 앱 서랍 열기
    mobile.log('📂 앱 서랍 열기 (위로 스와이프)...');
    mobile.adb('shell input swipe 720 2200 720 500 500');
    await new Promise(r => setTimeout(r, 2000));

    // 4. Overdare 앱 찾기 및 실행
    const targetAppName = 'OVERDARE';
    
    // 스마트 탐색 (양방향 스와이프) - 대소문자 처리는 findElement 내부에서 처리됨 (exactMatch 기본값 false라면)
    // 하지만 findAppInDrawer는 findElement를 사용하므로, 
    // 우선 'OVERDARE'로 찾아보고 없으면 'Overdare'로 다시 시도하는 로직이 필요할 수 있음.
    
    let found = await mobile.findAppInDrawer(targetAppName);
    if (!found) {
        // 대소문자 바꿔서 재시도
        found = await mobile.findAppInDrawer('Overdare');
    }

    if (found) {
        const element = mobile.findElement(targetAppName) || mobile.findElement('Overdare');
        mobile.log(`✅ 앱 발견! 좌표: (${element.x}, ${element.y})`);
        mobile.log('👆 앱 실행 (탭)');
        mobile.adb(`shell input tap ${element.x} ${element.y}`);
    } else {
        throw new Error(`'${targetAppName}' 앱을 찾지 못했습니다.`);
    }

    mobile.log('🎉 앱 실행 완료! 로딩 대기...');

    // 5. QA 선택 및 GO (구 02번 내용)
    mobile.log('⏳ 앱 로딩 대기 중... (10초)');
    await new Promise(r => setTimeout(r, 10000));

    // 5-1. Search 창 찾아서 'qa' 검색
    mobile.log('🔍 QA 환경 검색을 위해 Search 창 찾는 중...');
    const searchInput = await mobile.findAndClick('Search', 5); // Search 텍스트 찾기
    
    if (searchInput) {
        mobile.log('⌨️ "qa" 검색어 입력');
        mobile.adb('shell input text "qa"');
        // mobile.adb('shell input keyevent KEYCODE_ENTER'); // 엔터 키 제거: 엔터로 인해 바로 넘어가는 현상 방지 테스트
        await new Promise(r => setTimeout(r, 3000)); // 입력 후 필터링 대기
    } else {
        mobile.log('⚠️ Search 창을 찾지 못했습니다. 바로 QA 찾기를 시도합니다.', 'WARN');
    }

    // 5-2. QA 선택
    // 검색 결과에서 qa 선택
    mobile.log('🔍 검색 결과 목록에서 "qa" 찾는 중... (검색창 텍스트 제외)');
    
    // UI 덤프 갱신 (직접 파싱을 위해)
    try {
        mobile.adb('shell rm /sdcard/window_dump.xml');
    } catch (e) {}
    mobile.adb('shell uiautomator dump /sdcard/window_dump.xml');
    mobile.adb('pull /sdcard/window_dump.xml window_dump.xml');
    
    let targetQa = null;
    if (fs.existsSync('window_dump.xml')) {
        const xmlContent = fs.readFileSync('window_dump.xml', 'utf-8');
        // text="qa" (대소문자 무관, 정확히 일치) 찾기
        const regex = /text="qa"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/gi;
        let match;
        
        while ((match = regex.exec(xmlContent)) !== null) {
            const y1 = parseInt(match[2]);
            const y2 = parseInt(match[4]);
            
            // 검색창(Y ~650)보다 아래에 있는 요소 (예: Y > 800)
            if (y1 > 800) {
                targetQa = {
                    x: Math.floor((parseInt(match[1]) + parseInt(match[3])) / 2),
                    y: Math.floor((y1 + y2) / 2)
                };
                break; // 목록 상단에 있는 것 선택
            }
        }
    }

    if (targetQa) {
      mobile.log(`✅ 목록 내 QA 항목 발견: (${targetQa.x}, ${targetQa.y})`);
      mobile.log('👆 클릭하여 확실히 선택합니다.');
      mobile.adb(`shell input tap ${targetQa.x} ${targetQa.y}`);
      await new Promise(r => setTimeout(r, 1000));
    } else {
      mobile.log('⚠️ 목록에서 "qa" 항목을 찾을 수 없습니다. (Y > 800)', 'WARN');
    }

    // GO 버튼 찾기 및 클릭
    const goClicked = await mobile.findAndClick('GO', 15, true); // exactMatch=true (GO 단어만)
    
    if (goClicked) {
      mobile.log('🎉 [성공] GO 버튼 클릭 완료. 앱 진입 대기.');
    } else {
      throw new Error("GO 버튼을 찾을 수 없어 시나리오 실패");
    }

  } catch (error) {
    mobile.error(`Step 1 실패: ${error.message}`, 'step01_launch');
    process.exit(1);
  }
}

main();
