const MobileHelper = require('./utils/mobile-helper');
const fs = require('fs');
const path = require('path');

async function main() {
    const mobile = new MobileHelper();
    
    mobile.log('🕵️‍♂️ 현재 화면 UI 요소 분석을 시작합니다...');

    // 1. UI 덤프 및 XML 읽기
    const dumpPath = '/sdcard/window_dump_analysis.xml';
    const localPath = path.join(__dirname, 'current_screen_dump.xml');
    
    // 기존 덤프 삭제 및 생성
    try { mobile.adb(`shell rm ${dumpPath}`); } catch (e) {}
    
    mobile.log('📸 화면 덤프 중...');
    const dumpResult = mobile.adb(`shell uiautomator dump ${dumpPath}`);
    if (!dumpResult.includes('UI hierchary dumped to')) {
        mobile.log('❌ 덤프 실패. 다시 시도해주세요.', 'ERROR');
        return;
    }
    
    mobile.adb(`pull ${dumpPath} "${localPath}"`);
    
    if (!fs.existsSync(localPath)) {
        mobile.log('❌ 덤프 파일을 가져오지 못했습니다.', 'ERROR');
        return;
    }

    const xmlContent = fs.readFileSync(localPath, 'utf-8');
    
    // 2. 요소 파싱 (정규식 사용)
    // node 속성들을 캡처
    const nodeRegex = /<node ([^>]+)>/g;
    const elements = [];
    let match;

    while ((match = nodeRegex.exec(xmlContent)) !== null) {
        const attributes = match[1];
        
        // 속성 파싱 함수
        const getAttr = (name) => {
            const result = new RegExp(`${name}="([^"]*)"`).exec(attributes);
            return result ? result[1] : '';
        };

        const text = getAttr('text');
        const contentDesc = getAttr('content-desc');
        const resourceId = getAttr('resource-id');
        const clickable = getAttr('clickable') === 'true';
        const className = getAttr('class');
        const boundsStr = getAttr('bounds'); // [x1,y1][x2,y2]

        // 유의미한 요소만 필터링 (텍스트가 있거나, 클릭 가능하거나, ID가 있는 경우)
        if (text || contentDesc || resourceId || clickable) {
            // 좌표 계산
            const boundsMatch = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/.exec(boundsStr);
            let bounds = null;
            if (boundsMatch) {
                const x1 = parseInt(boundsMatch[1]);
                const y1 = parseInt(boundsMatch[2]);
                const x2 = parseInt(boundsMatch[3]);
                const y2 = parseInt(boundsMatch[4]);
                bounds = {
                    x: Math.floor((x1 + x2) / 2),
                    y: Math.floor((y1 + y2) / 2),
                    w: x2 - x1,
                    h: y2 - y1,
                    raw: boundsStr
                };
            }

            elements.push({
                text,
                contentDesc,
                resourceId,
                clickable,
                className,
                bounds
            });
        }
    }

    // 3. 결과 출력
    console.log('\n================ [ 분석 결과 ] ================');
    console.log(`총 발견된 유의미한 요소: ${elements.length}개\n`);

    const groups = {
        buttons: elements.filter(e => e.clickable && (e.text || e.contentDesc)),
        texts: elements.filter(e => !e.clickable && e.text),
        inputs: elements.filter(e => e.className.includes('EditText')),
        others: elements.filter(e => e.clickable && !e.text && !e.contentDesc) // 아이콘 등
    };

    console.log(`🖱️ [Clickable Buttons] (${groups.buttons.length})`);
    groups.buttons.forEach(e => {
        const name = e.text || e.contentDesc || '(No Text)';
        console.log(`   - "${name}" \t📍 (${e.bounds.x}, ${e.bounds.y}) \tID: ${e.resourceId || 'None'}`);
    });

    console.log(`\n📝 [Texts] (${groups.texts.length})`);
    groups.texts.forEach(e => {
        console.log(`   - "${e.text}" \t📍 (${e.bounds.x}, ${e.bounds.y})`);
    });

    console.log(`\n⌨️ [Input Fields] (${groups.inputs.length})`);
    groups.inputs.forEach(e => {
        console.log(`   - Text: "${e.text}" \t📍 (${e.bounds.x}, ${e.bounds.y}) \tID: ${e.resourceId}`);
    });

    console.log('\n================================================');
    mobile.log(`✅ 분석 완료. 상세 내용은 'current_screen_dump.xml' 참조`);
}

main();

