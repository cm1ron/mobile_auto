const MobileHelper = require('./utils/mobile-helper');

async function main() {
  const mobile = new MobileHelper();
  
  try {
    mobile.log('🚀 [Step 0] 디바이스 깨우기 및 App Tester 실행');

    // 1. 화면 켜기
    mobile.log('📱 화면 켜는 중...');
    mobile.adb('shell input keyevent KEYCODE_WAKEUP');
    await new Promise(r => setTimeout(r, 1000));

    // 확실하게 홈으로 이동 (여러 번 시도)
    mobile.log('🏠 홈 화면으로 이동...');
    mobile.adb('shell input keyevent KEYCODE_HOME');
    await new Promise(r => setTimeout(r, 1000));
    mobile.adb('shell input keyevent KEYCODE_HOME');
    await new Promise(r => setTimeout(r, 1000));

    // 2. 최근 앱 정리 (모두 닫기) - 선택 사항이지만 요청하셨으므로 시도
    mobile.log('🧹 최근 앱 정리 시도...');
    mobile.adb('shell input keyevent KEYCODE_APP_SWITCH'); 
    await new Promise(r => setTimeout(r, 1500));
    
    // "모두 닫기" 버튼 찾기 (시간 늘리고 부분 일치 허용)
    const closeAllClicked = await mobile.findAndClick('모두 닫기', 5, false); 
    if (!closeAllClicked) {
        await mobile.findAndClick('Close all', 5, false);
    }
    
    // 다시 홈으로 (모두 닫았거나, 못 찾았거나 상관없이 홈에서 시작)
    mobile.adb('shell input keyevent KEYCODE_HOME');
    await new Promise(r => setTimeout(r, 2000));

    // 3. 앱 서랍 열기
    mobile.log('📂 앱 서랍 열기 (위로 스와이프)...');
    mobile.adb('shell input swipe 720 2200 720 500 500');
    await new Promise(r => setTimeout(r, 2000));

    // 3. App Tester 앱 찾기 및 실행
    const targetAppName = 'App Tester'; 
    
    // 스마트 탐색 (양방향 스와이프)
    const found = await mobile.findAppInDrawer(targetAppName);

    if (found) {
        const element = mobile.findElement(targetAppName); // 찾았으므로 좌표 다시 획득
        mobile.log(`✅ 앱 발견! 좌표: (${element.x}, ${element.y})`);
        mobile.log('👆 앱 실행 (탭)');
        mobile.adb(`shell input tap ${element.x} ${element.y}`);
        mobile.log('🎉 App Tester 실행 완료!');
    } else {
        throw new Error(`'${targetAppName}' 앱을 찾지 못했습니다.`);
    }

    // 4. App Tester 앱 내부 로직
    mobile.log('⏳ App Tester 로딩 대기...');
    await new Promise(r => setTimeout(r, 5000)); // 로딩 대기

    // 패키지명 찾기 및 클릭
    const packageName = 'com.overdare.overdare.dev';
    const pkgClicked = await mobile.findAndClick(packageName, 10);

    if (pkgClicked) {
      mobile.log(`✅ '${packageName}' 선택 완료`);
      
      // 상세 화면 로딩 대기
      await new Promise(r => setTimeout(r, 3000));
      
      // 5. 'master' 검색
      // 검색창 텍스트: "출시 버전 및 출시 노트 검색"
      const searchInput = await mobile.findAndClick('출시 버전 및 출시 노트 검색', 5);
      
      if (searchInput) {
          mobile.log('⌨️ "master" 검색어 입력');
          mobile.adb('shell input text "master"');
          mobile.adb('shell input keyevent KEYCODE_ENTER');
          await new Promise(r => setTimeout(r, 2000));
      } else {
          mobile.log('⚠️ 검색창을 찾지 못했습니다. 그냥 진행합니다.', 'WARN');
      }

      // 6. 'master' 빌드 찾기 및 다운로드 (XML 파싱)
      mobile.log('🔍 최신 master 빌드 찾는 중...');
      
      // 검색 결과 로딩 대기 (충분히)
      await new Promise(r => setTimeout(r, 5000));
      
      const fs = require('fs');
      let targetBuild = null;
      let targetBtn = null;
      let scrollAttempts = 0;
      const maxScrolls = 5;

      while (!targetBuild && scrollAttempts < maxScrolls) {
          // 덤프 갱신
          mobile.adb('shell rm /sdcard/window_dump.xml');
          mobile.adb('shell uiautomator dump /sdcard/window_dump.xml');
          mobile.adb('pull /sdcard/window_dump.xml window_dump.xml');
          
          if (!fs.existsSync('window_dump.xml')) {
               mobile.log('⚠️ 덤프 파일이 없습니다. 재시도...');
               await new Promise(r => setTimeout(r, 1000));
               continue;
          }

          const xmlContent = fs.readFileSync('window_dump.xml', 'utf-8');
          
          // UnrealVersion 파싱 및 파일명(타이틀) 검증 로직
          const versionRegex = /text="UnrealVersion: ([^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g;
          let match;
          
          while ((match = versionRegex.exec(xmlContent)) !== null) {
              const unrealVerText = match[1];
              const uY1 = parseInt(match[3]);
              const uY2 = parseInt(match[5]);
              
              // 1. UnrealVersion에 'master'가 포함되어 있는지 확인
              if (!unrealVerText.includes('master')) continue;

              // 2. 파일명(타이틀) 찾기: UnrealVersion 바로 위에 있는 텍스트
              // UnrealVersion의 Y1보다 작으면서(위쪽), 가장 가까운 텍스트를 찾아야 함.
              // 보통 파일명은 UnrealVersion보다 약 100~300px 위에 있음.
              
              // XML에서 모든 텍스트 노드 추출
              const textNodeRegex = /text="([^"]+)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g;
              let textMatch;
              let titleCandidate = null;
              let minDiff = 1000;

              // 정규식 인덱스 리셋을 위해 새로운 루프 사용 필요하지만, 
              // exec는 global flag가 있어서 복잡하므로, matchAll 또는 단순 루프 사용
              // 여기서는 원본 XML을 다시 파싱
              while ((textMatch = textNodeRegex.exec(xmlContent)) !== null) {
                  const tText = textMatch[1];
                  const tY1 = parseInt(textMatch[3]);
                  const tY2 = parseInt(textMatch[5]);
                  
                  // 제외할 텍스트 패턴 (더 강력하게 필터링)
                  if (tText.includes('UnrealVersion:')) continue;
                  
                  // 날짜/용량 텍스트 강력 필터링
                  if (tText.includes('MB') || tText.includes('KB') || tText.includes('GB')) continue;
                  if (tText.includes('오전') || tText.includes('오후') || tText.includes('AM') || tText.includes('PM')) continue;
                  if (/\d+월\s*\d+/.test(tText)) continue; // "12월 9" 등 날짜 패턴
                  
                  // 버튼 및 기타 잡다한 텍스트 제외
                  if (['다운로드', '열기', 'Update', 'Install', 'Open', '최신', '설치된 출시 버전 없음'].includes(tText)) continue;
                  if (tText.length < 5) continue; // 너무 짧은 텍스트 제외

                  // UnrealVersion보다 위에 있어야 함 (Y2 < uY1)
                  // 거리 제한을 500px로 넉넉하게 잡음 (중간에 날짜 텍스트 등이 끼어있을 수 있으므로)
                  if (tY2 < uY1) {
                      const diff = uY1 - tY2;
                      if (diff < 500 && diff < minDiff) {
                          minDiff = diff;
                          titleCandidate = tText;
                      }
                  }
              }

              mobile.log(`   검사 중: [Unreal] ${unrealVerText} | [Title] ${titleCandidate || '(못찾음)'}`);

              // 3. 파일명(타이틀)에도 'master'가 포함되어 있는지 확인
              if (titleCandidate && titleCandidate.includes('master')) {
                  mobile.log(`   ✅ 조건 만족! (Title & Unreal 둘 다 master 포함)`);
                  targetBuild = { version: unrealVerText, y1: uY1, y2: uY2 };
                  break; // 가장 최신(상단) 빌드 선택
              } else {
                  mobile.log(`   ❌ 조건 불만족 (파일명에 master 없음)`);
              }
          }

          if (targetBuild) {
              mobile.log(`✅ 설치할 빌드 선택: ${targetBuild.version}`);
              
              // 버튼 찾기 로직
              // '설치' 텍스트 추가
              const btnRegex = /text="(다운로드|열기|Open|Update|Install|설치)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g;
              let btnMatch;
              let minDistance = 10000;
              
              while ((btnMatch = btnRegex.exec(xmlContent)) !== null) {
                  const btnText = btnMatch[1];
                  const btnY1 = parseInt(btnMatch[3]);
                  const btnY2 = parseInt(btnMatch[5]);
                  
                  if (btnY2 < targetBuild.y1) {
                      const distance = targetBuild.y1 - btnY2;
                      if (distance < 500 && distance < minDistance) {
                          minDistance = distance;
                          targetBtn = { 
                              text: btnText,
                              x: Math.floor((parseInt(btnMatch[2]) + parseInt(btnMatch[4])) / 2),
                              y: Math.floor((btnY1 + btnY2) / 2)
                          };
                      }
                  }
              }
              
              if (!targetBtn) {
                  mobile.log('⚠️ 빌드는 찾았으나 버튼을 못 찾았습니다. 조금만 스크롤하여 버튼을 찾습니다.', 'WARN');
                  // targetBuild를 초기화하지 않음 (이 빌드를 계속 노림)
                  // 대신 스크롤 루프에서 '미세 스크롤'을 수행하도록 유도
              }
          }
          
          if (!targetBtn) {
              if (targetBuild) {
                  // 빌드는 찾았는데 버튼이 없으면, 버튼이 보이도록 조금만 내림
                  mobile.log(`⬇️ 버튼 찾기 위해 미세 스크롤 (1/3 화면)`);
                  mobile.adb('shell input swipe 500 1500 500 1000 500'); 
              } else {
                  // 빌드 자체를 못 찾았으면 다음 페이지로 휙 넘김
                  mobile.log(`⬇️ 화면에 master 빌드가 없습니다. 아래로 스크롤합니다. (${scrollAttempts + 1}/${maxScrolls})`);
                  mobile.adb('shell input swipe 500 1500 500 500 500'); 
              }
              
              await new Promise(r => setTimeout(r, 2000)); 
              scrollAttempts++;
              
              // 재시도 시 targetBuild가 유지되어 있으면 안되므로 초기화 (새 덤프에서 다시 찾아야 좌표가 맞음)
              targetBuild = null; 
          }
      }
      
      if (targetBtn) {
          mobile.log(`✅ '${targetBtn.text}' 버튼 발견: (${targetBtn.x}, ${targetBtn.y})`);
          mobile.log('👆 버튼 클릭');
          mobile.adb(`shell input tap ${targetBtn.x} ${targetBtn.y}`);
          
          if (targetBtn.text === '열기' || targetBtn.text === 'Open') {
             mobile.log('🎉 "열기" 버튼 발견! 이미 설치되어 있습니다. 앱을 실행합니다.');
          } else {
             // Wi-Fi 상태 확인 및 대기 시간 설정
             const currentWifi = mobile.getWifiSSID();
             mobile.log(`📶 현재 Wi-Fi: ${currentWifi}`);
             
             let maxWaitTime = 180000; // 기본 3분
             if (currentWifi.toLowerCase().includes('qa access')) {
                 maxWaitTime = 600000; // 10분
                 mobile.log(`⚠️ 저속 Wi-Fi 감지! 다운로드 대기 시간을 ${maxWaitTime/60000}분으로 늘립니다.`);
             }

             mobile.log(`⏳ 다운로드 중... "설치" 팝업 대기 (최대 ${maxWaitTime/60000}분)`);
             
             // 다운로드 후 "설치" 팝업이 뜰 때까지 대기
             // 팝업의 "설치" 버튼을 찾아야 함.
             let installBtn = null;
             const downloadStartTime = Date.now();
             
             while (Date.now() - downloadStartTime < maxWaitTime) { // 동적 대기 시간 적용
                 installBtn = await mobile.findAndClick('설치', 2);
                 if (installBtn) {
                     mobile.log('✅ "설치" 버튼 발견 및 클릭');
                     break;
                 }
                 // 영문일 수도 있음
                 installBtn = await mobile.findAndClick('Install', 2);
                 if (installBtn) {
                     mobile.log('✅ "Install" 버튼 발견 및 클릭');
                     break;
                 }
                 
                 // 혹시 "업데이트" 팝업일 수도 있음
                 installBtn = await mobile.findAndClick('업데이트', 2);
                 if (installBtn) {
                     mobile.log('✅ "업데이트" 버튼 발견 및 클릭');
                     break;
                 }

                 // 다운로드 없이 바로 "열기"가 떴는지 확인 (이미 설치된 경우)
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
             
             /* "열기" 버튼 확인 로직 제거 (15초 대기로 대체)
             const openBtn = await mobile.findAndClick('열기', 60);
             if (openBtn) {
                 mobile.log('🎉 설치 완료 및 앱 실행(열기) 성공!');
             } else {
                 mobile.log('⚠️ 설치 시간이 너무 오래 걸리거나 "열기" 버튼을 찾지 못했습니다.', 'WARN');
             }
             */
          }
          
      } else {
          mobile.log('❌ "master"가 포함된 UnrealVersion을 찾을 수 없습니다.', 'ERROR');
      }

    } else {
      mobile.log(`❌ '${packageName}'를 목록에서 찾지 못했습니다. 스크롤이 필요할 수도 있습니다.`, 'WARN');
      // 스크롤 로직 추가 가능 (아래로 스와이프)
    }

  } catch (error) {
    mobile.error(`Step 0 실패: ${error.message}`, 'step00_install');
    process.exit(1);
  }
}

main();

