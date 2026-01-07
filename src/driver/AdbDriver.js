const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class AdbDriver {
  constructor() {
    this.baseDir = process.cwd();
    
    // 로그/에러 저장 경로 설정 (failures 폴더)
    const today = new Date().toISOString().split('T')[0];
    this.sessionDir = path.join(this.baseDir, 'failures', today);
    
    if (!fs.existsSync(this.sessionDir)) {
      fs.mkdirSync(this.sessionDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[1];
    this.logFile = path.join(this.sessionDir, `execution_${timestamp}.log`);
    
    this.log(`🚀 Driver initialized: ${new Date().toISOString()}`);
  }

  log(message, type = 'INFO') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${type}] ${message}`;
    console.log(logMessage);
    try {
      fs.appendFileSync(this.logFile, logMessage + '\n');
    } catch (e) {
      console.error('Failed to write to log file:', e);
    }
  }

  error(message, stepName = 'unknown') {
    this.log(message, 'ERROR');
    return this.captureScreenshot(`error_${stepName}`);
  }

  captureScreenshot(name) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[1];
      const filename = `${name}_${timestamp}.png`;
      const localPath = path.join(this.sessionDir, filename);
      
      this.adb('shell screencap -p /sdcard/screenshot.png');
      this.adb(`pull /sdcard/screenshot.png "${localPath}"`);
      this.adb('shell rm /sdcard/screenshot.png');
      
      this.log(`📸 Screenshot saved: ${localPath}`, 'SCREENSHOT');
      return localPath;
    } catch (e) {
      this.log(`❌ Screenshot failed: ${e.message}`, 'ERROR');
      return null;
    }
  }

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

  // --- Element Finding Logic ---

  refreshDump() {
    const dumpPath = '/sdcard/window_dump.xml';
    const localPath = path.join(this.sessionDir, 'temp_dump.xml');

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
            this.log(`⚠️ UI Dump failed (${i + 1}/3): ${e.message}`, 'WARN');
            this.sleep(1000);
        }
    }

    if (!dumpSuccess) return false;

    try { this.adb(`pull ${dumpPath} "${localPath}"`); } catch (e) { return false; }
    
    return fs.existsSync(localPath);
  }

  findElement(text, exactMatch = true) {
    if (!this.refreshDump()) return null;

    const localPath = path.join(this.sessionDir, 'temp_dump.xml');
    const xmlContent = fs.readFileSync(localPath, 'utf-8');

    // [Global] System Popup Check (One UI / Software Update)
    // 팝업 감지 시 뒤로가기(Back)를 눌러 닫고 재시도
    if (this._isSystemPopup(xmlContent)) {
        this.log('🛡️ 시스템 업데이트(One UI) 팝업 감지! 뒤로가기로 닫습니다...', 'WARN');
        this.adb('shell input keyevent 4'); // Back
        this.sleep(2000);
        return this.findElement(text, exactMatch); // 재귀 호출로 다시 탐색
    }

    let regex;
    const escapedText = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Escape regex chars
    
    if (exactMatch) {
      regex = new RegExp(`text="${escapedText}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`, 'i');
    } else {
      regex = new RegExp(`text="[^"]*${escapedText}[^"]*"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`, 'i');
    }

    const match = xmlContent.match(regex);
    
    // Also check content-desc
    let regexDesc;
    if (exactMatch) {
      regexDesc = new RegExp(`content-desc="${escapedText}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`, 'i');
    } else {
      regexDesc = new RegExp(`content-desc="[^"]*${escapedText}[^"]*"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`, 'i');
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
        raw: finalMatch[0]
      };
    }
    return null;
  }

  async findAndClick(text, timeoutSec = 10, exactMatch = true) {
    this.log(`🔍 Finding '${text}'...`);
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutSec * 1000) {
      const element = this.findElement(text, exactMatch);
      if (element) {
        this.log(`✅ Found '${text}', clicking at (${element.x}, ${element.y})`);
        this.adb(`shell input tap ${element.x} ${element.y}`);
        return true;
      }
      await this.sleep(1000);
    }
    this.log(`❌ Failed to find '${text}'`, 'WARN');
    return false;
  }

  // Helper for raw XML operations (needed for slider logic)
  getDumpContent() {
      const localPath = path.join(this.sessionDir, 'temp_dump.xml');
      if (fs.existsSync(localPath)) return fs.readFileSync(localPath, 'utf-8');
      return '';
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // 시스템 팝업(업데이트 등) 감지 헬퍼
  _isSystemPopup(xmlContent) {
      // 1. Software Update (English/Korean)
      if (xmlContent.includes('text="Software update"') || xmlContent.includes('text="소프트웨어 업데이트"')) {
          return true;
      }
      
      // 2. One UI Update context
      // One UI 텍스트와 함께 업데이트/설치/다운로드 관련 문구가 있을 때
      if (xmlContent.includes('text="One UI"')) {
          const updateKeywords = ['Update', '업데이트', 'Install', '설치', 'Download', '다운로드'];
          if (updateKeywords.some(k => xmlContent.includes(`text="${k}"`))) {
              return true;
          }
      }
      
      return false;
  }
}

module.exports = AdbDriver;
