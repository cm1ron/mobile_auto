class BasePage {
    /**
     * @param {import('../driver/AdbDriver')} driver 
     */
    constructor(driver) {
        this.driver = driver;
    }

    async sleep(ms) {
        await this.driver.sleep(ms);
    }
}

module.exports = BasePage;

