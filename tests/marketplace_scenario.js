const AdbDriver = require('../src/driver/AdbDriver');
const MarketplacePage = require('../src/pages/MarketplacePage');

(async () => {
    const driver = new AdbDriver();
    const marketplace = new MarketplacePage(driver);

    try {
        await marketplace.enterMarketplace();
        await marketplace.traverseAllCategories();
    } catch (error) {
        console.error('Test Failed:', error);
    }
})();
