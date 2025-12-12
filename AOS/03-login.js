const MobileHelper = require('./utils/mobile-helper');
const fs = require('fs');

async function main() {
    const mobile = new MobileHelper();
    
    // 커맨드 라인 인자 확인
    const args = process.argv.slice(2);
    const specificAccount = args[0]; // 사용자가 지정한 계정 (예: odqa02)
    const defaultAccount = 'odqa01'; // 기본 계정
    
    // 특정 계정이 지정되면 게스트 로그인을 건너뛰고 강제로 구글 로그인을 시도
    const forceGoogle = !!specificAccount;
    const targetAccount = specificAccount || defaultAccount;

    try {
        mobile.log(`🚀 [Step 3] 로그인 프로세스 시작 (Target: ${forceGoogle ? 'Google Only (' + targetAccount + ')' : 'Guest -> Google (' + targetAccount + ')'})`);

        // 0. 이미 로그인된 상태인지 확인 (알림 동의 팝업 등)
        mobile.log('🔍 로그인 상태 확인 중...');
        
        // 빠른 확인을 위해 findElement 사용 (내부적으로 덤프 뜸)
        const alreadyLoggedIn = mobile.findElement('Get notified', false) || mobile.findElement('Allow', false) || mobile.findElement('허용', false);
        
        if (alreadyLoggedIn) {
             mobile.log('✅ 이미 로그인된 상태(또는 진행 중인 상태)로 감지되었습니다. Step 3를 건너뜁니다.');
             process.exit(0);
        }

        let guestBtn = null;
        
        // 특정 계정 로그인이 아니면 게스트 버튼을 찾음
        if (!forceGoogle) {
            mobile.log('🔍 "Continue as Guest" 버튼 탐색...');
            guestBtn = await mobile.findElement('Continue as Guest', 3);
        } else {
            mobile.log('ℹ️ 특정 계정 로그인이 요청되어 게스트 버튼 탐색을 건너뜁니다.');
        }

        if (guestBtn) {
            // ==========================================
            // [CASE 1] 게스트 로그인 진행
            // ==========================================
            mobile.log('✅ "Continue as Guest" 버튼 발견 -> 게스트 로그인 진행');
            mobile.adb(`shell input tap ${guestBtn.x} ${guestBtn.y}`);
            mobile.log('👆 "Continue as Guest" 클릭');
            
            mobile.log('⏳ 바텀 시트 대기 중...');
            await new Promise(r => setTimeout(r, 2000));

            // 슬라이더 조작
            mobile.log('🔍 슬라이더(SeekBar) 찾는 중...');
            
            // 덤프 갱신
            try { mobile.adb('shell rm /sdcard/window_dump.xml'); } catch (e) {}
            mobile.adb('shell uiautomator dump /sdcard/window_dump.xml');
            mobile.adb('pull /sdcard/window_dump.xml window_dump.xml');
            
            const xmlContent = fs.readFileSync('window_dump.xml', 'utf-8');
            const seekBarRegex = /class="android.widget.SeekBar"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/;
            const match = xmlContent.match(seekBarRegex);
            
            if (match) {
                const x1 = parseInt(match[1]);
                const y1 = parseInt(match[2]);
                const x2 = parseInt(match[3]);
                const y2 = parseInt(match[4]);
                
                mobile.log(`✅ 슬라이더 발견: (${x1}, ${y1}) - (${x2}, ${y2})`);
                
                const width = x2 - x1;
                const centerY = Math.floor((y1 + y2) / 2);
                
                // 시나리오: 슬라이더의 중앙보다 약간 오른쪽(55% 지점)을 탭
                const targetX = x1 + Math.floor(width * 0.55); 
                
                mobile.log(`👆 슬라이더 조작 시도 (X: ${targetX}, Y: ${centerY})`);
                mobile.adb(`shell input tap ${targetX} ${centerY}`);
                
                await new Promise(r => setTimeout(r, 1000));
                
                // 체크박스 체크 및 OK 버튼 클릭
                mobile.log('🔍 체크박스 찾는 중...');
                
                const notifyTextRegex = /text="Get notified[^"]*"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/;
                const notifyMatch = xmlContent.match(notifyTextRegex); // 이전 덤프 재활용
                
                // 덤프를 다시 떠야 정확하지만, 탭 후 1초 지났으니 다시 뜨는게 안전
                try { mobile.adb('shell rm /sdcard/window_dump.xml'); } catch (e) {}
                mobile.adb('shell uiautomator dump /sdcard/window_dump.xml');
                mobile.adb('pull /sdcard/window_dump.xml window_dump.xml');
                const xmlCheck = fs.readFileSync('window_dump.xml', 'utf-8');
                
                const notifyMatchNew = xmlCheck.match(notifyTextRegex);
                
                if (notifyMatchNew) {
                    const textX1 = parseInt(notifyMatchNew[1]);
                    const textY1 = parseInt(notifyMatchNew[2]);
                    const textY2 = parseInt(notifyMatchNew[4]);
                    
                    const checkBoxX = textX1 - 60; 
                    const checkBoxY = Math.floor((textY1 + textY2) / 2);
                    
                    mobile.log(`✅ 체크박스 발견 추정: (${checkBoxX}, ${checkBoxY})`);
                    mobile.adb(`shell input tap ${checkBoxX} ${checkBoxY}`);
                    await new Promise(r => setTimeout(r, 1000));
                }

                // OK 버튼 클릭
                mobile.log('🔍 OK/Confirm 버튼 찾는 중...');
                const okBtn = await mobile.findAndClick('OK', 3) || await mobile.findAndClick('Confirm', 3);
                if (okBtn) {
                    mobile.log('✅ OK/Confirm 버튼 클릭 완료');
                } else {
                     mobile.log('⚠️ OK 버튼을 찾지 못했습니다.', 'WARN');
                }
                
            } else {
                mobile.log('❌ 슬라이더(SeekBar)를 찾을 수 없습니다.', 'ERROR');
            }

        } else {
            // ==========================================
            // [CASE 2] 구글 로그인 진행 (게스트 버튼 없음 또는 강제 구글 로그인)
            // ==========================================
            mobile.log(`ℹ️ ${forceGoogle ? '강제 구글 로그인 모드' : '"Continue as Guest" 버튼 없음'}. 구글 로그인 시도...`);
            
            const googleBtn = await mobile.findAndClick('Continue with Google', 5, false);
            
            if (googleBtn) {
                mobile.log('✅ "Continue with Google" 버튼 클릭 완료. 계정 선택 팝업 대기...');
                await new Promise(r => setTimeout(r, 3000));

                // 계정 선택 팝업에서 targetAccount 계정 찾기
                mobile.log(`🔍 "${targetAccount}" 포함된 계정 찾는 중...`);
                
                // 덤프 갱신
                try { mobile.adb('shell rm /sdcard/window_dump.xml'); } catch (e) {}
                mobile.adb('shell uiautomator dump /sdcard/window_dump.xml');
                mobile.adb('pull /sdcard/window_dump.xml window_dump.xml');
                
                const xmlContent = fs.readFileSync('window_dump.xml', 'utf-8');
                // 정규식에 변수 사용
                const accountRegex = new RegExp(`text="([^"]*${targetAccount}[^"]*)"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`, 'i');
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
                    
                    mobile.log('⏳ 로그인 처리 대기 중...');
                    await new Promise(r => setTimeout(r, 5000));
                    mobile.log('🎉 구글 계정 선택 완료');
                } else {
                    mobile.log(`⚠️ "${targetAccount}"가 포함된 계정을 찾을 수 없습니다.`, 'WARN');
                    throw new Error(`"${targetAccount}" 계정 찾기 실패`);
                }
            } else {
                mobile.log('❌ "Continue with Google" 버튼도 찾을 수 없습니다.', 'ERROR');
                throw new Error('로그인 수단을 찾을 수 없음 (게스트 X, 구글 X)');
            }
        }

    } catch (e) {
        mobile.error(`Step 3 실패: ${e.message}`, 'step03_login');
        process.exit(1);
    }
}

main();
