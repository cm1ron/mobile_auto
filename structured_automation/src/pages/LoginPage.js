const BasePage = require('./BasePage');

class LoginPage extends BasePage {
    
    async isLoggedIn() {
        this.driver.log('🔍 Checking login status...');
        
        // 1. Check for post-login permissions popups (Existing logic)
        const hasPermissionPopup = this.driver.findElement('Get notified', false) || 
                                   this.driver.findElement('Allow', false) || 
                                   this.driver.findElement('허용', false);

        if (hasPermissionPopup) return true;

        // 2. Check for Main Lobby elements (New logic)
        // If we see "Create", "Avatar", "Home", or "Play" tabs, we are logged in.
        const hasLobbyElement = this.driver.findElement('Create', true) || 
                                this.driver.findElement('Avatar', true) ||
                                this.driver.findElement('Home', true);

        if (hasLobbyElement) {
            this.driver.log('✅ Main Lobby elements found. Already logged in.');
            return true;
        }

        // 3. [Critical Fix] Check for Main Popup elements
        // If a popup is blocking the screen, it means we are already logged in.
        // Keywords from screenshot: "Not now", "Get your Gacha Ticket", "Season Pass"
        const hasMainPopup = this.driver.findElement('Not now', false) || 
                             this.driver.findElement('Gacha Ticket', false) ||
                             this.driver.findElement('Season Pass', false);

        if (hasMainPopup) {
            this.driver.log('✅ Main Popup detected (Not now / Season Pass). Already logged in.');
            return true;
        }

        return false;
    }

    async loginAsGuest() {
        this.driver.log('🔍 Attempting Guest Login...');
        const guestBtn = await this.driver.findAndClick('Continue as Guest', 3);

        if (!guestBtn) {
            this.driver.log('ℹ️ Guest button not found.');
            return false;
        }

        this.driver.log('⏳ Waiting for bottom sheet...');
        await this.sleep(2000);

        // Handle Slider
        await this._handleSlider();

        // Handle Checkbox & OK
        await this._handleTermsCheckbox();
        
        // Final Confirmation
        const okBtn = await this.driver.findAndClick('OK', 3) || await this.driver.findAndClick('Confirm', 3);
        if (okBtn) {
            this.driver.log('✅ Guest Login Completed');
            return true;
        }
        
        return false;
    }

    async loginWithGoogle(targetAccount) {
        this.driver.log(`🔍 Attempting Google Login with account: ${targetAccount}`);
        
        const googleBtn = await this.driver.findAndClick('Continue with Google', 5, false);
        if (!googleBtn) {
             throw new Error('"Continue with Google" button not found');
        }

        this.driver.log('⏳ Waiting for account popup...');
        await this.sleep(3000);

        // Find specific account in the list
        // We need to refresh the dump to find the account text
        this.driver.findElement('dummy'); // Trigger a dump refresh
        const xmlContent = this.driver.getDumpContent();

        // Regex to find the account text and bounds
        const accountRegex = new RegExp(`text="([^"]*${targetAccount}[^"]*)"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`, 'i');
        const match = xmlContent.match(accountRegex);

        if (match) {
            const [_, text, x1, y1, x2, y2] = match;
            const centerX = Math.floor((parseInt(x1) + parseInt(x2)) / 2);
            const centerY = Math.floor((parseInt(y1) + parseInt(y2)) / 2);

            this.driver.log(`✅ Found account: "${text}"`);
            this.driver.adb(`shell input tap ${centerX} ${centerY}`);
            
            this.driver.log('⏳ Waiting for login process...');
            await this.sleep(5000);
            return true;
        } else {
            throw new Error(`Account containing "${targetAccount}" not found`);
        }
    }

    // --- Private Helper Methods ---

    async _handleSlider() {
        this.driver.log('🔍 Looking for Slider (SeekBar)...');
        
        // Refresh dump
        this.driver.findElement('dummy_refresh'); 
        const xmlContent = this.driver.getDumpContent();
        
        const seekBarRegex = /class="android.widget.SeekBar"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/;
        const match = xmlContent.match(seekBarRegex);

        if (match) {
            const [_, x1, y1, x2, y2] = match.map(Number);
            this.driver.log(`✅ Slider found: (${x1}, ${y1}) - (${x2}, ${y2})`);

            const width = x2 - x1;
            const centerY = Math.floor((y1 + y2) / 2);
            const targetX = x1 + Math.floor(width * 0.55); // Click at 55%

            this.driver.adb(`shell input tap ${targetX} ${centerY}`);
            await this.sleep(1000);
        } else {
            this.driver.log('❌ Slider not found', 'WARN');
        }
    }

    async _handleTermsCheckbox() {
        this.driver.log('🔍 Looking for Checkbox...');
        
        // Refresh dump
        this.driver.findElement('dummy_refresh');
        const xmlContent = this.driver.getDumpContent();

        const notifyTextRegex = /text="Get notified[^"]*"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/;
        const match = xmlContent.match(notifyTextRegex);

        if (match) {
            const [_, x1, y1, x2, y2] = match.map(Number);
            
            // Assume checkbox is to the left of the text
            const checkBoxX = x1 - 60; 
            const checkBoxY = Math.floor((y1 + y2) / 2);

            this.driver.log(`✅ Checkbox location estimated: (${checkBoxX}, ${checkBoxY})`);
            this.driver.adb(`shell input tap ${checkBoxX} ${checkBoxY}`);
            await this.sleep(1000);
        }
    }
}

module.exports = LoginPage;

