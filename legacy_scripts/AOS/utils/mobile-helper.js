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
      const result = this.adb('shell dumpsys wifi | grep "SSID"');
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
      const isWindows = process.platform === 'win32';
      const env = { ...process.env };
      if (isWindows) {
          env.MSYS_NO_PATHCONV = '1';
      }
      return execSync(`adb ${command}`, { encoding: 'utf-8', stdio: 'pipe', env: env }).trim();
    } catch (e) {
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

  // 시스템 팝업 (One UI 업데이트 등) 감지 및 닫기
  checkAndDismissSystemPopup(xmlContent) {
      // 1. One UI 업데이트 / 소프트웨어 업데이트 팝업 감지
      // 키워드: "소프트웨어 업데이트", "Software update", "나중에", "Later", "지금 설치"
      // 보통 "나중에" 버튼이 있거나, 그냥 뒤로가기로 닫을 수 있음.
      const updateKeywords = ['소프트웨어 업데이트', 'Software update', 'One UI'];
      const hasUpdatePopup = updateKeywords.some(k => xmlContent.includes(`text="${k}"`));

      if (hasUpdatePopup) {
          this.log('🚨 [시스템 팝업 감지] 소프트웨어 업데이트 팝업이 발견되었습니다.', 'WARN');
          this.log('🔙 뒤로가기(Back) 키를 눌러 팝업을 닫습니다.');
          this.adb('shell input keyevent KEYCODE_BACK');
          
          // 닫히는 시간 대기
          try { require('child_process').execSync('sleep 1'); } catch(e) {}
          return true;
      }
      return false;
  }

  // 요소 찾기 (좌표 반환)
  findElement(text, exactMatch = true) {
    const dumpPath = '/sdcard/window_dump.xml';
    const localPath = path.join(process.cwd(), 'window_dump.xml');

    try { this.adb(`shell rm ${dumpPath}`); } catch (e) {}

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

    // [전역 방어 로직] 시스템 업데이트 팝업 감지 시 뒤로가기로 닫기
    this.checkAndDismissSystemPopup(xmlContent);

    let regex;
    if (exactMatch) {
      regex = new RegExp(`text="${text}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`, 'i');
    } else {
      regex = new RegExp(`text="[^"]*${text}[^"]*"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`, 'i');
    }

    const match = xmlContent.match(regex);
    
    let regexDesc;
    if (exactMatch) {
      regexDesc = new RegExp(`content-desc="${text}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`, 'i');
    } else {
      regexDesc = new RegExp(`content-desc="[^"]*${text}[^"]*"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`, 'i');
    }
    const matchDesc = xmlContent.match(regexDesc);

    const finalMatch = match || matchDesc;

    if (finalMatch) {
      const [_, x1, y1, x2, y2] = finalMatch.map(Number);
      return {
        x: Math.floor((x1 + x2) / 2),
        y: Math.floor((y1 + y2) / 2),
        width: x2 - x1,
        height: y2 - y1,
        foundText: text
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
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    this.log(`❌ 찾기 실패: '${text}' (시간 초과)`, 'FAIL');
    return false;
  }
}

module.exports = MobileHelper;
