export const config = {
  runtime: 'edge',
};

export default function handler(request: Request): Response {
  // 空响应，仅用于触发 Edge 运行时
  return new Response('OK');
}