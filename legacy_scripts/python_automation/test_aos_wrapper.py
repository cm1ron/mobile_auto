import pytest
import subprocess
import os
import sys

# 프로젝트 루트 디렉토리
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def run_node_script(script_relative_path, args=[]):
    """
    Node.js 스크립트를 실행하고 로그를 실시간으로 출력하는 헬퍼 함수.
    """
    script_full_path = os.path.join(PROJECT_ROOT, script_relative_path)
    
    cmd = ["node", script_full_path] + args
    
    print(f"\n🚀 Executing: {' '.join(cmd)}")
    
    # Popen을 사용하여 실시간 출력 캡처
    process = subprocess.Popen(
        cmd,
        cwd=PROJECT_ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT, # stderr도 stdout으로 합쳐서 출력
        text=True,
        encoding='utf-8',
        bufsize=1 # 라인 버퍼링
    )
    
    # 실시간 로그 출력
    logs = []
    while True:
        line = process.stdout.readline()
        if not line and process.poll() is not None:
            break
        if line:
            print(line.strip()) # 콘솔에 바로 출력
            logs.append(line)
            
    return_code = process.poll()
    
    if return_code != 0:
        pytest.fail(f"❌ Script '{script_relative_path}' failed with exit code {return_code}")
    else:
        print(f"✅ Script '{script_relative_path}' completed successfully.")

# ==========================================
# Test Cases
# ==========================================

def test_step00_delete_old_app():
    """Step 0: 기존 앱 삭제 및 디바이스 초기화"""
    run_node_script("AOS/00-delete-app.js")

def test_step01_install_app():
    """Step 1: 앱 다운로드 및 설치 (App Tester)"""
    run_node_script("AOS/01-install-app.js")

def test_step02_launch_app():
    """Step 2: 앱 실행 및 환경 선택 (QA)"""
    run_node_script("AOS/02-app-launch.js")

def test_step03_login():
    """Step 3: 로그인 (Guest/Google)"""
    # 필요 시 계정 인자 전달 가능: args=["odqa02"]
    run_node_script("AOS/03-login.js")

def test_step04_popup_handling():
    """Step 4: 팝업 및 튜토리얼 처리"""
    run_node_script("AOS/04-popup.js")
