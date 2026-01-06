// 앱 관리 페이지 (설치, 삭제, 앱 서랍 등)
const BasePage = require('./BasePage');

class AppManagerPage extends BasePage {
    
    // --- Step 0: 앱 삭제 ---
    async deleteApp(appName, packageName) {
        this.driver.log(`🚀 [Step 0] 디바이스 준비 및 ${appName} 삭제`);
        
        await this._wakeUpAndUnlock();
        await this._closeAllApps();
        await this._goHome();

        // 1. 앱 서랍에서 앱 확인
        this.driver.log('📂 앱 서랍 열기 (위로 스와이프)...');
        this.driver.adb('shell input swipe 720 2200 720 500 500');
        await this.sleep(2000);

        let found = await this._findAppInDrawer(appName);
        if (!found) {
             found = await this._findAppInDrawer(appName.charAt(0).toUpperCase() + appName.slice(1).toLowerCase());
        }

        if (found) {
            this.driver.log(`✅ '${appName}' 앱 발견! 삭제를 진행합니다.`);
            try {
                this.driver.adb(`uninstall ${packageName}`);
                this.driver.log(`🗑️ '${appName}' (${packageName}) 삭제 완료`);
            } catch (e) {
                this.driver.log(`⚠️ 삭제 실패: ${e.message}`, 'WARN');
            }
            await this.sleep(2000);
            await this._goHome();
        } else {
            this.driver.log(`ℹ️ '${appName}' 앱을 찾을 수 없습니다. (이미 삭제됨)`);
            await this._goHome();
        }
    }

    // --- Step 1: 앱 설치 (App Tester) ---
    async installApp(appTesterName, targetPackageName) {
        this.driver.log('🚀 [Step 1] App Tester 실행 및 최신 빌드 설치');
        await this._goHome();

        // 앱 서랍 열기
        this.driver.adb('shell input swipe 720 2200 720 500 500');
        await this.sleep(2000);

        // App Tester 실행
        const found = await this._findAppInDrawer(appTesterName);
        if (found) {
            const element = this.driver.findElement(appTesterName);
            this.driver.log('👆 App Tester 실행');
            this.driver.adb(`shell input tap ${element.x} ${element.y}`);
        } else {
            throw new Error(`'${appTesterName}' 앱을 찾지 못했습니다.`);
        }

        this.driver.log('⏳ App Tester 로딩 대기...');
        await this.sleep(5000);

        // 패키지명 선택
        const pkgClicked = await this.driver.findAndClick(targetPackageName, 10);
        if (!pkgClicked) throw new Error(`Package '${targetPackageName}' not found in App Tester.`);

        await this.sleep(3000);

        // "master" 검색
        const searchInput = await this.driver.findAndClick('출시 버전 및 출시 노트 검색', 5);
        if (searchInput) {
            this.driver.log('⌨️ "master" 검색');
            this.driver.adb('shell input keyevent 123'); // End
            for(let i=0; i<20; i++) this.driver.adb('shell input keyevent 67'); // Del
            await this.sleep(500);
            this.driver.adb('shell input text "master"');
            this.driver.adb('shell input keyevent 66'); // Enter
            
            this.driver.log('⏳ 검색 결과 로딩 대기 (10초)...');
            await this.sleep(10000);
        }

        // 다운로드/설치 로직
        // 조건: UnrealVersion 또는 Title에 "master" 키워드가 포함된 빌드를 찾아야 함.
        this.driver.log('🔍 최신 master 빌드 찾는 중...');
        
        const TARGET_KEYWORD = 'master';
        let targetBuild = null;
        let targetBtn = null;
        let scrollAttempts = 0;
        const maxScrolls = 5;

        // Loop for scrolling and finding the build
        while (!targetBuild && scrollAttempts < maxScrolls) {
            // Refresh dump
            this.driver.findElement('dummy_refresh');
            const xmlContent = this.driver.getDumpContent();

            // 1. Find UnrealVersion
            const versionRegex = /text="UnrealVersion: ([^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g;
            let match;
            
            while ((match = versionRegex.exec(xmlContent)) !== null) {
                const unrealVerText = match[1];
                const uY1 = parseInt(match[2]); // Corrected index from 3 to 2 based on regex groups usually (but let's check regex carefully)
                // wait, regex groups: text=1, bounds=[2,3][4,5] -> uY1 is 3
                // Actually let's use the one from previous code to be safe.
            }
            // Let's reimplement logic from 01-install-app.js more faithfully
            
            // Re-parsing XML for matches
            // 1. Find UnrealVersion nodes
            const allVersionMatches = [...xmlContent.matchAll(/text="UnrealVersion: ([^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g)];

            for (const match of allVersionMatches) {
                const unrealVerText = match[1];
                const uY1 = parseInt(match[3]); // Y1 of UnrealVersion

                // 2. Find Title (The text immediately above UnrealVersion)
                // We assume the title is within reasonable distance above (e.g., 600px)
                const allTextNodes = [...xmlContent.matchAll(/text="([^"]+)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g)];
                let titleCandidate = null;
                let minDiff = 1000;

                for (const tm of allTextNodes) {
                    const tText = tm[1];
                    const tY1 = parseInt(tm[3]); // Y1 of Text Node

                    // Filter out non-title texts
                    if (tText.includes('UnrealVersion:')) continue;
                    if (tText.match(/\d+월 \d+/)) continue; // Date
                    if (tText.includes('오전') || tText.includes('오후')) continue; // Time
                    
                    // [Fix] Ignore button texts and badges (Download, Open, Latest, Installed, Header)
                    const ignoreKeywords = [
                        '다운로드', '열기', 'Open', 'Update', 'Install', '설치', 
                        '최신', '설치됨', '모든 테스트 앱'
                    ];
                    if (ignoreKeywords.some(k => tText === k)) continue;

                    // Title must be above UnrealVersion (tY1 < uY1)
                    if (tY1 >= uY1) continue;

                    const diff = uY1 - tY1;
                    // [Fix 1] Increase range to 1000px (Title can be far above due to buttons/tags/date)
                    if (diff < 1000 && diff < minDiff) { 
                        minDiff = diff;
                        titleCandidate = tText;
                    }
                }

                // 3. Validate Title
                if (!titleCandidate) {
                    this.driver.log(`   ⚠️ Title for UnrealVersion '${unrealVerText}' not found. Skipping.`);
                    continue;
                }

                // [Critical Fix] BOTH Title AND UnrealVersion must contain 'master'
                // Case 1: Title has 'master' but UnrealVersion has 'feature-ovdr' -> INVALID (This is likely a cherry-pick or feature build)
                // Case 2: Title has 'ovdr' but UnrealVersion has 'master' -> INVALID (This is an ovdr build)
                
                const titleHasMaster = titleCandidate.includes(TARGET_KEYWORD);
                const unrealHasMaster = unrealVerText.includes(TARGET_KEYWORD);

                if (!titleHasMaster || !unrealHasMaster) {
                    this.driver.log(`   ℹ️ Pass: Title('${titleCandidate}') or UnrealVersion('${unrealVerText}') missing '${TARGET_KEYWORD}'. Both required.`);
                    continue;
                }

                // 4. Validate Version Pattern (on Title)
                // Pattern: x.xx.x-master.xxxxx
                const versionPattern = /\d+\.\d+\.\d+-master\.\d+/;
                if (!versionPattern.test(titleCandidate)) {
                    this.driver.log(`   ⚠️ Title format mismatch: ${titleCandidate}`);
                    continue;
                }

                this.driver.log(`   ✨ Valid Master Build Found: Title='${titleCandidate}'`);
                targetBuild = { version: titleCandidate, y: uY1 }; // Use UnrealVersion's Y for button search reference
                break;
            }

            // If not found in UnrealVersion, check Titles (simplified for now, focusing on UnrealVersion as primary)
            // (The original code had complex logic for Title matching if UnrealVersion didn't match directly but was close)
            
            if (targetBuild) {
                this.driver.log(`✅ 설치할 빌드 선택: ${targetBuild.version}`);
                
                // Find button near this build
                const btnKeywords = ['다운로드', '열기', 'Open', 'Update', 'Install', '설치'];
                let btnMatch = null;
                let minBtnDist = 2000;

                const allNodes = xmlContent.match(/<node [^>]+>/g) || [];
                for (const line of allNodes) {
                     const boundsMatch = line.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
                     if (!boundsMatch) continue;
                     
                     const y1 = parseInt(boundsMatch[2]);
                     const y2 = parseInt(boundsMatch[4]);
                     const centerY = Math.floor((y1 + y2) / 2);
                     
                     const textMatch = line.match(/text="([^"]*)"/);
                     const descMatch = line.match(/content-desc="([^"]*)"/);
                     const textVal = textMatch ? textMatch[1] : '';
                     const descVal = descMatch ? descMatch[1] : '';
                     
                     const combinedText = (textVal + ' ' + descVal).toLowerCase();
                     const foundKeyword = btnKeywords.find(k => combinedText.includes(k.toLowerCase()));

                     if (foundKeyword) {
                         const dist = Math.abs(y1 - targetBuild.y);
                         if (dist < minBtnDist) {
                             minBtnDist = dist;
                             btnMatch = {
                                 text: foundKeyword,
                                 x: Math.floor((parseInt(boundsMatch[1]) + parseInt(boundsMatch[3])) / 2),
                                 y: centerY
                             };
                         }
                     }
                }
                targetBtn = btnMatch;
            }

            if (!targetBtn) {
                 this.driver.log(`⬇️ 버튼을 찾지 못해 스크롤합니다.`);
                 this.driver.adb('shell input swipe 500 1500 500 1000 500');
                 await this.sleep(2000);
                 scrollAttempts++;
                 targetBuild = null; // Reset to find again in new view
            }
        }

        // Fallback: If still no target build found but there is a download button (user request in original code)
        if (!targetBtn) {
             this.driver.log('⚠️ 빌드 정보를 찾지 못했지만, "다운로드" 버튼이 있는지 확인합니다 (Force Check).');
             const btnKeywords = ['다운로드', '열기', 'Open', 'Update', 'Install', '설치'];
             this.driver.findElement('dummy'); // Refresh
             const xmlContent = this.driver.getDumpContent();
             
             // Simple search for any button
             for(const keyword of btnKeywords) {
                const btn = this.driver.findElement(keyword, false);
                if (btn) {
                    targetBtn = { ...btn, text: keyword };
                    this.driver.log(`✅ [Force] '${keyword}' 버튼 발견!`);
                    break;
                }
             }
        }

        if (targetBtn) {
            this.driver.log(`✅ '${targetBtn.text}' 버튼 발견 및 클릭`);
            this.driver.adb(`shell input tap ${targetBtn.x} ${targetBtn.y}`);
            await this.sleep(1000);

            if (targetBtn.text === '열기' || targetBtn.text === 'Open') {
                this.driver.log('🎉 이미 설치되어 있습니다.');
                return;
            }

            // 설치 대기
            this.driver.log('⏳ 설치 팝업 대기...');
            await this._handleInstallPopup();
        } else {
             throw new Error('설치 관련 버튼을 찾을 수 없습니다.');
        }
    }

    // --- Step 2: 앱 실행 (Launch) ---
    async launchApp(packageName) {
        this.driver.log('🚀 [Step 2] 앱 실행 및 QA 진입');
        await this._wakeUpAndUnlock();
        await this._closeAllApps();
        
        this.driver.log(`🚀 '${packageName}' 직접 실행`);
        this.driver.adb(`shell monkey -p ${packageName} -c android.intent.category.LAUNCHER 1`);
        
        this.driver.log('⏳ 앱 로딩 대기 (10초)...');
        await this.sleep(10000);
    }

    async selectQaEnvironment() {
        this.driver.log('🔍 QA 환경 선택 시도...');
        
        // Search
        const searchInput = await this.driver.findAndClick('Search', 5);
        if (searchInput) {
            this.driver.log('⌨️ "qa" 입력');
            this.driver.adb('shell input text "qa"');
            await this.sleep(3000);
        }

        // Select 'qa' from list (Advanced find logic simplified)
        this.driver.findElement('dummy'); // Refresh dump
        const xmlContent = this.driver.getDumpContent();
        
        // Find "qa" text below search bar (Y > 800 roughly)
        const regex = /text="qa"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/gi;
        let match;
        let targetQa = null;
        while ((match = regex.exec(xmlContent)) !== null) {
            const y1 = parseInt(match[2]);
            if (y1 > 800) {
                targetQa = {
                    x: Math.floor((parseInt(match[1]) + parseInt(match[3])) / 2),
                    y: Math.floor((parseInt(match[2]) + parseInt(match[4])) / 2)
                };
                break;
            }
        }

        if (targetQa) {
            this.driver.log('✅ QA 항목 선택');
            this.driver.adb(`shell input tap ${targetQa.x} ${targetQa.y}`);
            await this.sleep(1000);
        }

        const goClicked = await this.driver.findAndClick('GO', 15, true);
        if (!goClicked) throw new Error("GO 버튼을 찾을 수 없습니다.");
        
        this.driver.log('🎉 GO 버튼 클릭 완료');
    }

    // --- Private Helpers ---

    async _wakeUpAndUnlock() {
        this.driver.adb('shell input keyevent KEYCODE_WAKEUP');
        await this.sleep(1000);
        // Unlock Swipe
        this.driver.adb('shell input swipe 540 1500 540 500 500');
        await this.sleep(1000);
        // PIN (If needed, assume 0000 based on previous code)
        this.driver.adb('shell input text 0000');
        this.driver.adb('shell input keyevent 66');
        await this.sleep(2000);
    }

    async _closeAllApps() {
        this.driver.adb('shell input keyevent KEYCODE_APP_SWITCH');
        await this.sleep(1500);
        const closed = await this.driver.findAndClick('모두 닫기', 3, false) || await this.driver.findAndClick('Close all', 3, false);
        await this.sleep(1000);
        await this._goHome();
    }

    async _goHome() {
        this.driver.adb('shell input keyevent KEYCODE_HOME');
        await this.sleep(1000);
    }

    async _findAppInDrawer(appName) {
        this.driver.log(`🔍 앱 서랍에서 '${appName}' 탐색 시작...`);
        
        // 1. 현재 화면에서 찾기
        if (this.driver.findElement(appName)) {
            this.driver.log(`✅ '${appName}' 발견 (현재 화면)`);
            return true;
        }

        const maxPages = 5;
        const fs = require('fs');
        const path = require('path');
        const dumpPath = '/sdcard/window_dump.xml';
        const localPath = path.join(this.driver.sessionDir, 'temp_drawer_dump.xml');

        // 헬퍼: 현재 화면 XML 해시(간이) 구하기 - 화면 변화 감지용
        const getScreenHash = () => {
            try {
                this.driver.adb(`shell rm ${dumpPath}`);
            } catch (e) {}
            try {
                this.driver.adb(`shell uiautomator dump ${dumpPath}`);
                this.driver.adb(`pull ${dumpPath} "${localPath}"`);
                
                if (fs.existsSync(localPath)) {
                    return fs.readFileSync(localPath, 'utf-8').length; 
                }
            } catch (e) {}
            return 0;
        };

        // 2. 오른쪽으로 이동하며 찾기 (->)
        this.driver.log('➡️ 다음 페이지(오른쪽)로 탐색 시도...');
        let prevHash = getScreenHash();
        
        for (let i = 0; i < maxPages; i++) {
            this.driver.adb('shell input swipe 900 1200 100 1200 300'); // Next Page (오른쪽 스와이프)
            await this.sleep(2000);
            
            if (this.driver.findElement(appName)) {
                this.driver.log(`✅ '${appName}' 발견 (오른쪽 페이지 ${i + 1})`);
                return true;
            }
            
            const currHash = getScreenHash();
            if (Math.abs(currHash - prevHash) < 50) { 
                this.driver.log('🛑 더 이상 오른쪽 페이지가 없습니다.');
                break;
            }
            prevHash = currHash;
        }

        // 3. 왼쪽으로 이동하며 찾기 (<-)
        this.driver.log('⬅️ 이전 페이지(왼쪽)로 탐색 시도...');
        prevHash = getScreenHash();

        for (let i = 0; i < maxPages * 2; i++) { 
            this.driver.adb('shell input swipe 100 1200 900 1200 300'); // Prev Page (왼쪽 스와이프)
            await this.sleep(2000);

            if (this.driver.findElement(appName)) {
                this.driver.log(`✅ '${appName}' 발견 (왼쪽 페이지 ${i + 1})`);
                return true;
            }

            const currHash = getScreenHash();
            if (Math.abs(currHash - prevHash) < 50) {
                this.driver.log('🛑 더 이상 왼쪽 페이지가 없습니다.');
                break;
            }
            prevHash = currHash;
        }

        this.driver.log(`❌ '${appName}' 앱을 찾을 수 없습니다.`);
        return false;
    }

    async _handleInstallPopup() {
        // Wait for install button
        for(let i=0; i<30; i++) { // Max 1 min roughly
             if (await this.driver.findAndClick('설치', 1) || await this.driver.findAndClick('Install', 1) || await this.driver.findAndClick('업데이트', 1)) {
                 break;
             }
             await this.sleep(2000);
        }
        await this.sleep(10000); // Wait for install
    }
}

module.exports = AppManagerPage;

