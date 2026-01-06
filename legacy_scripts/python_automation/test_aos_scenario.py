import pytest
import time
import re
from mobile_helper import MobileHelper
from conftest import TEST_METADATA

# 모듈 레벨 픽스처: 모든 테스트에서 공유
@pytest.fixture(scope="module")
def mobile():
    return MobileHelper()

# ==========================================
# Step 0: 초기화
# ==========================================
def test_01_prepare_device(mobile):
    """디바이스 화면 켜기 및 잠금 해제"""
    mobile.log("🚀 [Step 0] 디바이스 준비")
    mobile.adb("shell input keyevent KEYCODE_WAKEUP")
    time.sleep(1)
    mobile.adb("shell input swipe 540 1500 540 500 300")
    time.sleep(1)
    mobile.adb("shell input text 0000")
    mobile.adb("shell input keyevent 66")
    time.sleep(1)
    mobile.adb("shell input keyevent KEYCODE_HOME")

def test_02_delete_old_app(mobile):
    """기존 앱(OVERDARE) 삭제"""
    target_pkg = "com.overdare.overdare.dev"
    mobile.log(f"🗑️ 앱 삭제 시도: {target_pkg}")
    mobile.adb(f"uninstall {target_pkg}")

# ==========================================
# Step 1: 앱 테스터 (다운로드 & 설치)
# ==========================================
def test_03_verify_build_download(mobile):
    """1. 정상적으로 빌드명/언리얼명의 master를 찾아서 다운로드 했는가?"""
    mobile.log("🚀 [Step 1-1] Master 빌드 검색 및 다운로드")
    
    # App Tester 실행 및 진입
    mobile.adb("shell input keyevent KEYCODE_APP_SWITCH")
    time.sleep(1)
    if not mobile.find_and_click("모두 닫기", 3, False):
        mobile.find_and_click("Close all", 2, False)
    mobile.adb("shell input keyevent KEYCODE_HOME")
    time.sleep(1)
    
    mobile.adb("shell input swipe 720 2200 720 500 500")
    time.sleep(2)
    
    if mobile.find_app_in_drawer("App Tester"):
        el = mobile.find_element("App Tester")
        if el: mobile.adb(f"shell input tap {el['x']} {el['y']}")
    else:
        pytest.fail("App Tester 앱을 찾을 수 없습니다.")
        
    time.sleep(5)
    
    if not mobile.find_and_click("com.overdare.overdare.dev", 10):
        pytest.fail("패키지 목록에서 com.overdare.overdare.dev를 찾을 수 없습니다.")
    time.sleep(3)
    
    # 이번 테스트를 위한 타겟 빌드 키워드
    TARGET_BUILD_KEYWORD = "10087"

    # 'master' 검색
    if mobile.find_and_click("출시 버전 및 출시 노트 검색", 5, False):
        mobile.log(f"🔍 '{TARGET_BUILD_KEYWORD}' 키워드로 검색 시도")
        
        # [수정] 기존 텍스트 지우기 (커서 이동 후 델리트)
        mobile.adb('shell input keyevent 123') # KEYCODE_MOVE_END
        for _ in range(20):
            mobile.adb('shell input keyevent 67') # KEYCODE_DEL
            
        time.sleep(1)
        mobile.adb(f'shell input text "{TARGET_BUILD_KEYWORD}"')
        time.sleep(1)
        mobile.adb('shell input keyevent 66') # ENTER
        time.sleep(8) # 대기 시간 증가
    else:
        pytest.fail("검색창 진입 실패")

    mobile.log("🔍 정규식 조건에 맞는 최신 빌드 탐색 중...")
    
    found_target = False
    
    # [추가] 검색 결과가 화면에 뜰 때까지 잠시 대기
    mobile.log("⏳ 검색 결과 로딩 대기...")
    for _ in range(5):
        if mobile.find_element("UnrealVersion", False): 
            break
        time.sleep(1)

    # 스크롤하며 찾기 (최대 5페이지)
    for i in range(5):
        mobile.log(f"🔎 페이지 {i+1} 검색 중...")
        mobile.adb('shell rm /sdcard/window_dump.xml')
        dump_res = mobile.adb('shell uiautomator dump /sdcard/window_dump.xml')
        
        # 덤프 실패 시 재시도
        if "ERROR" in dump_res:
            mobile.log("⚠️ UI 덤프 실패, 재시도...")
            time.sleep(1)
            mobile.adb('shell uiautomator dump /sdcard/window_dump.xml')
        
        # 안정적인 파일 읽기를 위해 pull 방식 사용
        mobile.adb('pull /sdcard/window_dump.xml window_dump.xml')
        
        try:
            with open('window_dump.xml', 'r', encoding='utf-8') as f:
                xml_content = f.read()
        except Exception as e:
            mobile.log(f"⚠️ XML 파일 읽기 실패: {e}")
            xml_content = ""
        
        if not xml_content or len(xml_content) < 100:
            mobile.log("⚠️ XML 내용이 비어있거나 너무 짧습니다.")
            continue
            
        unreal_matches = list(re.finditer(r'text="(UnrealVersion: ([^"]*))"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', xml_content))
        mobile.log(f"   👉 발견된 UnrealVersion 개수: {len(unreal_matches)}")
        
        target_build = None
        btn_match = None  # [수정] 루프 시작 전 초기화

        for match in unreal_matches:
            ver_text = match.group(2) 
            u_y1 = int(match.group(3))
            
            mobile.log(f"      - 감지된 버전: {ver_text} (Y: {u_y1})")
            
            # [수정] 이번 테스트를 위해 특정 키워드(10087)가 포함된 빌드만 선택
            if TARGET_BUILD_KEYWORD not in ver_text and "10087" not in ver_text:
                pass

            # 일단 UnrealVersion에 master는 있어야 함 (기본 전제)
            if "master" not in ver_text:
                continue
            
            # UnrealVersion에 타겟 키워드가 있거나, 아래 Title 체크에서 확인할 예정
            
            text_nodes = re.finditer(r'text="([^"]+)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', xml_content)
            title_candidate = None
            min_diff = 1000
            
            for t_match in text_nodes:
                t_text = t_match.group(1)
                t_y1_node = int(t_match.group(2)) # Top
                
                if "UnrealVersion" in t_text: continue
                # 날짜/시간 필터링
                if re.search(r'\d+월 \d+', t_text) or "오전" in t_text or "오후" in t_text: continue
                
                # [수정] 위/아래 상관없이 거리만으로 가장 가까운 텍스트 찾기
                diff = abs(u_y1 - t_y1_node)
                
                # 거리 로그 (디버깅)
                # mobile.log(f"         [Title 후보] '{t_text}' 거리: {diff}")
                
                # 600px 이내에서 가장 가까운 것 선택
                if diff < 600 and diff < min_diff:
                    min_diff = diff
                    title_candidate = t_text
            
            # [수정] 빌드 선택 조건 검증
            is_target_found = False
            
            # 1. UnrealVersion에 키워드 포함되면 무조건 합격
            if TARGET_BUILD_KEYWORD in ver_text:
                is_target_found = True
                mobile.log(f"   ✨ UnrealVersion에서 키워드('{TARGET_BUILD_KEYWORD}') 발견 -> 선택!")
            # 2. (보조) Title에 키워드 포함
            elif title_candidate and TARGET_BUILD_KEYWORD in title_candidate:
                is_target_found = True
                mobile.log(f"   ✨ Title에서 키워드('{TARGET_BUILD_KEYWORD}') 발견 -> 선택!")
                
            if is_target_found:
                mobile.log(f"✅ 타겟 빌드 확인 완료! [Title] {title_candidate or '없음'} / [Unreal] {ver_text}")
                TEST_METADATA['build_name'] = title_candidate or "Unknown Title"
                TEST_METADATA['unreal_version'] = ver_text
                target_build = {'y': u_y1}
            else:
                 mobile.log(f"      ❌ 탈락: '{TARGET_BUILD_KEYWORD}' 키워드가 없음 (Unreal: {ver_text})")
                 continue # 탈락이면 다음 UnrealVersion으로

            if target_build:
                # 버튼 찾기 로직 개선: text 또는 content-desc에서 버튼 키워드 탐색
                btn_texts = ["다운로드", "업데이트", "Install", "Update", "열기", "Open", "설치"]
                btn_match = None
                min_btn_dist = 2000  # [수정] 거리 제한 대폭 확대 (2000)
                
                # text와 content-desc 모두 추출하는 정규식
                
                # 1. text 속성 기반 탐색
                text_nodes = re.finditer(r'text="([^"]+)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', xml_content)
                for t_match in text_nodes:
                    t_text = t_match.group(1)
                    t_y1 = int(t_match.group(2))
                    
                    is_btn_text = any(btn_word in t_text for btn_word in btn_texts)
                    
                    if is_btn_text:
                        dist = abs(t_y1 - target_build['y'])
                        mobile.log(f"      [버튼 후보(text)] '{t_text}' 거리: {dist} (Y: {t_y1})")
                        
                        if dist < min_btn_dist:
                            bx = (int(t_match.group(2)) + int(t_match.group(4))) // 2
                            by = (int(t_match.group(3)) + int(t_match.group(5))) // 2
                            btn_match = {'text': t_text, 'x': bx, 'y': by}
                            min_btn_dist = dist

                # 2. content-desc 속성 기반 탐색 (text가 비어있고 content-desc에만 있을 경우 대비)
                desc_nodes = re.finditer(r'content-desc="([^"]+)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', xml_content)
                for d_match in desc_nodes:
                    d_text = d_match.group(1)
                    d_y1 = int(d_match.group(2))
                    
                    is_btn_text = any(btn_word in d_text for btn_word in btn_texts)
                    
                    if is_btn_text:
                        dist = abs(d_y1 - target_build['y'])
                        mobile.log(f"      [버튼 후보(desc)] '{d_text}' 거리: {dist} (Y: {d_y1})")
                        
                        if dist < min_btn_dist:
                            bx = (int(d_match.group(2)) + int(d_match.group(4))) // 2
                            by = (int(d_match.group(3)) + int(d_match.group(5))) // 2
                            btn_match = {'text': d_text, 'x': bx, 'y': by}
                            min_btn_dist = dist
            
                if btn_match:
                    mobile.log(f"👆 버튼 클릭: {btn_match['text']} ({btn_match['x']}, {btn_match['y']})")
                    mobile.adb(f"shell input tap {btn_match['x']} {btn_match['y']}")
                    found_target = True
                    
                    if btn_match['text'] in ["열기", "Open"]:
                        mobile.log("ℹ️ 이미 설치된 상태입니다.")
                    
                    break # 버튼 클릭했으면 Unreal 루프 종료
                else:
                    mobile.log("⚠️ 빌드는 찾았으나 버튼이 화면에 안 보일 수 있음. 살짝 스크롤.")
                    mobile.adb("shell input swipe 500 1500 500 1200 300")
                    time.sleep(1)
                    continue # 다음 UnrealVersion이나 스크롤 시도

        if found_target:
            break

        mobile.log("⬇️ 스크롤 다운하여 계속 탐색")
        mobile.adb("shell input swipe 500 1500 500 500 500")
        time.sleep(2)

    if not found_target:
        pytest.fail(f"조건에 맞는 빌드({TARGET_BUILD_KEYWORD})를 찾지 못했거나 다운로드 버튼을 누르지 못했습니다.")

def test_04_verify_installation(mobile):
    """2. 설치가 완료되었는가?"""
    mobile.log("🚀 [Step 1-2] 설치 진행 및 완료 확인")
    
    start_time = time.time()
    install_clicked = False
    
    while time.time() - start_time < 180:
        if mobile.find_and_click("설치", 2) or mobile.find_and_click("Install", 2) or mobile.find_and_click("업데이트", 2):
            mobile.log("✅ 설치/업데이트 버튼 클릭함")
            install_clicked = True
            break
        
        if mobile.find_element("열기") or mobile.find_element("Open"):
            mobile.log("ℹ️ '열기' 버튼 발견 -> 설치 완료 상태")
            install_clicked = True
            break
            
        time.sleep(2)
        
    time.sleep(10)
    
    res = mobile.adb("shell pm list packages | grep com.overdare.overdare.dev")
    if "com.overdare.overdare.dev" in res:
        mobile.log("🎉 [Pass] com.overdare.overdare.dev 패키지 설치 확인됨")
    else:
        pytest.fail("설치 과정을 거쳤으나 패키지가 조회되지 않습니다.")

# ==========================================
# Step 2: 앱 실행
# ==========================================
def test_05_verify_env_selection_screen(mobile):
    """1. 앱 실행 후 환경 선택 씬(Search/GO)으로 넘어갔는가?"""
    mobile.log("🚀 [Step 2-1] 앱 실행 및 환경 선택 화면 진입 확인")
    
    target_pkg = "com.overdare.overdare.dev"
    mobile.adb(f"shell monkey -p {target_pkg} -c android.intent.category.LAUNCHER 1")
    
    time.sleep(15)
    
    search_btn = mobile.find_element("Search")
    go_btn = mobile.find_element("GO")
    
    if search_btn or go_btn:
        mobile.log("🎉 [Pass] 환경 선택 화면(Search/GO) 진입 확인")
        
        if search_btn:
            mobile.adb(f"shell input tap {search_btn['x']} {search_btn['y']}")
            time.sleep(1)
            mobile.adb('shell input text "qa"')
            time.sleep(1)
            mobile.adb('shell input keyevent 66') 
            time.sleep(1)
            mobile.adb('shell input keyevent 4') 
            time.sleep(1)
            
            # [메타데이터 업데이트]
            TEST_METADATA['environment'] = 'QA (qa)'
    else:
        pytest.fail("환경 선택 화면(Search/GO)을 찾을 수 없습니다.")

def test_06_verify_login_screen_entry(mobile):
    """2. 환경 선택 후 로그인 페이지까지 진입했는가?"""
    mobile.log("🚀 [Step 2-2] 환경 선택(GO) 및 로그인 화면 진입 확인")
    
    if not mobile.find_and_click("GO", 5):
        if mobile.find_and_click("qa", 3, True):
            time.sleep(1)
            mobile.find_and_click("GO", 3)
            
    mobile.log("⏳ 로그인 화면 진입 대기...")
    time.sleep(8)
    
    is_login_screen = mobile.find_element("Guest") or mobile.find_element("Google")
    is_already_logged_in = mobile.find_element("Get notified", False) or mobile.find_element("Allow", False)
    
    if is_login_screen:
        mobile.log("🎉 [Pass] 로그인 화면(Guest/Google) 진입 확인")
        TEST_METADATA['account'] = 'Pending Login (Screen Visible)'
    elif is_already_logged_in:
        mobile.log("🎉 [Pass] 이미 로그인된 상태로 홈 진입 확인")
        TEST_METADATA['account'] = 'Already Logged In'
    else:
        pytest.fail("로그인 화면 또는 홈 화면을 확인할 수 없습니다.")
