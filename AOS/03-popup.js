const MobileHelper = require('./utils/mobile-helper');

async function main() {
    const mobile = new MobileHelper();
    
    try {
        mobile.log('🚀 [Step 3] 홈 화면 팝업 및 튜토리얼 처리 시작');

        // 처리할 키워드 리스트 (우선순위 순)
        // 1. 권한 허용 (시스템 팝업)
        // 2. 긍정적 응답 (OK, 확인, 동의)
        // 3. 닫기 (Close, 닫기, X)
        const keywords = [
            '허용', 'Allow', 
            'OK', '확인', 'Confirm', 'Yes', 
            'Accept', 'Agree', '동의',
            '닫기', 'Close', 'Close all', '오늘 하루 보지 않기',
            'Check it out', 'Check out now', 'Check out', '바로가기'
        ];

        // 최대 2분 동안 반복해서 팝업 처리
        const startTime = Date.now();
        const maxDuration = 120000; // 2분
        let noPopupCount = 0;

        while (Date.now() - startTime < maxDuration) {
            let handled = false;

            // 1. 키워드 기반 버튼 찾기
            // 단순 텍스트 매칭이 아니라, 클릭 가능한(Button) 요소인지 확인 필요
            
            // 덤프 갱신
            try { 
                mobile.adb('shell rm /sdcard/window_dump.xml'); 
            } catch (e) {}

            try {
                const dumpRes = mobile.adb('shell uiautomator dump /sdcard/window_dump.xml');
                if (dumpRes.includes('ERROR')) throw new Error('Dump failed');
                mobile.adb('pull /sdcard/window_dump.xml window_dump.xml');
            } catch (e) {
                mobile.log(`⚠️ 덤프 실패 (재시도 예정): ${e.message}`, 'WARN');
                await new Promise(r => setTimeout(r, 1000));
                continue; // 다음 루프로 넘어가서 재시도
            }
            
            const fs = require('fs');
            if (fs.existsSync('window_dump.xml')) {
                const xmlContent = fs.readFileSync('window_dump.xml', 'utf-8');
                
                for (const keyword of keywords) {
                    const nodeRegex = /<node ([^>]+)>/g;
                    let nodeMatch;
                    
                    while ((nodeMatch = nodeRegex.exec(xmlContent)) !== null) {
                        const attrs = nodeMatch[1];
                        const textMatch = /text="([^"]*)"/.exec(attrs);
                        const text = textMatch ? textMatch[1] : '';
                        
                        if (text.includes(keyword)) {
                            const clickable = attrs.includes('clickable="true"');
                            const isButton = attrs.includes('class="android.widget.Button"');
                            const resourceId = /resource-id="([^"]*)"/.exec(attrs)?.[1] || '';
                            const isPermissionBtn = resourceId.includes('permission_allow') || resourceId.includes('button1');
                            
                            // 텍스트 자체가 버튼 역할을 하는 경우 (clickable=false여도 클릭 시도)
                            const isTextButton = ['Check it out', 'Check it now', 'Check out', '바로가기'].some(k => text.includes(k));

                            if (clickable || isButton || isPermissionBtn || isTextButton) {
                                const boundsMatch = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(attrs);
                                if (boundsMatch) {
                                    const x1 = parseInt(boundsMatch[1]);
                                    const y1 = parseInt(boundsMatch[2]);
                                    const x2 = parseInt(boundsMatch[3]);
                                    const y2 = parseInt(boundsMatch[4]);
                                    const cx = Math.floor((x1 + x2) / 2);
                                    const cy = Math.floor((y1 + y2) / 2);
                                    
                                    mobile.log(`✅ 팝업 버튼 발견: '${text}' at (${cx}, ${cy})`);
                                    mobile.adb(`shell input tap ${cx} ${cy}`);
                                    
                                    // 애니메이션 대기 처리
                                    if (isTextButton) {
                                        mobile.log('⏳ 애니메이션 대기 중... (8초)');
                                        await new Promise(r => setTimeout(r, 8000));
                                    } else {
                                        await new Promise(r => setTimeout(r, 2000));
                                    }
                                    
                                    handled = true;
                                    noPopupCount = 0;
                                    break;
                                }
                            }
                        }
                    }
                    if (handled) break;
                }

                // 2. 특수 화면 처리 (Season Pass 등 닫기 버튼이 텍스트가 아닌 경우)
                if (!handled) {
                    // Season Pass 팝업 페이지 식별: "Available through gacha" 텍스트가 있는지 확인
                    // 단순 "Season Pass" 텍스트는 홈 화면에도 존재할 수 있어 오작동 원인이 됨
                    if (xmlContent.includes('text="Available through gacha"')) {
                         mobile.log('🧩 Season Pass 팝업 페이지 감지됨. 좌측 상단 닫기(X) 버튼 클릭 시도.');
                         mobile.adb('shell input tap 80 150');
                         
                         mobile.log('⏳ 화면 전환 대기 중... (5초)');
                         await new Promise(r => setTimeout(r, 5000));
                         
                         handled = true;
                         noPopupCount = 0;
                    }
                }
            }
            
            // 3. 딤드 팝업 처리 (여백 클릭) - handled가 아닐 때만 시도
            if (!handled) {
                mobile.log('👆 딤드 팝업 닫기 시도 (상단 여백 클릭)');
                // 상단 중앙 (540, 300) 클릭
                mobile.adb('shell input tap 540 300');
                await new Promise(r => setTimeout(r, 2000));
                
                // 화면 변화 확인 로직이 있으면 좋음 (생략)
            }

            if (!handled) {
                noPopupCount++;
                mobile.log(`ℹ️ 처리할 팝업이 보이지 않습니다. (${noPopupCount}/3)`);
                
                if (noPopupCount >= 3) {
                    mobile.log('🎉 모든 팝업 처리가 완료된 것으로 보입니다.');
                    break;
                }
                
                // 잠시 대기 후 재확인 (팝업이 늦게 뜰 수도 있음)
                await new Promise(r => setTimeout(r, 2000));
            }
        }

        // 튜토리얼 스킵 로직이 필요하다면 여기에 추가
        // 예: "Skip" 버튼이 있다면 클릭

    } catch (e) {
        mobile.error(`Step 3 실패: ${e.message}`, 'step03_popup');
        throw e;
    }
}

main();



