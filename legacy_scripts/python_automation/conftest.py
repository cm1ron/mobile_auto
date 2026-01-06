import pytest
from datetime import datetime

# 테스트 실행 중 수집할 메타데이터 저장소
TEST_METADATA = {
    "build_name": "N/A (Not Found)",
    "unreal_version": "N/A",
    "environment": "N/A",
    "account": "N/A"
}

def pytest_html_results_summary(prefix, summary, postfix):
    """
    HTML 리포트 상단에 커스텀 요약 정보를 추가하는 훅
    """
    content = f"""
    <div style="margin: 20px 0; padding: 15px; border: 1px solid #e1e4e8; border-radius: 6px; background-color: #f6f8fa;">
        <h3 style="margin-top: 0; color: #24292e;">🛠️ Execution Context</h3>
        <table style="width: 100%; border-collapse: collapse; font-family: -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;">
            <tr style="border-bottom: 1px solid #e1e4e8;">
                <th style="text-align: left; padding: 8px; color: #586069; width: 150px;">Target Build</th>
                <td style="padding: 8px; font-weight: 600;">{TEST_METADATA['build_name']}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e1e4e8;">
                <th style="text-align: left; padding: 8px; color: #586069;">Unreal Version</th>
                <td style="padding: 8px;">{TEST_METADATA['unreal_version']}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e1e4e8;">
                <th style="text-align: left; padding: 8px; color: #586069;">Environment</th>
                <td style="padding: 8px;">{TEST_METADATA['environment']}</td>
            </tr>
            <tr>
                <th style="text-align: left; padding: 8px; color: #586069;">Login Account</th>
                <td style="padding: 8px;">{TEST_METADATA['account']}</td>
            </tr>
        </table>
    </div>
    """
    prefix.extend([content])





