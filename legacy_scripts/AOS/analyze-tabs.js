const AdbDriver = require('../../src/driver/AdbDriver');
const fs = require('fs');
const path = require('path');

async function main() {
    const driver = new AdbDriver();
    
    // 분석할 탭 목록 (화면에 보이는 텍스트 그대로)
    // 'Charts '는 뒤에 공백이 있을 수 있어 주의
    const TABS = ['Home', 'Charts', 'Avatar', 'Chat', 'Party', 'Profile'];
    
    // 결과 저장 폴더 생성
    const outputDir = path.join(__dirname, 'analysis_results');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    driver.log('🚀 [탭 순회 분석기] 시작합니다...');
    driver.log(`📂 결과 저장 경로: ${outputDir}`);

    for (const tabName of TABS) {
        driver.log(`\n👉 [Step] '${tabName}' 탭으로 이동 시도...`);
        
        // 1. 탭 클릭
        // Charts의 경우 공백 이슈가 있을 수 있어 부분 일치(false)로 시도하거나, 
        // 정확한 텍스트를 찾아야 함. 여기서는 텍스트 포함 여부로 넓게 찾기 위해 exactMatch=false 사용
        const clicked = await driver.findAndClick(tabName, 5, false);

        if (clicked) {
            driver.log(`⏳ '${tabName}' 페이지 로딩 대기 (3초)...`);
            await driver.sleep(3000);

            // 2. 화면 덤프 및 저장
            const safeName = tabName.trim();
            const xmlPath = path.join(outputDir, `${safeName}_dump.xml`);
            const reportPath = path.join(outputDir, `${safeName}_report.txt`);
            const screenshotPath = path.join(outputDir, `${safeName}_screen.png`);

            // 스크린샷
            driver.adb(`shell screencap -p /sdcard/screenshot.png`);
            driver.adb(`pull /sdcard/screenshot.png "${screenshotPath}"`);

            // XML 덤프
            try {
                driver.adb('shell rm /sdcard/temp_dump_tab.xml');
            } catch(e) {}
            
            const dumpRes = driver.adb('shell uiautomator dump /sdcard/temp_dump_tab.xml');
            if (dumpRes.includes('UI hierchary dumped to')) {
                driver.adb(`pull /sdcard/temp_dump_tab.xml "${xmlPath}"`);
                
                // 3. 리포트 생성
                if (fs.existsSync(xmlPath)) {
                    const xmlContent = fs.readFileSync(xmlPath, 'utf-8');
                    generateReport(xmlContent, reportPath, safeName);
                    driver.log(`✅ [${safeName}] 분석 완료! (XML, PNG, Report 저장됨)`);
                }
            } else {
                driver.log(`⚠️ [${safeName}] 덤프 실패`, 'WARN');
            }

        } else {
            driver.log(`❌ '${tabName}' 탭을 찾지 못했습니다. 건너뜁니다.`, 'WARN');
        }
    }

    driver.log('\n🎉 모든 탭 분석이 완료되었습니다.');
}

function generateReport(xmlContent, outputPath, pageName) {
    const nodeRegex = /<node ([^>]+)>/g;
    let match;
    const elements = [];

    while ((match = nodeRegex.exec(xmlContent)) !== null) {
        const attributes = match[1];
        const getAttr = (name) => {
            const res = new RegExp(`${name}="([^"]*)"`).exec(attributes);
            return res ? res[1] : '';
        };

        const text = getAttr('text');
        const desc = getAttr('content-desc');
        const id = getAttr('resource-id').split('/').pop(); // id만 깔끔하게
        const clickable = getAttr('clickable') === 'true';
        const boundsStr = getAttr('bounds');
        
        if (text || desc || clickable) {
            const boundsMatch = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/.exec(boundsStr);
            let bounds = {};
            if (boundsMatch) {
                const x1 = parseInt(boundsMatch[1]);
                const y1 = parseInt(boundsMatch[2]);
                const x2 = parseInt(boundsMatch[3]);
                const y2 = parseInt(boundsMatch[4]);
                bounds = { x: Math.floor((x1+x2)/2), y: Math.floor((y1+y2)/2) };
            }

            elements.push({ text, desc, id, clickable, bounds });
        }
    }

    // 리포트 작성
    let report = `[ ${pageName} Page Analysis Report ]\n`;
    report += `Date: ${new Date().toLocaleString()}\n`;
    report += `Total Elements: ${elements.length}\n\n`;

    const buttons = elements.filter(e => e.clickable && (e.text || e.desc));
    const texts = elements.filter(e => !e.clickable && e.text);

    report += `=== 🖱️ Clickable Buttons (${buttons.length}) ===\n`;
    buttons.forEach(e => {
        report += `[Button] "${e.text || e.desc}" \n   └ ID: ${e.id || '-'} \n   └ Coord: (${e.bounds.x}, ${e.bounds.y})\n\n`;
    });

    report += `=== 📝 Static Texts (${texts.length}) ===\n`;
    texts.forEach(e => {
        report += `[Text] "${e.text}" \n   └ Coord: (${e.bounds.x}, ${e.bounds.y})\n`;
    });

    fs.writeFileSync(outputPath, report);
}

main();
