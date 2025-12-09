const MobileHelper = require('./utils/mobile-helper');
const fs = require('fs');

async function main() {
    const mobile = new MobileHelper();
    
    try {
        mobile.log('🚀 [Step 2-2] 구글 로그인 시작');

        // 1. "Continue with Google" 버튼 찾기 및 클릭
        mobile.log('🔍 "Continue with Google" 버튼 찾는 중...');
        // exactMatch=false로 검색 (텍스트가 길거나 줄바꿈이 있을 수 있음)
        const googleBtn = await mobile.findAndClick('Continue with Google', 10, false);
        
        if (!googleBtn) {
            throw new Error('"Continue with Google" 버튼을 찾을 수 없습니다.');
        }
        
        mobile.log('✅ 구글 로그인 버튼 클릭 완료. 계정 선택 팝업 대기 중...');
        await new Promise(r => setTimeout(r, 3000)); // 팝업 애니메이션 대기

        // 2. 계정 선택 팝업에서 "cmiron" 계정 찾기
        mobile.log('🔍 "cmiron" 포함된 계정 찾는 중...');
        
        // 덤프 갱신
        try { mobile.adb('shell rm /sdcard/window_dump.xml'); } catch (e) {}
        mobile.adb('shell uiautomator dump /sdcard/window_dump.xml');
        mobile.adb('pull /sdcard/window_dump.xml window_dump.xml');
        
        const xmlContent = fs.readFileSync('window_dump.xml', 'utf-8');
        
        // "cmiron" 텍스트를 가진 요소 찾기 (대소문자 무시)
        // 텍스트가 이메일 주소일 것이므로, text="...cmiron..." 형태
        const accountRegex = /text="([^"]*cmiron[^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/i;
        const match = xmlContent.match(accountRegex);
        
        if (match) {
            const accountText = match[1];
            const x1 = parseInt(match[2]);
            const y1 = parseInt(match[3]);
            const x2 = parseInt(match[4]);
            const y2 = parseInt(match[5]);
            
            const centerX = Math.floor((x1 + x2) / 2);
            const centerY = Math.floor((y1 + y2) / 2);
            
            mobile.log(`✅ 계정 발견: "${accountText}"`);
            mobile.log(`👆 계정 클릭: (${centerX}, ${centerY})`);
            
            mobile.adb(`shell input tap ${centerX} ${centerY}`);
            
            // 클릭 후 로그인 처리 대기
            mobile.log('⏳ 로그인 처리 대기 중...');
            await new Promise(r => setTimeout(r, 5000));
            
            mobile.log('🎉 구글 계정 선택 완료');
            
        } else {
            // 못 찾았을 경우
            mobile.log('⚠️ "cmiron"이 포함된 계정을 찾을 수 없습니다.', 'WARN');
            mobile.log('   (팝업이 안 떴거나, 스크롤이 필요할 수 있습니다.)');
            
            // 혹시 "다른 계정 사용" 등을 눌러야 하는 상황인지?
            // 일단 에러 처리
            throw new Error('"cmiron" 계정 찾기 실패');
        }

    } catch (e) {
        mobile.error(`Step 2-2 실패: ${e.message}`, 'step02_2_google_login');
        throw e;
    }
}

main();

