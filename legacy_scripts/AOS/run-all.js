const { execSync } = require('child_process');

// 사용자 입력 인자 확인 (예: node AOS/run-all.js odqa02)
const args = process.argv.slice(2);
const accountArg = args[0] ? ` "${args[0]}"` : '';

if (accountArg) {
    console.log(`🎯 Target Account Argument Detected: ${args[0]}`);
}

// 실행할 스크립트 목록
const steps = [
    'node AOS/00-delete-app.js',
    'node AOS/01-install-app.js',
    'node AOS/02-app-launch.js',
    `node AOS/03-login.js${accountArg}`, // 03단계에만 인자 전달
    'node AOS/04-popup.js'
];

console.log('🚀 Starting Full Automation Sequence...');

// 순차 실행
for (const step of steps) {
    console.log(`\n--------------------------------------------------`);
    console.log(`▶️  Executing: ${step}`);
    console.log(`--------------------------------------------------`);
    
    try {
        // stdio: 'inherit'으로 자식 프로세스의 로그를 실시간 출력
        execSync(step, { stdio: 'inherit' });
    } catch (e) {
        console.error(`\n❌ Execution failed at step: ${step}`);
        process.exit(1);
    }
}

console.log('\n🎉 All steps completed successfully!');





