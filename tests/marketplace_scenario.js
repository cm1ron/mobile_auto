const AdbDriver = require('../src/driver/AdbDriver');
const MarketplacePage = require('../src/pages/MarketplacePage');

(async () => {
    const driver = new AdbDriver();
    const marketplace = new MarketplacePage(driver);

    const args = process.argv.slice(2);
    const targetCategory = args[0]; // e.g. "Head"

    try {
        await marketplace.enterMarketplace();
        await marketplace.traverseAllCategories(targetCategory);
        
        // [New] 테스트 완료 후 홈으로 복귀
        await marketplace.exitMarketplace();
        
    } catch (error) {
        console.error('Test Failed:', error);
    }
})();
