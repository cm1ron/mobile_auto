const BasePage = require('./BasePage');

class PopupPage extends BasePage {
    
    async handleMainPopups() {
        this.driver.log('🚀 [Step 4] 메인 팝업 및 권한 처리 시작');
        
        // Flag to prevent infinite clicking on "Play now" (since it remains on screen as a button)
        let playNowHandled = false;

        // Loop to handle multiple stacked popups
        for (let i = 0; i < 5; i++) {
            let handled = false;

            // 1. Permission Popup (Allow/허용)
            if (await this._handlePermissionPopup()) {
                handled = true;
            }
            
            // 2. Play Now Dimmed Highlight (Handle ONLY ONCE)
            else if (!playNowHandled && await this._handlePlayNowPopup()) {
                handled = true;
                playNowHandled = true; // Mark as done so we don't click it again
            }

            // 3. Gacha Ticket Popup
            else if (await this._handleGachaPopup()) {
                handled = true;
            }

            // 4. "Don't show again" Checkbox
            else if (await this._handleDoNotShowCheckbox()) {
                await this._closePopup(); 
                handled = true;
            }

            // 5. Generic Close Button
            else if (await this._closePopup()) {
                handled = true;
            }

            if (!handled) {
                this.driver.log('✅ 더 이상 처리할 팝업이 없습니다.');
                break;
            }
            
            await this.sleep(2000); // Wait for next popup animation (Important!)
        }
    }

    // --- Specific Popup Handlers ---

    async _handlePermissionPopup() {
        const allowBtn = await this.driver.findAndClick('Allow', 2) || 
                         await this.driver.findAndClick('허용', 2);
        if (allowBtn) {
            this.driver.log('✅ 권한 허용 팝업 처리 완료');
            return true;
        }
        return false;
    }

    async _handlePlayNowPopup() {
        // Condition: "Play now" text is visible
        if (this.driver.findElement('Play now', false)) {
            this.driver.log('🔍 "Play now" 팝업 발견 -> 딤드 영역 터치 시도');
            // Tap top-center (safe area) to close via dimmed background
            this.driver.adb('shell input tap 540 300'); 
            await this.sleep(1000);
            return true;
        }
        return false;
    }

    async _handleGachaPopup() {
        // Condition: "Get your Gacha Ticket" button
        if (await this.driver.findAndClick('Get your Gacha Ticket', 2, false)) {
            this.driver.log('👆 가차 티켓 받기 클릭 -> 애니메이션 대기 (6초)');
            
            // Wait for animation
            await this.sleep(6000); 

            // Simply press Back to close the result popup
            this.driver.log('🔙 애니메이션 종료. 뒤로가기(Back) 키로 팝업 닫기');
            this.driver.adb('shell input keyevent KEYCODE_BACK');
            
            return true;
        }
        return false;
    }

    // --- Generic Handlers ---

    async _handleDoNotShowCheckbox() {
        const checkboxText = this.driver.findElement('7 days', false); 
        if (checkboxText) {
            this.driver.log('🔍 "7일간 보지 않기" 발견 -> 체크');
            const checkX = checkboxText.x - 60; 
            const checkY = checkboxText.y;
            this.driver.adb(`shell input tap ${checkX} ${checkY}`);
            await this.sleep(1000);
            return true;
        }
        return false;
    }

    async _closePopup() {
        const closeKeywords = [
            'Close', '닫기', 'X', 
            'Not now', '나중에', 
            'Skip', '건너뛰기', 'Cancel', '취소'
        ];

        for (const keyword of closeKeywords) {
            if (await this.driver.findAndClick(keyword, 1, false)) {
                this.driver.log(`✅ 일반 팝업 닫기 성공 (키워드: ${keyword})`);
                return true;
            }
        }
        return false; 
    }
}

module.exports = PopupPage;
