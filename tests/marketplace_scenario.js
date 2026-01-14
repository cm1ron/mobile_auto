const AdbDriver = require('../src/driver/AdbDriver');
const MarketplacePage = require('../src/pages/MarketplacePage');

(async () => {
    const driver = new AdbDriver();
    const marketplace = new MarketplacePage(driver);

    // android=... 인자 제외하고 나머지 인자만 처리
    const args = process.argv.slice(2).filter(arg => !arg.startsWith('android='));
    
    // Usage: node marketplace_scenario.js [TARGET_TAB] [TARGET_CATEGORY]
    // ex) node ... marketplace Head
    // ex) node ... customize Body
    
    const targetTab = args[0] ? args[0].toLowerCase() : null; // 'marketplace' or 'customize'
    const targetCategory = args[1]; // e.g. "Head"

    try {
        await marketplace.enterMarketplace();

        if (targetTab === 'marketplace') {
            driver.log(`🎯 [Mode] Marketplace 탭 검수 (Category: ${targetCategory || 'ALL'})`);
            await marketplace.traverseAllCategories(targetCategory);
        } 
        else if (targetTab === 'customize') {
            driver.log(`🎯 [Mode] Customize 탭 검수 (Category: ${targetCategory || 'ALL'})`);
            await marketplace.traverseCustomizeTab(targetCategory);
        } 
        else {
            // 인자가 없으면 기존처럼 전체(Marketplace -> Customize) 순회
            driver.log(`🎯 [Mode] 전체 순회 (Marketplace -> Customize)`);
            await marketplace.traverseAllCategories();
            // traverseAllCategories 내부에서 targetCategory가 없으면 자동으로 customize로 넘어가도록 로직이 되어 있음.
            // 하지만 명시적으로 분리했으므로 MarketplacePage.js의 자동 전환 로직을 수정하거나,
            // 여기서 순차적으로 호출해주는 것이 더 명확함.
            
            // 만약 MarketplacePage.js에서 자동 전환 로직을 뺀다면:
            // await marketplace.traverseAllCategories();
            // await marketplace.traverseCustomizeTab();
        }
        
        // [New] 테스트 완료 후 홈으로 복귀
        await marketplace.exitMarketplace();
        
    } catch (error) {
        console.error('Test Failed:', error);
    }
})();
