const MobileHelper = require('./utils/mobile-helper');

async function main() {
  const mobile = new MobileHelper();
  
  try {
    mobile.log('🚀 [Step 1] App Tester 실행 및 최신 빌드 설치');

    // 1. 홈 화면 이동 (Step 0에서 이미 정리했으므로 홈으로만 이동)
    mobile.adb('shell input keyevent KEYCODE_HOME');
    await new Promise(r => setTimeout(r, 2000));

    // 2. 앱 서랍 열기 (기본값으로 복구)
    mobile.log('📂 앱 서랍 열기 (위로 스와이프)...');
    mobile.adb('shell input swipe 720 2200 720 500 500');
    await new Promise(r => setTimeout(r, 2000));
    
    // 3. App Tester 앱 찾기 및 실행
    const targetAppName = 'App Tester'; 
    const found = await mobile.findAppInDrawer(targetAppName);

    if (found) {
        const element = mobile.findElement(targetAppName);
        mobile.log(`✅ 앱 발견! 좌표: (${element.x}, ${element.y})`);
        mobile.log('👆 앱 실행 (탭)');
        mobile.adb(`shell input tap ${element.x} ${element.y}`);
        mobile.log('🎉 App Tester 실행 완료!');
    } else {
        throw new Error(`'${targetAppName}' 앱을 찾지 못했습니다.`);
    }

    mobile.log('⏳ App Tester 로딩 대기...');
    await new Promise(r => setTimeout(r, 5000));

    // 패키지명 찾기 및 클릭
    const packageName = 'com.overdare.overdare.dev';
    const pkgClicked = await mobile.findAndClick(packageName, 10);

    if (pkgClicked) {
      mobile.log(`✅ '${packageName}' 선택 완료`);
      await new Promise(r => setTimeout(r, 3000));
      
      // 'master' 검색 (사용자 요청: 최신 마스터 빌드)
      const searchInput = await mobile.findAndClick('출시 버전 및 출시 노트 검색', 5);
      
      if (searchInput) {
          mobile.log('⌨️ "master" 검색어 입력 (기존 텍스트 삭제 후)');
          // 기존 텍스트 삭제 로직 추가 (커서 끝으로 이동 후 삭제)
          mobile.adb('shell input keyevent 123'); // KEYCODE_MOVE_END
          for(let i=0; i<20; i++) mobile.adb('shell input keyevent 67'); // DEL
          
          await new Promise(r => setTimeout(r, 500));
          mobile.adb('shell input text "master"');
          mobile.adb('shell input keyevent KEYCODE_ENTER');
          // 검색 결과 로딩 대기 시간 증가 (3초 -> 10초)
          mobile.log('⏳ 검색 결과 로딩 대기 (10초)...');
          await new Promise(r => setTimeout(r, 10000));
      } else {
          mobile.log('⚠️ 검색창을 찾지 못했습니다. 그냥 진행합니다.', 'WARN');
      }

      mobile.log('🔍 최신 master 빌드 찾는 중...');
      
      const fs = require('fs');
      let targetBuild = null;
      let targetBtn = null;
      let scrollAttempts = 0;
      const maxScrolls = 5;
      const TARGET_KEYWORD = 'master';

      while (!targetBuild && scrollAttempts < maxScrolls) {
          try {
              mobile.adb('shell rm /sdcard/window_dump.xml');
          } catch (e) {} // 파일 없으면 에러나도 무방
          
          try {
              mobile.adb('shell uiautomator dump /sdcard/window_dump.xml');
          } catch (e) {
              mobile.log('⚠️ UI 덤프 실패, 재시도...');
              await new Promise(r => setTimeout(r, 1000));
              continue;
          }
          
          await new Promise(r => setTimeout(r, 500)); // 덤프 파일 생성 대기

          try {
              mobile.adb('pull /sdcard/window_dump.xml window_dump.xml');
          } catch (e) {
               mobile.log('⚠️ 덤프 파일 가져오기 실패, 재시도...');
               await new Promise(r => setTimeout(r, 1000));
               continue;
          }
          
          if (!fs.existsSync('window_dump.xml')) {
               mobile.log('⚠️ 덤프 파일이 로컬에 없습니다. 재시도...');
               await new Promise(r => setTimeout(r, 1000));
               continue;
          }

          const xmlContent = fs.readFileSync('window_dump.xml', 'utf-8');
          
          // UnrealVersion 파싱
          const versionRegex = /text="UnrealVersion: ([^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g;
          let match;
          
          while ((match = versionRegex.exec(xmlContent)) !== null) {
              const unrealVerText = match[1];
              const uY1 = parseInt(match[3]);
              
              // 1. UnrealVersion 검증 (master 또는 키워드 포함)
              if (!unrealVerText.includes('master') && !unrealVerText.includes(TARGET_KEYWORD)) continue;

              mobile.log(`   ✨ 후보 버전(Unreal) 찾음: ${unrealVerText}`);

              // 2. Title 찾기
              const textNodeRegex = /text="([^"]+)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g;
              const allTextMatches = [...xmlContent.matchAll(textNodeRegex)];
              
              let titleCandidate = null;
              let minDiff = 1000;

              for (const tm of allTextMatches) {
                  const tText = tm[1];
                  const tY1_node = parseInt(tm[3]); // Top Y
                  
                  if (tText.includes('UnrealVersion:')) continue;
                  if (tText.match(/\d+월 \d+/)) continue;
                  if (tText.includes('오전') || tText.includes('오후')) continue;

                  // 거리 계산 (절대값)
                  const diff = Math.abs(uY1 - tY1_node);
                  
                  // 600px 이내 가장 가까운 것
                  if (diff < 600 && diff < minDiff) {
                      minDiff = diff;
                      titleCandidate = tText;
                  }
              }

              // 3. 빌드 선택 결정
              let isSelected = false;
              if (unrealVerText.includes(TARGET_KEYWORD)) {
                  isSelected = true;
                  mobile.log(`   ✅ UnrealVersion에 '${TARGET_KEYWORD}' 포함됨 -> 선택`);
              } else if (titleCandidate && titleCandidate.includes(TARGET_KEYWORD)) {
                  isSelected = true;
                  mobile.log(`   ✅ Title('${titleCandidate}')에 '${TARGET_KEYWORD}' 포함됨 -> 선택`);
              }

              if (isSelected) {
                  targetBuild = { version: unrealVerText, y: uY1 };
                  break;
              } else {
                  mobile.log(`   ❌ 탈락: '${TARGET_KEYWORD}' 키워드 없음 (Unreal: ${unrealVerText})`);
              }
          }

          // [긴급 수정] 사용자 요청: 빌드 검증 없이 다운로드 버튼이 보이면 무조건 클릭 (검색어 신뢰)
          if (!targetBuild) {
              mobile.log('⚠️ 빌드 정보를 찾지 못했지만, "다운로드" 버튼이 있는지 확인합니다.');
              
              // 정규식으로 버튼 키워드 찾기 (text 또는 content-desc에 포함)
              const btnForceRegex = /(text|content-desc)="([^"]*(다운로드|열기|Open|Update|Install|설치)[^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g;
              
              let forceMatch;
              while ((forceMatch = btnForceRegex.exec(xmlContent)) !== null) {
                  const keyword = forceMatch[2]; // 발견된 텍스트
                  const x1 = parseInt(forceMatch[4]);
                  const y1 = parseInt(forceMatch[5]);
                  const x2 = parseInt(forceMatch[6]);
                  const y2 = parseInt(forceMatch[7]);
                  
                  targetBtn = {
                      text: keyword,
                      x: Math.floor((x1 + x2) / 2),
                      y: Math.floor((y1 + y2) / 2)
                  };
                  mobile.log(`✅ [Force] '${keyword}' 버튼 발견! (빌드 검증 패스)`);
                  break; // 첫 번째 발견된 버튼 클릭
              }
          }

          if (targetBuild) {
              mobile.log(`✅ 설치할 빌드 선택: ${targetBuild.version}`);
              
              // 버튼 찾기 로직 개선: 정규식 대신 matchAll로 모든 노드 순회하며 유연하게 검사
              const btnKeywords = ['다운로드', '열기', 'Open', 'Update', 'Install', '설치'];
              let btnMatch = null;
              let minBtnDist = 2000;
              
              const allLines = xmlContent.match(/<node [^>]+>/g) || [];
              
              for (const line of allLines) {
                  // bounds 추출
                  const boundsMatch = line.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
                  if (!boundsMatch) continue;
                  
                  const x1 = parseInt(boundsMatch[1]);
                  const y1 = parseInt(boundsMatch[2]);
                  const x2 = parseInt(boundsMatch[3]);
                  const y2 = parseInt(boundsMatch[4]);
                  const centerY = Math.floor((y1 + y2) / 2);
                  
                  // text 추출
                  const textMatch = line.match(/text="([^"]*)"/);
                  const textVal = textMatch ? textMatch[1] : '';
                  
                  // content-desc 추출
                  const descMatch = line.match(/content-desc="([^"]*)"/);
                  const descVal = descMatch ? descMatch[1] : '';
                  
                  // 키워드 검사
                  const combinedText = (textVal + ' ' + descVal).toLowerCase();
                  const foundKeyword = btnKeywords.find(k => combinedText.includes(k.toLowerCase()));
                  
                  if (foundKeyword) {
                      const dist = Math.abs(y1 - targetBuild.y);
                      // mobile.log(`   [버튼 후보] '${textVal || descVal}' 거리: ${dist}`);
                      
                      if (dist < minBtnDist) {
                          minBtnDist = dist;
                          btnMatch = {
                              text: foundKeyword, // 발견된 키워드 사용
                              x: Math.floor((x1 + x2) / 2),
                              y: centerY
                          };
                      }
                  }
              }
              
              targetBtn = btnMatch;
              
              if (!targetBtn) {
                  mobile.log('⚠️ 빌드는 찾았으나 버튼을 못 찾았습니다.', 'WARN');
              }
          }
          
          if (!targetBtn) {
              if (targetBuild) {
                  mobile.log(`⬇️ 버튼 찾기 위해 스크롤`);
                  mobile.adb('shell input swipe 500 1500 500 1000 500'); 
              } else {
                  mobile.log(`⬇️ 화면에 타겟 빌드가 없습니다. 스크롤합니다.`);
                  mobile.adb('shell input swipe 500 1500 500 500 500'); 
              }
              
              await new Promise(r => setTimeout(r, 2000)); 
              scrollAttempts++;
              targetBuild = null; 
          }
      }
      
      if (targetBtn) {
          mobile.log(`✅ '${targetBtn.text}' 버튼 발견: (${targetBtn.x}, ${targetBtn.y})`);
          mobile.log('👆 버튼 클릭 (확실하게 2회 시도)');
          mobile.adb(`shell input tap ${targetBtn.x} ${targetBtn.y}`);
          await new Promise(r => setTimeout(r, 1000)); // 클릭 간격 1초
          
          // 혹시 안 눌렸을까봐 한 번 더 클릭
          if (!['열기', 'Open'].includes(targetBtn.text)) {
               mobile.adb(`shell input tap ${targetBtn.x} ${targetBtn.y}`);
          }
          
          if (targetBtn.text === '열기' || targetBtn.text === 'Open') {
             mobile.log('🎉 "열기" 버튼 발견! 이미 설치되어 있습니다. 앱을 실행합니다.');
          } else {
             const currentWifi = mobile.getWifiSSID();
             mobile.log(`📶 현재 Wi-Fi: ${currentWifi}`);
             
             let maxWaitTime = 180000; 
             if (currentWifi.toLowerCase().includes('qa access')) {
                 maxWaitTime = 600000; 
                 mobile.log(`⚠️ 저속 Wi-Fi 감지! 다운로드 대기 시간을 ${maxWaitTime/60000}분으로 늘립니다.`);
             }

             mobile.log(`⏳ 다운로드 중... "설치" 팝업 대기 (최대 ${maxWaitTime/60000}분)`);
             
             let installBtn = null;
             const downloadStartTime = Date.now();
             
             while (Date.now() - downloadStartTime < maxWaitTime) {
                 installBtn = await mobile.findAndClick('설치', 2);
                 if (installBtn) {
                     mobile.log('✅ "설치" 버튼 발견 및 클릭');
                     break;
                 }
                 installBtn = await mobile.findAndClick('Install', 2);
                 if (installBtn) {
                     mobile.log('✅ "Install" 버튼 발견 및 클릭');
                     break;
                 }
                 installBtn = await mobile.findAndClick('업데이트', 2);
                 if (installBtn) {
                     mobile.log('✅ "업데이트" 버튼 발견 및 클릭');
                     break;
                 }
                 
                 const openBtnCheck = await mobile.findElement('열기');
                 if (openBtnCheck) {
                     mobile.log('ℹ️ "설치" 팝업 없이 바로 "열기"가 발견되었습니다.');
                     break;
                 }
                 
                 await new Promise(r => setTimeout(r, 2000));
             }
             
             mobile.log('⏳ 설치 진행 중... (10초 대기)');
             await new Promise(r => setTimeout(r, 10000));
             mobile.log('🎉 설치 대기 완료.');
          }
          
      } else {
          mobile.log(`❌ '${TARGET_KEYWORD}'가 포함된 빌드를 찾을 수 없습니다.`, 'ERROR');
          throw new Error(`Build with keyword '${TARGET_KEYWORD}' not found.`);
      }

    } else {
      mobile.log(`❌ '${packageName}'를 목록에서 찾지 못했습니다. 스크롤이 필요할 수도 있습니다.`, 'WARN');
    }

  } catch (error) {
    mobile.error(`Step 1 실패: ${error.message}`, 'step01_install');
    process.exit(1);
  }
}

main();