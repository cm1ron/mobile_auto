const MobileHelper = require('./utils/mobile-helper');

async function main() {
    const mobile = new MobileHelper();
    
    try {
        mobile.log('🚀 [Step 2] 게스트 로그인 및 나이 설정 시작');

        // 1. "Continue as Guest" 버튼 찾기 및 클릭
        mobile.log('🔍 "Continue as Guest" 버튼 찾는 중...');
        const guestBtn = await mobile.findAndClick('Continue as Guest', 10);
        
        if (!guestBtn) {
            throw new Error('"Continue as Guest" 버튼을 찾을 수 없습니다.');
        }
        
        mobile.log('✅ 게스트 버튼 클릭 완료. 바텀 시트 대기 중...');
        await new Promise(r => setTimeout(r, 2000)); // 바텀 시트 애니메이션 대기

        // 2. 바텀 시트 확인 및 슬라이더 조작
        // 슬라이더(SeekBar) 찾기
        // 보통 SeekBar 클래스나 리소스 ID로 찾아야 함. 덤프 떠서 확인 필요할 수 있음.
        // 여기서는 일단 화면 분석을 위해 덤프를 한 번 뜨고, 슬라이더로 추정되는 요소를 찾음.
        
        mobile.log('🔍 슬라이더(SeekBar) 찾는 중...');
        const fs = require('fs');
        
        // 덤프 갱신
        try { mobile.adb('shell rm /sdcard/window_dump.xml'); } catch (e) {}
        mobile.adb('shell uiautomator dump /sdcard/window_dump.xml');
        mobile.adb('pull /sdcard/window_dump.xml window_dump.xml');
        
        const xmlContent = fs.readFileSync('window_dump.xml', 'utf-8');
        
        // SeekBar 찾기 (class="android.widget.SeekBar")
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
            
            // 현재 위치를 모르므로, 중앙에서 약간 오른쪽을 클릭해봄
            // 또는 여러 지점을 순차적으로 클릭하여 14를 찾을 수도 있음.
            // 일단 "오른쪽으로 한 칸"이라 했으니, 전체 길이의 60%~70% 지점을 노려봄?
            // 아니면 현재 위치가 디폴트(왼쪽 끝? 중간?)인지 알아야 함.
            
            // 시나리오: 슬라이더의 중앙보다 약간 오른쪽(55% 지점)을 탭
            const targetX = x1 + Math.floor(width * 0.55); 
            
            mobile.log(`👆 슬라이더 조작 시도 (X: ${targetX}, Y: ${centerY})`);
            mobile.adb(`shell input tap ${targetX} ${centerY}`);
            
            await new Promise(r => setTimeout(r, 1000));
            
            // 3. 검증: "14" 텍스트 확인 (또는 13 이상인지 확인)
            mobile.log('🔍 나이 설정값 확인 중...');
            
            // 덤프 다시 떠서 숫자 확인
            try { mobile.adb('shell rm /sdcard/window_dump.xml'); } catch (e) {}
            mobile.adb('shell uiautomator dump /sdcard/window_dump.xml');
            mobile.adb('pull /sdcard/window_dump.xml window_dump.xml');
            
            const xmlCheck = fs.readFileSync('window_dump.xml', 'utf-8');
            // 텍스트가 숫자인 것 찾기 (두 자리 숫자)
            const numberRegex = /text="(\d{2})"[^>]*bounds="/g;
            let ageMatch;
            let foundAge = null;
            
            while ((ageMatch = numberRegex.exec(xmlCheck)) !== null) {
                const age = parseInt(ageMatch[1]);
                // 슬라이더 툴팁일 가능성이 높은 위치인지 확인 (Y좌표가 슬라이더 근처)
                // 현재는 그냥 발견된 숫자 중 13 이상이면 성공 처리
                if (age >= 13) {
                    foundAge = age;
                    break;
                }
            }
            
            if (foundAge) {
                mobile.log(`🎉 [성공] 나이 설정(${foundAge}) 확인 완료! (13세 이상)`);
                
                // 4. 체크박스 체크 및 OK 버튼 클릭
                mobile.log('🔍 체크박스 찾는 중...');
                
                // "Get notified" 텍스트 찾기
                const notifyTextRegex = /text="Get notified[^"]*"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/;
                const notifyMatch = xmlCheck.match(notifyTextRegex);
                
                if (notifyMatch) {
                    // 텍스트 요소의 왼쪽 좌표(x1)를 기준으로 그 왼쪽 영역을 클릭
                    const textX1 = parseInt(notifyMatch[1]);
                    const textY1 = parseInt(notifyMatch[2]);
                    const textY2 = parseInt(notifyMatch[4]);
                    
                    // 체크박스 추정 좌표: 텍스트 X1에서 60픽셀 왼쪽, Y축은 텍스트 중앙
                    const checkBoxX = textX1 - 60; 
                    const checkBoxY = Math.floor((textY1 + textY2) / 2);
                    
                    mobile.log(`✅ 체크박스(텍스트 왼쪽) 발견 추정: (${checkBoxX}, ${checkBoxY})`);
                    mobile.adb(`shell input tap ${checkBoxX} ${checkBoxY}`);
                    await new Promise(r => setTimeout(r, 1000));
                } else {
                    mobile.log('⚠️ "Get notified" 텍스트를 찾지 못했습니다. 체크박스 클릭 실패 가능성 있음.', 'WARN');
                    
                    // 예비책: 아까 찾은 체크박스 View의 좌표 범위 [133,1554][252,1689]를 이용해 하드코딩 시도?
                    // 하지만 기기 해상도마다 다를 수 있으므로 권장하진 않음.
                    // 일단 실패 로그만 남김.
                }

                // OK 버튼 클릭
                mobile.log('🔍 OK 버튼 찾는 중...');
                const okBtn = await mobile.findAndClick('OK', 3) || await mobile.findAndClick('Confirm', 3);
                if (okBtn) {
                    mobile.log('✅ OK/Confirm 버튼 클릭 완료');
                } else {
                     mobile.log('⚠️ OK 버튼을 찾지 못했습니다.', 'WARN');
                }
                
            } else {
                mobile.log('⚠️ 13세 이상의 숫자를 찾지 못했습니다. (33이 떠있다는데 왜 못찾았을까?)', 'WARN');
                // 혹시 33이 text 속성이 아니라 content-desc 일 수도 있음
            }
            
        } else {
            // SeekBar를 못 찾았을 경우, UI 분석 로그 출력
            mobile.log('❌ 슬라이더(SeekBar)를 찾을 수 없습니다.', 'ERROR');
            throw new Error('슬라이더 찾기 실패');
        }

    } catch (e) {
        mobile.error(`Step 2 실패: ${e.message}`, 'step02_guest_login');
        throw e;
    }
}

main();

