import subprocess
import os
import time
import datetime
import re
import platform

class MobileHelper:
    def __init__(self):
        self.base_dir = os.getcwd()
        
        # 날짜별 폴더 생성
        today = datetime.datetime.now().strftime('%Y-%m-%d')
        self.session_dir = os.path.join(self.base_dir, 'failures', today)
        os.makedirs(self.session_dir, exist_ok=True)
        
        # 로그 파일 설정
        timestamp = datetime.datetime.now().strftime('%H-%M-%S-%f')[:-3]
        self.log_file = os.path.join(self.session_dir, f'execution_{timestamp}.log')
        
        self.log(f"🚀 자동화 시작: {datetime.datetime.now()}")

    def log(self, message, type='INFO'):
        timestamp = datetime.datetime.now().isoformat()
        log_message = f"[{timestamp}] [{type}] {message}"
        print(log_message)
        
        try:
            with open(self.log_file, 'a', encoding='utf-8') as f:
                f.write(log_message + '\n')
        except Exception as e:
            print(f"로그 파일 쓰기 실패: {e}")

    def error(self, message, step_name='unknown'):
        self.log(message, 'ERROR')
        # Pytest에서는 assert 실패 시 자동으로 처리되므로 여기서는 로그만 남기거나 스크린샷 찍음
        self.capture_screenshot(f"error_{step_name}")

    def adb(self, command):
        try:
            env = os.environ.copy()
            if platform.system() == 'Windows':
                env['MSYS_NO_PATHCONV'] = '1'
            
            # adb 명령어 실행
            result = subprocess.run(
                f"adb {command}", 
                shell=True, 
                capture_output=True, 
                text=True, 
                env=env,
                encoding='utf-8' # 한글 처리
            )
            
            if result.returncode != 0 and "error" in result.stderr.lower():
                 # 단순 경고가 아닌 진짜 에러인 경우 (필요 시 예외 처리 강화)
                 pass
            
            return result.stdout.strip()
        except Exception as e:
            raise Exception(f"ADB Execution Failed: {e}")

    def capture_screenshot(self, name):
        try:
            timestamp = datetime.datetime.now().strftime('%H-%M-%S-%f')[:-3]
            filename = f"{name}_{timestamp}.png"
            local_path = os.path.join(self.session_dir, filename)
            
            self.adb('shell screencap -p /sdcard/screenshot.png')
            self.adb(f'pull /sdcard/screenshot.png "{local_path}"')
            self.adb('shell rm /sdcard/screenshot.png')
            
            self.log(f"📸 스크린샷 저장: {local_path}", 'SCREENSHOT')
            return local_path
        except Exception as e:
            self.log(f"❌ 스크린샷 실패: {e}", 'ERROR')
            return None

    def get_wifi_ssid(self):
        try:
            res = self.adb('shell dumpsys wifi | grep "SSID"')
            match = re.search(r'SSID: "([^"]+)"', res) or re.search(r'SSID: ([^\s,]+)', res)
            if match:
                return match.group(1)
            return 'Unknown'
        except:
            return 'Unknown'

    def find_element(self, text, exact_match=True):
        dump_path = '/sdcard/window_dump.xml'
        local_path = os.path.join(os.getcwd(), 'window_dump.xml')
        
        self.adb(f'shell rm {dump_path}')
        
        dump_success = False
        for i in range(3):
            res = self.adb(f'shell uiautomator dump {dump_path}')
            if 'UI hierchary dumped to' in res:
                dump_success = True
                break
            time.sleep(1)
            
        if not dump_success:
            self.log('⚠️ UI 덤프 최종 실패', 'WARN')
            return None
            
        self.adb(f'pull {dump_path} "{local_path}"')
        
        if not os.path.exists(local_path):
            return None
            
        with open(local_path, 'r', encoding='utf-8') as f:
            xml_content = f.read()

        # [전역 방어 로직] 팝업 감지
        self.check_and_dismiss_system_popup(xml_content)

        if exact_match:
            pattern = rf'text="{re.escape(text)}"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"'
        else:
            pattern = rf'text="[^"]*{re.escape(text)}[^"]*"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"'
            
        match = re.search(pattern, xml_content)
        
        # content-desc 확인 (fallback)
        if not match:
            if exact_match:
                pattern_desc = rf'content-desc="{re.escape(text)}"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"'
            else:
                pattern_desc = rf'content-desc="[^"]*{re.escape(text)}[^"]*"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"'
            match = re.search(pattern_desc, xml_content)

        if match:
            x1, y1, x2, y2 = map(int, match.groups())
            return {
                'x': (x1 + x2) // 2,
                'y': (y1 + y2) // 2,
                'width': x2 - x1,
                'height': y2 - y1,
                'found_text': text
            }
            
        return None

    def find_and_click(self, text, timeout_sec=10, exact_match=True):
        self.log(f"🔍 '{text}' 찾는 중... (최대 {timeout_sec}초)")
        start_time = time.time()
        
        while time.time() - start_time < timeout_sec:
            element = self.find_element(text, exact_match)
            if element:
                self.log(f"✅ 발견: '{text}' at ({element['x']}, {element['y']})")
                self.adb(f"shell input tap {element['x']} {element['y']}")
                self.log(f"👆 클릭: '{text}'")
                return True
            time.sleep(1)
            
        self.log(f"❌ 찾기 실패: '{text}' (시간 초과)", 'FAIL')
        return False

    def check_and_dismiss_system_popup(self, xml_content):
        update_keywords = ['소프트웨어 업데이트', 'Software update', 'One UI']
        has_popup = any(f'text="{k}"' in xml_content for k in update_keywords)
        
        if has_popup:
            self.log('🚨 [시스템 팝업 감지] 소프트웨어 업데이트 팝업이 발견되었습니다.', 'WARN')
            self.log('🔙 뒤로가기(Back) 키를 눌러 팝업을 닫습니다.')
            self.adb('shell input keyevent KEYCODE_BACK')
            time.sleep(1)
            return True
        return False

    def find_app_in_drawer(self, app_name):
        self.log(f"🔍 앱 서랍에서 '{app_name}' 탐색 시작...")
        if self.find_element(app_name):
            return True
            
        max_pages = 5
        
        def get_screen_hash():
            try:
                self.adb('shell rm /sdcard/window_dump.xml')
                self.adb('shell uiautomator dump /sdcard/window_dump.xml')
                self.adb('pull /sdcard/window_dump.xml window_dump_check.xml')
                if os.path.exists('window_dump_check.xml'):
                    return os.path.getsize('window_dump_check.xml')
            except:
                pass
            return 0

        self.log('➡️ 다음 페이지(오른쪽)로 탐색 시도...')
        prev_hash = get_screen_hash()
        
        for _ in range(max_pages):
            self.adb('shell input swipe 900 1200 100 1200 300')
            time.sleep(2)
            if self.find_element(app_name): return True
            
            curr_hash = get_screen_hash()
            if abs(curr_hash - prev_hash) < 50:
                self.log('🛑 더 이상 오른쪽 페이지가 없습니다.')
                break
            prev_hash = curr_hash
            
        return False



