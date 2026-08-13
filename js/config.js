// 온라인 멀티플레이 서버(Cloudflare Worker)의 배포 주소.
// server/를 처음 배포한 뒤 GitHub Actions 로그(또는 `wrangler deploy` 출력)에 찍히는
// 실제 *.workers.dev 주소로 이 한 줄만 바꾸면 된다.
export const WORKER_BASE_URL = 'https://oathfall-mp.nonggle4918.workers.dev';
