const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class MobileHelper {
  constructor() {
    this.baseDir = process.cwd();
    
    // 날짜별 폴더 생성 (예: failures/2025-12-08)
    const today = new Date().toISOString().split('T')[0];
    this.sessionDir = path.join(this.baseDir, 'failures', today);
    
    if (!fs.existsSync(this.sessionDir)) {
      fs.mkdirSync(this.sessionDir, { recursive: true });
    }

    // 로그 파일 설정
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[1]; // 시간만 추출
    this.logFile = path.join(this.sessionDir, `execution_${timestamp}.log`);
    
    this.log(`🚀 자동화 시작: ${new Date().toISOString()}`);
  }

  // 로그 기록
  log(message, type = 'INFO') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${type}] ${message}`;
    
    console.log(logMessage); // 콘솔 출력
    
    // 파일 저장
    try {
      fs.appendFileSync(this.logFile, logMessage + '\n');
    } catch (e) {
      console.error('로그 파일 쓰기 실패:', e);
    }
  }

  // 에러 기록 및 스크린샷
  error(message, stepName = 'unknown') {
    this.log(message, 'ERROR');
    return this.captureScreenshot(`error_${stepName}`);
  }

  // 스크린샷 캡처
  captureScreenshot(name) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[1]; // 시간만
      const filename = `${name}_${timestamp}.png`;
      const localPath = path.join(this.sessionDir, filename);
      
      this.adb('shell screencap -p /sdcard/screenshot.png');
      this.adb(`pull /sdcard/screenshot.png "${localPath}"`);
      this.adb('shell rm /sdcard/screenshot.png');
      
      this.log(`📸 스크린샷 저장: ${localPath}`, 'SCREENSHOT');
      return localPath;
    } catch (e) {
      this.log(`❌ 스크린샷 실패: ${e.message}`, 'ERROR');
      return null;
    }
  }

    // 앱 서랍 등에서 스크롤하며 앱 찾기 (양방향 탐색)
    async findAppInDrawer(appName) {
        this.log(`🔍 앱 서랍에서 '${appName}' 탐색 시작...`);
        
        // 1. 현재 화면에서 찾기
        if (this.findElement(appName)) return true;

        const maxPages = 5;
        const fs = require('fs');
        const dumpPath = '/sdcard/window_dump.xml';
        const localPath = 'window_dump_check.xml';

        // 헬퍼: 현재 화면 XML 해시(간이) 구하기 - 화면 변화 감지용
        const getScreenHash = () => {
            try {
                this.adb(`shell rm ${dumpPath}`);
            } catch (e) {}
            try {
                // dump 실패 시 재시도 로직 포함된 adb 사용 불가 (무한루프 가능성)
                // 직접 execSync 사용하거나, findElement 내부 로직 재사용
                // 여기서는 간단히 execSync 사용
                require('child_process').execSync(`adb shell uiautomator dump ${dumpPath}`);
                require('child_process').execSync(`adb pull ${dumpPath} "${localPath}"`);
                
                if (fs.existsSync(localPath)) {
                    return fs.readFileSync(localPath, 'utf-8').length; 
                }
            } catch (e) {}
            return 0;
        };

        // 2. 오른쪽으로 이동하며 찾기 (->)
        this.log('➡️ 다음 페이지(오른쪽)로 탐색 시도...');
        let prevHash = getScreenHash();
        
        for (let i = 0; i < maxPages; i++) {
            this.adb('shell input swipe 900 1200 100 1200 300'); // Next Page
            await new Promise(r => setTimeout(r, 2000));
            
            if (this.findElement(appName)) return true;
            
            const currHash = getScreenHash();
            // 화면 크기(바이트)가 같으면 더 이상 안 움직인 것으로 간주
            if (Math.abs(currHash - prevHash) < 50) { 
                this.log('🛑 더 이상 오른쪽 페이지가 없습니다.');
                break;
            }
            prevHash = currHash;
        }

        // 3. 왼쪽으로 이동하며 찾기 (<-)
        this.log('⬅️ 이전 페이지(왼쪽)로 탐색 시도...');
        prevHash = getScreenHash();

        for (let i = 0; i < maxPages * 2; i++) { 
            this.adb('shell input swipe 100 1200 900 1200 300'); // Prev Page
            await new Promise(r => setTimeout(r, 2000));

            if (this.findElement(appName)) return true;

            const currHash = getScreenHash();
            if (Math.abs(currHash - prevHash) < 50) {
                this.log('🛑 더 이상 왼쪽 페이지가 없습니다.');
                break;
            }
            prevHash = currHash;
        }

        return false;
    }

  // 현재 Wi-Fi SSID 확인
  getWifiSSID() {
    try {
      // Android 10 이상에서는 권한 때문에 SSID가 안 보일 수 있으나, dumpsys를 이용해 시도
      // 방법 1: dumpsys wifi
      // 방법 2: dumpsys netstats (복잡)
      // 방법 3: adb shell settings get global wifi_on (켜져있는지만 확인)
      
      // 가장 확실한 방법: dumpsys wifi | grep "Wi-Fi is" or "SSID"
      const result = this.adb('shell dumpsys wifi | grep "SSID"');
      // 결과 예: "SSID: "MyWiFi", BSSID: ..."
      
      const match = result.match(/SSID: "([^"]+)"/) || result.match(/SSID: ([^\s,]+)/);
      if (match) {
          return match[1];
      }
      return 'Unknown';
    } catch (e) {
      return 'Unknown';
    }
  }

  // ADB 명령어 실행
  adb(command) {
    try {
      // OS 확인 (win32: Windows, darwin: Mac, linux: Linux)
      const isWindows = process.platform === 'win32';
      
      // 실행 환경 변수 복사
      const env = { ...process.env };
      
      // Windows(Git Bash 등)에서 경로 자동 변환 방지
      if (isWindows) {
          env.MSYS_NO_PATHCONV = '1';
      }

      // execSync 옵션에 env 전달
      return execSync(`adb ${command}`, { encoding: 'utf-8', stdio: 'pipe', env: env }).trim();
    } catch (e) {
      // ADB 에러는 호출부에서 처리하도록 throw
      throw new Error(`ADB Execution Failed: ${e.message}`);
    }
  }

  // 화면 텍스트 가져오기 (디버깅용)
  getScreenText() {
    const localPath = path.join(process.cwd(), 'window_dump.xml');
    if (!fs.existsSync(localPath)) return [];
    
    const xmlContent = fs.readFileSync(localPath, 'utf-8');
    const matches = xmlContent.match(/text="([^"]+)"/g);
    if (!matches) return [];
    
    return matches.map(s => s.replace('text=', '').replace(/"/g, ''));
  }

  // 요소 찾기 (좌표 반환)
  findElement(text, exactMatch = true) {
    const dumpPath = '/sdcard/window_dump.xml';
    const localPath = path.join(process.cwd(), 'window_dump.xml');

    // 기존 덤프 삭제 (실패해도 무시)
    try {
      this.adb(`shell rm ${dumpPath}`);
    } catch (e) {
      // console.warn('덤프 파일 삭제 실패 (무시됨):', e.message);
    }

    // UI 덤프 (재시도 로직 추가)
    let dumpSuccess = false;
    for (let i = 0; i < 3; i++) {
        try {
            const dumpResult = this.adb(`shell uiautomator dump ${dumpPath}`);
            if (dumpResult.includes('UI hierchary dumped to')) {
                dumpSuccess = true;
                break;
            }
        } catch (e) {
            this.log(`⚠️ UI 덤프 실패 (${i + 1}/3): ${e.message}`, 'WARN');
            // 잠시 대기 후 재시도
            try { require('child_process').execSync('sleep 1'); } catch(e2) {}
        }
    }

    if (!dumpSuccess) {
        this.log('⚠️ UI 덤프 최종 실패', 'WARN');
        return null;
    }

    try {
      this.adb(`pull ${dumpPath} "${localPath}"`);
    } catch (e) {
      this.log(`⚠️ UI 덤프 과정 중 에러: ${e.message}`, 'WARN');
      return null;
    }

    if (!fs.existsSync(localPath)) return null;
    const xmlContent = fs.readFileSync(localPath, 'utf-8');

    // 정규식 생성
    let regex;
    if (exactMatch) {
      // 대소문자 구분 없이 "GO"만 정확히 매칭 (앞뒤에 다른 글자 없어야 함)
      // text="GO" 또는 content-desc="GO"
      // 주의: RegExp의 'i' 플래그는 유지하되, 전체 단어 일치를 보장해야 함.
      // 하지만 XML 속성값 안에서의 매칭이므로 text="GO"가 정확히 닫히는지 확인하면 됨.
      // 사용자가 "qa", "QA" 등 대소문자 무관하게 요청했으므로 'i' 플래그 사용
      regex = new RegExp(`text="${text}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`, 'i');
    } else {
      regex = new RegExp(`text="[^"]*${text}[^"]*"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`, 'i');
    }

    const match = xmlContent.match(regex);
    
    // content-desc 검색 추가
    let regexDesc;
    if (exactMatch) {
      regexDesc = new RegExp(`content-desc="${text}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`, 'i');
    } else {
      regexDesc = new RegExp(`content-desc="[^"]*${text}[^"]*"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`, 'i');
    }
    const matchDesc = xmlContent.match(regexDesc);

    const finalMatch = match || matchDesc;

    if (finalMatch) {
      // 텍스트 검증: exactMatch가 true인데 부분 일치된 경우 걸러내기
      if (exactMatch) {
         // 정규식에서 text="값" 형태로 찾았으므로, 값 자체만 추출해서 비교
         // 하지만 정규식 자체가 text="GO"를 찾도록 설계되었고 'i' 플래그가 있어 대소문자 무시됨.
         // 문제는 'text="Google"'도 'text="Go' 부분과 매칭되지 않게 하는 것.
         // 위 정규식은 text="GO" (따옴표로 닫힘)를 찾으므로 Google과는 매칭되지 않음.
         // 따라서 별도의 includes 검사는 제거하거나, 정규식 매칭을 신뢰함.
         // 다만 match[0] 전체 문자열에서 text="찾는값" 패턴이 있는지 대소문자 무시하고 확인.
      }

      const [_, x1, y1, x2, y2] = finalMatch.map(Number);
      return {
        x: Math.floor((x1 + x2) / 2),
        y: Math.floor((y1 + y2) / 2),
        width: x2 - x1,
        height: y2 - y1,
        foundText: text // 발견된 텍스트
      };
    }

    return null;
  }

  // 요소 찾을 때까지 대기 및 클릭
  async findAndClick(text, timeoutSec = 10, exactMatch = true) {
    this.log(`🔍 '${text}' 찾는 중... (최대 ${timeoutSec}초)`);
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutSec * 1000) {
      const element = this.findElement(text, exactMatch);
      
      if (element) {
        this.log(`✅ 발견: '${text}' at (${element.x}, ${element.y})`);
        this.adb(`shell input tap ${element.x} ${element.y}`);
        this.log(`👆 클릭: '${text}'`);
        return true;
      }
      
      // 1초 대기
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    this.log(`❌ 찾기 실패: '${text}' (시간 초과)`, 'FAIL');
    const screenTexts = this.getScreenText();
    this.log(`   👀 현재 화면 텍스트: ${screenTexts.slice(0, 10).join(', ')}...`);
    
    return false;
  }
}

module.exports = MobileHelper;
