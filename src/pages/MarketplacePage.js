const BasePage = require('./BasePage');

class MarketplacePage extends BasePage {
    
    // 마켓플레이스 진입
    async enterMarketplace() {
        this.driver.log('🚀 [Marketplace] 마켓플레이스 진입 시도 (Avatar 탭)');
        const avatarTab = await this.driver.findAndClick('Avatar', 5);
        
        if (avatarTab) {
            this.driver.log('✅ Avatar 탭 클릭 완료');
            this.driver.log('⏳ 마켓플레이스 로딩 대기...');
            await this.sleep(3000); 
            return true;
        } else {
            this.driver.log('❌ 하단 Avatar 탭을 찾을 수 없습니다.', 'ERROR');
            throw new Error('Avatar Tab not found');
        }
    }

    // 1차 분류(카테고리) 전체 순회 및 아이템 전수 조사
    async traverseAllCategories(targetCategory = null) {
        this.driver.log('🚀 [Category] 모든 카테고리 탭 순회 및 아이템 전수 조사 시작');
        if (targetCategory) {
            this.driver.log(`🎯 Target Category: ${targetCategory}`);
        }

        // [Step 0] 진입하자마자 현재(Default) 탭 아이템 우선 전수 조사
        // 타겟 카테고리가 없거나, 타겟이 현재 탭인 경우 수행 (하지만 현재 탭 이름을 알 수 없으므로, 타겟이 있으면 건너뛰는 게 안전할 수도 있음)
        // 여기서는 타겟이 지정되면 Default 탭 검사는 건너뛰고 바로 해당 탭을 찾아가도록 수정 (원하는 탭만 보기 위해)
        if (!targetCategory) {
            this.driver.log('🚀 [Default Tab] 기본 탭 아이템 전수 조사 먼저 수행');
            await this.equipAllItemsInCurrentTab();
        }
        
        // 1. 탭 Y라인(tabY) 자동 감지
        this.driver.refreshDump(); // 덤프 갱신
        let xmlContent = this.driver.getDumpContent();
        let tabY = 1402; // 기본값

        // Y좌표 1300~1550 사이의 텍스트 요소들을 찾아 평균 Y값 계산
        const potentialTabs = [];
        const tabRegex = /text="([^"]+)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g;
        let match;
        
        while ((match = tabRegex.exec(xmlContent)) !== null) {
            const tText = match[1];
            const y1 = parseInt(match[3]);
            const y2 = parseInt(match[5]);
            const centerY = Math.floor((y1 + y2) / 2);

            // 상단 탭 영역 추정 범위 (상태바 제외 위해 1300 -> 1380으로 조정)
            if (centerY > 1380 && centerY < 1550) {
                 if (!['Filter', 'Sort', 'Search', 'Season Coin only', 'Charge BLUC', 'Save', '0', ''].includes(tText)) {
                    // 시간 텍스트(예: 12:30, 0105) 제외
                    if (/^\d{2}:?\d{2}$/.test(tText)) continue;
                    potentialTabs.push(centerY);
                 }
            }
        }

        if (potentialTabs.length > 0) {
            const sum = potentialTabs.reduce((a, b) => a + b, 0);
            tabY = Math.floor(sum / potentialTabs.length);
            this.driver.log(`ℹ️ 카테고리 탭 Y라인 자동 감지: ${tabY}`);
        } else {
            this.driver.log(`⚠️ 탭 라인 감지 실패. 기본값(${tabY}) 사용`, 'WARN');
        }

        const clickedCategories = new Set();
        let scrollCount = 0;
        const maxScrolls = 15;
        let consecutiveEmptyScrolls = 0;

        while (scrollCount < maxScrolls) {
            // 탭 목록 스캔
            this.driver.refreshDump();
            const xmlContent = this.driver.getDumpContent();
            
            const visibleNodes = [];
            const regex = /text="([^"]+)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g;
            let match;

            while ((match = regex.exec(xmlContent)) !== null) {
                const text = match[1];
                const y1 = parseInt(match[3]);
                const y2 = parseInt(match[5]);
                const centerY = Math.floor((y1 + y2) / 2);
                
                if (Math.abs(centerY - tabY) < 80) {
                    if (['Filter', 'Sort', 'Search', 'Season Coin only', 'Charge BLUC', 'Save', '0'].includes(text)) continue;
                    
                    visibleNodes.push({
                        text: text,
                        x: Math.floor((parseInt(match[2]) + parseInt(match[4])) / 2),
                        y: centerY,
                        left: parseInt(match[2])
                    });
                }
            }

            visibleNodes.sort((a, b) => a.left - b.left);

            // 안 누른 탭 클릭 -> 아이템 전수 조사
            const targetNode = visibleNodes.find(node => {
                if (clickedCategories.has(node.text)) return false;
                if (targetCategory && node.text !== targetCategory) return false;
                return true;
            });

            if (targetNode) {
                this.driver.log(`\n============== [Category: ${targetNode.text}] ==============`);
                this.driver.log(`👆 1차 카테고리 클릭: '${targetNode.text}'`);
                this.driver.adb(`shell input tap ${targetNode.x} ${targetNode.y}`);
                clickedCategories.add(targetNode.text);
                
                await this.sleep(2500); 
                
                // 2차 카테고리 분기 처리
                if (targetNode.text === 'Headwear' || targetNode.text === 'Premium Item') {
                    this.driver.log(`ℹ️ '${targetNode.text}'는 서브 카테고리 탐색 대상입니다.`);
                    await this.traverseSubCategories(tabY, targetNode.text);
                } else {
                    await this.equipAllItemsInCurrentTab();
                }

                consecutiveEmptyScrolls = 0;
                continue; 
            }

            // 탭바 스크롤
            if (consecutiveEmptyScrolls >= 3) {
                this.driver.log('🛑 3회 연속 새로운 탭 없음. 전체 탐색 종료.');
                break;
            }

            this.driver.log(`➡️ 다음 카테고리 탭 스크롤...`);
            this.driver.adb(`shell input swipe 900 ${tabY} 200 ${tabY} 800`); 
            await this.sleep(2000);
            scrollCount++;
            consecutiveEmptyScrolls++;
        }

        this.driver.log(`✅ 모든 카테고리 순회 완료. (총 ${clickedCategories.size}개)`);
    }

    // 2차 카테고리(서브 탭) 순회
    async traverseSubCategories(parentTabY, parentTabName) {
        // [Step 0] 진입하자마자 현재 선택된(디폴트) 서브 탭의 아이템 검수 수행
        this.driver.log('   🚀 [Sub-Category] 디폴트 서브 탭 아이템 검수 시작');
        await this.equipAllItemsInCurrentTab();

        // 1차 탭(parentTabY)보다 아래에 위치.
        const subTabMinY = parentTabY + 80;
        const subTabMaxY = parentTabY + 220; 
        
        this.driver.log(`   🔎 서브 카테고리 스캔 범위: Y=${subTabMinY}~${subTabMaxY}`);

        this.driver.refreshDump();
        const xmlContent = this.driver.getDumpContent();
        
        const subTabs = [];
        const regex = /text="([^"]+)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g;
        let match;

        while ((match = regex.exec(xmlContent)) !== null) {
            const text = match[1];
            const y1 = parseInt(match[3]);
            const y2 = parseInt(match[5]);
            const centerY = Math.floor((y1 + y2) / 2);
            
            if (centerY >= subTabMinY && centerY <= subTabMaxY) {
                if (['Filter', 'Sort', 'Search', 'Season Coin only', 'Charge BLUC', 'Save', '0'].includes(text)) continue;
                if (/^[\d,.$]+$/.test(text)) continue; 
                if (['Epic', 'Legendary', 'Rare', 'Common', 'Uncommon'].includes(text)) continue;

                subTabs.push({
                    text: text,
                    x: Math.floor((parseInt(match[2]) + parseInt(match[4])) / 2),
                    y: centerY,
                    left: parseInt(match[2])
                });
            }
        }

        subTabs.sort((a, b) => a.left - b.left);

        if (subTabs.length > 0) {
            this.driver.log(`   ✨ 발견된 서브 탭(텍스트): ${subTabs.map(t => t.text).join(', ')}`);
            
            // [Modified] 첫 번째 서브 탭은 이미 진입 시(Line 140) 검수했으므로 건너뜀
            for (let i = 1; i < subTabs.length; i++) {
                const subTab = subTabs[i];
                this.driver.log(`   👉 2차 카테고리 클릭: '${subTab.text}'`);
                this.driver.adb(`shell input tap ${subTab.x} ${subTab.y}`);
                await this.sleep(2000); 
                await this.equipAllItemsInCurrentTab();
            }
        } else {
            this.driver.log('   ⚠️ 텍스트로 된 서브 탭을 찾지 못했습니다.', 'WARN');

            if (parentTabName === 'Premium Item') {
                this.driver.log('   🕶️ [Blind Click] Premium Item - 이미지 탭 추정, 강제 좌표 순회 시도');
                
                const blindY = parentTabY + 120;
                const blindPoints = [
                    { name: 'Left Tab (MOTO)', x: 270 },
                    { name: 'Right Tab (MECHA)', x: 810 }
                ];

                // [New] 화면 변화 감지를 위한 이전 아이템 ID 저장
                let lastFirstItemId = await this.getFirstItemId();

                // [Modified] 첫 번째 탭(Left)은 이미 검수했으므로 두 번째부터 순회
                for (let i = 1; i < blindPoints.length; i++) {
                    const point = blindPoints[i];
                    this.driver.log(`   👉 [Blind] 서브 탭 클릭 시도: ${point.name} (${point.x}, ${blindY})`);
                    this.driver.adb(`shell input tap ${point.x} ${blindY}`);
                    await this.sleep(2000);

                    // [Check] 화면이 바뀌었는지 확인 (첫 번째 아이템 비교)
                    const currentFirstItemId = await this.getFirstItemId();
                    
                    if (currentFirstItemId && lastFirstItemId && currentFirstItemId === lastFirstItemId) {
                         this.driver.log(`   🛑 화면 변화 없음 (탭 없음/동일 탭). Blind Click 중단.`);
                         break; // 루프 탈출
                    }
                    
                    lastFirstItemId = currentFirstItemId; // 갱신

                    // 클릭 후 아이템 확인
                    await this.equipAllItemsInCurrentTab();
                }

            } else {
                this.driver.log('   ℹ️ 서브 탭 없음 -> 일반 아이템 스캔 진행');
                await this.equipAllItemsInCurrentTab();
            }
        }
    }

    // 현재 화면의 첫 번째 아이템 ID(thumb_id)를 반환하는 헬퍼
    async getFirstItemId() {
        this.driver.refreshDump();
        const xmlContent = this.driver.getDumpContent();
        const match = /content-desc="thumb_id:([^"]+)"/.exec(xmlContent);
        return match ? match[1] : null;
    }

    // 현재 선택된 탭 안에서 스크롤하며 모든 아이템 착용
    async equipAllItemsInCurrentTab() {
        this.driver.log('   👕 아이템 목록 전수 조사 시작 (Vertical Scroll)');
        
        const visitedItems = new Set();
        let scrollAttempts = 0;
        const maxPageScrolls = 30; // 30회
        let noNewItemsCount = 0;

        while (scrollAttempts < maxPageScrolls) {
            this.driver.refreshDump();
            const xmlContent = this.driver.getDumpContent();
            
            const items = [];
            // thumb_id로 아이템 식별
            const itemRegex = /content-desc="thumb_id:([^"]+)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g;
            let match;

            while ((match = itemRegex.exec(xmlContent)) !== null) {
                const id = match[1];
                const x1 = parseInt(match[2]);
                const y1 = parseInt(match[3]);
                const x2 = parseInt(match[4]);
                const y2 = parseInt(match[5]);
                
                // 탭바 영역(Y < 1400)이나 하단(Y > 2100) 제외 (안전 영역)
                if (y1 > 1400 && y2 < 2100) {
                    items.push({
                        id: id,
                        x: Math.floor((x1 + x2) / 2),
                        y: Math.floor((y1 + y2) / 2),
                        rawY: y1,
                        rawX: x1
                    });
                }
            }

            // 정렬
            items.sort((a, b) => {
                if (Math.abs(a.rawY - b.rawY) > 50) return a.rawY - b.rawY;
                return a.rawX - b.rawX;
            });

            let clickedCount = 0;
            for (const item of items) {
                if (visitedItems.has(item.id)) continue;

                this.driver.log(`   👗 착용: ${item.id.substring(0, 10)}...`);
                this.driver.adb(`shell input tap ${item.x} ${item.y}`);
                
                // 크래시 체크
                await this.sleep(1500);
                try {
                    this.driver.adb('shell uiautomator dump /sdcard/alive_check.xml');
                } catch (e) {
                    this.driver.log('   🚨 [CRASH] 앱 사망 확인!', 'ERROR');
                    throw new Error(`App crashed on item ${item.id}`);
                }

                visitedItems.add(item.id);
                clickedCount++;
            }

            if (clickedCount === 0) {
                noNewItemsCount++;
                if (noNewItemsCount >= 2) {
                    this.driver.log('   🛑 더 이상 새로운 아이템이 없습니다. (End of List)');
                    break;
                }
            } else {
                noNewItemsCount = 0;
            }

            // 아래로 스크롤 (아이템 더 보기)
            this.driver.log('   ⬇️ 아이템 목록 스크롤 (Swipe Up)...');
            // 스크롤 거리 축소
            this.driver.adb('shell input swipe 540 1700 540 1340 1000'); 
            await this.sleep(2000);
            scrollAttempts++;
        }
        
        this.driver.log(`   ✅ 카테고리 완료 (총 ${visitedItems.size}개 아이템 테스트)`);
    }
}

module.exports = MarketplacePage;
