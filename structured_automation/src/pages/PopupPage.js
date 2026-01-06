const BasePage = require('./BasePage');

class PopupPage extends BasePage {
    
    async handleMainPopups() {
        this.driver.log('🚀 [Step 4] 메인 팝업 처리 시작');

        // 1. "Don't show again for 7 days" 체크박스 처리
        // 팝업 하단에 "7일간 보지 않기" 체크박스가 있으면 체크하고 닫기
        await this._handleDoNotShowCheckbox();

        // 2. 닫기 버튼(X) 처리
        await this._closePopup();
    }

    async _handleDoNotShowCheckbox() {
        // "7 days" 텍스트 찾기
        const checkboxText = this.driver.findElement('7 days', false); 
        
        if (checkboxText) {
            this.driver.log('🔍 "7일간 보지 않기" 체크박스 발견');
            
            // 텍스트 왼쪽 좌표를 체크박스로 가정 (일반적인 UI)
            const checkX = checkboxText.x - 60; 
            const checkY = checkboxText.y;

            this.driver.log(`👆 체크박스 클릭: (${checkX}, ${checkY})`);
            this.driver.adb(`shell input tap ${checkX} ${checkY}`);
            await this.sleep(1000);
        }
    }

    async _closePopup() {
        // [General Strategy for Closing Popups]
        // 1. Explicit Keywords (Text or Content-Desc)
        // 2. Hardware Back Key (Fallback)

        const closeKeywords = [
            'Close', '닫기', 'X', 
            'Not now', '나중에', 
            'Skip', '건너뛰기',
            'Cancel', '취소',
            'No thanks', '아니요',
            'Confirm' // Sometimes confirm closes simple alerts
        ];

        let closed = false;
        
        // Try to find and click any closing keyword
        for (const keyword of closeKeywords) {
            // Check text and content-desc (implicit in findAndClick if updated, or loop manual find)
            // Using findAndClick with short timeout
            if (await this.driver.findAndClick(keyword, 1, false)) { // false = partial match allowed
                this.driver.log(`✅ 팝업 닫기 성공 (키워드: ${keyword})`);
                closed = true;
                break;
            }
        }

        if (!closed) {
            // 2. Hardware Back Key (Fallback)
            // If explicit close button is not found, try Back Key.
            // This is the most robust way to dismiss standard Android dialogs/popups.
            this.driver.log('ℹ️ 닫기 버튼 없음. 뒤로가기(Back) 키로 강제 종료 시도');
            this.driver.adb('shell input keyevent KEYCODE_BACK');
        }
        
        await this.sleep(1000);
    }
}

module.exports = PopupPage;

